"use client";

import Link from "next/link";
import { ArrowRight, BadgeCheck } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import {
  checkEligibility,
  feeFor,
  formatAgeRange,
  formatFee,
  formatNumber,
  getDeadline,
  hostOf,
  isApplicable,
  isNew,
  isUpdated,
  noticeTypeOf,
  reservedFee,
  type DeadlineTone,
  type EligibilityInput,
  type Notice,
} from "@/lib/domain";
import { cn } from "@/lib/utils";

const toneText: Record<DeadlineTone, string> = {
  urgent: "text-urgent",
  warn: "text-warn-foreground",
  open: "text-foreground",
  neutral: "text-muted-foreground",
};

function monogramOf(s?: string): string {
  const base = (s ?? "").replace(/[^A-Za-z0-9]/g, "");
  if (base.length >= 2) return base.slice(0, 2).toUpperCase();
  if (base.length === 1) return base.toUpperCase();
  return "NB";
}

/**
 * One entry in the register. Deliberately not a card: a hairline gutter carries
 * the deadline, the headline carries the notice, and the five facts sit on a
 * fixed grid so that vacancies, age and fee line up column-wise down the page.
 */
export function NoticeCard({
  n,
  profile,
  feature = false,
}: {
  n: Notice;
  profile?: EligibilityInput | null;
  index?: number;
  feature?: boolean;
}) {
  const { t, lang } = useI18n();
  const d = getDeadline(n);
  const title = lang === "hi" && n.titleHi ? n.titleHi : n.title;
  const elig = profile ? checkEligibility(n, profile) : null;

  const orgName = n.organization?.name ?? n.organization?.shortName ?? "Notice";
  const orgKey = n.organization?.shortName ?? n.organization?.name ?? "notice";
  const dl = n.applyLast ? new Date(`${n.applyLast}T00:00:00Z`) : null;
  const locale = lang === "hi" ? "hi-IN" : "en-GB";
  const dlDay = dl ? dl.getUTCDate() : null;
  const dlMonth = dl ? dl.toLocaleDateString(locale, { month: "short", timeZone: "UTC" }) : null;

  const deadlineLabel =
    d.boardStatus === "upcoming" && d.days !== null
      ? t("card.opensIn", { days: d.days })
      : d.boardStatus === "closed"
        ? t("card.closed")
        : d.days === 0
          ? t("card.lastDayToday")
          : d.days === 1
            ? t("card.oneDayLeft")
            : d.days !== null
              ? t("card.daysLeft", { days: d.days })
              : t("dates.tbd");

  const source = n.officialSourceUrl ?? n.organization?.officialWebsite ?? null;
  const isExam = noticeTypeOf(n) === "entrance_exam";

  // A field that does not exist for this kind of notice is shown as "Not
  // applicable" and set in muted type, so it reads as a category rather than as
  // data we failed to collect.
  const factFor = (field: string, value: string) =>
    isApplicable(n, field) ? { value, muted: false } : { value: t("card.notApplicable"), muted: true };

  return (
    <article
      className={cn(
        "register-row content-view group relative grid grid-cols-[3.5rem_1fr] gap-x-4 px-2 py-4 sm:grid-cols-[4.25rem_1fr] sm:gap-x-6 sm:px-3",
        feature && "sm:py-5",
      )}
    >
      {/* Deadline gutter — a dateline, separated by a rule rather than a tinted box. */}
      <div className="flex flex-col items-end border-r border-border pr-4 text-right sm:pr-6">
        {dl ? (
          <>
            <span className={cn("eyebrow leading-none", d.tone === "urgent" && "text-urgent")}>{dlMonth}</span>
            <span className={cn("day-figure mt-1 text-[2.1rem] sm:text-[2.5rem]", toneText[d.tone])}>{dlDay}</span>
          </>
        ) : (
          <span className={cn("day-figure mt-1 text-[2.1rem] sm:text-[2.5rem]", toneText[d.tone])}>—</span>
        )}
        <span
          className={cn(
            "mt-1.5 font-mono text-[9.5px] uppercase leading-tight tracking-[0.05em]",
            d.tone === "urgent" ? "text-urgent" : "text-muted-foreground",
          )}
        >
          {deadlineLabel}
        </span>
        {n.serialNumber != null && (
          <span className="mt-2 font-mono text-[9.5px] tracking-[0.08em] text-muted-foreground/60">
            NB-{n.serialNumber}
          </span>
        )}
      </div>

      <div className="min-w-0">
        {/* Byline */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="orgmark orgmark-sm">
            {n.organization?.logoUrl ? <img src={n.organization.logoUrl} alt="" /> : monogramOf(orgKey)}
          </span>
          <span className="min-w-0 truncate text-[12.5px] font-medium text-foreground">{orgName}</span>
          <Dot />
          <span className="eyebrow">{t(`sector.${n.sector}`)}</span>
          <span className="ml-auto flex items-center gap-1.5">
            {isNew(n) && <span className="chip border-urgent/35 text-urgent">{t("card.new")}</span>}
            {isUpdated(n) && <span className="chip border-warn/45 text-warn-foreground">{t("card.updated")}</span>}
            {isExam && <span className="chip border-border text-muted-foreground">{t("card.entranceExam")}</span>}
            {n.isSample && <span className="chip border-border text-muted-foreground">{t("card.sample")}</span>}
          </span>
        </div>

        <h3
          className={cn(
            "mt-1.5 line-clamp-2 font-display font-semibold leading-[1.18]",
            feature ? "text-[1.4rem] sm:text-[1.55rem]" : "text-[1.2rem] sm:text-[1.3rem]",
          )}
        >
          <Link
            href={`/notice/${n.id}`}
            className="underline decoration-transparent decoration-1 underline-offset-[5px] transition-[text-decoration-color] duration-[var(--dur)] ease-[var(--ease)] after:absolute after:inset-0 group-hover:decoration-current"
          >
            {title}
          </Link>
        </h3>

        {/* Five fixed columns so the eye can read down a column, not just across. */}
        <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2 border-t border-border/70 pt-2.5 sm:grid-cols-5">
          <Fact label={t("card.vacancies")} {...factFor("totalVacancies", formatNumber(n.totalVacancies))} />
          <Fact label={t("card.qualification")} value={t(`qual.${n.minQualification}`)} />
          <Fact label={t("card.age")} value={formatAgeRange(n.minAge, n.maxAge, "—")} />
          <Fact
            label={t("card.fee")}
            value={`${formatFee(feeFor(n, "general"), t("card.free"))} / ${formatFee(reservedFee(n), t("card.free"))}`}
          />
          <Fact
            label={t("card.experience")}
            {...factFor(
              "experienceRequiredYears",
              n.experienceRequiredYears > 0 ? t("detail.years", { n: n.experienceRequiredYears }) : "—",
            )}
          />
        </dl>

        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 text-[11px]">
          {source ? (
            <a
              href={source}
              target="_blank"
              rel="noopener noreferrer"
              className="relative z-10 inline-flex items-center gap-1 font-mono text-[10.5px] text-verified hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              <BadgeCheck className="size-3" />
              {hostOf(source)}
            </a>
          ) : (
            <span />
          )}
          <span className="inline-flex items-center gap-2">
            {elig && (
              <span
                className={cn(
                  "chip",
                  elig.verdict === "eligible" && "border-open/40 text-open",
                  elig.verdict === "not_eligible" && "border-urgent/40 text-urgent",
                  elig.verdict === "check" && "border-border text-muted-foreground",
                )}
              >
                {elig.verdict === "eligible" ? t("card.eligible") : elig.verdict === "not_eligible" ? t("card.notEligible") : t("card.check")}
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-foreground">
              <span className="hidden sm:inline">{t("card.viewDetails")}</span>
              <ArrowRight className="size-3 transition-transform duration-150 group-hover:translate-x-0.5" />
            </span>
          </span>
        </div>
      </div>
    </article>
  );
}

function Fact({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="fact-label">{label}</dt>
      <dd className={cn("mt-0.5 truncate fact-value", muted && "font-normal text-muted-foreground")} title={value}>
        {value}
      </dd>
    </div>
  );
}

function Dot() {
  return <span aria-hidden className="size-[3px] shrink-0 rounded-full bg-border" />;
}
