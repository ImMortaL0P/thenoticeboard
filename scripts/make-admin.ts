// Usage: npm run make-admin -- someone@example.com [admin|reviewer]
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const [email, role = "admin"] = process.argv.slice(2);
if (!email) {
  console.error("Usage: npm run make-admin -- <email> [admin|reviewer]");
  process.exit(1);
}
prisma.user
  .update({ where: { email: email.toLowerCase() }, data: { role } })
  .then((u) => console.log(`${u.email} is now ${u.role}`))
  .catch(() => console.error("No user with that email. Ask them to sign up first."))
  .finally(() => prisma.$disconnect());
