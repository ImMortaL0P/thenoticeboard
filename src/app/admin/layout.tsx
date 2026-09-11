import { type ReactNode } from "react";
import { requireStaff } from "@/lib/auth";
import { AdminNav } from "@/components/AdminNav";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireStaff();
  const pendingCount = await prisma.notification.count({ where: { status: "pending_review" } });
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8">
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[220px_1fr]">
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <AdminNav
            pendingCount={pendingCount}
            role={user.role}
            userLabel={user.fullName ?? user.email}
          />
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}