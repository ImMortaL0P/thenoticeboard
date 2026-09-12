import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();

function extractMatch(text: string, regex: RegExp): string | null {
  const match = text.match(regex);
  return match ? match[1].trim() : null;
}

function parseDetails(md: string) {
  const sections = md.split('### ').slice(1);
  const results = [];

  for (const sec of sections) {
    const lines = sec.split('\n');
    const titleMatch = lines[0].match(/^\d+\.\s*(.+)/);
    if (!titleMatch) continue;
    const title = titleMatch[1].trim();
    
    // Default org from title prefix if not found
    let org = extractMatch(sec, /\*\s*\**Organization\**:\s*(.*)/i);
    if (!org) {
        if (title.includes('RRB')) org = 'Railway Recruitment Boards (RRB)';
        else if (title.includes('SSC')) org = 'Staff Selection Commission (SSC)';
        else if (title.includes('UPSC')) org = 'Union Public Service Commission (UPSC)';
        else org = 'Government of India';
    }
    
    const advt = extractMatch(sec, /\*\s*\**Advertisement Number\**:\s*(.*)/i);
    
    let totalVacancies = null;
    const vacMatch = extractMatch(sec, /\*\s*\**Total Vacancies\**:\s*(\d+)/i);
    if (vacMatch) totalVacancies = parseInt(vacMatch, 10);
    
    const eligMatch = extractMatch(sec, /\*\s*\**Eligibility\**:\s*([\s\S]*?)(?=\n\s*\*\s*\**[A-Z])/);
    let eligStr = eligMatch;
    if (!eligStr) { 
       const eligLine = lines.find(l => l.includes('Eligibility:') || l.includes('Qualifications:'));
       if (eligLine) eligStr = eligLine.split(':')[1].trim();
    }
    let minQual = 'any';
    if (eligStr) {
      const lower = eligStr.toLowerCase();
      if (lower.includes('b.e') || lower.includes('b.tech') || lower.includes('degree in engineering')) minQual = 'engineering';
      else if (lower.includes('master') || lower.includes('m.sc') || lower.includes('m.a') || lower.includes('m.tech') || lower.includes('mba') || lower.includes('ca ') || lower.includes('cfa ') || lower.includes('cma ')) minQual = 'postgraduate';
      else if (lower.includes('bachelor') || lower.includes('degree') || lower.includes('graduation') || lower.includes('graduate') || lower.includes('b.sc') || lower.includes('b.com') || lower.includes('b.a')) minQual = 'graduate';
      else if (lower.includes('diploma')) minQual = 'diploma';
      else if (lower.includes('12th') || lower.includes('intermediate') || lower.includes('10+2')) minQual = '12th';
      else if (lower.includes('10th') || lower.includes('matriculation') || lower.includes('high school') || lower.includes('ssc')) minQual = '10th';
    }

    let minAge = null, maxAge = null;
    const ageRaw = extractMatch(sec, /\*\s*\**Age Limit\**:\s*(.*)/i);
    if (ageRaw) {
      const ageMatch = ageRaw.match(/(\d{2})\s*to\s*(\d{2})/i);
      if (ageMatch) {
          minAge = parseInt(ageMatch[1], 10);
          maxAge = parseInt(ageMatch[2], 10);
      } else {
          const maxMatch = ageRaw.match(/(?:Maximum|Up to|Max)\s*(\d{1,2})/i);
          if (maxMatch) maxAge = parseInt(maxMatch[1], 10);
      }
    }

    const timelineMatch = extractMatch(sec, /\*\s*\**(?:Important )?Timeline\**:\s*([\s\S]*?)(?=\n\s*\*\s*\**[A-Z])/i);
    let applyLast = null, examDate = null;
    if (timelineMatch) {
      const dateRangeMatch = timelineMatch.match(/to\s+(\d{2}\/\d{2}\/\d{4})/i) || timelineMatch.match(/Last Date\s*[:-]\s*(\d{2}\/\d{2}\/\d{4})/i);
      if (dateRangeMatch) {
        const parts = dateRangeMatch[1].split('/');
        applyLast = `${parts[2]}-${parts[1]}-${parts[0]}`; 
      }
      const examMatch = timelineMatch.match(/(?:Exam|Examination)\s*(?:Date)?\s*[:-]\s*(\d{2}\/\d{2}\/\d{4})/i);
      if (examMatch) {
        const parts = examMatch[1].split('/');
        examDate = `${parts[2]}-${parts[1]}-${parts[0]}`; 
      }
    }

    const rawLinks = extractMatch(sec, /\*\s*\**Links\**:\s*([\s\S]*?)(?=\n---|\Z)/);
    let notifUrl = null, applyUrl = null;
    if (rawLinks) {
       const notifMatch = rawLinks.match(/\[(?:Official )?Notification[^\]]*\]\(([^)]+)\)/i);
       if (notifMatch) notifUrl = notifMatch[1];
       else {
           const altNotif = rawLinks.match(/\[Notification[^\]]*\]\(([^)]+)\)/i);
           if (altNotif) notifUrl = altNotif[1];
       }
       const portalMatch = rawLinks.match(/\[(?:Apply|Online|Portal)[^\]]*\]\(([^)]+)\)/i);
       if (portalMatch) applyUrl = portalMatch[1];
    }
    
    let feeGen = null, feeSC = null, feeST = null, feePWBD = null, feeNote = null;
    const feeMatch = extractMatch(sec, /\*\s*\**(?:Application )?Fee\**:\s*(.*)/i);
    if (feeMatch) {
       const numMatch = feeMatch.match(/(?:Rs\.?|₹)\s*(\d+)/i);
       if (numMatch) feeGen = parseInt(numMatch[1], 10);
       feeNote = feeMatch.replace(/\*\s*/g, '').trim();
       if (feeNote.toLowerCase().includes('exempt') || feeNote.toLowerCase().includes('nil') || feeNote.toLowerCase().includes('no fee')) {
          feeSC = 0; feeST = 0; feePWBD = 0;
       }
    }

    results.push({
      title,
      org,
      advt,
      totalVacancies,
      eligibilityStr: eligStr ? eligStr.replace(/\*\s*/g, '').replace(/Mandatory:/, '').trim().slice(0, 500) : null,
      minQual,
      minAge,
      maxAge,
      applyLast,
      examDate,
      fee: { general: feeGen, sc: feeSC, st: feeST, pwbd: feePWBD, note: feeNote },
      urls: { notification: notifUrl, apply: applyUrl }
    });
  }
  return results;
}

function extractDatesFromTable(md: string, results: any[]) {
    const lines = md.split('\n');
    let inTable = false;
    for (const line of lines) {
        if (line.includes('| No. | Category |')) {
            inTable = true;
            continue;
        }
        if (inTable && line.startsWith('|')) {
            if (line.includes('---')) continue;
            const parts = line.split('|').map(p => p.trim());
            if (parts.length >= 6) {
                const titleStr = parts[3];
                const titleMatch = titleStr.match(/\[([^\]]+)\]/);
                if (titleMatch) {
                    const tableTitle = titleMatch[1];
                    const dateRaw = parts[5];
                    const dateMatch = dateRaw.match(/(\d{2}\/\d{2}\/\d{4})/g);
                    if (dateMatch && dateMatch.length >= 2) {
                        const lastDateStr = dateMatch[dateMatch.length-1];
                        const dparts = lastDateStr.split('/');
                        const isoDate = `${dparts[2]}-${dparts[1]}-${dparts[0]}`;
                        
                        for (const r of results) {
                             if (r.title.includes(tableTitle) || tableTitle.includes(r.title.replace(' Recruitment 2026', ''))) {
                                 if (!r.applyLast) r.applyLast = isoDate;
                             }
                        }
                    }
                }
            }
        } else if (inTable && !line.trim()) {
            inTable = false; 
        }
    }
}

async function main() {
  const md = fs.readFileSync("/Users/mangalam/Downloads/government_job_notifications_india_2026.md", "utf8");
  const extracted = parseDetails(md);
  extractDatesFromTable(md, extracted);
  console.log(`Parsed ${extracted.length} notifications`);
  
  let staff = await prisma.user.findFirst({ where: { role: 'admin' } });
  if (!staff) {
     staff = await prisma.user.create({
         data: {
             id: 'seed-admin',
             email: 'admin@thenoticeboard.in',
             fullName: 'Admin',
             passwordHash: 'dummy',
             role: 'admin'
         }
     });
  }

  // Clear existing items that were seeded from CLI before
  await prisma.notification.deleteMany({
      where: { origin: 'pdf_verified' }
  });

  for (const item of extracted) {
     const applyUrl = item.urls.apply || '';
     let sourceUrl = '';
     if (applyUrl) {
         try {
           sourceUrl = new URL(applyUrl).origin;
         } catch(e) {}
     }
     
     const tl = item.title.toLowerCase();
     let sector = "central_govt";
     if (tl.includes('ssc') || tl.includes('upsc') || tl.includes('nic') || tl.includes('ibps') || tl.includes('rrb') || tl.includes('isro')) {
         sector = "central_govt";
     } else if (tl.includes('ukpsc') || tl.includes('hppsc') || tl.includes('uppsc') || tl.includes('bpsc') || tl.includes('police')) {
         sector = "state_govt";
     }

     const postNames = [];
     if (item.title.match(/Sub-Inspector/i)) postNames.push("Sub-Inspector (SI)");
     if (item.title.match(/Constable/i)) postNames.push("Constable");
     if (item.title.match(/Engineer/i)) postNames.push("Junior Engineer (JE)");
     
     // Find or create exact organization for this notification
     let short = item.org.substring(0, 50); // Fallback shortname
     let actualOrg = await prisma.organization.findFirst({ where: { name: item.org }});
     if (!actualOrg) {
         actualOrg = await prisma.organization.create({ data: { name: item.org, shortName: short, sector }});
     }

     console.log(`Saving: ${item.title} ending ${item.applyLast}`);
     
     await prisma.notification.create({
         data: {
             title: item.title,
             summary: item.org ? `Recruitment by ${item.org}` : null,
             advertisementNo: item.advt,
             totalVacancies: item.totalVacancies,
             minQualification: item.minQual,
             qualificationDetails: item.eligibilityStr,
             minAge: item.minAge,
             maxAge: item.maxAge,
             applyLast: item.applyLast,
             examDate: item.examDate,
             officialNotificationPdfUrl: item.urls.notification || '',
             applyUrl: applyUrl,
             officialSourceUrl: sourceUrl,
             fees: item.fee,
             
             status: 'published',
             origin: 'pdf_verified',
             isSample: false,
             sector: sector,
             postNames: postNames,
             
             reviewedById: staff.id,
             reviewedAt: new Date(),
             sourceVerifiedAt: new Date(),
             
             organizationId: actualOrg.id
         }
     });
  }
  
  console.log("Database seeded with verified PDF items!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
