import fs from "fs";
import { prisma } from "../src/lib/db";

async function main() {
  const filePath = "/Users/mangalam/Downloads/government_job_notifications_india_2026.md";
  const content = fs.readFileSync(filePath, "utf-8");

  console.log("Removing dummy data (isSample: true)...");
  await prisma.notification.deleteMany({ where: { isSample: true } });

  // Notice that we leave existing Organizations and Sources alone, unless they are implicitly dummy
  // Wait, there's no `isSample` field on Source. But that's fine, we will just add the new ones.
  // actually I can just run it.

  console.log("Parsing markdown...");

  const extractUrls = (htmlText: string) => {
    const notifMatch = htmlText.match(/\[Notification\]\(([^)]+)\)/);
    const portalMatch = htmlText.match(/\[Portal\]\(([^)]+)\)/);
    // some just have Portal
    const singleMatch = htmlText.match(/\[Portal\]\(([^)]+)\)/);
    return {
      notificationUrl: notifMatch ? notifMatch[1] : null,
      portalUrl: portalMatch ? portalMatch[1] : (singleMatch ? singleMatch[1] : null),
    };
  };

  const lines = content.split('\n');
  let tableStarted = false;

  for (const line of lines) {
    if (line.includes('| 1 |')) {
      tableStarted = true;
    }
    if (tableStarted && line.startsWith('| ')) {
      // Parse columns
      const cols = line.split('|').map(c => c.trim()).filter(c => c.length > 0);
      if (cols.length < 7) continue;

      const no = cols[0];
      if (no === 'No.') continue; // header

      const category = cols[1].replace(/\*\*/g, '');
      const recruitmentBodyRaw = cols[2];
      const vacanciesRaw = cols[3];
      const applyWindow = cols[4];
      const eligibility = cols[5];
      const linksRaw = cols[6];

      const bodyMatch = recruitmentBodyRaw.match(/\[(.*?)\]/);
      if (!bodyMatch) {
         // Maybe it has no link in it, just text?
         continue;
      }
      const title = bodyMatch[1];

      // parse URLs
      let { notificationUrl, portalUrl } = extractUrls(linksRaw);

      if (!portalUrl) {
          // fallback, maybe it's just a raw link or missing "Portal" specifically
          const linkPattern = /\[.*?\]\((.*?)\)/g;
          const matches = [...linksRaw.matchAll(linkPattern)];
          if (matches.length > 0) {
             portalUrl = matches[matches.length - 1][1];
             if (matches.length > 1) {
                notificationUrl = matches[0][1];
             }
          }
      }

      if (!portalUrl) continue;

      let orgName = title.split(' ')[0] || "Govt";
      if (title.includes("UPSC")) orgName = "UPSC";
      else if (title.includes("SSC")) orgName = "SSC";
      else if (title.includes("RRB")) orgName = "RRB";
      else if (title.includes("PSU")) orgName = "PSU";
      else if (title.includes("UPSSSC")) orgName = "UPSSSC";
      else orgName = title.substring(0, 15);

      const orgShort = (orgName.toLowerCase().replace(/[^a-z0-9]/g, '') + '_' + no);

      // Upsert Organizaion
      const org = await prisma.organization.upsert({
        where: { shortName: orgShort },
        update: {},
        create: {
          name: orgName,
          shortName: orgShort,
          sector: "central_govt", // simple default
        }
      });

      // Insert Source
      const sourceCheck = await prisma.source.findUnique({ where: { url: portalUrl } });
      if (!sourceCheck) {
        await prisma.source.create({
          data: {
            name: title + " Portal",
            url: portalUrl,
            sector: "unknown",
            organizationId: org.id,
            active: true
          }
        });
      }

      // Add Notification
      await prisma.notification.create({
        data: {
          organizationId: org.id,
          title: title,
          sector: "central_govt", // simple default
          summary: `Vacancies: ${vacanciesRaw}. Window: ${applyWindow}. Eligibility: ${eligibility}`,
          status: "pending_review",
          officialNotificationPdfUrl: notificationUrl,
          applyUrl: portalUrl,
          origin: "manual",
          isSample: false
        }
      });

      console.log(`Added: ${title}`);
    } else if (tableStarted && line.trim() === '') {
      tableStarted = false; // end of table
    }
  }

  console.log("Done.");
}

main().catch(console.error);