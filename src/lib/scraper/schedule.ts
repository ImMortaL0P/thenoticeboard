import { envNum } from "../env";
// Scrape scheduling by tier and timeslot.
//
// Two dials, not one. `everyHours` stops a source being hammered; `hoursIST`
// says *when* it is worth looking at all. Indian recruitment bodies publish
// during the working day, so national high-yield sources get swept across
// office hours while the long tail runs once, overnight, when nothing else
// is competing for the worker.
//
// All hours are IST (Asia/Kolkata), because that is when the publishers work.
//
// The slots also dodge the extraction models' busiest window. Gemini's load is
// US-centric: IST 03:00 is UTC 21:30, i.e. mid-afternoon US Pacific — the worst
// possible moment, and where the overnight tiers used to sit. IST 11:00-16:00
// is the US night and measurably quieter, so the unattended tiers run there
// instead. The publishers do not care what time we read their pages; the
// models do.
//
// IST -> US Pacific, for reference (PDT; shift one hour in the US winter):
//   IST 03:00 -> 14:30 PT  peak        IST 12:00 -> 23:30 PT  quiet
//   IST 07:00 -> 18:30 PT  moderate    IST 14:00 -> 01:30 PT  quiet
//   IST 10:00 -> 21:30 PT  moderate    IST 16:00 -> 03:30 PT  quiet
//   IST 11:00 -> 22:30 PT  quiet       IST 22:00 -> 09:30 PT  peak
// The quiet band is roughly IST 11:00-18:00.

export type Tier = "hot" | "standard" | "slow" | "watch";

export type TierConfig = {
  label: string;
  /** Minimum gap between two runs of the same source. */
  everyHours: number;
  /** Hours of the IST day at which this tier is eligible to run. */
  hoursIST: number[];
  description: string;
};

export const TIERS: Record<Tier, TierConfig> = {
  hot: {
    label: "Hot",
    everyHours: 3,
    hoursIST: [7, 10, 13, 16, 19, 22],
    description:
      "National high-volume bodies (SSC, UPSC, IBPS, SBI, RRB, India Post). Swept across the working day plus a late sweep, so a morning notification is on the board the same day. Its 13:00 and 16:00 sweeps sit in the models' quiet window; 19:00 and 22:00 land in US business hours, where deferrals are likeliest — acceptable, because a deferred link is simply retried on the next tick.",
  },
  standard: {
    label: "Standard",
    everyHours: 12,
    hoursIST: [11, 20],
    description:
      "PSUs, central agencies and regulators. Twice a day is ample — these publish in bursts and rarely give short windows. The main sweep moved from 08:00 to 11:00 to land in the models' quiet window.",
  },
  slow: {
    label: "Slow",
    everyHours: 24,
    hoursIST: [12],
    description:
      "State commissions and the long tail. Once a day at IST 12:00 — the quietest hour for the extraction models, and nothing here is time-critical enough to need an overnight run.",
  },
  watch: {
    label: "Watch",
    everyHours: 24,
    hoursIST: [14],
    description:
      "Pages for a single exam we have already captured. They will never yield a new notice, but they are exactly where a date extension or corrigendum appears — so they are re-read once a day and deactivated automatically when their notice closes. Runs at IST 14:00, inside the quiet window, since it is the largest tier by source count.",
  },
};

/**
 * A source that tracks ONE already-captured exam rather than listing new ones.
 *
 * These were seeded one-per-notice ("SSC Junior Engineer (JE Exam 2026) Portal"),
 * and they are the reason the organisation table fragmented: the old scraper
 * created an Organization from each source name. Sweeping them every three hours
 * is pure waste — the notice is already on the board. They still earn a daily
 * read, because a date extension is posted on the exam's own page.
 */
export function isWatchSource(input: { name: string; url?: string | null }): boolean {
  const n = input.name;
  if (/\bportal\s*$/i.test(n)) return true;
  // "<body> <exam name> <year>" with no listing word — a single advertisement.
  if (/\b20\d{2}\b/.test(n) && !/(notice|notification|advertis|vacanc|career|opening|announce|recruitment board)/i.test(n)) {
    return true;
  }
  return false;
}

/** Which tier a source belongs to, from its sector and short name. */
export function defaultTierFor(input: { sector: string; name: string; shortName?: string | null; url?: string | null }): Tier {
  // Checked first: a single-exam page is a watch target whatever body it belongs
  // to. Otherwise the 13 SSC/UPSC/RRB exam portals would all land in "hot" and
  // burn six sweeps a day each to re-read a notice we already have.
  if (isWatchSource(input)) return "watch";

  const hay = `${input.name} ${input.shortName ?? ""}`;
  if (/\b(ssc|upsc|ibps|sbi|rrb|railway|india\s?post|department of posts)\b/i.test(hay)) return "hot";
  if (input.sector === "state_psc") return "slow";
  if (input.sector === "psu" || input.sector === "private") return "standard";
  return "standard";
}

export function hourIST(now: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hour12: false,
      timeZone: "Asia/Kolkata",
    }).format(now),
  );
}

/**
 * Is this source due right now?
 *
 * A source is due when the current IST hour is one of its tier's slots AND
 * enough time has passed since its last run. The slot check is what makes the
 * schedule predictable: a "hot" source is looked at at 07:00, 10:00, 13:00 …
 * rather than drifting by however long the previous sweep happened to take.
 */
export function isDue(
  source: { tier?: string | null; intervalHours?: number | null; lastRunAt?: Date | null },
  now: Date = new Date(),
): boolean {
  const tier = (source.tier as Tier) in TIERS ? (source.tier as Tier) : "standard";
  const cfg = TIERS[tier];
  if (!cfg.hoursIST.includes(hourIST(now))) return false;

  const gapHours = source.intervalHours ?? cfg.everyHours;
  if (!source.lastRunAt) return true;
  const elapsed = now.getTime() - source.lastRunAt.getTime();
  // 10 minutes of slack so an hourly tick that fires a little late still counts.
  return elapsed >= gapHours * 3_600_000 - 600_000;
}

/**
 * IST hour for the daily Gemini discovery sweep. 15:00 IST is 01:30 US Pacific:
 * one grounded-search call plus a batch of extractions, run when the models are
 * least contended.
 */
export const GEMINI_DISCOVERY_HOUR_IST = envNum("GEMINI_DISCOVERY_HOUR_IST", 15);

/** IST hour at which closed notices are swept and deadline alerts fire. */
export const MAINTENANCE_HOUR_IST = envNum("MAINTENANCE_HOUR_IST", 9);
