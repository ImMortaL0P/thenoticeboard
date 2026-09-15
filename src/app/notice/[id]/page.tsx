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
  formatAgeRange,
  formatDate,
  formatFee,
  formatNumber,
  getDeadline,
  hostOf,
  isApplicable,
  noticeTypeOf,
  toNotice,
} from "@/lib/domain";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ id: string }> };

/** MongoDB: nested orderBy inside include not supported — fetch separately. */
async function load(id: string) {
  const row = await prisma.notification.findFirst({
    where: { id, status: { in: ["published", "closed"] } },
    include: { organization: true },
  });
  if (!row) return null;
  const updates = await prisma.notificationUpdate.findMany({
    where: { notificationId: id },
    orderBy: { date: "desc" },
  });
  return { ...row, updates };
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
  const locale = lang === "hi" ? "hi-IN" : "en-GB";

  const dl = n.applyLast ? new Date(`${n.applyLast}T00:00:00Z`) : null;
  const dlDay = dl ? dl.getUTCDate() : null;
  const dlMonth = dl ? dl.toLocaleDateString(locale, { month: "short", timeZone: "UTC" }) : null;
  const dlYear = dl ? dl.getUTCFullYear() : null;

  const deadlineNote =
    d.boardStatus === "closed"
      ? t("card.closed")
      : d.days === 0
        ? t("card.lastDayToday")
        : d.days === 1
          ? t("card.oneDayLeft")
          : d.days !== null
            ? t("card.daysLeft", { days: d.days })
            : t("dates.tbd");

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
  const relaxLabel: Record<string, string> = {
    sc_st: "SC / ST", obc: "OBC", ews: "EWS", pwbd: "PwBD", esm: "Ex-servicemen", female: "Women",
  };
  const sourceLink = n.officialSourceUrl ?? n.organization?.officialWebsite ?? null;
  const isExam = noticeTypeOf(n) === "entrance_exam";
  const na = t("card.notApplicable");
  const factFor = (field: string, value: string) =>
    isApplicable(n, field) ? { value, muted: false } : { value: na, muted: true };
  const feeRows = FEE_KEYS.filter((k) => n.fees[k] !== undefined);
  const vacancyRows = isApplicable(n, "vacancyBreakup") ? Object.entries(n.vacancyBreakup) : [];

  return (
    <article className="page-enter">
      <Link
        href="/"
        className="group inline-flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground transition-colors duration-[var(--dur)] hover:text-foreground"
      >
        <ArrowLeft className="size-3 transition-transform duration-[var(--dur)] ease-[var(--ease)] group-hover:-translate-x-0.5" />
        {t("detail.backToBoard")}
      </Link>

      {/* ── Notice masthead ───────────────────────────────────────────────── */}
      <header className="rule-masthead mt-4 pt-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pb-3">
          <span className="eyebrow">{t(`sector.${n.sector}`)}</span>
          <span className="dateline">
            {isApplicable(n, "advertisementNo") && n.advertisementNo
              ? `${t("detail.advertisement")} ${n.advertisementNo}`
              : `NB-${n.serialNumber}`}
          </span>
        </div>

        <div className="grid gap-8 border-t border-border pt-6 lg:grid-cols-[minmax(0,1fr)_11rem] lg:gap-12">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="orgmark orgmark-md">
                {n.organization?.logoUrl ? (
                  <img src={n.organization.logoUrl} alt="" />
                ) : (
                  monogramOf(n.organization?.shortName ?? n.organization?.name)
                )}
              </span>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-medium">{n.organization?.name}</div>
                {sourceLink && (
                  <a
                    href={sourceLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link-rule inline-flex items-center gap-1 font-mono text-[10.5px] text-verified"
                  >
                    <BadgeCheck className="size-3" />
                    {hostOf(sourceLink)}
                  </a>
                )}
              </div>
              <span className="ml-auto flex items-center gap-1.5">
              {isExam && <span className="chip border-border text-muted-foreground">{t("card.entranceExam")}</span>}
              {n.isSample && <span className="chip border-border text-muted-foreground">{t("card.sample")}</span>}
            </span>
            </div>

            <h1 className="mt-4 text-[1.85rem] font-semibold leading-[1.12] sm:text-[2.3rem]">{title}</h1>
            {summary && (
              <p className="mt-3.5 max-w-2xl text-[14.5px] leading-relaxed text-muted-foreground">{summary}</p>
            )}
          </div>

          {/* Deadline block — the one number a candidate came for. */}
          <aside className="flex shrink-0 flex-row items-baseline gap-3 border-t border-border pt-4 lg:flex-col lg:items-end lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0 lg:text-right">
            <span className={cn("eyebrow", d.tone === "urgent" && "text-urgent")}>{t("card.lastDate")}</span>
            {dl ? (
              <div className="flex items-baseline gap-2 lg:flex-col lg:items-end lg:gap-0">
                <span className={cn("day-figure text-[3rem]", d.tone === "urgent" ? "text-urgent" : "text-foreground")}>
                  {dlDay}
                </span>
                <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground lg:mt-1">
                  {dlMonth} {dlYear}
                </span>
              </div>
            ) : (
              <span className="day-figure text-[3rem] text-muted-foreground">—</span>
            )}
            <span
              className={cn(
                "font-mono text-[10.5px] uppercase tracking-[0.06em]",
                d.tone === "urgent" ? "text-urgent" : "text-muted-foreground",
              )}
            >
              {deadlineNote}
            </span>
          </aside>
        </div>

        {/* Key facts, on the same fixed grid as the board rows. */}
        <dl className="mt-7 grid grid-cols-2 gap-x-5 gap-y-3 border-t-2 border-foreground py-3.5 sm:grid-cols-4 lg:grid-cols-6">
          <Fact label={t("card.vacancies")} {...factFor("totalVacancies", formatNumber(n.totalVacancies))} />
          <Fact label={t("card.qualification")} value={t(`qual.${n.minQualification}`)} />
          <Fact label={t("card.age")} value={formatAgeRange(n.minAge, n.maxAge, "—")} />
          <Fact
            label={t("card.fee")}
            value={`${formatFee(n.fees.general ?? null, t("card.free"))} / ${formatFee(n.fees.sc ?? null, t("card.free"))}`}
          />
          <Fact
            label={t("card.experience")}
            {...factFor(
              "experienceRequiredYears",
              n.experienceRequiredYears > 0 ? t("detail.years", { n: n.experienceRequiredYears }) : "—",
            )}
          />
          <Fact label={t("detail.pay")} {...factFor("payLevel", n.payLevel ?? "—")} />
        </dl>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          {n.officialNotificationPdfUrl && (
            <a href={n.officialNotificationPdfUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary group/b">
              <Download className="size-3.5 group-hover/b:translate-y-px" /> {t("detail.downloadPdf")}
            </a>
          )}
          {n.applyUrl && (
            <a href={n.applyUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline group/b">
              <ExternalLink className="size-3.5 group-hover/b:-translate-y-px" /> {t("detail.applyOnline")}
            </a>
          )}
          {n.officialSourceUrl && (
            <a href={n.officialSourceUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline">
              <Globe className="size-3.5" /> {t("detail.officialWebsite")}
            </a>
          )}
          <a href={`/notice/${n.id}/ics`} className="btn btn-ghost">
            <CalendarPlus className="size-3.5" /> {t("detail.addToCalendar")}
          </a>
        </div>
      </header>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_17rem] lg:gap-14">
        <div className="min-w-0 space-y-9">
          <Panel title={t("detail.importantDates")}>
            <ol>
              {dates.map(([k, v]) => (
                <li
                  key={k}
                  className={cn(
                    "flex items-baseline justify-between gap-4 border-b border-border py-2 text-[13.5px] last:border-0",
                    k === "dates.applyLast" && "font-semibold",
                  )}
                >
                  <span className="text-muted-foreground">{t(k)}</span>
                  <span className="tabular-nums">{v ? formatDate(v, lang) : "—"}</span>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel title={t("detail.eligibility")}>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Fact
                label={t("detail.ageLimit")}
                value={`${formatAgeRange(n.minAge, n.maxAge, "—")}${n.ageCutoffDate ? ` (${t("detail.cutoffDate", { date: formatDate(n.ageCutoffDate, lang) })})` : ""}`}
              />
              <Fact label={t("detail.minQualification")} value={t(`qual.${n.minQualification}`)} />
              {n.streams.length > 0 && <Fact label={t("detail.streams")} value={n.streams.join(", ")} />}
              {n.experienceRequiredYears > 0 && (
                <Fact label={t("card.experience")} value={t("detail.years", { n: n.experienceRequiredYears })} />
              )}
            </dl>
            {n.qualificationDetails && (
              <p className="mt-4 text-[13.5px] leading-relaxed">{n.qualificationDetails}</p>
            )}
            {relax.length > 0 && (
              <div className="mt-6">
                <h3 className="eyebrow mb-2">{t("detail.ageRelaxation")}</h3>
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>{t("detail.category")}</th>
                      <th>{t("detail.relaxationYears")}</th>
                      <th>{t("detail.effectiveMaxAge")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relax.map(([k, v]) => (
                      <tr key={k}>
                        <td>{relaxLabel[k] ?? k}</td>
                        <td className="tabular-nums">+{v}</td>
                        <td className="tabular-nums">{n.maxAge !== null ? n.maxAge + v : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          {(feeRows.length > 0 || vacancyRows.length > 0) && (
            <div className="grid gap-9 sm:grid-cols-2">
              {feeRows.length > 0 && (
                <Panel title={t("detail.fees")}>
                  <table className="table-base">
                    <tbody>
                      {feeRows.map((k) => (
                        <tr key={k}>
                          <td>{k === "general" ? "General / UR" : k.toUpperCase()}</td>
                          <td className="text-right font-semibold tabular-nums">
                            {formatFee(n.fees[k], t("card.free"))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Panel>
              )}
              {vacancyRows.length > 0 && (
                <Panel title={t("detail.vacancyBreakup")}>
                  <table className="table-base">
                    <tbody>
                      {vacancyRows.map(([k, v]) => (
                        <tr key={k}>
                          <td>{k}</td>
                          <td className="text-right font-semibold tabular-nums">{formatNumber(v)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Panel>
              )}
            </div>
          )}

          {(n.selectionProcess || n.postNames.length > 0) && (
            <Panel title={t("detail.selection")}>
              {n.postNames.length > 0 && <Fact label={t("detail.posts")} value={n.postNames.join(", ")} />}
              {n.selectionProcess && (
                <p className="mt-3 text-[13.5px] leading-relaxed">{n.selectionProcess}</p>
              )}
            </Panel>
          )}

          <p className="border-t border-border pt-4 text-[11.5px] leading-relaxed text-muted-foreground">
            {t("detail.verifyNote")}
          </p>
        </div>

        <aside className="space-y-9 lg:sticky lg:top-20 lg:self-start">
          <Panel title={t("detail.yourResult")}>
            {elig ? (
              <div className="space-y-3 text-[13px]">
                <span
                  className={cn(
                    "chip",
                    elig.verdict === "eligible" && "border-open/40 text-open",
                    elig.verdict === "not_eligible" && "border-urgent/40 text-urgent",
                    elig.verdict === "check" && "border-border text-muted-foreground",
                  )}
                >
                  {elig.verdict === "eligible"
                    ? t("card.eligible")
                    : elig.verdict === "not_eligible"
                      ? t("card.notEligible")
                      : t("card.check")}
                </span>
                {elig.age !== null && <p>{t("elig.ageOn", { age: elig.age })}</p>}
                <ul className="space-y-1 text-muted-foreground">
                  {elig.reasons.map((r, i) => (
                    <li key={i} className="border-l border-border pl-2.5">{t(r.key, r.vars)}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="space-y-3 text-[13px]">
                <p className="text-muted-foreground">{t("detail.fillProfile")}</p>
                <Link href={user ? "/profile" : `/login?next=/notice/${n.id}`} className="btn btn-outline btn-sm">
                  {t("detail.checkMyEligibility")}
                </Link>
              </div>
            )}
          </Panel>

          <Panel title={t("detail.updates")}>
            {row.updates.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">{t("detail.noUpdates")}</p>
            ) : (
              <ul className="space-y-3">
                {row.updates.map((u) => (
                  <li key={u.id} className="border-l-2 border-warn pl-3 text-[13px]">
                    <div className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
                      {formatDate(u.date, lang)}
                    </div>
                    {u.link ? (
                      <a href={u.link} target="_blank" rel="noopener noreferrer" className="link-rule font-medium">
                        {u.title}
                      </a>
                    ) : (
                      <span className="font-medium">{u.title}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </aside>
      </div>
    </article>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <h2 className="panel-head">{title}</h2>
      {children}
    </section>
  );
}

function Fact({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="fact-label">{label}</dt>
      <dd className={cn("mt-0.5 fact-value break-words", muted && "font-normal text-muted-foreground")}>{value}</dd>
    </div>
  );
}

function monogramOf(s?: string | null): string {
  const base = (s ?? "").replace(/[^A-Za-z0-9]/g, "");
  return base.slice(0, 2).toUpperCase() || "NB";
}
