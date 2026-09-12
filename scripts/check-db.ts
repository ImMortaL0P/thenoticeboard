import { prisma } from "../src/lib/db";
async function run() {
  const n = await prisma.notification.findMany({ select: { id: true, title: true, applyLast: true, examDate: true, minAge: true, maxAge: true, totalVacancies: true } });
  console.log(n.slice(0, 5));
}
run();
