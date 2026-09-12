import { prisma } from "../src/lib/db";
async function count() {
  const c = await prisma.notification.count();
  console.log(`Total: ${c}`);
}
count().finally(() => prisma.$disconnect());
