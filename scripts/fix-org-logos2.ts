import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();

async function main() {
  const md = fs.readFileSync("/Users/mangalam/Downloads/government_job_notifications_india_2026.md", "utf8");
  
  const urlMapping: Record<string, string> = {};
  
  const lines = md.split('\n');
  let inTable = false;
  for (const line of lines) {
      if (line.includes('| No. | Category |')) {
          inTable = true;
          continue;
      }
      if (inTable && line.startsWith('|')) {
          if (line.includes('---')) continue;
          
          // Use regex to get title and URLs instead of strict column split due to \|
          const titleMatch = line.match(/\[([^\]]+)\]\(#[^)]+\)/);
          if (!titleMatch) continue;
          const tableTitle = titleMatch[1];
          
          // Get all http(s) links in this line
          const urls = [...line.matchAll(/https?:\/\/[^\s)\/]+/g)].map(m => m[0]);
          if (urls.length > 0) {
              // The last URL is typically the portal, the first is gov PDF
              // Domain is what we want for logging.
              const portalDomain = urls[urls.length - 1];
              urlMapping[tableTitle] = portalDomain;
          }
      } else if (inTable && !line.trim()) {
          inTable = false; 
      }
  }

  console.log("Found mapping for", Object.keys(urlMapping).length, "items.");

  const verified = await prisma.notification.findMany({ 
      where: { origin: 'pdf_verified' },
      include: { organization: true }
  });
  
  let updated = 0;
  for (const item of verified) {
       let thisUrl = urlMapping[item.title];
       if (!thisUrl) {
           for (const [tTitle, url] of Object.entries(urlMapping)) {
                if (item.title.includes(tTitle) || tTitle.includes(item.title.replace(' Recruitment 2026', ''))) {
                    thisUrl = url;
                    break;
                }
           }
       }
       
       if (thisUrl) {
           let domain = '';
           try {
             domain = new URL(thisUrl).origin;
           } catch(e) { domain = thisUrl; }
           
           if (!item.applyUrl) {
               await prisma.notification.update({
                  where: { id: item.id },
                  data: { 
                     applyUrl: thisUrl,
                     officialSourceUrl: domain
                  }
               });
           }
           
           const logo = `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(domain)}&size=256`;
           
           if (!item.organization.logoUrl || item.organization.logoUrl === '') {
               await prisma.organization.update({
                  where: { id: item.organization.id },
                  data: {
                      officialWebsite: domain,
                      logoUrl: logo
                  }
               });
               updated++;
           }
       }
  }
  
  // Hardcode missing ones just in case
  const hardcoded = {
     'UPSC': 'https://upsc.gov.in',
     'SSC': 'https://ssc.gov.in',
     'RRB': 'https://indianrailways.gov.in',
     'ISRO': 'https://isro.gov.in',
     'IBPS': 'https://ibps.in',
     'SBI': 'https://sbi.co.in',
     'Bank of India': 'https://bankofindia.co.in',
     'UKPSC': 'https://psc.uk.gov.in',
     'HPPSC': 'http://www.hppsc.hp.gov.in',
     'NTPC': 'https://ntpc.co.in',
     'RCFL': 'https://rcfltd.com',
     'Delhi High Court': 'https://delhihighcourt.nic.in'
  };
  
  for (const [key, domain] of Object.entries(hardcoded)) {
       const orgs = await prisma.organization.findMany({
            where: { name: { contains: key } }
       });
       for (const org of orgs) {
           if (!org.logoUrl) {
               const logo = `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(domain)}&size=256`;
               await prisma.organization.update({
                  where: { id: org.id },
                  data: { logoUrl: logo, officialWebsite: domain }
               });
               updated++;
           }
       }
  }
  
  console.log(`Updated logos for ${updated} organizations.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
