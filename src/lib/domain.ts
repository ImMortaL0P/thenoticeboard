// Core domain logic: types, deadline status, fees, eligibility.
// Ported from the Lovable build (src/lib/domain.ts) and adapted to the Prisma model.
import type { Notification, Organization, NotificationUpdate } from "@prisma/client";

export const SECTORS = [
  "central_govt",
  "banking_insurance",
  "railways",
  "defence",
  "psu",
  "state_psc",
  "private",
] as const;
export type Sector = (typeof SECTORS)[number];

export const QUALIFICATIONS = [
  "10th",
  "12th",
  "diploma",
  "graduate",
  "engineering",
  "postgraduate",
  "phd",
] as const;
export type Qualification = (typeof QUALIFICATIONS)[number] | "any";

export const CATEGORIES = ["general", "ews", "obc", "sc", "st"] as const;
export type Category = (typeof CATEGORIES)[number];

export const FEE_KEYS = ["general", "obc", "ews", "sc", "st", "female", "pwbd"] as const;
export const RELAX_KEYS = ["sc_st", "obc", "ews", "pwbd", "esm", "female"] as const;
export const UPDATE_TYPES = ["corrigendum", "date_extension", "admit_card", "answer_key", "result"] as const;
export const STATUSES = ["draft", "pending_review", "published", "closed", "archived", "rejected"] as const;

export const STREAMS = [
  "Any",
  "Science",
  "Commerce",
  "Arts",
  "Engineering",
  "Computer Science",
  "Information Technology",
  "Mechanical",
  "Electrical",
  "Civil",
  "Electronics",
  "Chemical",
  "Law",
  "Medical",
  "ITI",
];

export const STATES = [
  "All India",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
];

const QUAL_RANK: Record<string, number> = {
  any: 0,
  "10th": 1,
  "12th": 2,
  diploma: 3,
  graduate: 4,
  engineering: 4.5,
  postgraduate: 5,
  phd: 6,
};

/** Plain, serialisable notice passed to client components. */
export type Notice = Omit<
  Notification,
  | "postNames"
  | "streams"
  | "vacancyBreakup"
  | "ageRelaxation"
  | "fees"
  | "createdAt"
  | "updatedAt"
  | "sourceVerifiedAt"
  | "reviewedAt"
  | "alertsSentAt"
  | "rawText"
> & {
  postNames: string[];
  streams: string[];
  vacancyBreakup: Record<string, number>;
  ageRelaxation: Record<string, number>;
  fees: Record<string, number>;
  createdAt: string;
  updatedAt: string;
  sourceVerifiedAt: string | null;
  organization: Pick<Organization, "id" | "name" | "shortName" | "officialWebsite" | "logoUrl" | "isVerified"> | null;
};

export type UpdateRow = Pick<NotificationUpdate, "id" | "type" | "title" | "link" | "date">;

function asArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : [];
}
function asRecord(v: unknown): Record<string, number> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    const num = typeof val === "number" ? val : Number(val);
    if (!Number.isNaN(num)) out[k] = num;
  }
  return out;
}

export function toNotice(n: Notification & { organization?: Organization | null }): Notice {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { rawText, reviewedAt, alertsSentAt, ...rest } = n;
  return {
    ...rest,
    postNames: asArray(n.postNames),
    streams: asArray(n.streams),
    vacancyBreakup: asRecord(n.vacancyBreakup),
    ageRelaxation: asRecord(n.ageRelaxation),
    fees: asRecord(n.fees),
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
    sourceVerifiedAt: n.sourceVerifiedAt ? n.sourceVerifiedAt.toISOString() : null,
    organization: n.organization
      ? {
          id: n.organization.id,
          name: n.organization.name,
          shortName: n.organization.shortName,
          officialWebsite: n.organization.officialWebsite,
          logoUrl: n.organization.logoUrl,
          isVerified: n.organization.isVerified,
        }
      : null,
  };
}

// ---------- dates ----------

/** Today's date in India (YYYY-MM-DD), independent of server timezone. */
export function todayIST(): string {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
}

export function daysBetween(dateStr: string, from: string = todayIST()): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${dateStr}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type DeadlineTone = "urgent" | "warn" | "open" | "neutral";
export type BoardStatus = "open" | "closing_soon" | "upcoming" | "closed";
export type Deadline = { tone: DeadlineTone; boardStatus: BoardStatus; days: number | null };

export function getDeadline(n: Pick<Notice, "applyLast" | "applyStart" | "status">): Deadline {
  if (n.status === "closed") return { tone: "neutral", boardStatus: "closed", days: null };
  if (!n.applyLast) return { tone: "neutral", boardStatus: "upcoming", days: null };
  const days = daysBetween(n.applyLast);
  if (n.applyStart && daysBetween(n.applyStart) > 0) {
    return { tone: "neutral", boardStatus: "upcoming", days: daysBetween(n.applyStart) };
  }
  if (days < 0) return { tone: "neutral", boardStatus: "closed", days };
  if (days <= 3) return { tone: "urgent", boardStatus: "closing_soon", days };
  if (days <= 7) return { tone: "warn", boardStatus: "closing_soon", days };
  return { tone: "open", boardStatus: "open", days };
}

export const toneClasses: Record<DeadlineTone, string> = {
  urgent: "bg-urgent-soft text-urgent border-urgent/30",
  warn: "bg-warn-soft text-warn-foreground border-warn/40",
  open: "bg-open-soft text-open border-open/30",
  neutral: "bg-neutral-soft text-muted-foreground border-border",
};

export const toneBar: Record<DeadlineTone, string> = {
  urgent: "bg-urgent",
  warn: "bg-warn",
  open: "bg-open",
  neutral: "bg-neutral/40",
};

// ---------- fees ----------

export function feeFor(n: Pick<Notice, "fees">, category: string): number | null {
  const v = n.fees[category];
  return typeof v === "number" ? v : null;
}

export function reservedFee(n: Pick<Notice, "fees">): number | null {
  const c = [n.fees.sc, n.fees.st, n.fees.pwbd].filter((v) => typeof v === "number");
  return c.length ? Math.min(...c) : null;
}

export function maxFee(n: Pick<Notice, "fees">): number {
  const v = Object.values(n.fees);
  return v.length ? Math.max(...v) : 0;
}

export function formatFee(value: number | null, freeLabel = "Free"): string {
  if (value === null || value === undefined) return "n/a";
  return value === 0 ? freeLabel : `₹${value.toLocaleString("en-IN")}`;
}

export function formatDate(value: string | null | undefined, lang = "en"): string {
  if (!value) return "n/a";
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "n/a";
  return n.toLocaleString("en-IN");
}

/** Compact age band for dense cards: 18-27, ≤ 27, 18+, or the tbd label. */
export function formatAgeRange(min: number | null, max: number | null, tbd: string): string {
  if (min === null && max === null) return tbd;
  if (min === null) return `≤ ${max}`;
  if (max === null) return `${min}+`;
  return `${min}-${max}`;
}

export function hostOf(url: string | null | undefined): string {
  if (!url) return "official source";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// ---------- eligibility ----------

export function ageOn(dob: string, cutoff: string | null): number {
  const ref = cutoff ?? todayIST();
  const [by, bm, bd] = dob.split("-").map(Number);
  const [ry, rm, rd] = ref.split("-").map(Number);
  let age = ry - by;
  if (rm < bm || (rm === bm && rd < bd)) age -= 1;
  return age;
}

export type EligibilityInput = {
  dob?: string | null;
  category?: string | null;
  pwbd?: boolean;
  exServicemen?: boolean;
  gender?: string | null;
  qualification?: string | null;
  stream?: string | null;
  experienceYears?: number | null;
};

export type Reason = { key: string; vars: Record<string, string | number> };
export type EligibilityResult = {
  verdict: "eligible" | "not_eligible" | "check";
  reasons: Reason[];
  effectiveMaxAge: number | null;
  age: number | null;
};

export function relaxationYears(n: Pick<Notice, "ageRelaxation">, input: EligibilityInput): number {
  const r = n.ageRelaxation;
  let extra = 0;
  const cat = (input.category ?? "general").toLowerCase();
  if (cat === "sc" || cat === "st") extra = Math.max(extra, r.sc_st ?? 0);
  if (cat === "obc") extra = Math.max(extra, r.obc ?? 0);
  if (cat === "ews") extra = Math.max(extra, r.ews ?? 0);
  // PwBD relaxation is cumulative with category relaxation under central government rules.
  if (input.pwbd) extra += r.pwbd ?? 0;
  if (input.exServicemen) extra = Math.max(extra, r.esm ?? 0);
  if (input.gender === "female") extra = Math.max(extra, r.female ?? 0);
  return extra;
}

export function checkEligibility(
  n: Pick<
    Notice,
    "ageRelaxation" | "maxAge" | "minAge" | "ageCutoffDate" | "minQualification" | "streams" | "experienceRequiredYears"
  >,
  input: EligibilityInput,
): EligibilityResult {
  const reasons: Reason[] = [];
  const hasAnyInput = Boolean(input.dob || input.qualification);
  const extra = relaxationYears(n, input);
  const effectiveMaxAge = n.maxAge === null ? null : n.maxAge + extra;
  let age: number | null = null;

  if (input.dob) {
    age = ageOn(input.dob, n.ageCutoffDate);
    const min = n.minAge ?? 0;
    if (age < min || (effectiveMaxAge !== null && age > effectiveMaxAge)) {
      reasons.push({ key: "elig.reasonAge", vars: { age, min, max: effectiveMaxAge ?? "n/a" } });
    }
  }

  if (input.qualification && n.minQualification !== "any") {
    const need = QUAL_RANK[n.minQualification] ?? 0;
    const have = QUAL_RANK[input.qualification] ?? 0;
    const engineeringOk =
      n.minQualification !== "engineering" ||
      input.qualification === "engineering" ||
      input.qualification === "postgraduate" ||
      input.qualification === "phd";
    if (have < need || !engineeringOk) {
      reasons.push({ key: "elig.reasonQual", vars: { required: n.minQualification } });
    }
  }

  const streams = n.streams.filter((s) => s.toLowerCase() !== "any");
  if (input.stream && input.stream.toLowerCase() !== "any" && streams.length && !n.streams.some((s) => s.toLowerCase() === "any")) {
    const match = streams.some((s) => s.toLowerCase() === (input.stream ?? "").toLowerCase());
    if (!match) reasons.push({ key: "elig.reasonStream", vars: { streams: streams.join(", ") } });
  }

  const needExp = Number(n.experienceRequiredYears ?? 0);
  if (needExp > 0 && (input.experienceYears ?? 0) < needExp) {
    reasons.push({ key: "elig.reasonExp", vars: { years: needExp } });
  }

  if (!hasAnyInput) return { verdict: "check", reasons: [], effectiveMaxAge, age };
  if (reasons.length) return { verdict: "not_eligible", reasons, effectiveMaxAge, age };
  if (!input.dob && n.maxAge !== null) return { verdict: "check", reasons, effectiveMaxAge, age };
  return { verdict: "eligible", reasons, effectiveMaxAge, age };
}

export function isNew(n: Pick<Notice, "createdAt" | "notificationDate">): boolean {
  if (n.notificationDate) return daysBetween(n.notificationDate) >= -7;
  return Date.now() - Date.parse(n.createdAt) < 3 * 86_400_000;
}

export function isUpdated(n: Pick<Notice, "createdAt" | "updatedAt">): boolean {
  return Date.parse(n.updatedAt) - Date.parse(n.createdAt) > 86_400_000 && Date.now() - Date.parse(n.updatedAt) < 7 * 86_400_000;
}
