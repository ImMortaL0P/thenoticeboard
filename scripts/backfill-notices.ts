/**
 * Re-verify existing notices against their official source and fill in gaps.
 *
 *   npx tsx scripts/backfill-notices.ts                 # dry run, all live notices
 *   npx tsx scripts/backfill-notices.ts --limit 10      # try a handful first
 *   npx tsx scripts/backfill-notices.ts --apply
 *   npx tsx scripts/backfill-notices.ts --apply --dates # also fill missing closing dates
 *
 * Why this recovers data the original import missed: it re-fetches through the
 * new pipeline, so a notice whose source is a scanned PDF now goes to Gemini as
 * bytes instead of being discarded by pdf-parse, and categories come back as
 * schema-constrained enums rather than free text.
 *
 * Safety rules, in order of importance:
 *   - Only EMPTY fields are filled. An existing value is never overwritten,
 *     because a human may have set it and the model may be wrong.
 *   - `applyLast` is excluded by default. It is the one field the whole board
 *     turns on, so machine-filling it silently is the worst thing this script
 *     could do. Pass --dates to opt in; those notices are sent back to
 *     pending_review rather than published straight to the board.
 *   - Every change is stamped into extractionNotes so it can be audited later.
 */

import "dotenv/config";
import { prisma } from "../src/lib/db";
import { fetchDoc } from "../src/lib/scraper/fetch";
import { autoExtract, ExtractionUnavailable, AllProvidersExhausted, usageSummary } from "../src/lib/scraper/ai";
import { organizationChoices } from "../src/lib/orgs";

const APPLY = process.argv.includes("--apply");
/**
 * The regex fallback exists so a NEW scraped item is not empty. It is far too
 * noisy to edit already-reviewed notices with: on the first sample it produced
 * payLevel "673-49" and read an exam date as a notification date. So by default
 * only a real model extraction may fill anything here.
 */
const ALLOW_RULES = process.argv.includes("--allow-rules");
const FILL_DATES = process.argv.includes("--dates");
const LIMIT = (() => {
  const i = process.argv.indexOf("--limit");
  return i >= 0 ? Number(process.argv[i + 1]) || 0 : 0;
})();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Titles taken from a PDF's anchor text rather than the document itself —
 * "English (671 KB)", "Download", "Click here", "Advertisement". These are the
 * one exception to never-overwrite: the existing value is not information, and
 * a candidate scanning the board cannot tell what the notice is.
 */
const JUNK_TITLE =
  /^(?:english|hindi|\u0939\u093f\u0928\u094d\u0926\u0940|download|click here|view|pdf|notice|notification|advertisement|detailed advertisement|read more|apply online)?\s*(?:\(\s*[\d.]+\s*[kmg]b\s*\))?\s*$/i;

function isJunkTitle(title: string): boolean {
  const t = title.trim();
  if (t.length < 12) return true;
  return JUNK_TITLE.test(t);
}

function isEmptyFees(fees: unknown): boolean {
  if (!fees || typeof fees !== "object") return true;
  return Object.values(fees as Record<string, unknown>).every((v) => v === undefined || v === null);
}

async function main() {
  console.log(APPLY ? ">>> APPLY MODE\n" : ">>> DRY RUN — nothing will be written\n");
  if (!process.env.GEMINI_API_KEY) console.log("!! GEMINI_API_KEY not set — extraction falls back to regex rules.\n");

  const all = await prisma.notification.findMany({
    where: { status: { in: ["published", "closed"] } },
    include: { organization: true },
    orderBy: { applyLast: "asc" },
  });

  // Only bother with notices that are actually missing something re-fetchable.
  const candidates = all.filter((n) => {
    const missing =
      (FILL_DATES && !n.applyLast) ||
      !n.advertisementNo ||
      n.totalVacancies == null ||
      (n.minAge == null && n.maxAge == null) ||
      isEmptyFees(n.fees) ||
      !n.officialNotificationPdfUrl ||
      !n.applyStart ||
      !n.notificationDate ||
      isJunkTitle(n.title);
    return missing && (n.officialSourceUrl || n.discoveredUrl || n.rawText);
  });

  const work = LIMIT > 0 ? candidates.slice(0, LIMIT) : candidates;
  console.log(`${all.length} live notices · ${candidates.length} with fillable gaps · processing ${work.length}\n`);

  const orgChoices = await organizationChoices();
  let touched = 0;
  let flagged = 0;
  let skippedUntrusted = 0;
  let providersBusy = 0;
  const failures: string[] = [];

  for (const n of work) {
    const url = n.officialSourceUrl ?? n.discoveredUrl;
    const label = `NB-${n.serialNumber} ${n.title.slice(0, 58)}`;

    console.log(`  →  ${label}`);
    let doc = null;
    if (url) {
      process.stdout.write(`       fetching ${(url ?? "").slice(0, 60)}… `);
      try {
        doc = await fetchDoc(url);
        console.log(doc.kind === "pdf" ? `pdf ${(doc.bytes.length / 1024).toFixed(0)}kb` : "html");
      } catch (err) {
        console.log("failed");
        failures.push(`${label} — fetch failed: ${err instanceof Error ? err.message : err}`);
      }
    }
    if (!doc && !n.rawText) {
      failures.push(`${label} — no source to re-read`);
      continue;
    }

    let draft, method: string, confidence: number;
    try {
      ({ draft, method, confidence } = await autoExtract({
        text: doc?.kind === "pdf" ? doc.text : (doc?.text ?? n.rawText ?? ""),
        pdf: doc?.kind === "pdf" ? { bytes: doc.bytes } : null,
        linkText: n.title,
        orgChoices,
      }));
    } catch (err) {
      if (err instanceof AllProvidersExhausted) {
        console.log(`\n!! ${err.message}\n   Stopping — nothing further can be extracted right now.\n`);
        break;
      }
      if (err instanceof ExtractionUnavailable) {
        providersBusy++;
        console.log(`       ${err.message}`);
        await sleep(2_000);
        continue;
      }
      throw err;
    }

    // Fill empties only.
    const patch: Record<string, unknown> = {};
    const filled: string[] = [];
    let needsReviewTitle = false;
    const put = (field: string, current: unknown, next: unknown) => {
      const isEmpty = current === null || current === undefined || current === "";
      if (isEmpty && next !== null && next !== undefined && next !== "") {
        patch[field] = next;
        filled.push(`${field}=${String(next).slice(0, 34)}`);
      }
    };

    if (isJunkTitle(n.title) && draft.title && draft.title.length > 12 && !isJunkTitle(draft.title)) {
      patch.title = draft.title;
      filled.push(`title="${draft.title.slice(0, 40)}"`);
      needsReviewTitle = true;
    }
    put("advertisementNo", n.advertisementNo, draft.advertisementNo);
    put("totalVacancies", n.totalVacancies, draft.totalVacancies);
    put("minAge", n.minAge, draft.minAge);
    put("maxAge", n.maxAge, draft.maxAge);
    put("applyStart", n.applyStart, draft.applyStart);
    put("notificationDate", n.notificationDate, draft.notificationDate);
    put("payLevel", n.payLevel, draft.payLevel);
    put("selectionProcess", n.selectionProcess, draft.selectionProcess);
    put("summary", n.summary, draft.summary);
    put("applyUrl", n.applyUrl, draft.applyUrl);
    put(
      "officialNotificationPdfUrl",
      n.officialNotificationPdfUrl,
      draft.officialNotificationPdfUrl ?? (doc?.kind === "pdf" ? doc.url : null),
    );
    if (Array.isArray(n.postNames) && n.postNames.length === 0 && draft.postNames?.length) {
      patch.postNames = draft.postNames;
      filled.push(`postNames×${draft.postNames.length}`);
    }
    if (isEmptyFees(n.fees) && (draft.feeGeneral != null || draft.feeReserved != null)) {
      patch.fees = {
        general: draft.feeGeneral ?? undefined,
        sc: draft.feeReserved ?? undefined,
        st: draft.feeReserved ?? undefined,
        pwbd: draft.feeReserved ?? undefined,
      };
      filled.push("fees");
    }

    // The deadline: opt-in, and it goes back through review.
    let needsReview = needsReviewTitle;
    if (FILL_DATES && !n.applyLast && draft.applyLast) {
      patch.applyLast = draft.applyLast;
      filled.push(`applyLast=${draft.applyLast}`);
      needsReview = true;
    }

    const trusted = method.startsWith("ai-") || ALLOW_RULES;
    if (filled.length > 0 && !trusted) {
      console.log(`       skipped — only the regex fallback ran (${method}). Would have set: ${filled.join("  ")}`);
      skippedUntrusted++;
      await sleep(400);
      continue;
    }

    if (filled.length === 0) {
      console.log(`       nothing new (${method}, confidence ${confidence})`);
      await sleep(400);
      continue;
    }

    touched++;
    if (needsReview) flagged++;
    console.log(`       ${needsReview ? "!" : "+"} ${filled.join("  ")}`);
    console.log(`       via ${method}, confidence ${confidence}${needsReview ? "  → back to pending_review" : ""}`);

    if (APPLY) {
      patch.extractionConfidence = confidence;
      patch.extractionNotes =
        `Backfilled ${new Date().toISOString().slice(0, 10)} via ${method}: ${filled.join(", ")}`.slice(0, 900);
      if (needsReview) patch.status = "pending_review";
      await prisma.notification.update({ where: { id: n.id }, data: patch });
    }
    await sleep(400); // stay well inside Gemini's rate limit
  }

  console.log(`\n${"=".repeat(72)}`);
  console.log(`  ${usageSummary()}`);
  console.log(`  ${touched} notice(s) ${APPLY ? "updated" : "would be updated"}${flagged ? `, ${flagged} sent back to review` : ""}`);
  if (providersBusy) {
    console.log(`  ${providersBusy} left untouched — every extraction provider was busy. Re-run later.`);
  }
  if (skippedUntrusted) {
    console.log(`  ${skippedUntrusted} skipped because only the regex fallback ran — usually Gemini`);
    console.log(`     rate-limiting. Re-run later, or pass --allow-rules to accept them.`);
  }
  if (failures.length) {
    console.log(`\n  ${failures.length} could not be re-read:`);
    for (const f of failures.slice(0, 20)) console.log(`     ${f}`);
  }
  if (!FILL_DATES) {
    const noDate = all.filter((n) => !n.applyLast).length;
    if (noDate) console.log(`\n  ${noDate} notice(s) still have no closing date. Re-run with --dates to fill them (they go back to review).`);
  }
  if (!APPLY) console.log("\n  Dry run. Re-run with --apply.\n");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
