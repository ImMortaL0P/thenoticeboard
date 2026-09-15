// One full scrape of a single source: fetch index (+ pagination) -> discover
// links -> fetch each new document -> extract -> save as pending_review.
//
// Nothing is ever auto-published here. Items carry an org-resolution confidence
// and an extraction confidence so the review queue can be ordered by how much
// human attention each one actually needs.

import * as cheerio from "cheerio";
import { prisma } from "../db";
import type { Prisma, Source } from "@prisma/client";
import { fetchDoc, fetchHtml, type FetchedDoc } from "./fetch";
import { allLinks, discoverLinks, discoverFromFeed, discoverPaginationUrls, looksLikeFeed, type DiscoveredItem } from "./discover";
import { autoExtract, scoreConfidence, ExtractionUnavailable, AllProvidersExhausted } from "./ai";
import { getNextNotificationSerialNumber } from "../serial";
import { organizationChoices, resolveOrganization, unassignedOrg, learnDomain, isOfficialUrl } from "../orgs";

export type SourceWithOrg = Prisma.SourceGetPayload<{ include: { organization: true } }>;
export type RunResult = {
  sourceId: string;
  status: "ok" | "error";
  linksFound: number;
  newItems: number;
  extendedItems: number;
  message: string;
};

const MAX_NEW = Math.max(1, Number(process.env.SCRAPE_MAX_NEW_PER_SOURCE ?? 25));
/** Aggregator listing pages opened per run to find the official link behind them. */
const MAX_AGGREGATOR_HOPS = Math.max(1, Number(process.env.SCRAPE_MAX_AGGREGATOR_HOPS ?? 15));
const MAX_RAW = 40 * 1024;

function hostOfUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 40);
  }
}

function looksHtml(text: string): boolean {
  return /^\s*<!doctype html/i.test(text) || /<html[\s>]/i.test(text);
}

function htmlToText(raw: string): string {
  return cheerio.load(raw).text().replace(/\s+/g, " ").trim();
}

/**
 * Only applied to HTML now. PDFs are never rejected on text quality: a scanned
 * PDF whose local text extraction is unusable is precisely the document we send
 * to the model as bytes, and those used to be the ones we silently threw away.
 */
function readableHtmlText(raw: string): boolean {
  const t = raw.trim();
  if (t.length < 40) return false;
  const caretDensity = (t.match(/\^/g) ?? []).length / t.length;
  return caretDensity <= 0.002;
}

async function processDiscoveredLink(
  source: SourceWithOrg,
  link: DiscoveredItem,
  doc: FetchedDoc,
  orgChoices: { shortName: string; name: string }[],
): Promise<"new" | "extended" | "already_handled"> {
  // Belt and braces: the aggregator hop should already have filtered these out,
  // but nothing unverifiable gets written even if a future caller forgets.
  if (source.trust === "aggregator" && !(await isOfficialUrl(link.url))) {
    return "already_handled";
  }

  const existing = await prisma.notification.findFirst({
    where: { OR: [{ discoveredUrl: link.url }, { officialSourceUrl: link.url }] },
    include: { updates: true },
  });

  let rawText = doc.kind === "pdf" ? doc.text : htmlToText(doc.text);
  let effectivePdfBytes = doc.kind === "pdf" ? doc.bytes : null;
  let hasEmbeddedPdf = false;
  let officialSourceUrl = link.url;

  // If we fetched an HTML page but it's just a viewer/wrapper for a PDF, fetch the PDF.
  if (doc.kind === "html") {
    const $ = cheerio.load(doc.text);
    let pdfUrl = null;
    
    // 1. Look for iframes pointing to PDFs (like SEBI)
    $("iframe").each((_, el) => {
      const src = $(el).attr("src");
      if (src && /\.pdf($|\?)/i.test(src)) {
        pdfUrl = src;
      }
    });

    // 2. If no iframe, check if there's exactly one prominent PDF link on a thin page.
    if (!pdfUrl && rawText.length < 3000) {
      const pdfLinks: string[] = [];
      $("a").each((_, el) => {
        const href = $(el).attr("href");
        if (href && /\.pdf($|\?)/i.test(href)) {
          pdfLinks.push(href);
        }
      });
      // Try to take the only PDF if it's unambiguous
      if (pdfLinks.length === 1) pdfUrl = pdfLinks[0];
    }

    if (pdfUrl) {
      try {
        const fullPdfUrl = new URL(pdfUrl, link.url).href;
        console.log(`       chasing embedded pdf: ${fullPdfUrl}`);
        const subDoc = await fetchDoc(fullPdfUrl);
        if (subDoc.kind === "pdf") {
          rawText = rawText + "\n\n[Extracted from embedded PDF:]\n" + subDoc.text;
          effectivePdfBytes = subDoc.bytes;
          hasEmbeddedPdf = true;
          officialSourceUrl = fullPdfUrl; // Treat the PDF as the official source
        }
      } catch (err) {
        console.warn(`       failed to fetch embedded pdf ${pdfUrl}: ${err}`);
      }
    }
  }

  const { draft, method, confidence } = await autoExtract({
    text: rawText,
    pdf: effectivePdfBytes ? { bytes: effectivePdfBytes } : null,
    linkText: link.text,
    orgChoices,
  });

  if (existing) {
    if (draft.applyLast && existing.applyLast && draft.applyLast > existing.applyLast) {
      const hasUpdate = existing.updates.some((u) => u.type === "date_extension" && u.date === draft.applyLast);
      if (!hasUpdate) {
        await prisma.notificationUpdate.create({
          data: {
            notificationId: existing.id,
            type: "date_extension",
            title: `Date extended to ${draft.applyLast}`,
            date: draft.applyLast,
            link: link.url,
          },
        });
        await prisma.notification.update({
          where: { id: existing.id },
          data: {
            applyLast: draft.applyLast,
            status: "pending_review",
            extractionNotes: `Date extension detected: ${existing.applyLast} -> ${draft.applyLast}.`,
          },
        });
        return "extended";
      }
    }
    return "already_handled";
  }

  // ---- organisation resolution ------------------------------------------
  // Domain first (deterministic), then the code the model picked from our own
  // list, then aliases. If nothing resolves the item is parked, not guessed.
  let organizationId: string;
  let orgConfidence: string;

  const byCode = draft.organizationShortName
    ? await prisma.organization.findFirst({ where: { shortName: draft.organizationShortName } })
    : null;

  const match = await resolveOrganization({
    sourceOrganizationId: source.organizationId,
    url: link.url,
    extractedName: draft.organizationNameRaw ?? link.text,
  });

  if (match && match.confidence === "domain") {
    organizationId = match.organizationId;
    orgConfidence = "domain";
  } else if (byCode) {
    organizationId = byCode.id;
    orgConfidence = "model-pick";
    await learnDomain(byCode.id, link.url);
  } else if (match) {
    organizationId = match.organizationId;
    orgConfidence = match.confidence;
  } else {
    organizationId = (await unassignedOrg()).id;
    orgConfidence = "unresolved";
  }

  // Final gate. A notice that reached us through an aggregator is only written
  // once its own URL is on an official domain — the aggregator told us it
  // exists, the official site is what we actually read and cite.
  if (!(await isOfficialUrl(link.url)) && source.trust === "aggregator") {
    throw new Error(`refusing to store unverifiable aggregator item: ${link.url}`);
  }

  const data: Prisma.NotificationUncheckedCreateInput = {
    serialNumber: await getNextNotificationSerialNumber(),
    organizationId,
    title: draft.title ?? link.text ?? `${source.name} notice`,
    summary: draft.summary ?? undefined,
    postNames: draft.postNames ?? [],
    status: "pending_review",
    noticeType: draft.noticeType ?? "recruitment",
    sector: draft.sector ?? source.sector,
    minQualification: draft.minQualification,
    minAge: draft.minAge ?? undefined,
    maxAge: draft.maxAge ?? undefined,
    totalVacancies: draft.totalVacancies ?? undefined,
    payLevel: draft.payLevel ?? undefined,
    experienceRequiredYears: draft.experienceRequiredYears ?? undefined,
    selectionProcess: draft.selectionProcess ?? undefined,
    fees: {
      general: draft.feeGeneral ?? undefined,
      sc: draft.feeReserved ?? undefined,
      st: draft.feeReserved ?? undefined,
      pwbd: draft.feeReserved ?? undefined,
    },
    applyStart: draft.applyStart ?? undefined,
    applyLast: draft.applyLast ?? undefined,
    notificationDate: draft.notificationDate ?? undefined,
    advertisementNo: draft.advertisementNo ?? undefined,
    applyUrl: draft.applyUrl ?? undefined,
    officialNotificationPdfUrl:
      draft.officialNotificationPdfUrl ?? ((doc.kind === "pdf" || hasEmbeddedPdf) ? officialSourceUrl : undefined),
    // These two fields finally mean what they say: the official document we
    // read and cite, and the page that led us to it.
    officialSourceUrl: officialSourceUrl,
    discoveredUrl: link.discoveredVia ?? link.url,
    rawText: rawText.slice(0, MAX_RAW),
    origin: "scraper",
    sourceId: source.id,
    extractionMethod: method,
    orgConfidence,
    extractionConfidence: confidence,
    extractionNotes:
      [
        link.discoveredVia
          ? `Discovered via aggregator (${hostOfUrl(link.discoveredVia)}); verified and extracted from the official source.`
          : null,
        orgConfidence === "unresolved"
          ? `Organisation not recognised. Document says: "${draft.organizationNameRaw ?? link.text ?? "?"}". Assign it once and the alias is remembered.`
          : null,
      ]
        .filter(Boolean)
        .join(" ") || undefined,
  };

  await prisma.notification.create({ data });
  return "new";
}

/**
 * Follow an aggregator's listing pages to the official notification behind them.
 *
 * An aggregator entry is a signpost, not a notice. We open each listing page,
 * take the links that point at a government or verified-body domain, and hand
 * those on to the normal pipeline. Anything that never reaches an official
 * domain is dropped — a notice we cannot verify at the source is not a notice
 * this board can carry, however plausible the aggregator's summary looked.
 */
async function resolveViaAggregator(items: DiscoveredItem[]): Promise<DiscoveredItem[]> {
  const out = new Map<string, DiscoveredItem>();
  let hops = 0;

  for (const item of items) {
    if (hops >= MAX_AGGREGATOR_HOPS) break;

    // Occasionally an aggregator links straight to the official PDF.
    if (await isOfficialUrl(item.url)) {
      out.set(item.url, item);
      continue;
    }

    hops++;
    let html: string;
    try {
      html = await fetchHtml(item.url);
    } catch {
      continue;
    }
    for (const link of allLinks(html, item.url)) {
      if (out.has(link.url)) continue;
      if (!(await isOfficialUrl(link.url))) continue;
      // Skip the body's home page; we want the notification, not the portal.
      try {
        const u = new URL(link.url);
        if (u.pathname === "/" || u.pathname === "") continue;
      } catch {
        continue;
      }
      out.set(link.url, { url: link.url, text: link.text ?? item.text, via: "keyword", discoveredVia: item.url });
    }
  }

  return [...out.values()];
}

/**
 * Fetch, extract and store a batch of already-discovered links for a source.
 * Shared by the per-source crawler and the Gemini discovery sweep, so both
 * paths go through exactly the same verification and review gating.
 */
export async function ingestLinks(
  source: SourceWithOrg,
  links: DiscoveredItem[],
): Promise<{ newItems: number; extendedItems: number; skipped: number; deferred: number }> {
  const orgChoices = await organizationChoices();
  let newItems = 0;
  let extendedItems = 0;
  let skipped = 0;
  let deferred = 0;

  // Marking a URL as seen is what stops it being looked at again, so it happens
  // only once the link has reached a settled state. Previously it was recorded
  // before the fetch, which meant a notice that arrived while the extraction
  // provider was overloaded was lost permanently.
  const markSeen = async () => {
    try {
      await prisma.discoveredLink.create({ data: { sourceId: source.id, url: link.url, text: link.text } });
    } catch {
      /* already recorded */
    }
  };
  let link!: DiscoveredItem;

  for (link of links) {
    const already = await prisma.discoveredLink.findFirst({ where: { url: link.url }, select: { id: true } });
    if (already) continue;

    let doc: FetchedDoc;
    try {
      doc = await fetchDoc(link.url);
    } catch {
      // Dead or unreachable links are overwhelmingly permanent; record them so
      // the crawler does not retry the same 404 on every tick.
      skipped++;
      await markSeen();
      continue;
    }
    if (doc.kind === "html") {
      const text = looksHtml(doc.text) ? htmlToText(doc.text) : doc.text;
      if (!readableHtmlText(text)) { skipped++; await markSeen(); continue; }
    }

    try {
      const action = await processDiscoveredLink(source, link, doc, orgChoices);
      if (action === "new") newItems++;
      if (action === "extended") extendedItems++;
      await markSeen();
    } catch (err) {
      if (err instanceof AllProvidersExhausted) {
        // Abandon the rest of this source: every remaining link would fail the
        // same way, and leaving them unrecorded means the next run retries them.
        console.warn(`  ${err.message}`);
        deferred += links.length - links.indexOf(link);
        break;
      }
      if (err instanceof ExtractionUnavailable) {
        // Left unrecorded on purpose: the document is fine, the models were
        // busy. The next scheduled tick will pick this URL up again.
        deferred++;
        console.warn(`  deferred ${link.url} — ${err.message}`);
        continue;
      }
      console.warn(`  save failed for ${link.url}: ${err instanceof Error ? err.message : err}`);
      await markSeen();
    }
  }

  return { newItems, extendedItems, skipped, deferred };
}

export async function runScrapeForSource(source: SourceWithOrg): Promise<RunResult> {
  const run = await prisma.scrapeRun.create({ data: { sourceId: source.id, status: "running" } });

  try {
    const indexHtml = await fetchHtml(source.url);

    // A feed is parsed as a feed, whether the source declares itself one or the
    // body simply turns out to be XML.
    const isFeed = source.kind === "rss" || looksLikeFeed(indexHtml);
    const found = isFeed
      ? discoverFromFeed(indexHtml, source.url)
      : discoverLinks(indexHtml, source.url, source);

    // Sweep a couple of pagination pages too — listings push older notices off
    // page 1. Feeds are already complete, so they are not paginated here.
    for (const pageUrl of isFeed ? [] : discoverPaginationUrls(indexHtml, source.url)) {
      try {
        const pageHtml = await fetchHtml(pageUrl);
        for (const item of discoverLinks(pageHtml, pageUrl, source)) {
          if (!found.some((f) => f.url === item.url)) found.push(item);
        }
      } catch {
        // a dead pagination link must not fail the run
      }
    }

    // An aggregator's own URLs are never ingested — only what they point to.
    const candidates =
      source.trust === "aggregator" ? await resolveViaAggregator(found) : found;

    const known = await prisma.discoveredLink.findMany({
      where: { sourceId: source.id },
      select: { url: true },
    });
    const knownUrls = new Set(known.map((k) => k.url));
    // Deduping on the OFFICIAL url, globally rather than per-source: the same
    // notice will legitimately be found by both its own body and an aggregator,
    // and it should exist once.
    const globallyKnown = await prisma.notification.findMany({
      where: { officialSourceUrl: { in: candidates.map((c) => c.url) } },
      select: { officialSourceUrl: true },
    });
    const heldUrls = new Set(globallyKnown.map((n) => n.officialSourceUrl));
    const allFresh = candidates.filter((l) => !knownUrls.has(l.url) && !heldUrls.has(l.url));
    const fresh = allFresh.slice(0, MAX_NEW);
    const truncated = allFresh.length - fresh.length;

    const { newItems, extendedItems, skipped, deferred } = await ingestLinks(source, fresh);

    // A source that finds nothing is not healthy — it is usually a JS-rendered
    // listing or a moved page. Recording it as "ok" is how a broken source hides.
    const degraded = found.length === 0 || candidates.length === 0;
    const notes = [
      found.length === 0 ? "NO LINKS MATCHED — selector or page likely stale" : null,
      found.length > 0 && candidates.length === 0 && source.trust === "aggregator"
        ? "aggregator pages led to no official domain — nothing verifiable to ingest"
        : null,
      truncated > 0 ? `${truncated} more link(s) held back by SCRAPE_MAX_NEW_PER_SOURCE` : null,
      skipped > 0 ? `${skipped} unreachable/unreadable` : null,
      deferred > 0 ? `${deferred} deferred (extraction providers busy — will retry next tick)` : null,
    ].filter(Boolean);

    await prisma.source.update({
      where: { id: source.id },
      data: degraded
        ? { lastRunAt: new Date(), lastStatus: "degraded", lastError: "No matching links found", failCount: { increment: 1 } }
        : { lastRunAt: new Date(), lastStatus: "ok", lastError: null, failCount: 0 },
    });
    await prisma.scrapeRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        status: degraded ? "error" : "ok",
        linksFound: found.length,
        newItems,
        message: `${found.length} link(s), ${newItems} new, ${extendedItems} extended. ${notes.join(" · ") || "OK"}`,
      },
    });
    return {
      sourceId: source.id,
      status: "ok",
      linksFound: found.length,
      newItems,
      extendedItems,
      message: notes.join(" · "),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 300) : String(err);
    await prisma.source.update({
      where: { id: source.id },
      data: { lastRunAt: new Date(), lastStatus: "error", lastError: msg, failCount: { increment: 1 } },
    });
    await prisma.scrapeRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), status: "error", message: msg },
    });
    return { sourceId: source.id, status: "error", linksFound: 0, newItems: 0, extendedItems: 0, message: msg };
  }
}

export { scoreConfidence };
