import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const orgs = await prisma.organization.findMany({
    where: {
      name: { contains: "Bank of India", mode: "insensitive" }
    }
  });

  console.log("Found matching orgs:");
  for (const org of orgs) {
    const noticeCount = await prisma.notification.count({
      where: { organizationId: org.id }
    });
    console.log(`- ID: ${org.id} | Name: "${org.name}" | ShortName: "${org.shortName}" | Notices: ${noticeCount}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
