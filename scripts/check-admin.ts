import { prisma } from "../src/lib/db";
async function check() {
  const admin = await prisma.user.findFirst({ where: { role: "admin" } });
  if (admin) console.log("Admin exists:", admin.email);
  else console.log("No admin found");
}
check();
