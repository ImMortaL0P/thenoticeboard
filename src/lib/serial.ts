import { prisma } from "./db";

export async function getNextNotificationSerialNumber(): Promise<number> {
  const maxAgg = await prisma.notification.aggregate({
    _max: { serialNumber: true }
  });
  return (maxAgg._max.serialNumber ?? 0) + 1;
}
