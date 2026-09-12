// One full scrape of a single source: fetch index → discover links → parse new
// pages → extract fields → save draft Notifications (pending_review) + ScrapeRun log.

import * as cheerio from "cheerio";
import { prisma } from "../db";
import type { Prisma, Source } from "@prisma/client";
import { fetchHtml } from "./fetch";
import { discoverLinks, type DiscoveredItem } from "./discover";
import { autoExtract } from "./ai";
import { getNextNotificationSerialNumber } from "../serial";

export type SourceWithOrg = Prisma.SourceGetPayload<{ include: { organization: true } }>;
export type RunResult = {
  sourceId: string;
  status: "ok" | "error";
  linksFound: number;
  newItems: number;
  extendedItems: number;
  message: string;
};

const MAX_NEW = Math.max(1, Number(process.env.SCRAPE_MAX_NEW_PER_SOURCE ?? 10));
const MAX_RAW = 40 * 1024;

// Runtime guards against pages that would only pollute the review queue.

function looksHtml(text: string): boolean {
  return /^\s*<!doctype html/i.test(text) || /<html[\s>]/i.test(text);
}

/** Strip markup so stored rawText / extraction see visible text, not source. */
function htmlToText(raw: string): string {
  return cheerio.load(raw).text().replace(/\s+/g, " ").trim();
}

/**
 * Reject extracted text that clearly isn't readable prose:
 * scanned Devanagari PDFs extract as byte-mangled ASCII full of '^' carets
 * (pdf-parse can't map their non-Unicode fonts), which a length check passes.
 */
function readableText(raw: string): boolean {
  const t = raw.trim();
  if (t.length < 40) return false;
  const caretDensity = (t.match(/\^/g) ?? []).length / t.length;
  if (caretDensity > 0.002) return false;
  return true;
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "notice-source"
  );
}

async function orgIdFor(source: SourceWithOrg): Promise<string> {
  if (source.organizationId) return source.organizationId;
  if (source.organization) return source.organization.id;
  const slug = slugify(source.name);
  const existing = await prisma.organization.findFirst({ where: { shortName: slug } });
  if (existing) return existing.id;
  const org = await prisma.organization.create({
    data: { name: source.name, shortName: slug, sector: source.sector, isVerified: false },
  });
  await prisma.source.update({ where: { id: source.id }, data: { organizationId: org.id } });
  return org.id;
}

async function processDiscoveredLink(
  source: SourceWithOrg,
  organizationId: string,
  link: DiscoveredItem,
  rawText: string,
): Promise<'new' | 'extended' | 'already_handled'> {
  // Check if we already have this official URL or discovered URL in DB.
  let existingNotification = await prisma.notification.findFirst({
    where: {
      OR: [
        { discoveredUrl: link.url },
        { officialSourceUrl: link.url }
      ]
    },
    include: { updates: true }
  });

  const { draft, method } = await autoExtract(rawText, link.text);

  if (existingNotification) {
    // Already exists. Let's see if the closing date extended.
    if (draft.applyLast && existingNotification.applyLast) {
      if (draft.applyLast > existingNotification.applyLast) {
        // Date got extended!
        // Check if we already created an update for this date
        const hasUpdate = existingNotification.updates.some(u => u.type === 'date_extension' && u.date === draft.applyLast);
        if (!hasUpdate) {
          await prisma.notificationUpdate.create({
            data: {
              notificationId: existingNotification.id,
              type: "date_extension",
              title: `Date Extended to ${draft.applyLast}`,
              date: draft.applyLast,
              link: link.url
            }
          });
          // Also update the main row if it's not closed yet, though we leave it to reviewer ideally.
          // We will update the applyLast and set to pending_review so the reviewer checks it.
          await prisma.notification.update({
            where: { id: existingNotification.id },
            data: {
              applyLast: draft.applyLast,
              status: "pending_review",
              extractionNotes: `Detected date extension via AI/scraper from ${existingNotification.applyLast} to ${draft.applyLast}.`
            }
          });
          return 'extended';
        }
      }
    }
    return 'already_handled';
  }

  // It's a brand new notification
  const data: Prisma.NotificationUncheckedCreateInput = {
    serialNumber: await getNextNotificationSerialNumber(),
    organizationId,
    title: draft.title ?? `${source.organization?.shortName ?? source.name} notice`,
    summary: draft.summary ?? undefined,
    postNames: [],
    status: "pending_review",
    sector: source.sector,
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
    officialSourceUrl: link.url,
    discoveredUrl: link.url,
    rawText: rawText.slice(0, MAX_RAW),
    origin: "scraper",
    sourceId: source.id,
    extractionMethod: method,
  };

  await prisma.notification.create({ data });
  return 'new';
}

export async function runScrapeForSource(source: SourceWithOrg): Promise<RunResult> {
  const run = await prisma.scrapeRun.create({ data: { sourceId: source.id, status: "running" } });

  try {
    const html = await fetchHtml(source.url);
    const found = discoverLinks(html, source.url, source);

    const known = await prisma.discoveredLink.findMany({
      where: { sourceId: source.id },
      select: { url: true },
    });
    const knownUrls = new Set(known.map((k) => k.url));
    const fresh = found.filter((l) => !knownUrls.has(l.url)).slice(0, MAX_NEW);

    const organizationId = await orgIdFor(source);
    let newItems = 0;
    let extendedItems = 0;
    const thin: DiscoveredItem[] = [];

    for (const link of fresh) {
      try {
        await prisma.discoveredLink.create({ data: { sourceId: source.id, url: link.url, text: link.text } });
      } catch {
        continue; // another run raced to record this URL
      }
      let rawText: string;
      try {
        rawText = await fetchHtml(link.url);
      } catch {
        continue; // link is dead or unparseable — skip, don't fail the run
      }
      if (looksHtml(rawText)) rawText = htmlToText(rawText);
      if (!readableText(rawText)) {
        thin.push(link);
        continue;
      }
      try {
        const action = await processDiscoveredLink(source, organizationId, link, rawText);
        if (action === 'new') newItems++;
        if (action === 'extended') extendedItems++;
      } catch (err) {
        console.warn(`  save failed for ${link.url}: ${err instanceof Error ? err.message : err}`);
      }
    }

    const note =
      found.length === 0
        ? "No matching links found on index page."
        : thin.length
          ? `Skip ${thin.length} thin/empty pages (likely scanned PDFs)`
          : "OK";

    await prisma.source.update({
      where: { id: source.id },
      data: { lastRunAt: new Date(), lastStatus: "ok", lastError: null, failCount: 0 },
    });
    await prisma.scrapeRun.update({
      where: { id: run.id },
      data: {
        finishedAt: new Date(),
        status: "ok",
        linksFound: found.length,
        newItems,
        message: `Found ${found.length} links, ${newItems} new item(s), ${extendedItems} extended. ${note}`,
      },
    });
    return { sourceId: source.id, status: "ok", linksFound: found.length, newItems, extendedItems, message: "" };
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