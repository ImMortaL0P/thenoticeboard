"use client";

import Link from "next/link";
import { BadgeCheck } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import {
  checkEligibility,
  feeFor,
  formatFee,
  formatNumber,
  getDeadline,
  hostOf,
  isNew,
  isUpdated,
  reservedFee,
  toneBar,
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

const toneBorder: Record<DeadlineTone, string> = {
  urgent: "border-urgent/25",
  warn: "border-warn/30",
  open: "border-open/25",
  neutral: "border-border",
};

export function NoticeCard({
  n,
  profile,
  index = 0,
}: {
  n: Notice;
  profile?: EligibilityInput | null;
  index?: number;
}) {
  const { t, lang } = useI18n();
  const d = getDeadline(n);
  const title = lang === "hi" && n.titleHi ? n.titleHi : n.title;
  const elig = profile ? checkEligibility(n, profile) : null;

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
        "stagger-row content-view relative grid grid-cols-[3rem_1fr] gap-x-3 gap-y-1.5 bg-card px-4 py-4 sm:grid-cols-[3.75rem_1fr] sm:gap-x-5 sm:px-5",
        "transition-[background-color] duration-150 hover:bg-muted/50",
      )}
      style={{ animationDelay: `${Math.min(index * 55, 330)}ms` }}
    >
      <span className={cn("absolute inset-y-0 left-0 w-0.5", toneBar[d.tone])} aria-hidden />

      {/* Deadline mark */}
      <div
        className={cn(
          "flex w-full flex-col items-center justify-center self-start rounded-xl border bg-background px-1 py-2 text-center",
          toneBorder[d.tone],
        )}
        aria-label={deadlineLabel}
      >
        <span className={cn("text-[10px] font-bold uppercase tracking-[0.08em]", toneText[d.tone])}>
          {dlMonth ?? "—"}
        </span>
        <span className={cn("mt-0.5 text-2xl font-black leading-none tabular-nums", toneText[d.tone])}>
          {dlDay ?? "—"}
        </span>
        <span className="mt-1 max-w-[3.25rem] text-[9px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground">
          {deadlineLabel}
        </span>
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] font-medium text-muted-foreground">
          <span className="font-semibold text-foreground">{n.organization?.shortName ?? n.organization?.name}</span>
          <span aria-hidden>·</span>
          <span>{t(`sector.${n.sector}`)}</span>
          {isNew(n) && <span className="chip border-primary/30 bg-accent text-accent-foreground">{t("card.new")}</span>}
          {isUpdated(n) && <span className="chip border-warn/40 bg-warn-soft text-warn-foreground">{t("card.updated")}</span>}
          {n.isSample && <span className="chip border-border bg-muted text-muted-foreground">{t("card.sample")}</span>}
        </div>

        <h3 className="mt-1 line-clamp-2 text-[15px] font-semibold leading-snug sm:text-base">
          <Link href={`/notice/${n.id}`} className="after:absolute after:inset-0 hover:text-primary">
            {title}
          </Link>
        </h3>

        <dl className="mt-2 flex flex-wrap items-stretch gap-x-4 gap-y-1.5 text-xs">
          <Fact label={t("card.vacancies")} value={formatNumber(n.totalVacancies)} />
          <Fact label={t("card.qualification")} value={t(`qual.${n.minQualification}`)} />
          <Fact label={t("card.age")} value={`${n.minAge ?? "—"}–${n.maxAge ?? "—"}`} />
          <Fact
            label={t("card.fee")}
            value={`${formatFee(feeFor(n, "general"), t("card.free"))} / ${formatFee(reservedFee(n), t("card.free"))}`}
          />
          {n.experienceRequiredYears > 0 && (
            <Fact label={t("card.experience")} value={t("detail.years", { n: n.experienceRequiredYears })} />
          )}
        </dl>

        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <span className="inline-flex items-center gap-1 font-medium text-verified">
            <BadgeCheck className="size-3.5" />
            {t("card.verifiedFrom", { source: hostOf(n.officialSourceUrl ?? n.organization?.officialWebsite) })}
          </span>
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