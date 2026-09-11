import { prisma } from "@/lib/db";
import { toNotice } from "@/lib/domain";
import { getCurrentUser } from "@/lib/auth";
import { Calendar } from "@/components/Calendar";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const [rows, user] = await Promise.all([
    prisma.notification.findMany({
      where: { status: { in: ["published", "closed"] } },
      include: { organization: true },
      orderBy: { applyLast: "asc" },
    }),
    getCurrentUser(),
  ]);

  let savedIds: string[] = [];
  if (user) {
    const saved = await prisma.savedNotification.findMany({
      where: { userId: user.id },
      select: { notificationId: true },
    });
    savedIds = saved.map((s) => s.notificationId);
  }

  return (
    <Calendar notices={rows.map(toNotice)} savedIds={savedIds} hasUser={!!user} />
  );
}