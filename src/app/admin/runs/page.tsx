import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function RunsPage() {
  await requireStaff();
  const runs = await prisma.scrapeRun.findMany({
    include: { source: true },
    orderBy: { startedAt: "desc" },
    take: 60,
  });

  const statusChip = (status: string) => {
    if (status === "ok") return <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">ok</span>;
    if (status === "running") return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">running</span>;
    return <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">error</span>;
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Scrape runs</h1>
        <p className="text-sm text-muted-foreground">Last 60 runs across all sources.</p>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="table-base w-full min-w-[40rem]">
          <thead>
            <tr>
              <th>Started</th>
              <th>Source</th>
              <th>Status</th>
              <th className="text-right">Links</th>
              <th className="text-right">New</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  No runs yet.
                </td>
              </tr>
            ) : (
              runs.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap text-muted-foreground">
                    {r.startedAt.toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td className="max-w-[16rem] truncate font-medium">{r.source?.name ?? "—"}</td>
                  <td>{statusChip(r.status)}</td>
                  <td className="text-right tabular-nums">{r.linksFound}</td>
                  <td className="text-right tabular-nums">{r.newItems}</td>
                  <td className="max-w-[22rem] truncate text-xs text-muted-foreground" title={r.message ?? ""}>
                    {r.message ?? "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}