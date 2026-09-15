// Extraction orchestration: try each configured provider in turn, retrying the
// transient failures, and refuse to guess when none of them can be reached.

import { extractFromText, type NoticeDraft } from "../extract";
import { SECTORS, QUALIFICATIONS, NOTICE_TYPES, detectNoticeType } from "../domain";
import { UNKNOWN, MAX_PDF_INLINE_BYTES, isQuotaExhausted, isTransient, isUnreachable, providerChain, usage, type ProviderInput } from "./providers";

export type ExtractInput = ProviderInput & { linkText: string | null; url?: string };

export type ExtractResult = {
  draft: NoticeDraft;
  method: string;
  /** 0-100. Drives review ordering and, later, auto-publish eligibility. */
  confidence: number;
};

/**
 * Every provider was unreachable or overloaded.
 *
 * This is deliberately an error rather than a silent fall back to the regex
 * rules. The rules produce values like payLevel "673-49" and read exam dates as
 * notification dates; writing that into the board because a vendor was busy is
 * worse than not writing at all. The caller leaves the URL unrecorded so the
 * next scheduled tick picks it up again.
 */
export class ExtractionUnavailable extends Error {
  constructor(readonly attempts: string[]) {
    super(`extraction unavailable (${attempts.join("; ")})`);
  }
}

/**
 * Providers whose quota is gone for this process. Once a key reports quota
 * exhaustion there is no point calling it again in this run, so it is skipped
 * outright rather than retried per document.
 */
const exhausted = new Set<string>();

/**
 * Providers that could not be reached at all this process — typically a local
 * Ollama that is not running. Skipped outright rather than retried per
 * document, so a switched-off local model costs one failed connection for the
 * whole run instead of twenty seconds on every notice.
 */
const unreachable = new Set<string>();

/** Every configured provider has exhausted its quota. Nothing will work today. */
export class AllProvidersExhausted extends Error {
  constructor(readonly providers: string[]) {
    super(
      `every extraction provider is out of quota (${providers.join(", ")}). ` +
        `Enable billing on the provider, or set a second key (ANTHROPIC_API_KEY / OPENAI_API_KEY) in .env.`,
    );
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Is the locally-extracted text good enough to use instead of the PDF itself?
 *
 * This is the single biggest lever on free-tier consumption. A PDF sent inline
 * costs tens of thousands of tokens; the same document's text layer costs a few
 * thousand. Most government notices DO have a usable text layer — only scans
 * and the non-Unicode Devanagari fonts genuinely need the model to look at the
 * page. So the PDF goes up only when the text is actually unusable.
 */
export function textIsUsable(text: string): boolean {
  const t = text.trim();
  if (t.length < 800) return false;
  const caretDensity = (t.match(/\^/g) ?? []).length / t.length;
  if (caretDensity > 0.002) return false;
  // Byte-mangled extractions are mostly punctuation and stray capitals.
  const letters = (t.match(/[A-Za-z\u0900-\u097F]/g) ?? []).length;
  return letters / t.length > 0.5;
}

/**
 * Cheap gate before spending a model call at all. An index page, a results
 * notice or a syllabus has no business consuming quota — a recruitment notice
 * always carries both a date and recruitment vocabulary.
 */
export function looksLikeNotice(text: string, url?: string): boolean {
  if (url) {
    const lo = url.toLowerCase();
    if (lo.includes('/job/details_') || lo.includes('syllabus') || lo.includes('corrigendum') || lo.includes('result')) {
      return false;
    }
  }
  const head = text.slice(0, 20_000);
  const hasDate = /\b\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\b|\b\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(head);
  const hasVocab =
    /recruit|vacanc|applicat|eligib|advertisement|notification|post[s]?\b|appoint|भर्ती|विज्ञापन|रिक्ति|आवेदन|पद/i.test(head);
  return hasDate && hasVocab;
}
const BACKOFF_MS = [2_000, 6_000, 15_000];

/**
 * Total wall-clock budget for extracting ONE document across all providers and
 * retries. Without this the cascade can spend tens of minutes on a single
 * notice during an outage, which looks like a hang and starves everything
 * behind it. Exceeding it defers the document rather than failing it.
 */
const TOTAL_BUDGET_MS = Number(process.env.EXTRACT_BUDGET_MS ?? 180_000);

/**
 * Confidence at or above which the rules extractor is trusted on its own and no
 * model is called at all.
 *
 * 60 means the document yielded a closing date and a real title plus two or
 * three more fields — i.e. a conventionally-formatted notice, which most
 * official notices are. Those cost nothing and are not improved by a model.
 * Lower it to spend less quota, raise it to prefer model quality.
 */
const RULES_TRUST_MIN = Number(process.env.RULES_TRUST_MIN ?? 60);

/** Fill a model draft's gaps from the rules draft. Never overwrites. */
function mergeDrafts(primary: NoticeDraft, secondary: NoticeDraft): NoticeDraft {
  const out = { ...primary } as Record<string, unknown>;
  for (const [k, v] of Object.entries(secondary as Record<string, unknown>)) {
    const cur = out[k];
    const empty = cur === null || cur === undefined || cur === "" || (Array.isArray(cur) && cur.length === 0);
    const has = v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0);
    // minQualification defaults to "any", which is a value but not information.
    if ((empty || (k === "minQualification" && cur === "any")) && has) out[k] = v;
  }
  return out as NoticeDraft;
}

function sanitize(raw: Record<string, unknown>): NoticeDraft {
  const str = (v: unknown): string | null => {
    if (typeof v !== "string") return null;
    const t = v.trim();
    return !t || t.toLowerCase() === UNKNOWN || t.toLowerCase() === "null" ? null : t;
  };
  // Zero is a real fee (free) but never a real vacancy count or age. Models
  // return 0 for "not applicable" on exams that advertise no posts, and
  // "0 vacancies" on the board is a worse answer than saying nothing.
  const money = (v: unknown): number | null => {
    const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.]/g, ""));
    return Number.isFinite(n) && n >= 0 && n < 1_000_000 ? n : null;
  };
  const count = (v: unknown): number | null => {
    const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.]/g, ""));
    return Number.isFinite(n) && n > 0 && n < 10_000_000 ? n : null;
  };
  const age = (v: unknown): number | null => {
    const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.]/g, ""));
    return Number.isFinite(n) && n >= 14 && n <= 70 ? n : null;
  };
  const years = (v: unknown): number | null => {
    const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/[^\d.]/g, ""));
    return Number.isFinite(n) && n >= 0 && n <= 40 ? n : null;
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

/**
 * How much of the notice we actually got. Weighted by what a candidate needs to
 * act: without a closing date the entry is close to useless, so that alone is
 * worth a third of the score.
 */
export function scoreConfidence(d: NoticeDraft): number {
  let score = 0;
  if (d.applyLast) score += 32;
  if (d.title && d.title.length > 12) score += 14;
  if (d.organizationShortName) score += 14;
  if (d.totalVacancies != null) score += 10;
  if (d.minAge != null || d.maxAge != null) score += 8;
  if (d.feeGeneral != null) score += 6;
  if (d.advertisementNo) score += 6;
  if (d.applyStart) score += 5;
  if (d.summary) score += 5;
  return Math.min(100, score);
}

export async function autoExtract(input: ExtractInput): Promise<ExtractResult> {
  const text = input.text.replace(/\s+/g, " ").trim();
  const rules = (): ExtractResult => {
    const draft = extractFromText(text, input.linkText);
    return { draft, method: "rules", confidence: scoreConfidence(draft) };
  };

  // Send the PDF only when we genuinely cannot read it ourselves, and only when
  // it is small enough to be worth the tokens.
  let pdf = input.pdf ?? null;
  if (pdf && textIsUsable(text)) {
    pdf = null; // the text layer is fine — use it and keep the quota
  } else if (pdf && pdf.bytes.length > MAX_PDF_INLINE_BYTES) {
    console.log(`       pdf ${(pdf.bytes.length / 1024 / 1024).toFixed(1)}mb exceeds inline cap — using local text`);
    pdf = null;
  }
  const effective: ProviderInput = { ...input, text, pdf };

  // Not a notice at all: do not spend a call on it.
  if (!pdf && !looksLikeNotice(text, input.url)) {
    return { ...rules(), method: "rules-skipped" };
  }

  // Rules first. Official notices label their fields, so most of them are fully
  // readable without a model — and a call not made is quota kept for the ones
  // that genuinely need it.
  const rulesResult = rules();
  if (!pdf && rulesResult.confidence >= RULES_TRUST_MIN && rulesResult.draft.applyLast && rulesResult.draft.title) {
    return { ...rulesResult, method: "rules-confident" };
  }

  const chain = providerChain();
  const usable = chain.filter((p) => !exhausted.has(p.name) && !unreachable.has(p.name));
  if (chain.length > 0 && usable.length === 0) {
    console.warn(`  every extraction provider is out of quota (${chain.map((p) => p.name).join(", ")}). falling back to rules`);
    return { ...rulesResult, method: "rules-fallback-quota" };
  }
  // No model configured at all — the regex rules are the whole pipeline, and
  // that is a deliberate local-only mode rather than a failure.
  if (chain.length === 0) return rules();

  // Nothing to read and no PDF: not worth a model call.
  if (!pdf && text.length < 50) return rules();

  const attempts: string[] = [];
  let sawPermanentFailure = false;
  const startedAt = Date.now();
  const outOfTime = () => Date.now() - startedAt > TOTAL_BUDGET_MS;

  for (const provider of usable) {
    if (outOfTime()) {
      attempts.push(`${provider.name}: skipped (budget exhausted)`);
      continue;
    }
    // A provider that cannot read PDFs is useless when local text extraction
    // already failed — skip rather than feed it an empty string.
    if (pdf && !provider.readsPdf && text.length < 200) {
      attempts.push(`${provider.name}: skipped (cannot read PDF)`);
      continue;
    }

    for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
      try {
        process.stdout.write(`       ${provider.name}${attempt ? ` (retry ${attempt})` : ""}… `);
        const raw = await provider.call(effective);
        console.log("ok");
        // The model leads, but anything it left null that the rules did find is
        // kept — two cheap readings of the same document beat one.
        const draft = mergeDrafts(sanitize(raw), rulesResult.draft);
        const method = `ai-${provider.name}${pdf && provider.readsPdf ? "-pdf" : ""}`;
        return { draft, method, confidence: scoreConfidence(draft) };
      } catch (err) {
        const msg = err instanceof Error ? err.message.slice(0, 120) : String(err);
        if (isQuotaExhausted(err)) {
          console.log("out of quota");
          exhausted.add(provider.name);
          attempts.push(`${provider.name}: quota exhausted`);
          break; // no amount of waiting brings a spent allowance back
        }
        if (isUnreachable(err)) {
          console.log("not running");
          unreachable.add(provider.name);
          attempts.push(`${provider.name}: not reachable (is it running?)`);
          break; // nothing is listening; it will not start mid-run
        }
        console.log(isTransient(err) ? "busy" : "failed");
        if (!isTransient(err)) {
          attempts.push(`${provider.name}: ${msg}`);
          sawPermanentFailure = true;
          break; // a malformed request will not improve on retry
        }
        if (attempt === BACKOFF_MS.length || outOfTime()) {
          attempts.push(`${provider.name}: overloaded after ${attempt + 1} tr${attempt ? "ies" : "y"}`);
          break;
        }
        await sleep(BACKOFF_MS[attempt]);
      }
    }
  }

  // Every provider was busy: the document is probably fine, we just could not
  // read it right now. Tell the caller to try again rather than writing rules
  // output over a real notice.
  if (chain.length > 0 && chain.every((p) => exhausted.has(p.name))) {
    console.warn(`  every extraction provider is out of quota (${chain.map((p) => p.name).join(", ")}). falling back to rules`);
    return { ...rulesResult, method: "rules-fallback-quota" };
  }
  if (!sawPermanentFailure) {
    console.warn(`  all providers unavailable (${attempts.join("; ")}) — falling back to rules`);
    return { ...rulesResult, method: "rules-fallback-unavailable" };
  }

  console.warn(`  all providers failed (${attempts.join("; ")}) — falling back to rules`);
  return { ...rulesResult, method: "rules-fallback-failed" };
}

/** Model calls made so far this process, for end-of-run summaries. */
export function usageSummary(): string {
  if (usage.calls === 0) return "no model calls";
  const parts = Object.entries(usage.byProvider).map(([k, v]) => `${k} ${v}`);
  return `${usage.calls} model call(s): ${parts.join(", ")}`;
}
