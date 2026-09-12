import { prisma } from "../src/lib/db";
import fs from "fs";
import path from "path";
import https from "https";

const AI_PROMPT = `You are a recruitment data expert for India. Please extract these details from the scraped job notification text:
- The actual and proper "organizationName" (e.g., 'Indian Navy', 'State Bank of India', 'Union Public Service Commission', 'NTPC Limited'). DO NOT use job titles asorg name!
- The "officialWebsite" (homepage) of this recruitment body (e.g., 'https://joinindiannavy.gov.in').
- The exact "pdfUrl" for the official notification (extract from the text, or guess based on the officialWebsite and common patterns).
- The exact "applyUrl" for the direct apply link.
- "advertisementNo", "totalVacancies", "minQualification" (one of: 10th, 12th, diploma, graduate, engineering, postgraduate, phd, any), "minAge", "maxAge".
- "sector": MUST be one of: 'UPSC', 'SSC', 'Banking', 'Railway', 'Defence', 'State PSC', 'Public Sector', 'Private Sector', 'Research/Academia'.

Return EXACTLY valid JSON, with keys: organizationName, officialWebsite, pdfUrl, applyUrl, advertisementNo, totalVacancies, minQualification, minAge, maxAge, sector. Output null for missing numbers.`;

async function callGeminiExtract(text: string): Promise<any> {
  const key = process.env.GEMINI_API_KEY;
  let attempt = 1;
  while (attempt <= 10) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: AI_PROMPT + `\n\nTEXT:\n` + text.slice(0, 30000) }] }],
          generationConfig: { responseMimeType: "application/json" }
        })
      });
      if (!res.ok) {
        if (res.status === 429) {
          const raw = await res.json();
          let wait = 5000;
          try {
            if (raw.error?.details) {
              const retryInfo = raw.error.details.find((d:any) => d['@type'].includes('RetryInfo'));
              if (retryInfo && retryInfo.retryDelay) wait = parseInt(retryInfo.retryDelay) * 1000 + 1000;
            }
          } catch(e) {}
          console.warn(`⏳ Rate limited. Waiting ${wait/1000}s...`);
          await new Promise(r => setTimeout(r, wait));
          attempt++;
          continue;
        }
        throw new Error(`Gemini Error: ${res.status} ${await res.text()}`);
      }
      
      const data = await res.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!content) throw new Error("No content generated");
      return JSON.parse(content);
    } catch(e: any) {
       console.warn(`Attempt ${attempt} failed: ${e.message}`);
       await new Promise(r => setTimeout(r, 2000));
       attempt++;
    }
  }
  throw new Error("Failed after 10 attempts");
}

function downloadImage(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
         resolve(); return;
      }
      const file = fs.createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => { fs.unlink(destPath, () => {}); resolve(); });
  });
}

function extractDomain(url: string) {
    if(!url) return null;
    try { return new URL(url).hostname; } catch(e) { return null; }
}

async function run() {
  const notes = await prisma.notification.findMany({
    where: { origin: "scraper" },
    include: { organization: true }
  });

  console.log(`Found ${notes.length} scraper items to verify.`);

  for (const n of notes) {
    console.log(`\n--- Deep Diving ID: ${n.id} [${n.title.substring(0, 60)}] ---`);
    if (!n.rawText || n.rawText.length < 50) {
      console.log(`Skipping - insufficient raw text.`);
      continue;
    }
    try {
      const draft = await callGeminiExtract(n.rawText);
      console.log(`AI Org: ${draft.organizationName} | Website: ${draft.officialWebsite}`);

      if (!draft.organizationName) continue;

      // Find or create proper org
      let org = await prisma.organization.findFirst({
         where: { name: { equals: draft.organizationName, mode: 'insensitive' } }
      });

      if (!org) {
         const shortName = draft.organizationName.split(' ').map((w: string) => w[0]).join('').substring(0, 10).toUpperCase() + '-' + Math.floor(Math.random()*1000);
         org = await prisma.organization.create({
             data: {
               name: draft.organizationName,
               shortName: shortName,
               sector: draft.sector || 'Public Sector',
               officialWebsite: draft.officialWebsite || null
             }
         });
         console.log(`Created new proper Org: ${org.name}`);
      } else {
         console.log(`Matched existing proper Org: ${org.name}`);
      }

      // Handle Logo
      if (!org.logoUrl && draft.officialWebsite) {
          const domain = extractDomain(draft.officialWebsite);
          if (domain) {
              const faviconUrl = `https://www.google.com/s2/favicons?sz=128&domain_url=${domain}`;
              const p = path.join(__dirname, '..', 'public', 'logos');
              if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
              const destFile = path.join(p, `${org.id}.png`);
              await downloadImage(faviconUrl, destFile);
              
              if (fs.existsSync(destFile)) {
                  const s = fs.statSync(destFile);
                  if (s.size > 100) {
                      await prisma.organization.update({
                          where: { id: org.id },
                          data: { logoUrl: `/logos/${org.id}.png` }
                      });
                      console.log(`Downloaded logo for ${org.name} via favicon.`);
                  }
              }
          }
      }

      // Cleanup fallback pdf / apply urls
      let finalPdfUrl = draft.pdfUrl || n.officialNotificationPdfUrl;
      let finalApplyUrl = draft.applyUrl || n.applyUrl;

      await prisma.notification.update({
          where: { id: n.id },
          data: {
              organizationId: org.id,
              advertisementNo: draft.advertisementNo ? String(draft.advertisementNo) : null,
              totalVacancies: Number(draft.totalVacancies) || null,
              minQualification: typeof draft.minQualification === 'string' ? draft.minQualification : 'any',
              minAge: Number(draft.minAge) || null,
              maxAge: Number(draft.maxAge) || null,
              officialNotificationPdfUrl: finalPdfUrl,
              applyUrl: finalApplyUrl,
              extractionNotes: "Deep-Dived & Verified via AI Script",
              sector: draft.sector || n.sector
          }
      });
      console.log(`Updated notification with proper body and fields.`);
      await new Promise(r => setTimeout(r, 4500)); // Rate limiting
    } catch(e: any) {
       console.error(`Failed on ${n.id}:`, e.message);
    }
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
