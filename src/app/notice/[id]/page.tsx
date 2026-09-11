import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, BadgeCheck, CalendarPlus, Download, ExternalLink, Globe } from "lucide-react";
import { prisma } from "@/lib/db";
import { getT } from "@/lib/i18n-server";
import { getCurrentUser } from "@/lib/auth";
import { profileToInput } from "@/lib/profile";
import {
  FEE_KEYS,
  checkEligibility,
  formatDate,
  formatFee,
  formatNumber,
  getDeadline,
  hostOf,
  toNotice,
  toneClasses,
} from "@/lib/domain";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ id: string }> };

async function load(id: string) {
  const row = await prisma.notification.findFirst({
    where: { id, status: { in: ["published", "closed"] } },
    include: { organization: true, updates: { orderBy: { date: "desc" } } },
  });
  return row;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const row = await load((await params).id);
  return row ? { title: row.title, description: row.summary ?? undefined } : { title: "Not found" };
}

export default async function NoticePage({ params }: Props) {
  const { id } = await params;
  const [row, { t, lang }, user] = await Promise.all([load(id), getT(), getCurrentUser()]);
  if (!row) notFound();
  const n = toNotice(row);
  const d = getDeadline(n);
  const profile = profileToInput(user);
  const elig = profile ? checkEligibility(n, profile) : null;
  const title = lang === "hi" && n.titleHi ? n.titleHi : n.title;
  const summary = lang === "hi" && n.summaryHi ? n.summaryHi : n.summary;

  const dates: [string, string | null][] = [
    ["dates.notification", n.notificationDate],
    ["dates.applyStart", n.applyStart],
    ["dates.applyLast", n.applyLast],
    ["dates.feeLast", n.feeLast],
    ["dates.admitCard", n.admitCardDate],
    ["dates.examDate", n.examDate],
    ["dates.result", n.resultDate],
  ];
  const relax = Object.entries(n.ageRelaxation).filter(([, v]) => v > 0);
  const relaxLabel: Record<string, string> = { sc_st: "SC / ST", obc: "OBC", ews: "EWS", pwbd: "PwBD", esm: "Ex-servicemen", female: "Women" };

  return (
    <div className="space-y-6">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {t("detail.backToBoard")}
      </Link>

      <header className="card space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{n.organization?.name}</span>
          <span>·</span>
          <span>{t(`sector.${n.sector}`)}</span>
          {n.isSample && <span className="chip border-border bg-muted">{t("card.sample")}</span>}
        </div>
        <h1 className="text-xl font-bold leading-tight sm:text-2xl">{title}</h1>
        {summary && <p className="text-sm text-muted-foreground">{summary}</p>}
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <Fact label={t("card.vacancies")} value={formatNumber(n.totalVacancies)} />
          <Fact label={t("card.lastDate")} value={formatDate(n.applyLast, lang)} />
          <Fact label={t("card.age")} value={`${n.minAge ?? "—"}–${n.maxAge ?? "—"}`} />
          <Fact label={t("card.qualification")} value={t(`qual.${n.minQualification}`)} />
          <Fact label={t("card.fee")} value={`${formatFee(n.fees.general ?? null, t("card.free"))} / ${formatFee(n.fees.sc ?? null, t("card.free"))}`} />
          <Fact label={t("detail.advertisement")} value={n.advertisementNo ?? "—"} />
        </dl>
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("chip", toneClasses[d.tone])}>{t(`status.${d.boardStatus === "closing_soon" ? "closingSoon" : d.boardStatus}`)}</span>
          <span className="inline-flex items-center gap-1 text-xs text-verified">
            <BadgeCheck className="size-3.5" /> {t("card.verifiedFrom", { source: hostOf(n.officialSourceUrl) })}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {n.officialNotificationPdfUrl && (
            <a href={n.officialNotificationPdfUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
              <Download className="size-4" /> {t("detail.downloadPdf")}
            </a>
          )}
          {n.applyUrl && (
            <a href={n.applyUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline">
              <ExternalLink className="size-4" /> {t("detail.applyOnline")}
            </a>
          )}
          {n.officialSourceUrl && (
            <a href={n.officialSourceUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline">
              <Globe className="size-4" /> {t("detail.officialWebsite")}
            </a>
          )}
          <a href={`/notice/${n.id}/ics`} className="btn btn-ghost">
            <CalendarPlus className="size-4" /> {t("detail.addToCalendar")}
          </a>
        </div>
        <p className="text-xs text-muted-foreground">{t("detail.verifyNote")}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Section title={t("detail.importantDates")}>
            <ol className="space-y-2">
              {dates.map(([k, v]) => (
                <li key={k} className="flex justify-between gap-4 border-b border-border pb-2 text-sm last:border-0">
                  <span className="text-muted-foreground">{t(k)}</span>
                  <span className="font-semibold">{v ? formatDate(v, lang) : t("dates.tbd")}</span>
                </li>
              ))}
            </ol>
          </Section>

          <Section title={t("detail.eligibility")}>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Fact label={t("detail.ageLimit")} value={`${n.minAge ?? "—"}–${n.maxAge ?? "—"} ${n.ageCutoffDate ? `(${t("detail.cutoffDate", { date: formatDate(n.ageCutoffDate, lang) })})` : ""}`} />
              <Fact label={t("detail.minQualification")} value={t(`qual.${n.minQualification}`)} />
              {n.streams.length > 0 && <Fact label={t("detail.streams")} value={n.streams.join(", ")} />}
              {n.experienceRequiredYears > 0 && <Fact label={t("card.experience")} value={t("detail.years", { n: n.experienceRequiredYears })} />}
            </dl>
            {n.qualificationDetails && <p className="mt-3 text-sm">{n.qualificationDetails}</p>}
            {relax.length > 0 && (
              <div className="mt-4">
                <h3 className="mb-2 text-sm font-semibold">{t("detail.ageRelaxation")}</h3>
                <table className="table-base">
                  <thead><tr><th>{t("detail.category")}</th><th>{t("detail.relaxationYears")}</th><th>{t("detail.effectiveMaxAge")}</th></tr></thead>
                  <tbody>
                    {relax.map(([k, v]) => (
                      <tr key={k}><td>{relaxLabel[k] ?? k}</td><td>+{v}</td><td>{n.maxAge !== null ? n.maxAge + v : "—"}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <div className="grid gap-6 sm:grid-cols-2">
            <Section title={t("detail.fees")}>
              <table className="table-base">
                <tbody>
                  {FEE_KEYS.filter((k) => n.fees[k] !== undefined).map((k) => (
                    <tr key={k}><td className="capitalize">{k === "general" ? "General / UR" : k.toUpperCase()}</td><td className="text-right font-semibold">{formatFee(n.fees[k], t("card.free"))}</td></tr>
                  ))}
                </tbody>
              </table>
            </Section>
            <Section title={t("detail.vacancyBreakup")}>
              <table className="table-base">
                <tbody>
                  {Object.entries(n.vacancyBreakup).map(([k, v]) => (
                    <tr key={k}><td>{k}</td><td className="text-right font-semibold">{formatNumber(v)}</td></tr>
                  ))}
                </tbody>
              </table>
            </Section>
          </div>

          {(n.selectionProcess || n.payLevel || n.postNames.length > 0) && (
            <Section title={t("detail.selection")}>
              {n.postNames.length > 0 && <Fact label={t("detail.posts")} value={n.postNames.join(", ")} />}
              {n.selectionProcess && <p className="mt-3 text-sm">{n.selectionProcess}</p>}
              {n.payLevel && <div className="mt-3"><Fact label={t("detail.pay")} value={n.payLevel} /></div>}
            </Section>
          )}
        </div>

        <aside className="space-y-6">
          <Section title={t("detail.yourResult")}>
            {elig ? (
              <div className="space-y-2 text-sm">
                <span className={cn("chip", elig.verdict === "eligible" ? "border-open/30 bg-open-soft text-open" : elig.verdict === "not_eligible" ? "border-urgent/30 bg-urgent-soft text-urgent" : "bg-muted")}>
                  {elig.verdict === "eligible" ? t("card.eligible") : elig.verdict === "not_eligible" ? t("card.notEligible") : t("card.check")}
                </span>
                {elig.age !== null && <p>{t("elig.ageOn", { age: elig.age })}</p>}
                <ul className="list-disc pl-5 text-muted-foreground">
                  {elig.reasons.map((r, i) => <li key={i}>{t(r.key, r.vars)}</li>)}
                </ul>
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                <p className="text-muted-foreground">{t("detail.fillProfile")}</p>
                <Link href={user ? "/profile" : `/login?next=/notice/${n.id}`} className="btn btn-primary btn-sm">{t("detail.checkMyEligibility")}</Link>
              </div>
            )}
          </Section>
          <Section title={t("detail.updates")}>
            {row.updates.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("detail.noUpdates")}</p>
            ) : (
              <ul className="space-y-3">
                {row.updates.map((u) => (
                  <li key={u.id} className="text-sm">
                    <div className="text-xs text-muted-foreground">{formatDate(u.date, lang)}</div>
                    {u.link ? <a href={u.link} target="_blank" rel="noopener noreferrer" className="font-medium hover:text-primary">{u.title}</a> : <span className="font-medium">{u.title}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </aside>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="mb-3 text-base font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="fact-label">{label}</dt>
      <dd className="fact-value">{value}</dd>
    </div>
  );
}
