import { prisma } from "../src/lib/db";
async function run() {
  const n = await prisma.notification.findMany({ select: { title: true, isSample: true, applyLast: true, minAge: true, status: true } });
  console.log(n.length, "total");
  console.log(n.filter(x => !x.isSample).slice(0, 5));
}
run();
