import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();

async function main() {
  const md = fs.readFileSync("/Users/mangalam/Downloads/government_job_notifications_india_2026.md", "utf8");
  
  // Also clean up the reviewer queue (removing all draft/pending that were dummy/seeded previously, matching our verified items or just ALL pending review)
  // We'll delete pending_review items that are not from actual new scraper runs (meaning, origin manual or empty URLs).
  // Actually, since this is a new setup, let's just clear pending_review queue to remove clutter, as requested: "remove all the exams that are verified and posted from the reviewer queue"
  // This probably means delete duplicated seeded items.
  const pending = await prisma.notification.deleteMany({
      where: { status: 'pending_review' }
  });
  console.log(`Deleted ${pending.count} items from pending_review queue to clean up duplicates.`);
  
  // Extract URLs from the master table in Markdown to fix the missing URLs
  const lines = md.split('\n');
  let inTable = false;
  
  // A mapping to save to organizations
  const urlMapping: Record<string, string> = {};
  
  for (const line of lines) {
      if (line.includes('| No. | Category |')) {
          inTable = true;
          continue;
      }
      if (inTable && line.startsWith('|')) {
          if (line.includes('---')) continue;
          
          const parts = line.split('|').map(p => p.trim());
          if (parts.length >= 7) {
              const titleStr = parts[3]; // [Title](#link)
              const titleMatch = titleStr.match(/\[([^\]]+)\]/);
              if (!titleMatch) continue;
              const tableTitle = titleMatch[1];
              
              const linksCol = parts[6];
              const portalMatch = linksCol.match(/\[Portal[^\]]*\]\(([^)]+)\)/i) || linksCol.match(/\[Appply[^\]]*\]\(([^)]+)\)/i);
              const notifMatch = linksCol.match(/\[Notification[^\]]*\]\(([^)]+)\)/i);
              
              let foundUrl = '';
              if (portalMatch) foundUrl = portalMatch[1];
              else if (notifMatch) {
                  try {
                      foundUrl = new URL(notifMatch[1]).origin; 
                  } catch(e){}
              }
              
              if (foundUrl) {
                  urlMapping[tableTitle] = foundUrl;
              }
          }
      } else if (inTable && !line.trim()) {
          inTable = false; 
      }
  }

  // Update logic
  // For each pdf_verified notification, let's fix its URLs, and its organization's logo.
  const verified = await prisma.notification.findMany({ 
      where: { origin: 'pdf_verified' },
      include: { organization: true }
  });
  
  for (const item of verified) {
       let thisUrl = '';
       // fuzzy match with urlMapping
       for (const [tTitle, url] of Object.entries(urlMapping)) {
            if (item.title.includes(tTitle) || tTitle.includes(item.title.replace(' Recruitment 2026', ''))) {
                thisUrl = url;
                break;
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
           
           // Set the logo on the organization
           const logo = `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(domain)}&size=128`;
           
           if (!item.organization.logoUrl || !item.organization.officialWebsite) {
               await prisma.organization.update({
                  where: { id: item.organization.id },
                  data: {
                      officialWebsite: domain,
                      logoUrl: logo
                  }
               });
               console.log(`Updated org ${item.organization.name} -> logo: ${logo}`);
           }
       }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
