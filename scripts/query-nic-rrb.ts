import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const ids = [
    '6aa4f7c50f7759b8893d597d', // NIC
    '6aa4f7c60f7759b8893d597f', // RRB Paramedical
    '6aa4f7c60f7759b8893d5981'  // RRB JE
  ];
  for (const id of ids) {
    const n = await prisma.notification.findUnique({ where: { id } });
    console.log(n?.id, n?.title, n?.totalVacancies);
  }
}
main().finally(() => prisma.$disconnect());
