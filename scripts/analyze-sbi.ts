import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const notifs = await prisma.notification.findMany({
    where: { org: { isNot: null } } // just bypass compiling error
  });
}
