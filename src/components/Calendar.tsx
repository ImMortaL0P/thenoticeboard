"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, List } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { todayIST, type Notice } from "@/lib/domain";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/locales/en";

type CalEventType = "apply" | "fee" | "exam" | "admit" | "result";

type CalEvent = {
  id: string;
  noticeId: string;
  type: CalEventType;
  date: string; // YYYY-MM-DD
  title: string;
  org: string;
  tone: string;
  dot: string;
  label: string;
};

const LEGEND_KEYS: Record<CalEventType, TranslationKey> = {
  apply: "calendar.legendApply",
  fee: "calendar.legendFee",
  exam: "calendar.legendExam",
  admit: "calendar.legendAdmit",
  result: "calendar.legendResult",
};

const EVENT_TYPES: ReadonlyArray<{
  key: CalEventType;
  date: (n: Notice) => string | null | undefined;
  tone: string;
  dot: string;
}> = [
  { key: "apply", date: (n) => n.applyLast, tone: "text-urgent", dot: "bg-urgent" },
  { key: "fee", date: (n) => n.feeLast, tone: "text-warn-foreground", dot: "bg-warn" },
  { key: "exam", date: (n) => n.examDate, tone: "text-primary", dot: "bg-primary" },
  { key: "admit", date: (n) => n.admitCardDate, tone: "text-verified", dot: "bg-verified" },
  { key: "result", date: (n) => n.resultDate, tone: "text-open", dot: "bg-open" },
];

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

export function Calendar({ notices, savedIds, hasUser }: { notices: Notice[]; savedIds: string[]; hasUser: boolean }) {
  const { t, lang } = useI18n();
  const today = todayIST();
  const [view, setView] = useState<"month" | "list">("month");
  const [savedOnly, setSavedOnly] = useState(false);
  const [ym, setYm] = useState(() => {
    const [y, m] = today.split("-").map(Number);
    return { y, m: m - 1 };
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const locale = lang === "hi" ? "hi-IN" : "en-IN";

  const events = useMemo(() => {
    const out: CalEvent[] = [];
    for (const n of notices) {
      if (savedOnly && !savedIds.includes(n.id)) continue;
      for (const et of EVENT_TYPES) {
        const date = et.date(n);
        if (!date) continue;
        out.push({
          id: `${n.id}:${et.key}`,
          noticeId: n.id,
          type: et.key,
          date,
          title: lang === "hi" && n.titleHi ? n.titleHi : n.title,
          org: n.organization?.shortName ?? n.organization?.name ?? "",
          tone: et.tone,
          dot: et.dot,
          label: t(LEGEND_KEYS[et.key]),
        });
      }
    }
    out.sort((a, b) => a.date.localeCompare(b.date));
    return out;
  }, [notices, savedOnly, savedIds, lang, t]);

  const byDate = useMemo(() => {
    const m = new Map<string, CalEvent[]>();
    for (const e of events) {
      const arr = m.get(e.date) ?? [];
      arr.push(e);
      m.set(e.date, arr);
    }
    return m;
  }, [events]);

  const onDay = (date: string) => byDate.get(date) ?? [];

  const monthLabel = new Date(ym.y, ym.m, 1).toLocaleDateString(locale, { month: "long", year: "numeric" });

  // calendar grid cells: null = blank leading/trailing slot
  const grid = useMemo(() => {
    const firstDow = new Date(ym.y, ym.m, 1).getDay();
    const daysIn = new Date(ym.y, ym.m + 1, 0).getDate();
    const cells: (number | null)[] = Array(firstDow).fill(null);
    for (let d = 1; d <= daysIn; d++) cells.push(d);
    return cells;
  }, [ym]);

  const dayKey = (d: number | null) =>
    d == null ? "" : `${ym.y}-${String(ym.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const monthEventsFirst = useMemo(() => {
    for (let d = 1; d <= 31; d++) {
      const k = dayKey(d);
      if (k && byDate.get(k)?.length) return k;
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byDate, ym]);

  const shownDay = selectedDay ?? monthEventsFirst;

  const upcoming = events.filter((e) => e.date >= today);

  const shift = (delta: number) =>
    setYm(({ y, m }) => {
      const d = new Date(y, m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });

  const monthTitle = t("calendar.month");
  const listTitle = t("calendar.list");

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("calendar.title")}</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">{t("calendar.subtitle")}</p>
        </div>
        {hasUser && (
          <label className="inline-flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              className="size-4 accent-[var(--color-primary)]"
              checked={savedOnly}
              onChange={(e) => {
                setSavedOnly(e.target.checked);
                setSelectedDay(null);
              }}
            />
            {t("calendar.savedOnly")}
          </label>
        )}
      </header>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => shift(-1)} aria-label={t("calendar.prev")}>
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => {
              const [y, m] = today.split("-").map(Number);
              setYm({ y, m: m - 1 });
            }}
          >
            {t("calendar.today")}
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => shift(1)} aria-label={t("calendar.next")}>
            <ChevronRight className="size-4" />
          </button>
          <span className="ml-2 min-w-40 text-sm font-bold tracking-tight">{monthLabel}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="flex rounded-lg border border-border bg-card p-0.5">
            <IconToggle active={view === "month"} onClick={() => setView("month")} ariaLabel={monthTitle}>
              <CalendarDays className="size-4" />
            </IconToggle>
            <IconToggle active={view === "list"} onClick={() => setView("list")} ariaLabel={listTitle}>
              <List className="size-4" />
            </IconToggle>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {EVENT_TYPES.map((et) => (
          <span key={et.key} className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <span className={cn("size-2 rounded-full", et.dot)} />
            {t(LEGEND_KEYS[et.key])}
          </span>
        ))}
      </div>

      {view === "month" ? (
        <div className="space-y-3">
          {/* Weekday header */}
          <div className="grid grid-cols-7">
            {WEEKDAYS.map((w) => (
              <div key={w} className="pb-1 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {new Date(2024, 0, 7 + WEEKDAYS.indexOf(w)).toLocaleDateString(locale, { weekday: "short" })}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-1">
            {grid.map((d, i) => {
              const k = dayKey(d);
              const evts = k ? onDay(k) : [];
              const isToday = k === today;
              const isSelected = k === shownDay;
              return d == null ? (
                <div key={`blank-${i}`} aria-hidden />
              ) : (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSelectedDay(k)}
                  aria-label={k}
                  className={cn(
                    "relative flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg text-sm transition-colors duration-150",
                    isToday && "font-bold text-primary",
                    isSelected ? "bg-accent text-accent-foreground" : "hover:bg-muted",
                  )}
                >
                  {d}
                  <span className="flex h-1.5 items-center gap-0.5">
                    {evts.slice(0, 3).map((e) => (
                      <span key={e.id} className={cn("size-1.5 rounded-full", e.dot)} />
                    ))}
                    {evts.length > 3 && <span className="text-[9px] leading-none text-muted-foreground">+{evts.length - 3}</span>}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Selected day events */}
          <div className="rounded-xl border border-border bg-card px-3 py-2">
            {shownDay ? (
              <EventsOnDay events={onDay(shownDay)} day={shownDay} locale={locale} emptyLabel={t("calendar.noEventsDay")} />
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">{t("calendar.tapDay")}</p>
            )}
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {upcoming.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">{t("calendar.noEvents")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {upcoming.map((e) => {
                const [y, m, d] = e.date.split("-").map(Number);
                const day = d;
                const month = new Date(y, m - 1, 1).toLocaleDateString(locale, { month: "short" });
                return (
                  <li key={e.id}>
                    <Link
                      href={`/notice/${e.noticeId}`}
                      className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50"
                    >
                      <div className="w-12 shrink-0 text-center">
                        <div className="text-lg font-bold leading-none tabular-nums">{day}</div>
                        <div className="mt-0.5 text-[10px] font-semibold uppercase text-muted-foreground">{month}</div>
                      </div>
                      <span className={cn("size-2 shrink-0 rounded-full", e.dot)} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium group-hover:text-primary">{e.title}</p>
                        <p className="text-xs text-muted-foreground">{e.org}</p>
                      </div>
                      <span className={cn("shrink-0 text-xs font-semibold", e.tone)}>{e.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function EventsOnDay({ events, day, locale, emptyLabel }: { events: CalEvent[]; day: string; locale: string; emptyLabel: string }) {
  const fmt = new Date(`${day}T00:00:00Z`).toLocaleDateString(locale, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
  return (
    <div>
      <h3 className="mb-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">{fmt}</h3>
      {events.length === 0 ? (
        <p className="py-1 text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="space-y-1">
          {events.map((e) => (
            <li key={e.id}>
              <Link
                href={`/notice/${e.noticeId}`}
                className="flex items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors hover:bg-muted"
              >
                <span className={cn("size-2 shrink-0 rounded-full", e.dot)} />
                <span className="min-w-0 flex-1 truncate font-medium hover:text-primary">{e.title}</span>
                <span className={cn("shrink-0 text-xs font-semibold", e.tone)}>{e.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function IconToggle({ active, onClick, ariaLabel, children }: { active: boolean; onClick: () => void; ariaLabel: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={active}
      className={cn(
        "rounded-md p-1.5 transition-colors duration-150",
        active ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}