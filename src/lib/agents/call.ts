// One rate-limited model call, walking a provider list until one answers.
//
// Separate from the scraper's autoExtract because the agents need control over
// WHICH provider answered (for the two-reading agreement check) and must pace
// themselves against each provider's published allowance rather than firing and
// handling 429s.

import { acquire, release } from "./limits";
import { isQuotaExhausted, isTimeout, isTransient, isUnreachable, type Provider, type ProviderInput } from "../scraper/providers";
import { SECTORS, QUALIFICATIONS, NOTICE_TYPES, detectNoticeType } from "../domain";
import type { NoticeDraft } from "../extract";

const UNKNOWN = "unknown";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Providers proven dead for this process, so they are not tried per notice. */
const dead = new Set<string>();

export type CallResult = { provider: string; raw: Record<string, unknown> };

export async function callProvider(
  chain: Provider[],
  input: ProviderInput,
  opts: { log?: (s: string) => void } = {},
): Promise<CallResult | null> {
  const log = opts.log ?? (() => {});

  const ATTEMPTS = 3;

  for (const provider of chain) {
    if (dead.has(provider.name)) continue;

    // A transient failure is retried on the SAME provider before moving on.
    // Previously one hiccup dropped straight through to the next provider,
    // which meant that with a single-provider chain (--local-only) one slow
    // first call ended the notice entirely.
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      const ok = await acquire(provider.name);
      if (!ok) {
        log(`       ${provider.name}: daily allowance spent`);
        dead.add(provider.name);
        break;
      }

      try {
        log(`       ${provider.name}${attempt > 1 ? ` (attempt ${attempt})` : ""}…`);
        const raw = await provider.call(input);
        return { provider: provider.name, raw };
      } catch (err) {
        const msg = err instanceof Error ? err.message.slice(0, 120) : String(err);
        if (isQuotaExhausted(err)) {
          log(`       ${provider.name}: out of quota`);
          dead.add(provider.name);
          break;
        }
        if (isUnreachable(err)) {
          log(`       ${provider.name}: not running`);
          dead.add(provider.name);
          break;
        }
        if (isTimeout(err)) {
          log(`       ${provider.name}: timed out — the document may be long, or the model still loading`);
          if (attempt === ATTEMPTS) break;
          await sleep(3_000);
          continue;
        }
        if (isTransient(err)) {
          log(`       ${provider.name}: busy (${msg})`);
          if (attempt === ATTEMPTS) break;
          await sleep(2_000 * attempt);
          continue;
        }
        log(`       ${provider.name}: ${msg}`);
        dead.add(provider.name);
        break;
      } finally {
        release(provider.name);
      }
    }
  }
  return null;
}

/** Shared normalisation — identical rules to the scraper's own sanitiser. */
export function sanitizeDraftFor(raw: Record<string, unknown>): NoticeDraft {
  const str = (v: unknown): string | null => {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return !t || t.toLowerCase() === UNKNOWN || t.toLowerCase() === "null" ? null : t;
  };
  const money = (v: unknown): number | null => {
    const x = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.]/g, ""));
    return Number.isFinite(x) && x >= 0 && x < 1_000_000 ? x : null;
  };
  const count = (v: unknown): number | null => {
    const x = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.]/g, ""));
    return Number.isFinite(x) && x > 0 && x < 10_000_000 ? x : null;
  };
  const age = (v: unknown): number | null => {
    const x = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.]/g, ""));
    return Number.isFinite(x) && x >= 14 && x <= 70 ? x : null;
  };
  const years = (v: unknown): number | null => {
    const x = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.]/g, ""));
    return Number.isFinite(x) && x >= 0 && x <= 40 ? x : null;
  };
  const date = (v: unknown): string | null => {
    const s = str(v);
    return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  };

  const qual = str(raw.minQualification);
  const title = str(raw.title);
  const declaredType = str(raw.noticeType);

  return {
    organizationShortName: str(raw.organizationShortName),
    organizationNameRaw: str(raw.organizationNameRaw),
    sector: (SECTORS as readonly string[]).includes(str(raw.sector) ?? "") ? (str(raw.sector) as string) : null,
    noticeType:
      declaredType && (NOTICE_TYPES as readonly string[]).includes(declaredType)
        ? declaredType
        : detectNoticeType({ title, orgShortName: str(raw.organizationShortName) }),
    title,
    advertisementNo: str(raw.advertisementNo),
    totalVacancies: count(raw.totalVacancies),
    minQualification: qual && ([...QUALIFICATIONS, "any"] as readonly string[]).includes(qual) ? qual : "any",
    minAge: age(raw.minAge),
    maxAge: age(raw.maxAge),
    feeGeneral: money(raw.feeGeneral),
    feeReserved: money(raw.feeReserved),
    applyStart: date(raw.applyStart),
    applyLast: date(raw.applyLast),
    notificationDate: date(raw.notificationDate),
    summary: str(raw.summary),
    payLevel: str(raw.payLevel),
    selectionProcess: str(raw.selectionProcess),
    experienceRequiredYears: years(raw.experienceRequiredYears),
    applyUrl: str(raw.applyUrl),
    officialNotificationPdfUrl: str(raw.officialNotificationPdfUrl),
    postNames: Array.isArray(raw.postNames) ? raw.postNames.filter((p): p is string => typeof p === "string") : null,
  };
}
