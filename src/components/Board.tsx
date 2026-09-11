"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { NoticeCard } from "@/components/NoticeCard";
import {
  CATEGORIES,
  QUALIFICATIONS,
  SECTORS,
  STATES,
  checkEligibility,
  daysBetween,
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
        <input type="checkbox" checked={get("free") === "1"} onChange={(e) => set("free", e.target.checked ? "1" : "")} />
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
          <input type="checkbox" checked={get("eligible") === "1"} onChange={(e) => set("eligible", e.target.checked ? "1" : "")} />
          {t("filters.onlyEligible")}
        </label>
      )}
      <button type="button" onClick={reset} className="btn btn-outline w-full">{t("filters.reset")}</button>
    </div>
  );

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <h1 className="max-w-3xl text-3xl font-bold tracking-tight sm:text-4xl">{t("home.heroTitle")}</h1>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">{t("home.heroSub")}</p>
        <div className="flex flex-wrap gap-x-8 gap-y-3 sm:max-w-xl">
          <Stat label={t("stats.openNow")} value={stats.open} tone="text-open" />
          <Stat label={t("stats.closingWeek")} value={stats.week} tone="text-urgent" />
          <Stat label={t("stats.newToday")} value={stats.recent} tone="text-primary" />
        </div>
      </section>

      {notices.some((n) => n.isSample) && (
        <p className="rounded-lg border border-warn/40 bg-warn-soft px-3 py-2 text-xs font-medium text-warn-foreground">
          {t("home.sampleBanner")}
        </p>
      )}

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

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        <SectorChip active={!get("sector")} onClick={() => set("sector", "")}>{t("home.allSectors")}</SectorChip>
        {SECTORS.map((s) => (
          <SectorChip key={s} active={get("sector") === s} onClick={() => set("sector", get("sector") === s ? "" : s)}>
            {t(`sector.${s}`)}
          </SectorChip>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <aside className="hidden lg:block">
          <div className="card sticky top-20 p-4">
            <h2 className="mb-3 text-sm font-bold">{t("filters.title")}</h2>
            {filterPanel}
          </div>
        </aside>

        <section>
          <p className="mb-3 text-sm text-muted-foreground">{t("home.results", { count: filtered.length })}</p>
          {filtered.length === 0 ? (
            <div className="card p-10 text-center">
              <p className="text-muted-foreground">{t("home.noResults")}</p>
              <button className="btn btn-outline mt-3" onClick={reset}>{t("home.clearFilters")}</button>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2" lang={lang}>
              {filtered.map((n) => (
                <NoticeCard key={n.id} n={n} profile={profile} />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* mobile bottom sheet */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button className="absolute inset-0 bg-black/40" aria-label="Close" onClick={() => setSheetOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-border bg-background p-4">
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
      )}
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
    <div className="border-t border-border pt-2">
      <div className={cn("text-2xl font-bold tabular-nums tracking-tight", tone)}>{value}</div>
      <div className="mt-0.5 text-xs font-medium text-muted-foreground">{label}</div>
    </div>
  );
}

function SectorChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition-[color,background-color,border-color] duration-150",
        active
          ? "border-primary/40 bg-accent text-primary"
          : "border-border bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
