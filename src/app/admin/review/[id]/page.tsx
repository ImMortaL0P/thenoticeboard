import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { ReviewForm } from "@/components/ReviewForm";

export const dynamic = "force-dynamic";

export default async function ReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const notice = await prisma.notification.findUnique({
    where: { id },
    include: { organization: true, source: true },
  });
  if (!notice) notFound();

  const fees = (notice.fees ?? {}) as Record<string, number | string>;
  const postNames = Array.isArray(notice.postNames) ? notice.postNames : [];

  const defaults = {
    title: notice.title,
    titleHi: notice.titleHi ?? "",
    summary: notice.summary ?? "",
    summaryHi: notice.summaryHi ?? "",
    advertisementNo: notice.advertisementNo ?? "",
    postNames: postNames.join(", "),
    totalVacancies: notice.totalVacancies ?? 0,
    minQualification: notice.minQualification,
    qualificationDetails: notice.qualificationDetails ?? "",
    minAge: notice.minAge ?? 0,
    maxAge: notice.maxAge ?? 0,
    ageCutoffDate: notice.ageCutoffDate ?? "",
    applyLast: notice.applyLast ?? "",
    feeLast: notice.feeLast ?? "",
    examDate: notice.examDate ?? "",
    admitCardDate: notice.admitCardDate ?? "",
    resultDate: notice.resultDate ?? "",
    notificationDate: notice.notificationDate ?? "",
    state: notice.state ?? "",
    location: notice.location ?? "",
    payLevel: notice.payLevel ?? "",
    selectionProcess: notice.selectionProcess ?? "",
    applyUrl: notice.applyUrl ?? "",
    officialNotificationPdfUrl: notice.officialNotificationPdfUrl ?? "",
    officialSourceUrl: notice.officialSourceUrl ?? "",
    feeGeneral: typeof fees.general === "number" ? fees.general : 0,
    feeReserved: typeof fees.sc === "number" ? fees.sc : 0,
    feeOther: typeof fees.note === "string" ? fees.note : "",
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs text-muted-foreground">
            <Link href="/admin/review" className="hover:text-foreground">Review queue</Link>
            {" / "}Review
          </div>
          <h1 className="text-lg font-bold leading-tight">{notice.title}</h1>
          <p className="text-sm text-muted-foreground">
            {notice.organization?.name ?? "Unknown org"} ·{" "}
            {notice.status === "pending_review"
              ? `submitted ${notice.createdAt.toLocaleDateString("en-IN")}`
              : notice.status}
            {notice.origin === "scraper" && notice.source ? ` · scraped from ${notice.source.name}` : ""}
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          {notice.discoveredUrl && notice.extractionMethod === "rules" && (
            <a href={notice.discoveredUrl} target="_blank" rel="noreferrer" className="btn btn-outline">
              Open scraped page ↗
            </a>
          )}
          {notice.officialNotificationPdfUrl && (
            <a href={notice.officialNotificationPdfUrl} target="_blank" rel="noreferrer" className="btn btn-outline">
              Official PDF ↗
            </a>
          )}
        </div>
      </div>

      <ReviewForm defaults={defaults} id={notice.id} extractionMethod={notice.extractionMethod} />

      {notice.rawText && (
        <details className="card p-4">
          <summary className="cursor-pointer select-none text-sm font-medium text-muted-foreground">
            Raw extracted text ({notice.rawText.length.toLocaleString("en-IN")} chars)
            {notice.extractionMethod === "rules" && " — auto-extracted, verify before approving"}
          </summary>
          <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-4 text-xs leading-relaxed text-foreground/80">
            {notice.rawText}
          </pre>
        </details>
      )}
    </div>
  );
}