import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { formatDate } from "@/lib/domain";
import { ReviewQueueList } from "@/components/ReviewQueueList";

export const dynamic = "force-dynamic";

export default async function ReviewQueuePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: queryTab } = await searchParams;
  await requireStaff();
  const tabs = [
    { key: "pending_review", label: "Pending review" },
    { key: "published", label: "Published" },
    { key: "rejected", label: "Rejected" },
  ] as const;
  const tab = (queryTab ?? "pending_review") as "pending_review" | "published" | "rejected";

  const items = await prisma.notification.findMany({
    where: { status: tab },
    include: { organization: true, source: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const counts = await Promise.all(
    tabs.map(async (t) => ({ key: t.key, n: await prisma.notification.count({ where: { status: t.key } }) })),
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Review queue</h1>
        <p className="text-sm text-muted-foreground">
          Scraped and submitted notices land here as drafts. Nothing is ever auto-published.
        </p>
      </div>

      <div className="flex gap-1">
        {tabs.map((t) => {
          const c = counts.find((x) => x.key === t.key);
          return (
            <Link
              key={t.key}
              href={`/admin/review?tab=${t.key}`}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                t.key === tab ? "bg-accent text-foreground hover:bg-accent/80" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label} · {c?.n ?? 0}
            </Link>
          );
        })}
      </div>

      {items.length === 0 ? (
        <div className="card p-8 text-center text-sm text-muted-foreground">
          Queue is empty. Run a source or submit a notice to see drafts here.
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
          {items.map((n) => (
            <li key={n.id}>
              <ReviewQueueList
                id={n.id}
                title={n.title}
                orgShortName={n.organization?.shortName ?? "-"}
                sourceName={n.source?.name ?? null}
                origin={n.origin}
                advertisementNo={n.advertisementNo}
                totalVacancies={n.totalVacancies}
                minQualification={n.minQualification}
                applyLast={n.applyLast}
                createdAt={n.createdAt.toISOString()}
                maxAge={n.maxAge}
                rejectReason={n.status === "rejected" ? n.rejectReason : null}
                discoveredUrl={n.discoveredUrl}
                officialSourceUrl={n.officialSourceUrl}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}