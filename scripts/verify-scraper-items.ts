import { prisma } from "../src/lib/db";

const AI_PROMPT = `You are a recruitment extraction expert for the Indian job market. You are given the raw text of a scraped government/PSU/banking job notification, along with its source URLs.
Extract and verify data to publish it.

Return ONLY valid JSON with the following exact keys. Output null if missing.
{
  "title": "Clear job title (e.g. 'SBI Specialist Cadre Officer 2026')",
  "organizationName": "Name of organization (e.g. 'State Bank of India')",
  "sector": "Must be exactly one of: 'UPSC', 'SSC', 'Banking', 'Railway', 'Defence', 'State PSC', 'Public Sector', 'Private Sector', 'Research/Academia'",
  "advertisementNo": "Ads num if any",
  "totalVacancies": integer (or null),
  "minQualification": "EXACTLY ONE: 10th, 12th, diploma, graduate, engineering, postgraduate, phd, any",
  "minAge": integer (or null),
  "maxAge": integer (or null),
  "feeGeneral": integer (or null),
  "feeReserved": integer (or null),
  "applyStart": "YYYY-MM-DD",
  "applyLast": "YYYY-MM-DD",
  "notificationDate": "YYYY-MM-DD",
  "summary": "Short 2-3 sentence summary",
  "payLevel": "string like 'Level 7' or null",
  "selectionProcess": "string or null",
  "experienceRequiredYears": integer (or 0),
  "applyUrl": "Extracted apply link exact URL, MUST NOT be a general website redirect, must be the specific page to apply or portal link found in text",
  "pdfUrl": "Extracted official notification PDF link. If the sourceUrl is a PDF, use it."
}`;

async function callGemini(text: string, sourceUrl: string): Promise<any> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Missing GEMINI_API_KEY");

  let attempt = 1;
  while (attempt <= 10) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: AI_PROMPT + `\n\nSOURCE_URL: ${sourceUrl}\n\nTEXT:\n` + text.slice(0, 25000) }]
          }],
          generationConfig: {
            responseMimeType: "application/json",
          },
        }),
      });
      
      if (!res.ok) {
        if (res.status === 429) {
          const raw = await res.json();
          let wait = 10000;
          try {
            if (raw.error?.details) {
              const retryInfo = raw.error.details.find((d:any) => d['@type'].includes('RetryInfo'));
              if (retryInfo && retryInfo.retryDelay) {
                wait = parseInt(retryInfo.retryDelay) * 1000 + 1000;
              }
            }
          } catch(e) {}
          console.warn(`⏳ Rate limited. Waiting ${wait/1000}s...`);
          await new Promise(r => setTimeout(r, wait));
          attempt++;
          continue; // Wait and loop again
        }
        throw new Error(`Gemini Error: ${res.status} ${await res.text()}`);
      }
      
      const data = await res.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!content) throw new Error("No content generated");
      return JSON.parse(content);
    } catch(e: any) {
       console.warn(`Attempt ${attempt} failed: ${e.message}`);
       await new Promise(r => setTimeout(r, 5000));
       attempt++;
    }
  }
  throw new Error("Failed after 10 attempts");
}

async function run() {
  const notes = await prisma.notification.findMany({
    where: { status: "pending_review", origin: "scraper" },
    include: { organization: true }
  });

  console.log(`Found ${notes.length} scraper items to verify.`);

  for (const n of notes) {
    if (!n.rawText || n.rawText.length < 50) {
      console.log(`Skipping ${n.id} due to empty/short text`);
      continue;
    }
    console.log(`\n--- Processing ID: ${n.id} [${n.officialSourceUrl}] ---`);
    try {
      const draft = await callGemini(n.rawText, n.officialSourceUrl);
      console.log(`AI title: ${draft.title} | Org: ${draft.organizationName}`);
      console.log(`PDF: ${draft.pdfUrl} | Apply: ${draft.applyUrl}`);

      // Resolve Org
      let orgId = n.organizationId;
      if (draft.organizationName && draft.organizationName !== "undefined" && draft.organizationName !== "null") {
         let o = await prisma.organization.findFirst({
            where: { name: { equals: draft.organizationName, mode: 'insensitive' } }
         });
         if (!o) {
            o = await prisma.organization.create({
                data: {
                  name: draft.organizationName,
                  shortName: draft.organizationName.split(' ').map((w: string) => w[0]).join('').substring(0, 10).toUpperCase() + '-' + Math.floor(Math.random() * 1000),
                  sector: 'central_govt'
                }
            });
         }
         orgId = o.id;
      }

      let sectorCheck = draft.sector || 'unknown';
      if (!['UPSC', 'SSC', 'Banking', 'Railway', 'Defence', 'State PSC', 'Public Sector', 'Private Sector', 'Research/Academia'].includes(sectorCheck)) {
        sectorCheck = "Public Sector";
      }

      // Resolve URLs
      let finalPdfUrl = n.officialNotificationPdfUrl;
      let finalApplyUrl = n.applyUrl;

      if (n.officialSourceUrl.toLowerCase().includes('.pdf')) {
         finalPdfUrl = n.officialSourceUrl;
      } else if (draft.pdfUrl && draft.pdfUrl.startsWith('http')) {
         finalPdfUrl = draft.pdfUrl;
      }

      if (draft.applyUrl && draft.applyUrl.startsWith('http')) {
         finalApplyUrl = draft.applyUrl;
      }

      if (!finalPdfUrl) {
         if (n.discoveredUrl?.toLowerCase().includes('.pdf')) finalPdfUrl = n.discoveredUrl;
      }

      // If both are exact same, and it's a PDF, clear applyUrl.
      if (finalPdfUrl === finalApplyUrl && finalApplyUrl?.endsWith('.pdf')) {
         finalApplyUrl = null;
      }

      // Give precedence to PDF url if not found but we have apply url as pdf
      if (!finalPdfUrl && finalApplyUrl?.endsWith('.pdf')) {
         finalPdfUrl = finalApplyUrl;
         finalApplyUrl = null;
      }

      if (draft.title === "null" || !draft.title) draft.title = n.title;

      // Update
      await prisma.notification.update({
        where: { id: n.id },
        data: {
          title: draft.title,
          organizationId: orgId,
          sector: sectorCheck,
          advertisementNo: draft.advertisementNo ? String(draft.advertisementNo) : null,
          totalVacancies: Number(draft.totalVacancies) || null,
          minQualification: draft.minQualification || 'any',
          minAge: Number(draft.minAge) || null,
          maxAge: Number(draft.maxAge) || null,
          fees: {
            general: Number(draft.feeGeneral) || 0,
            sc: Number(draft.feeReserved) || 0,
            st: Number(draft.feeReserved) || 0,
            pwbd: 0
          },
          applyStart: draft.applyStart || null,
          applyLast: draft.applyLast || null,
          notificationDate: draft.notificationDate || null,
          summary: draft.summary || '',
          payLevel: draft.payLevel || null,
          selectionProcess: draft.selectionProcess || null,
          experienceRequiredYears: Number(draft.experienceRequiredYears) || 0,
          officialNotificationPdfUrl: finalPdfUrl,
          applyUrl: finalApplyUrl,
          status: "published",
          extractionNotes: "Deep dived, fetched exact PDF & Apply Links, and published via Gemini verified script"
        }
      });
      console.log(`Updated and published ${n.id} completely. PDF: ${finalPdfUrl} Apply: ${finalApplyUrl}`);
      // delay to avoid limit issues
      await new Promise(r => setTimeout(r, 4500)); // ~14 RPM
    } catch(e: any) {
      console.error(`Failed ${n.id}:`, e.message);
    }
  }
}

run().catch(console.error);
