import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const sourceId = "6aa4f2c11f5b476ba742ffcf"; // bankofindia_18
  const targetId = "6aa4f7c90f7759b8893d5992"; // Bank of India.

  const sourceOrg = await prisma.organization.findUnique({ where: { id: sourceId } });
  const targetOrg = await prisma.organization.findUnique({ where: { id: targetId } });

  if (!sourceOrg || !targetOrg) {
    console.error("One or both orgs not found.");
    return;
  }

  console.log(`Merging "${sourceOrg.name}" (${sourceOrg.shortName}) into "${targetOrg.name}" (${targetOrg.shortName})...`);

  // Update Notifications
  const updateNotices = await prisma.notification.updateMany({
    where: { organizationId: sourceId },
    data: { organizationId: targetId }
  });
  console.log(`Updated ${updateNotices.count} notifications.`);

  // Update Sources
  const updateSources = await prisma.source.updateMany({
    where: { organizationId: sourceId },
    data: { organizationId: targetId }
  });
  console.log(`Updated ${updateSources.count} sources.`);

  // Update Employer Profiles if applicable
  const updateProfiles = await prisma.employerProfile.updateMany({
    where: { organizationId: sourceId },
    data: { organizationId: targetId }
  });
  console.log(`Updated ${updateProfiles.count} employer profiles.`);

  // Clean up the name of the target to remove the trailing dot if desired
  await prisma.organization.update({
    where: { id: targetId },
    data: {
      name: "Bank of India",
      shortName: "Bank of India"
    }
  }).catch(e => console.error("Error updating target name:", e));

  // Delete the source org
  await prisma.organization.delete({
    where: { id: sourceId }
  });

  console.log("Merge complete. Duplicate deleted.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
