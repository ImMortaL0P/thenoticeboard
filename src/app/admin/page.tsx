import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const user = await requireStaff();
  const [published, pending, sources, users] = await Promise.all([
    prisma.notification.count({ where: { status: "published" } }),
    prisma.notification.count({ where: { status: "pending_review" } }),
    prisma.source.count({ where: { active: true } }),
    prisma.user.count(),
  ]);
  const stats = [
    ["Published notices", published],
    ["Waiting for review", pending],
    ["Active sources", sources],
    ["Users", users],
  ] as const;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin</h1>
        <p className="text-sm text-muted-foreground">Signed in as {user.email} ({user.role})</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map(([label, value]) => (
          <div key={label} className="card p-4">
            <div className="text-2xl font-bold">{value}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>
      <div className="card p-5 text-sm text-muted-foreground">
        Review queue, notice editor, source manager, employer verification and scraper logs are built in
        <strong className="text-foreground"> Phase 3</strong> (see PLAN.md). Until then, use <code>npm run db:studio</code> to edit data directly.
      </div>
    </div>
  );
}
