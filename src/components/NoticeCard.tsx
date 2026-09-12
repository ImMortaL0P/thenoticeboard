"use client";

import Link from "next/link";
import { ArrowRight, BadgeCheck, CalendarDays } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import {
  checkEligibility,
  feeFor,
  formatAgeRange,
  formatFee,
  formatNumber,
  getDeadline,
  hostOf,
  isNew,
  isUpdated,
  reservedFee,
  type DeadlineTone,
  type EligibilityInput,
  type Notice,
} from "@/lib/domain";
import { cn } from "@/lib/utils";

const toneText: Record<DeadlineTone, string> = {
  urgent: "text-urgent",
  warn: "text-warn-foreground",
  open: "text-open",
  neutral: "text-muted-foreground",
};

const toneTile: Record<DeadlineTone, string> = {
  urgent: "border-urgent/25 bg-urgent/10",
  warn: "border-warn/35 bg-warn/10",
  open: "border-open/30 bg-open/10",
  neutral: "border-border bg-muted/40",
};

const AVATAR_TINTS = [
  "bg-open/12 text-open",
  "bg-warn/12 text-warn-foreground",
  "bg-accent text-primary",
  "bg-neutral-soft text-neutral",
  "bg-urgent/10 text-urgent",
] as const;

function monogramOf(s?: string): string {
  const base = (s ?? "").replace(/[^A-Za-z0-9]/g, "");
  if (base.length >= 2) return base.slice(0, 2).toUpperCase();
  if (base.length === 1) return base.toUpperCase();
  return "NB";
}

function tintFor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_TINTS[h % AVATAR_TINTS.length];
}

export function NoticeCard({
  n,
  profile,
  index = 0,
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

  const orgKey = n.organization?.shortName ?? n.organization?.name ?? "notice";
  const dl = n.applyLast ? new Date(`${n.applyLast}T00:00:00Z`) : null;
  const dlDay = dl ? dl.getUTCDate() : null;
  const dlMonth = dl
    ? dl.toLocaleDateString(lang === "hi" ? "hi-IN" : "en-US", { month: "short", timeZone: "UTC" })
    : null;

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

  return (
    <article
      className={cn(
        "stagger-row content-view card-lift group relative grid grid-cols-[3.25rem_1fr] gap-x-3 gap-y-2 rounded-xl border border-border bg-card px-4 py-4 shadow-[var(--shadow-card)]",
        "sm:grid-cols-[3.5rem_1fr] sm:gap-x-4 sm:px-5",
        feature && "sm:grid-cols-[3.75rem_1fr] sm:px-6 sm:py-5",
      )}
      style={{ animationDelay: `${Math.min(index * 45, 320)}ms` }}
    >
      {/* Deadline mark */}
      <div
        className={cn(
          "flex w-full flex-col items-center justify-center self-start rounded-xl border px-1 py-2 text-center",
          toneTile[d.tone],
        )}
        aria-label={deadlineLabel}
      >
        {dl ? (
          <>
            <span className={cn("text-[10px] font-bold uppercase tracking-[0.08em]", toneText[d.tone])}>
              {dlMonth ?? ""}
            </span>
            <span className={cn("mt-0.5 text-xl font-black leading-none tabular-nums sm:text-2xl", toneText[d.tone])}>
              {dlDay ?? ""}
            </span>
            <span className="mt-1.5 max-w-[3.25rem] text-[9px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground">
              {deadlineLabel}
            </span>
            {n.serialNumber != null && (
              <span className="mt-1.5 text-[9px] font-mono font-bold leading-tight tracking-widest text-muted-foreground/70">
                NB-{n.serialNumber}
              </span>
            )}
          </>
        ) : (
          <>
            <CalendarDays className={cn("mb-1 size-4", toneText[d.tone])} />
            <span className="text-[9px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground">
              {deadlineLabel}
            </span>
            {n.serialNumber != null && (
              <span className="mt-1.5 text-[9px] font-mono font-bold leading-tight tracking-widest text-muted-foreground/70">
                NB-{n.serialNumber}
              </span>
            )}
          </>
        )}
      </div>

      <div className="min-w-0">
        {/* Org identity + status chips */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn("avatar overflow-hidden", !n.organization?.logoUrl && tintFor(orgKey), feature ? "size-9 sm:size-10" : "size-8 sm:size-9")}>
            {n.organization?.logoUrl ? (
              <img src={n.organization.logoUrl} alt={orgKey} className="size-full object-contain bg-white" />
            ) : (
              monogramOf(orgKey)
            )}
          </span>
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 text-xs font-medium text-muted-foreground">
            <span className="font-semibold text-foreground">
              {n.organization?.shortName ?? n.organization?.name ?? "Notice"}
            </span>
            <Dot />
            <span>{t(`sector.${n.sector}`)}</span>
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            {isNew(n) && <span className="chip border-primary/30 bg-accent text-accent-foreground">{t("card.new")}</span>}
            {isUpdated(n) && <span className="chip border-warn/40 bg-warn-soft text-warn-foreground">{t("card.updated")}</span>}
            {n.isSample && <span className="chip border-border bg-muted text-muted-foreground">{t("card.sample")}</span>}
          </span>
        </div>

        <h3
          className={cn(
            "mt-2 line-clamp-2 font-extrabold leading-snug tracking-tighter",
            feature ? "text-lg sm:text-xl" : "text-base sm:text-lg",
          )}
        >
          <Link href={`/notice/${n.id}`} className="after:absolute after:inset-0 group-hover:text-primary">
            {title}
          </Link>
        </h3>

        <dl className="mt-2.5 flex flex-wrap items-stretch gap-x-4 gap-y-1.5 text-xs">
          <Fact label={t("card.vacancies")} value={formatNumber(n.totalVacancies)} />
          <Fact label={t("card.qualification")} value={t(`qual.${n.minQualification}`)} />
          <Fact label={t("card.age")} value={formatAgeRange(n.minAge, n.maxAge, t("dates.tbd"))} />
          <Fact
            label={t("card.fee")}
            value={`${formatFee(feeFor(n, "general"), t("card.free"))} / ${formatFee(reservedFee(n), t("card.free"))}`}
          />
          {n.experienceRequiredYears > 0 && (
            <Fact label={t("card.experience")} value={t("detail.years", { n: n.experienceRequiredYears })} />
          )}
        </dl>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 text-[11px]">
          {n.officialSourceUrl ?? n.organization?.officialWebsite ? (
            <a
              href={n.officialSourceUrl ?? n.organization?.officialWebsite!}
              target="_blank"
              rel="noopener noreferrer"
              className="relative z-10 inline-flex items-center gap-1 font-medium text-verified hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              <BadgeCheck className="size-3.5" />
              {t("card.verifiedFrom", { source: hostOf(n.officialSourceUrl ?? n.organization?.officialWebsite) })}
            </a>
          ) : (
            <span className="inline-flex items-center gap-1 font-medium text-verified">
              <BadgeCheck className="size-3.5" />
              {t("card.verifiedFrom", { source: hostOf(n.officialSourceUrl ?? n.organization?.officialWebsite) })}
            </span>
          )}
          <span className="inline-flex items-center gap-2">
            {elig && (
              <span
                className={cn(
                  "chip",
                  elig.verdict === "eligible" && "border-open/30 bg-open-soft text-open",
                  elig.verdict === "not_eligible" && "border-urgent/30 bg-urgent-soft text-urgent",
                  elig.verdict === "check" && "border-border bg-muted text-muted-foreground",
                )}
              >
                {elig.verdict === "eligible" ? t("card.eligible") : elig.verdict === "not_eligible" ? t("card.notEligible") : t("card.check")}
              </span>
            )}
            <span className="inline-flex items-center gap-1 font-semibold text-primary">
              <span className="hidden sm:inline">{t("card.viewDetails")}</span>
              <ArrowRight className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
            </span>
          </span>
        </div>
      </div>
    </article>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-l border-border pl-3 first:border-l-0 first:pl-0">
      <dt className="fact-label">{label}</dt>
      <dd className="mt-0.5 max-w-48 truncate text-[13px] font-semibold text-foreground">{value}</dd>
    </div>
  );
}

function Dot() {
  return <span aria-hidden className="size-1 rounded-full bg-border" />;
}