import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { formatDate } from "@/lib/domain";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const user = await requireStaff();
  const [published, pending, activeSources, users, recentPending, recentRuns, unhealthy] = await Promise.all([
    prisma.notification.count({ where: { status: "published" } }),
    prisma.notification.count({ where: { status: "pending_review" } }),
    prisma.source.count({ where: { active: true } }),
    prisma.user.count(),
    prisma.notification.findMany({
      where: { status: "pending_review" },
      include: { organization: true, source: true },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    prisma.scrapeRun.findMany({
      include: { source: true },
      orderBy: { startedAt: "desc" },
      take: 6,
    }),
    prisma.source.findMany({
      where: { active: true, OR: [{ lastStatus: "error" }, { failCount: { gte: 2 } }] },
      select: { id: true, name: true, lastError: true, failCount: true },
    }),
  ]);

  const stats: Array<[string, number, string?]> = [
    ["Published", published, "/admin/review?tab=published"],
    ["Pending review", pending, "/admin/review"],
    ["Active sources", activeSources, "/admin/sources"],
    ["Users", users, undefined],
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">{user.fullName ?? user.email} · {user.role}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map(([label, value, href]) => (
          <div key={label} className="card p-4">
            <div className="text-2xl font-bold">{value}</div>
            <div className="text-xs text-muted-foreground">
              {href ? <Link href={href} className="hover:text-foreground">{label}</Link> : label}
            </div>
          </div>
        ))}
      </div>

      {unhealthy.length > 0 && (
        <div className="card border-amber-300 p-4 text-sm">
          <div className="mb-2 font-semibold text-amber-800">⚠ {unhealthy.length} unhealthy source(s)</div>
          <ul className="space-y-1 text-muted-foreground">
            {unhealthy.map((s) => (
              <li key={s.id}>
                <Link href="/admin/sources" className="font-medium text-foreground hover:underline">{s.name}</Link>
                {" — "}{s.lastError ?? `${s.failCount} consecutive failures`}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Waiting for review</h2>
            <Link href="/admin/review" className="text-sm text-primary hover:underline">View all</Link>
          </div>
          {recentPending.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing in the queue.</p>
          ) : (
            <ul className="divide-y divide-border">
              {recentPending.map((n) => (
                <li key={n.id} className="flex items-center gap-3 py-2.5">
                  <Link
                    href={`/admin/review/${n.id}`}
                    className="min-w-0 flex-1 truncate text-sm font-medium hover:text-primary"
                  >
                    {n.title}
                  </Link>
                  <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                    {n.organization?.shortName ?? "—"}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDate(n.createdAt.toISOString())}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Recent scrape runs</h2>
            <Link href="/admin/runs" className="text-sm text-primary hover:underline">View all</Link>
          </div>
          {recentRuns.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs yet. Add a source and hit “Run now”.</p>
          ) : (
            <ul className="divide-y divide-border">
              {recentRuns.map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${r.status === "ok" ? "bg-emerald-500" : r.status === "running" ? "bg-amber-500" : "bg-red-500"}`} />
                  <span className="min-w-0 flex-1 truncate font-medium">{r.source?.name ?? "—"}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {r.linksFound} links · {r.newItems} new
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDate(r.startedAt.toISOString())}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}