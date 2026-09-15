// Deterministic checks that run before any model is called.
//
// Every one of these is free and certain, so they go first: a notice that fails
// a date constraint is rejected without spending a single token, and a large
// share of scraped junk fails here. Only what survives is worth a model's time.

import { todayIST, daysBetween } from "../domain";

export type ConstraintIssue = { field: string; severity: "reject" | "flag"; message: string };

/**
 * Days after the closing date that an UNEXTENDED notice is still accepted.
 *
 * A window that shut a week ago is not something a candidate can act on. The
 * exception is an extension: bodies routinely push a deadline after it passes,
 * and those notices are still live, so a recorded date_extension overrides this.
 */
export const MAX_DAYS_PAST = Number(process.env.NOTICE_MAX_DAYS_PAST ?? 7);

/**
 * Hard floor. Nothing this far past its deadline is kept, extension or not —
 * an extension that itself expired a fortnight ago is just as dead.
 */
export const HARD_EXPIRY_DAYS = Number(process.env.NOTICE_HARD_EXPIRY_DAYS ?? 15);

/**
 * Maximum age of the notice itself, by its publication date.
 *
 * Scrapers constantly rediscover archive pages. A notification issued more than
 * six months ago is a record, not news, whatever its stated deadline says.
 */
export const MAX_AGE_DAYS = Number(process.env.NOTICE_MAX_AGE_DAYS ?? 180);

/**
 * How far ahead a closing date may plausibly sit. Recruitment windows do not
 * open two years out; a date beyond this is almost always a parse error
 * (a 2126 for a 2026, or an exam date mistaken for a deadline).
 */
export const MAX_DAYS_FUTURE = Number(process.env.NOTICE_MAX_DAYS_FUTURE ?? 400);

type Checkable = {
  /** A date_extension has been recorded, so the original deadline is moot. */
  isExtended?: boolean;
  applyLast?: string | null;
  applyStart?: string | null;
  notificationDate?: string | null;
  examDate?: string | null;
  feeLast?: string | null;
  minAge?: number | null;
  maxAge?: number | null;
  totalVacancies?: number | null;
  title?: string | null;
  officialSourceUrl?: string | null;
};

export function checkConstraints(n: Checkable): ConstraintIssue[] {
  const issues: ConstraintIssue[] = [];
  const today = todayIST();

  // ---- age of the notice itself ------------------------------------------
  if (n.notificationDate) {
    const age = -daysBetween(n.notificationDate, today);
    if (age > MAX_AGE_DAYS) {
      issues.push({
        field: "notificationDate",
        severity: "reject",
        message: `published ${age} days ago (${n.notificationDate}) — older than the ${MAX_AGE_DAYS}-day limit`,
      });
    }
  }

  // ---- the application window --------------------------------------------
  if (n.applyLast) {
    const days = daysBetween(n.applyLast, today); // negative = already passed
    const passed = -days;

    if (passed >= HARD_EXPIRY_DAYS) {
      // Nothing survives this, extension or not.
      issues.push({
        field: "applyLast",
        severity: "reject",
        message: `expired ${passed} days ago (${n.applyLast}) — past the ${HARD_EXPIRY_DAYS}-day hard limit`,
      });
    } else if (passed >= MAX_DAYS_PAST && !n.isExtended) {
      issues.push({
        field: "applyLast",
        severity: "reject",
        message: `closed ${passed} days ago (${n.applyLast}) with no recorded extension`,
      });
    } else if (passed > 0 && n.isExtended) {
      issues.push({
        field: "applyLast",
        severity: "flag",
        message: `closed ${passed} days ago but an extension is recorded — confirm the new date`,
      });
    }

    if (days > MAX_DAYS_FUTURE) {
      issues.push({
        field: "applyLast",
        severity: "reject",
        message: `closing date ${n.applyLast} is ${days} days away — almost certainly a parse error`,
      });
    }
  } else if (n.applyStart && daysBetween(n.applyStart, today) < -MAX_AGE_DAYS) {
    // No closing date AND the window opened long ago: nothing current here.
    issues.push({
      field: "applyLast",
      severity: "reject",
      message: `no closing date and applications opened ${-daysBetween(n.applyStart, today)} days ago`,
    });
  } else {
    // Not fatal on its own: some notices genuinely announce before opening.
    issues.push({ field: "applyLast", severity: "flag", message: "no closing date" });
  }

  // Internal consistency. Each of these means a label was matched on the wrong
  // value, so the whole extraction is suspect, not just the one field.
  if (n.applyStart && n.applyLast && n.applyStart > n.applyLast) {
    issues.push({ field: "applyStart", severity: "flag", message: `opens (${n.applyStart}) after it closes (${n.applyLast})` });
  }
  if (n.notificationDate && n.applyLast && n.notificationDate > n.applyLast) {
    issues.push({ field: "notificationDate", severity: "flag", message: `issued (${n.notificationDate}) after it closes (${n.applyLast})` });
  }
  if (n.examDate && n.applyLast && n.examDate < n.applyLast) {
    issues.push({ field: "examDate", severity: "flag", message: `exam (${n.examDate}) before applications close (${n.applyLast})` });
  }
  if (n.feeLast && n.applyLast && daysBetween(n.applyLast, n.feeLast) < -7) {
    issues.push({ field: "feeLast", severity: "flag", message: `fee deadline (${n.feeLast}) long before closing (${n.applyLast})` });
  }

  if (n.minAge != null && n.maxAge != null && n.minAge > n.maxAge) {
    issues.push({ field: "minAge", severity: "flag", message: `minimum age ${n.minAge} above maximum ${n.maxAge}` });
  }
  if (n.totalVacancies != null && n.totalVacancies > 500_000) {
    issues.push({ field: "totalVacancies", severity: "flag", message: `${n.totalVacancies} vacancies is implausible` });
  }

  if (!n.title || n.title.trim().length < 12) {
    issues.push({ field: "title", severity: "flag", message: "title missing or too short to be meaningful" });
  }
  if (!n.officialSourceUrl) {
    issues.push({ field: "officialSourceUrl", severity: "reject", message: "no official source — nothing to verify against" });
  }

  return issues;
}

export function worstSeverity(issues: ConstraintIssue[]): "reject" | "flag" | "ok" {
  if (issues.some((i) => i.severity === "reject")) return "reject";
  if (issues.length) return "flag";
  return "ok";
}
