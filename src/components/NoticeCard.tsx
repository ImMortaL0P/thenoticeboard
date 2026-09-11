"use client";

import Link from "next/link";
import { BadgeCheck, CalendarClock } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import {
  checkEligibility,
  feeFor,
  formatDate,
  formatFee,
  formatNumber,
  getDeadline,
  hostOf,
  isNew,
  isUpdated,
  reservedFee,
  toneBar,
  toneClasses,
  type EligibilityInput,
  type Notice,
} from "@/lib/domain";
import { cn } from "@/lib/utils";

export function NoticeCard({ n, profile }: { n: Notice; profile?: EligibilityInput | null }) {
  const { t, lang } = useI18n();
  const d = getDeadline(n);
  const title = lang === "hi" && n.titleHi ? n.titleHi : n.title;
  const elig = profile ? checkEligibility(n, profile) : null;

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
    <article className="card relative flex flex-col overflow-hidden transition-shadow hover:shadow-[var(--shadow-lift)]">
      <span className={cn("absolute inset-y-0 left-0 w-1", toneBar[d.tone])} aria-hidden />
      <div className="flex flex-1 flex-col gap-3 p-4 pl-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{n.organization?.shortName}</span>
              <span>·</span>
              <span>{t(`sector.${n.sector}`)}</span>
              {isNew(n) && <span className="chip border-primary/30 bg-accent text-accent-foreground">{t("card.new")}</span>}
              {isUpdated(n) && <span className="chip border-warn/40 bg-warn-soft text-warn-foreground">{t("card.updated")}</span>}
              {n.isSample && <span className="chip border-border bg-muted text-muted-foreground">{t("card.sample")}</span>}
            </div>
            <h3 className="mt-1 line-clamp-2 font-semibold leading-snug">
              <Link href={`/notice/${n.id}`} className="after:absolute after:inset-0 hover:text-primary">
                {title}
              </Link>
            </h3>
          </div>
          <span className={cn("chip shrink-0", toneClasses[d.tone])}>
            <CalendarClock className="size-3" />
            {deadlineLabel}
          </span>
        </div>

        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3">
          <div>
            <dt className="fact-label">{t("card.vacancies")}</dt>
            <dd className="fact-value">{formatNumber(n.totalVacancies)}</dd>
          </div>
          <div>
            <dt className="fact-label">{t("card.qualification")}</dt>
            <dd className="fact-value">{t(`qual.${n.minQualification}`)}</dd>
          </div>
          <div>
            <dt className="fact-label">{t("card.age")}</dt>
            <dd className="fact-value">
              {n.minAge ?? "—"}–{n.maxAge ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="fact-label">{t("card.fee")}</dt>
            <dd className="fact-value">
              {formatFee(feeFor(n, "general"), t("card.free"))} / {formatFee(reservedFee(n), t("card.free"))}
            </dd>
          </div>
          <div>
            <dt className="fact-label">{t("card.lastDate")}</dt>
            <dd className="fact-value">{formatDate(n.applyLast, lang)}</dd>
          </div>
          {n.experienceRequiredYears > 0 && (
            <div>
              <dt className="fact-label">{t("card.experience")}</dt>
              <dd className="fact-value">{t("detail.years", { n: n.experienceRequiredYears })}</dd>
            </div>
          )}
        </dl>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
          <span className="inline-flex items-center gap-1 text-verified">
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
