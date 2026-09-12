import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { SourcesTable, type SourceRowData } from "@/components/SourcesTable";
import { AddSourceForm, RunAllSourcesButton } from "@/components/SourceControls";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const user = await requireAdmin();
  const sources = await prisma.source.findMany({
    include: { organization: true },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });

  const rows: SourceRowData[] = sources.map((s) => ({
    id: s.id,
    name: s.name,
    url: s.url,
    sector: s.sector,
    kind: s.kind,
    intervalHours: s.intervalHours,
    active: s.active,
    linkSelector: s.linkSelector,
    includePattern: s.includePattern,
    excludePattern: s.excludePattern,
    createdAt: s.createdAt.toISOString(),
    lastRunAt: s.lastRunAt?.toISOString() ?? null,
    lastStatus: s.lastStatus,
    lastError: s.lastError,
    failCount: s.failCount,
  }));

  const isAdmin = user.role === "admin";

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold">Sources</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Official/index pages the scraper monitors. “Run now” fetches, parses and files new drafts as
            pending review.
          </p>
        </div>
        {isAdmin && <RunAllSourcesButton />}
      </div>
      
      {isAdmin && <AddSourceForm />}

      {rows.length === 0 ? (
        <div className="card p-8 text-center text-sm text-muted-foreground mt-8">
          No sources configured yet.
        </div>
      ) : (
        <SourcesTable sources={rows} isAdmin={isAdmin} />
      )}
    </div>
  );
}
