"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, BadgeCheck, Search, SlidersHorizontal, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { NoticeCard } from "@/components/NoticeCard";
import {
  CATEGORIES,
  QUALIFICATIONS,
  SECTORS,
  STATES,
  checkEligibility,
  daysBetween,
  formatNumber,
  getDeadline,
  maxFee,
  reservedFee,
  type EligibilityInput,
  type Notice,
} from "@/lib/domain";
import { cn } from "@/lib/utils";

const FILTER_KEYS = ["q", "sector", "qual", "cat", "age", "exp", "state", "status", "fee", "free", "posted", "sort", "eligible"] as const;

export function Board({ notices, profile }: { notices: Notice[]; profile: EligibilityInput | null }) {
  const { t, lang } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [sheetOpen, setSheetOpen] = useState(false);
  const get = (k: (typeof FILTER_KEYS)[number]) => params.get(k) ?? "";

  function set(k: (typeof FILTER_KEYS)[number], v: string) {
    const next = new URLSearchParams(params.toString());
    if (v) next.set(k, v);
    else next.delete(k);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }
  function reset() {
    router.replace(pathname, { scroll: false });
  }

  const filtered = useMemo(() => {
    const q = get("q").toLowerCase().trim();
    const sector = get("sector");
    const qual = get("qual");
    const cat = get("cat") || profile?.category || "general";
    const age = Number(get("age")) || null;
    const exp = get("exp") === "" ? null : Number(get("exp"));
    const state = get("state");
    const status = get("status");
    const fee = get("fee") === "" ? null : Number(get("fee"));
    const free = get("free") === "1";
    const posted = Number(get("posted")) || null;
    const onlyEligible = get("eligible") === "1";

    const list = notices.filter((n) => {
      if (q) {
        const hay = [n.title, n.titleHi, n.advertisementNo, n.organization?.name, n.organization?.shortName, ...n.postNames]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (sector && n.sector !== sector) return false;
      if (qual) {
        const res = checkEligibility(n, { qualification: qual });
        if (res.reasons.some((r) => r.key === "elig.reasonQual")) return false;
      }
      if (age !== null) {
        const extra = checkEligibility(n, { category: cat, dob: null }).effectiveMaxAge;
        const min = n.minAge ?? 0;
        const max = extra ?? 99;
        if (age < min || age > max) return false;
      }
      if (exp !== null && n.experienceRequiredYears > exp) return false;
      if (state && state !== "All India" && n.state !== state && n.state !== "All India") return false;
      if (state === "All India" && n.state !== "All India") return false;
      const d = getDeadline(n);
      if (status && d.boardStatus !== status) return false;
      if (!status && d.boardStatus === "closed") return false; // hide closed by default
      if (fee !== null && (n.fees[cat] ?? maxFee(n)) > fee) return false;
      if (free && reservedFee(n) !== 0) return false;
      if (posted && (!n.notificationDate || daysBetween(n.notificationDate) < -posted)) return false;
      if (onlyEligible && profile && checkEligibility(n, profile).verdict === "not_eligible") return false;
      return true;
    });

    const sort = get("sort") || "lastDate";
    list.sort((a, b) => {
      if (sort === "newest") return (b.notificationDate ?? b.createdAt).localeCompare(a.notificationDate ?? a.createdAt);
      if (sort === "vacancies") return (b.totalVacancies ?? 0) - (a.totalVacancies ?? 0);
      return (a.applyLast ?? "9999").localeCompare(b.applyLast ?? "9999");
    });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notices, params, profile]);

  const stats = useMemo(() => {
    let open = 0,
      week = 0,
      recent = 0;
    for (const n of notices) {
      const d = getDeadline(n);
      if (d.boardStatus === "open" || d.boardStatus === "closing_soon") open++;
      if (d.boardStatus === "closing_soon") week++;
      if (n.notificationDate && daysBetween(n.notificationDate) >= -3) recent++;
    }
    return { open, week, recent };
  }, [notices]);

  // The single most urgent live notice, surfaced as a real-card hero asset.
  const spotlight = useMemo(() => {
    const open = notices.filter((n) => {
      const d = getDeadline(n);
      return d.boardStatus === "open" || d.boardStatus === "closing_soon";
    });
    return open.sort((a, b) => (a.applyLast ?? "9999").localeCompare(b.applyLast ?? "9999"))[0] ?? null;
  }, [notices]);

  const activeCount = FILTER_KEYS.filter((k) => k !== "q" && k !== "sort" && k !== "sector" && params.get(k)).length;

  const filterPanel = (
    <div className="space-y-4">
      <Field label={t("filters.qualification")}>
        <select className="input" value={get("qual")} onChange={(e) => set("qual", e.target.value)}>
          <option value="">{t("filters.any")}</option>
          {QUALIFICATIONS.map((q) => (
            <option key={q} value={q}>{t(`qual.${q}`)}</option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("filters.age")}>
          <input className="input" type="number" min={14} max={70} value={get("age")} onChange={(e) => set("age", e.target.value)} />
        </Field>
        <Field label={t("filters.category")}>
          <select className="input" value={get("cat")} onChange={(e) => set("cat", e.target.value)}>
            <option value="">{t("filters.any")}</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{t(`cat.${c}`)}</option>
            ))}
          </select>
        </Field>
      </div>
      <p className="-mt-2 text-[11px] text-muted-foreground">{t("filters.ageHint")}</p>
      <Field label={t("filters.experience")}>
        <input className="input" type="number" min={0} max={40} value={get("exp")} onChange={(e) => set("exp", e.target.value)} />
      </Field>
      <Field label={t("filters.state")}>
        <select className="input" value={get("state")} onChange={(e) => set("state", e.target.value)}>
          <option value="">{t("filters.any")}</option>
          {STATES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </Field>
      <Field label={t("filters.status")}>
        <select className="input" value={get("status")} onChange={(e) => set("status", e.target.value)}>
          <option value="">{t("status.open")} + {t("status.upcoming")}</option>
          <option value="open">{t("status.open")}</option>
          <option value="closing_soon">{t("status.closingSoon")}</option>
          <option value="upcoming">{t("status.upcoming")}</option>
          <option value="closed">{t("status.closed")}</option>
        </select>
      </Field>
      <Field label={t("filters.fee")}>
        <input className="input" type="number" min={0} step={50} value={get("fee")} onChange={(e) => set("fee", e.target.value)} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input className="accent-primary" type="checkbox" checked={get("free") === "1"} onChange={(e) => set("free", e.target.checked ? "1" : "")} />
        {t("filters.freeForReserved")}
      </label>
      <Field label={t("filters.datePosted")}>
        <select className="input" value={get("posted")} onChange={(e) => set("posted", e.target.value)}>
          <option value="">{t("filters.any")}</option>
          <option value="7">{t("date.last7")}</option>
          <option value="30">{t("date.last30")}</option>
          <option value="90">{t("date.last90")}</option>
        </select>
      </Field>
      {profile && (
        <label className="flex items-center gap-2 text-sm">
          <input className="accent-primary" type="checkbox" checked={get("eligible") === "1"} onChange={(e) => set("eligible", e.target.checked ? "1" : "")} />
          {t("filters.onlyEligible")}
        </label>
      )}
      <button type="button" onClick={reset} className="btn btn-outline w-full">{t("filters.reset")}</button>
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
        <div className="hero-wash" aria-hidden />
        <div className="dot-grid absolute inset-0 opacity-40" aria-hidden />
        <div className="relative grid items-center gap-6 px-5 py-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-12 lg:py-10">
          <div className="space-y-4">
            <span className="kicker-pill">{t("home.kicker")}</span>
            <h1 className="max-w-2xl text-3xl font-bold leading-[1.08] tracking-tight sm:text-4xl lg:text-[2.6rem]">
              {t("home.heroLead")}
              <br />
              <span className="highlight-ink text-primary">{t("home.heroAccent")}</span>
            </h1>
            <p className="max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              {t("home.heroSub")}
            </p>
            <div className="flex flex-wrap items-end gap-x-8 gap-y-3 pt-2">
              <Stat label={t("stats.openNow")} value={stats.open} tone="text-open" />
              <Stat label={t("stats.closingWeek")} value={stats.week} tone="text-urgent" />
              <Stat label={t("stats.newToday")} value={stats.recent} tone="text-primary" />
            </div>
          </div>
          {spotlight && <SpotlightCard n={spotlight} />}
        </div>
      </section>

      {notices.some((n) => n.isSample) && (
        <p className="rounded-lg border border-warn/40 bg-warn-soft px-3 py-2 text-xs font-medium text-warn-foreground">
          {t("home.sampleBanner")}
        </p>
      )}

      {/* Toolbar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="input pl-9"
            placeholder={t("home.searchPlaceholder")}
            defaultValue={get("q")}
            onChange={(e) => set("q", e.target.value)}
          />
        </div>
        <select className="input w-auto" value={get("sort")} onChange={(e) => set("sort", e.target.value)} aria-label={t("filters.sort")}>
          <option value="">{t("sort.lastDate")}</option>
          <option value="newest">{t("sort.newest")}</option>
          <option value="vacancies">{t("sort.vacancies")}</option>
        </select>
        <button type="button" className="btn btn-outline lg:hidden" onClick={() => setSheetOpen(true)}>
          <SlidersHorizontal className="size-4" />
          {activeCount > 0 && <span className="chip border-primary bg-primary text-primary-foreground">{activeCount}</span>}
        </button>
      </div>

      {/* Sector chips */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        <SectorChip active={!get("sector")} onClick={() => set("sector", "")}>{t("home.allSectors")}</SectorChip>
        {SECTORS.map((s) => (
          <SectorChip key={s} active={get("sector") === s} onClick={() => set("sector", get("sector") === s ? "" : s)}>
            {t(`sector.${s}`)}
          </SectorChip>
        ))}
      </div>

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[260px_1fr]">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block">
          <div className="sticky top-20 space-y-2">
            <h2 className="px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t("filters.title")}
            </h2>
            <div className="card p-4">{filterPanel}</div>
          </div>
        </aside>

        <section className="min-w-0">
          {/* Results header */}
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-muted-foreground">
              {t("home.results", { count: filtered.length })}
            </p>
            {activeCount > 0 && (
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary transition-colors hover:text-primary/70"
              >
                <X className="size-3.5" />
                {t("home.clearFilters")}
              </button>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="card flex flex-col items-center px-6 py-14 text-center">
              <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Search className="size-5" />
              </span>
              <p className="mt-3 text-sm font-medium text-foreground">{t("home.noResults")}</p>
              <button className="btn btn-outline mt-4" onClick={reset}>{t("home.clearFilters")}</button>
            </div>
          ) : (
            <div className="flex flex-col gap-3" lang={lang}>
              {filtered.map((n, i) => (
                <NoticeCard key={n.id} n={n} profile={profile} index={i} feature={i < 3} />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Mobile bottom sheet — always mounted for slide animation */}
      <div
        className={cn(
          "fixed inset-0 z-50 lg:hidden sheet-mask",
          sheetOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        role="dialog"
        aria-modal="true"
        aria-hidden={!sheetOpen}
        inert={!sheetOpen}
      >
        <button
          className="absolute inset-0 bg-black/40"
          aria-label="Close"
          onClick={() => setSheetOpen(false)}
          tabIndex={sheetOpen ? 0 : -1}
        />
        <div
          className={cn(
            "absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-border bg-card p-4 shadow-[var(--shadow-lift)]",
            "sheet-panel",
            sheetOpen ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0",
          )}
        >
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-bold">{t("filters.title")}</h2>
            <button className="btn btn-ghost btn-sm" onClick={() => setSheetOpen(false)} aria-label="Close">
              <X className="size-4" />
            </button>
          </div>
          {filterPanel}
          <button className="btn btn-primary mt-3 w-full" onClick={() => setSheetOpen(false)}>
            {t("filters.apply")} ({filtered.length})
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="label">{label}</span>
      {children}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div>
      <div className={cn("text-2xl font-bold tabular-nums tracking-tight", tone)}>{value}</div>
      <div className="mt-0.5 text-xs font-medium text-muted-foreground">{label}</div>
    </div>
  );
}

function SpotlightCard({ n }: { n: Notice }) {
  const { t, lang } = useI18n();
  const d = getDeadline(n);
  const title = lang === "hi" && n.titleHi ? n.titleHi : n.title;
  const org = n.organization?.shortName ?? n.organization?.name ?? "Notice";

  const deadlineLabel =
    d.days === null
      ? t("dates.tbd")
      : d.days === 0
        ? t("card.lastDayToday")
        : d.days === 1
          ? t("card.oneDayLeft")
          : t("card.daysLeft", { days: d.days });

  const toneChip = {
    urgent: "border-urgent/40 bg-urgent-soft text-urgent",
    warn: "border-warn/40 bg-warn-soft text-warn-foreground",
    open: "border-open/40 bg-open-soft text-open",
    neutral: "border-border bg-muted text-muted-foreground",
  }[d.tone];

  const date = n.applyLast
    ? new Date(`${n.applyLast}T00:00:00Z`).toLocaleDateString(lang === "hi" ? "hi-IN" : "en-US", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      })
    : null;

  return (
    <div className="glass-panel hidden rounded-2xl p-5 lg:block">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">{org}</span>
        <Dot />
        <span>{t(`sector.${n.sector}`)}</span>
        <BadgeCheck className="ml-auto size-3.5 text-verified" />
      </div>
      <h2 className="mt-3 line-clamp-3 text-sm font-semibold leading-snug text-foreground">
        <Link href={`/notice/${n.id}`} className="group-hover:text-primary hover:text-primary">
          {title}
        </Link>
      </h2>
      <div className="mt-4 flex items-center gap-3">
        <span className={cn("chip", toneChip)}>{deadlineLabel}</span>
        {date && <span className="text-xs font-semibold tabular-nums text-muted-foreground">{date}</span>}
      </div>
      <dl className="mt-4 flex items-center gap-4 text-xs">
        <SpotFact label={t("card.vacancies")} value={formatNumber(n.totalVacancies)} />
        <SpotFact label={t("card.qualification")} value={t(`qual.${n.minQualification}`)} />
      </dl>
      <Link href={`/notice/${n.id}`} className="btn btn-primary btn-sm mt-5 w-full">
        {t("card.viewDetails")}
        <ArrowRight className="size-3.5" />
      </Link>
    </div>
  );
}

function SpotFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="fact-label">{label}</dt>
      <dd className="mt-0.5 text-[13px] font-semibold text-foreground">{value}</dd>
    </div>
  );
}

function Dot() {
  return <span aria-hidden className="size-1 rounded-full bg-border" />;
}

function SectorChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-[color,background-color,border-color,box-shadow] duration-150",
        active
          ? "border-transparent bg-foreground text-background shadow-[var(--shadow-card)]"
          : "border-border bg-transparent text-muted-foreground hover:border-primary/30 hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}