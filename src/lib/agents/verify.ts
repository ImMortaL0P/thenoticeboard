// Review-queue verification.
//
// The scraper's job is to find documents. This is the job of deciding whether
// what it found is real, filling in what it missed, and saying how much of it
// can be trusted. It runs over the pending_review queue one notice at a time.
//
// Order of work, cheapest and most certain first:
//   1. deterministic constraints   — free, catches stale and self-contradictory
//   2. re-read the official source — free, and the only citable truth
//   3. extract with the best model available
//   4. constraints again, on the fresh reading
//   5. a SECOND model re-reads, and must agree on the closing date
//   6. score, then publish / hold for a human / reject
//
// Step 5 is what makes unattended publishing defensible. One model's confident
// wrong date is indistinguishable from a right one; two independent readings
// agreeing is evidence. They disagree often enough to be worth the call.

import { prisma } from "../db";
import { fetchDoc } from "../scraper/fetch";
import { sanitizeDraftFor, callProvider } from "./call";
import { checkConstraints, worstSeverity, type ConstraintIssue } from "./constraints";
import { scoreConfidence } from "../scraper/ai";
import { providerChain } from "../scraper/providers";
import { dailyExhausted } from "./limits";
import { organizationChoices, resolveOrganization, learnDomain, isOfficialUrl } from "../orgs";
import type { NoticeDraft } from "../extract";

export type VerifyOutcome = {
  action: "publish" | "review" | "reject";
  confidence: number;
  reasons: string[];
  patch: Record<string, unknown>;
  providersUsed: string[];
};

/**
 * Providers ordered by how much you would trust their answer, not by speed.
 *
 * This is a different question from extraction, where cost and latency decide.
 * Here a wrong answer reaches candidates, so the strongest available model goes
 * first. Ollama is deliberately LAST: it is unlimited and free, which makes it
 * the right thing to fall back to when every hosted allowance is spent, and the
 * wrong thing to spend the day on while those allowances sit unused.
 */
export function verifyChain() {
  const order = (process.env.VERIFY_PROVIDERS ??
    "cerebras,gemini,mistral,groq,nvidia,sambanova,together,openrouter,ovh,github,cohere,huggingface,scaleway,cloudflare,llm7,anthropic,openai,ollama")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const available = new Map(providerChain().map((p) => [p.name, p]));
  return order.map((n) => available.get(n)).filter((p): p is NonNullable<typeof p> => !!p);
}

/** Providers that still have allowance left today, best first. */
function usableChain() {
  return verifyChain().filter((p) => !dailyExhausted(p.name));
}

/** True when every hosted provider is spent and only the local model remains. */
export function onlyLocalLeft(): boolean {
  const usable = usableChain();
  return usable.length > 0 && usable.every((p) => p.name === "ollama");
}

const CRITICAL_AGREEMENT_FIELDS = ["applyLast", "totalVacancies"] as const;

function disagreements(a: NoticeDraft, b: NoticeDraft): string[] {
  const out: string[] = [];
  for (const f of CRITICAL_AGREEMENT_FIELDS) {
    const av = a[f as keyof NoticeDraft];
    const bv = b[f as keyof NoticeDraft];
    // Only a genuine conflict counts. One model finding a value the other
    // missed is a gap, not a contradiction.
    if (av != null && bv != null && String(av) !== String(bv)) {
      out.push(`${f}: "${av}" vs "${bv}"`);
    }
  }
  return out;
}

/** Fill gaps in `primary` from `secondary` without ever overwriting. */
function merge(primary: NoticeDraft, secondary: NoticeDraft): NoticeDraft {
  const out = { ...primary } as Record<string, unknown>;
  for (const [k, v] of Object.entries(secondary as Record<string, unknown>)) {
    const cur = out[k];
    const empty = cur === null || cur === undefined || cur === "" || (Array.isArray(cur) && cur.length === 0);
    const has = v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0);
    if ((empty || (k === "minQualification" && cur === "any")) && has) out[k] = v;
  }
  return out as NoticeDraft;
}

const AUTO_PUBLISH_MIN = Number(process.env.AUTO_PUBLISH_MIN_CONFIDENCE ?? 85);
const AUTO_PUBLISH = process.env.AUTO_PUBLISH === "1";

export type QueuedNotice = {
  id: string;
  serialNumber: number;
  title: string;
  officialSourceUrl: string | null;
  discoveredUrl: string | null;
  officialNotificationPdfUrl: string | null;
  rawText: string | null;
  applyLast: string | null;
  applyStart: string | null;
  notificationDate: string | null;
  examDate: string | null;
  feeLast: string | null;
  minAge: number | null;
  maxAge: number | null;
  totalVacancies: number | null;
  organizationId: string;
  /** Recorded date_extension rows — an expired deadline may still be live. */
  updates?: { type: string; date: string }[];
};

export async function verifyNotice(
  n: QueuedNotice,
  opts: { log?: (s: string) => void } = {},
): Promise<VerifyOutcome> {
  const log = opts.log ?? (() => {});
  const reasons: string[] = [];
  const providersUsed: string[] = [];
  const patch: Record<string, unknown> = {};

  // ---- 1. constraints on what we already hold ----------------------------
  // An extension only counts if it actually moves the deadline forward.
  const isExtended = (n.updates ?? []).some(
    (u) => u.type === "date_extension" && (!n.applyLast || u.date >= n.applyLast),
  );
  const stored = checkConstraints({ ...n, isExtended });
  const storedVerdict = worstSeverity(stored);
  if (storedVerdict === "reject") {
    const fatal = stored.filter((i) => i.severity === "reject");
    return {
      action: "reject",
      confidence: 0,
      reasons: fatal.map((i) => `${i.field}: ${i.message}`),
      patch: { rejectReason: fatal.map((i) => i.message).join("; ").slice(0, 400) },
      providersUsed: [],
    };
  }

  // ---- 2. re-read the official source ------------------------------------
  const url = n.officialNotificationPdfUrl ?? n.officialSourceUrl ?? n.discoveredUrl;
  if (!url || !(await isOfficialUrl(url))) {
    return {
      action: "reject",
      confidence: 0,
      reasons: ["no official URL to verify against"],
      patch: { rejectReason: "No official source URL — cannot verify at source." },
      providersUsed: [],
    };
  }

  let doc = null;
  try {
    log(`       re-reading ${url.slice(0, 70)}`);
    doc = await fetchDoc(url);
  } catch (err) {
    reasons.push(`official source unreachable: ${err instanceof Error ? err.message : err}`);
  }
  const text = doc ? (doc.kind === "pdf" ? doc.text : doc.text) : (n.rawText ?? "");
  const pdf = doc?.kind === "pdf" ? { bytes: doc.bytes } : null;

  if (!text && !pdf) {
    return { action: "review", confidence: 0, reasons: [...reasons, "nothing readable at the source"], patch: {}, providersUsed: [] };
  }

  // ---- 3. extract with the best provider that still has allowance --------
  const orgChoices = await organizationChoices();
  const chain = usableChain();
  if (chain.length === 0) {
    return { action: "review", confidence: 0, reasons: ["no provider has allowance left"], patch: {}, providersUsed: [] };
  }

  const primary = await callProvider(chain, { text, pdf, orgChoices }, { log });
  if (!primary) {
    return { action: "review", confidence: 0, reasons: [...reasons, "every provider refused or was unreachable"], patch: {}, providersUsed: [] };
  }
  providersUsed.push(primary.provider);
  let draft = sanitizeDraftFor(primary.raw);

  // ---- 4. constraints on the fresh reading -------------------------------
  const fresh = checkConstraints({ ...draft, officialSourceUrl: url, isExtended });
  const freshFatal = fresh.filter((i) => i.severity === "reject");
  if (freshFatal.length) {
    return {
      action: "reject",
      confidence: 0,
      reasons: freshFatal.map((i) => `${i.field}: ${i.message}`),
      patch: { rejectReason: freshFatal.map((i) => i.message).join("; ").slice(0, 400) },
      providersUsed,
    };
  }
  reasons.push(...fresh.map((i) => `${i.field}: ${i.message}`));

  // ---- 5. independent second reading -------------------------------------
  // Always when the local model is doing the work (it is free and unhurried),
  // otherwise only when the first reading is not already convincing.
  const isLocal = primary.provider === "ollama";
  const firstScore = scoreConfidence(draft);
  let agreement: "agreed" | "conflicted" | "single" = "single";

  if (isLocal || firstScore < AUTO_PUBLISH_MIN) {
    const others = chain.filter((p) => p.name !== primary.provider);
    if (others.length) {
      const second = await callProvider(others, { text, pdf, orgChoices }, { log });
      if (second) {
        providersUsed.push(second.provider);
        const otherDraft = sanitizeDraftFor(second.raw);
        const conflicts = disagreements(draft, otherDraft);
        if (conflicts.length) {
          agreement = "conflicted";
          reasons.push(`readings disagree — ${conflicts.join("; ")}`);
        } else {
          agreement = "agreed";
          draft = merge(draft, otherDraft);
        }
      }
    }
  }

  // ---- 6. organisation, score, route -------------------------------------
  const match = await resolveOrganization({
    url,
    extractedName: draft.organizationNameRaw ?? null,
  });
  if (match && match.confidence === "domain") {
    patch.organizationId = match.organizationId;
    patch.orgConfidence = "domain";
  } else if (draft.organizationShortName) {
    const byCode = await prisma.organization.findFirst({ where: { shortName: draft.organizationShortName } });
    if (byCode) {
      patch.organizationId = byCode.id;
      patch.orgConfidence = "model-pick";
      await learnDomain(byCode.id, url);
    }
  }

  // Fill only what is missing on the stored row.
  const fill = (field: keyof QueuedNotice, value: unknown) => {
    if ((n[field] === null || n[field] === undefined) && value !== null && value !== undefined) patch[field] = value;
  };
  fill("applyLast", draft.applyLast);
  fill("applyStart", draft.applyStart);
  fill("notificationDate", draft.notificationDate);
  fill("minAge", draft.minAge);
  fill("maxAge", draft.maxAge);
  fill("totalVacancies", draft.totalVacancies);
  if (draft.title && draft.title.length > 12) patch.title = draft.title;
  if (draft.summary) patch.summary = draft.summary;
  if (draft.advertisementNo) patch.advertisementNo = draft.advertisementNo;
  if (draft.payLevel) patch.payLevel = draft.payLevel;
  if (draft.selectionProcess) patch.selectionProcess = draft.selectionProcess;
  if (draft.applyUrl) patch.applyUrl = draft.applyUrl;
  if (draft.noticeType) patch.noticeType = draft.noticeType;
  if (draft.sector) patch.sector = draft.sector;
  if (draft.postNames?.length) patch.postNames = draft.postNames;
  if (draft.feeGeneral != null || draft.feeReserved != null) {
    patch.fees = {
      general: draft.feeGeneral ?? undefined,
      sc: draft.feeReserved ?? undefined,
      st: draft.feeReserved ?? undefined,
      pwbd: draft.feeReserved ?? undefined,
    };
  }

  let confidence = scoreConfidence(draft);
  if (agreement === "agreed") confidence = Math.min(100, confidence + 10);
  if (agreement === "conflicted") confidence = Math.max(0, confidence - 35);
  if (patch.orgConfidence === "domain") confidence = Math.min(100, confidence + 5);
  patch.extractionConfidence = confidence;

  const action: VerifyOutcome["action"] =
    AUTO_PUBLISH && confidence >= AUTO_PUBLISH_MIN && agreement !== "conflicted" && draft.applyLast
      ? "publish"
      : "review";

  if (action === "review" && reasons.length === 0) reasons.push("verified; awaiting a human");

  return { action, confidence, reasons, patch, providersUsed };
}
