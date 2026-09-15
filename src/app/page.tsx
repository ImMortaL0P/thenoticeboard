import { Suspense } from "react";
import { prisma } from "@/lib/db";
import { toNotice } from "@/lib/domain";
import { getCurrentUser } from "@/lib/auth";
import { profileToInput } from "@/lib/profile";
import { Board } from "@/components/Board";
import { BackedBy } from "@/components/BackedBy";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [rows, user] = await Promise.all([
    prisma.notification.findMany({
      where: { status: { in: ["published", "closed"] } },
      include: { organization: true },
      orderBy: { applyLast: "asc" },
    }),
    getCurrentUser(),
  ]);
  return (
    <>
      <Suspense>
        <Board notices={rows.map(toNotice)} profile={profileToInput(user)} />
      </Suspense>
      <BackedBy />
    </>
  );
}
