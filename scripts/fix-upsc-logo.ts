import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Fixing UPSC logo...");
  
  // Real UPSC logo direct from their actual site (nic.in doesn't give a good favicon via the google API)
  const upscLogoUrl = "https://upsc.gov.in/sites/all/themes/upsc_theme/images/upsc_logo.png";
  
  const res = await prisma.organization.updateMany({
    where: { shortName: "UPSC" },
    data: { logoUrl: upscLogoUrl }
  });
  
  console.log(`Updated ${res.count} UPSC organization records with high-quality logo.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
