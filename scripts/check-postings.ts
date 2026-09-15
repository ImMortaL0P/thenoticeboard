import { prisma } from "../src/lib/db";
async function run() {
  const count = await prisma.notification.count({ where: { status: "pending_review" } });
  const recent = await prisma.notification.findMany({ 
    where: { status: "pending_review" },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { title: true, officialSourceUrl: true }
  });
  console.log(`Pending Review: ${count}`);
  console.log(recent);
}
run();
