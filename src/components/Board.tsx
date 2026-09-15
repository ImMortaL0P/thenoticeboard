"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Search, SlidersHorizontal, X } from "lucide-react";
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

  // The single most urgent live notice, run as the "stop press" item.
  const spotlight = useMemo(() => {
    const open = notices.filter((n) => {
      const d = getDeadline(n);
      return d.boardStatus === "open" || d.boardStatus === "closing_soon";
    });
    return open.sort((a, b) => (a.applyLast ?? "9999").localeCompare(b.applyLast ?? "9999"))[0] ?? null;
  }, [notices]);

  const activeCount = FILTER_KEYS.filter((k) => k !== "q" && k !== "sort" && k !== "sector" && params.get(k)).length;

  const today = new Date().toLocaleDateString(lang === "hi" ? "hi-IN" : "en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });

  const filterPanel = (
    <div className="space-y-3.5">
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
      <p className="-mt-1.5 text-[10.5px] leading-snug text-muted-foreground">{t("filters.ageHint")}</p>
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
      <label className="flex items-center gap-2 text-[12.5px]">
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
        <label className="flex items-center gap-2 text-[12.5px]">
          <input className="accent-primary" type="checkbox" checked={get("eligible") === "1"} onChange={(e) => set("eligible", e.target.checked ? "1" : "")} />
          {t("filters.onlyEligible")}
        </label>
      )}
      <button type="button" onClick={reset} className="btn btn-outline w-full">{t("filters.reset")}</button>
    </div>
  );

  return (
    <div className="page-enter">
      {/* ── Masthead ─────────────────────────────────────────────────────── */}
      <section className="rule-masthead pt-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2 pb-3">
          <span className="eyebrow">{t("home.kicker")}</span>
          <span className="dateline">{today} · IST</span>
        </div>

        <div className="grid gap-8 border-t border-border pt-7 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-14">
          <div>
            <h1 className="max-w-3xl text-[2.35rem] font-semibold leading-[1.06] tracking-[-0.02em] sm:text-[3rem] lg:text-[3.4rem]">
              {t("home.heroLead")}{" "}
              <em className="not-italic text-primary">{t("home.heroAccent")}</em>
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
              {t("home.heroSub")}
            </p>
          </div>
          {spotlight && <SpotlightCard n={spotlight} />}
        </div>

        {/* Dateline strip — counts as record metadata, not as hero statistics. */}
        <dl className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-1 border-t-2 border-foreground py-2.5 font-mono text-[11px] uppercase tracking-[0.05em]">
          <Tally label={t("stats.openNow")} value={stats.open} />
          <Tally label={t("stats.closingWeek")} value={stats.week} tone="text-urgent" />
          <Tally label={t("stats.newToday")} value={stats.recent} />
        </dl>
      </section>

      {notices.some((n) => n.isSample) && (
        <p className="mt-5 border-l-2 border-warn bg-warn-soft px-3 py-2 text-[12px] text-warn-foreground">
          {t("home.sampleBanner")}
        </p>
      )}

      {/* ── Search + sector rail ─────────────────────────────────────────── */}
      <div className="mt-8 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            className="input pl-8"
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
          <SlidersHorizontal className="size-3.5" />
          {activeCount > 0 && <span className="font-mono text-[10px]">{activeCount}</span>}
        </button>
      </div>

      <nav className="mt-3 flex gap-5 overflow-x-auto border-b border-border pb-0" aria-label={t("filters.sort")}>
        <SectorTab active={!get("sector")} onClick={() => set("sector", "")}>{t("home.allSectors")}</SectorTab>
        {SECTORS.map((s) => (
          <SectorTab key={s} active={get("sector") === s} onClick={() => set("sector", get("sector") === s ? "" : s)}>
            {t(`sector.${s}`)}
          </SectorTab>
        ))}
      </nav>

      <div className="mt-6 flex flex-col gap-8 lg:grid lg:grid-cols-[15rem_1fr] lg:gap-10">
        {/* Filter rail */}
        <aside className="hidden lg:block">
          <div className="sticky top-20">
            <h2 className="eyebrow border-b border-foreground pb-1.5">{t("filters.title")}</h2>
            <div className="pt-4">{filterPanel}</div>
          </div>
        </aside>

        <section className="min-w-0">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
              {t("home.results", { count: filtered.length })}
            </p>
            {activeCount > 0 && (
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
              >
                <X className="size-3" />
                {t("home.clearFilters")}
              </button>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="border-t border-foreground px-2 py-16 text-center">
              <p className="font-display text-xl">{t("home.noResults")}</p>
              <button className="btn btn-outline mt-4" onClick={reset}>{t("home.clearFilters")}</button>
            </div>
          ) : (
            <div className="register" lang={lang}>
              {filtered.map((n, i) => (
                <NoticeCard key={n.id} n={n} profile={profile} index={i} feature={i === 0} />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Mobile filter sheet */}
      <div
        className={cn(
          "fixed inset-0 z-50 transition-opacity duration-200 lg:hidden",
          sheetOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        role="dialog"
        aria-modal="true"
        aria-hidden={!sheetOpen}
        inert={!sheetOpen}
      >
        <button
          className="absolute inset-0 bg-foreground/40"
          aria-label="Close"
          onClick={() => setSheetOpen(false)}
          tabIndex={sheetOpen ? 0 : -1}
        />
        <div
          className={cn(
            "absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto border-t-2 border-foreground bg-card p-4 transition-transform duration-200",
            sheetOpen ? "translate-y-0" : "translate-y-6",
          )}
        >
          <div className="mb-4 flex items-center justify-between border-b border-border pb-2">
            <h2 className="eyebrow">{t("filters.title")}</h2>
            <button className="btn btn-ghost btn-sm" onClick={() => setSheetOpen(false)} aria-label="Close">
              <X className="size-4" />
            </button>
          </div>
          {filterPanel}
          <button className="btn btn-primary mt-4 w-full" onClick={() => setSheetOpen(false)}>
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

function Tally({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="order-2 text-muted-foreground">{label}</dt>
      <dd className={cn("order-1 text-[13px] font-semibold tabular-nums text-foreground", tone)}>{value}</dd>
    </div>
  );
}

/** "Stop press" — the notice closing soonest, set as a boxed sidebar item. */
function SpotlightCard({ n }: { n: Notice }) {
  const { t, lang } = useI18n();
  const d = getDeadline(n);
  const title = lang === "hi" && n.titleHi ? n.titleHi : n.title;
  const org = n.organization?.name ?? n.organization?.shortName ?? "Notice";

  const deadlineLabel =
    d.days === null
      ? t("dates.tbd")
      : d.days === 0
        ? t("card.lastDayToday")
        : d.days === 1
          ? t("card.oneDayLeft")
          : t("card.daysLeft", { days: d.days });

  const date = n.applyLast
    ? new Date(`${n.applyLast}T00:00:00Z`).toLocaleDateString(lang === "hi" ? "hi-IN" : "en-GB", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      })
    : null;

  return (
    <aside className="hidden self-start border border-foreground lg:block">
      <div className="border-b border-foreground bg-foreground px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-background">
          {t("stats.closingWeek")}
        </span>
      </div>
      <div className="px-4 py-4">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[11.5px] font-medium">{org}</span>
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.05em] text-urgent">{deadlineLabel}</span>
        </div>
        <h2 className="mt-2 font-display text-[1.15rem] font-semibold leading-[1.2]">
          <Link href={`/notice/${n.id}`} className="link-rule">
            {title}
          </Link>
        </h2>
        <dl className="mt-3.5 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-border pt-3">
          <div>
            <dt className="fact-label">{t("card.vacancies")}</dt>
            <dd className="mt-0.5 fact-value">{formatNumber(n.totalVacancies)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="fact-label">{t("card.lastDate")}</dt>
            <dd className="mt-0.5 fact-value">{date ?? "—"}</dd>
          </div>
        </dl>
        <Link href={`/notice/${n.id}`} className="btn btn-primary mt-4 w-full group/cta">
          {t("card.viewDetails")}
          <ArrowRight className="size-3 group-hover/cta:translate-x-0.5" />
        </Link>
      </div>
    </aside>
  );
}

function SectorTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px shrink-0 whitespace-nowrap border-b-2 pb-2 text-[12.5px] font-medium transition-colors",
        active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
