// One full scrape of a single source: fetch index → discover links → parse new
// pages → extract fields → save draft Notifications (pending_review) + ScrapeRun log.

import * as cheerio from "cheerio";
import { prisma } from "../db";
import type { Prisma, Source } from "@prisma/client";
import { fetchHtml } from "./fetch";
import { discoverLinks, type DiscoveredItem } from "./discover";
import { extractFromText } from "../extract";

export type SourceWithOrg = Prisma.SourceGetPayload<{ include: { organization: true } }>;
export type RunResult = {
  sourceId: string;
  status: "ok" | "error";
  linksFound: number;
  newItems: number;
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

async function saveNotice(
  source: SourceWithOrg,
  organizationId: string,
  link: DiscoveredItem,
  rawText: string,
): Promise<void> {
  const draft = extractFromText(rawText, link.text);

  const data: Prisma.NotificationUncheckedCreateInput = {
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
    fees: {
      general: draft.feeGeneral ?? undefined,
      sc: draft.feeReserved ?? undefined,
      st: draft.feeReserved ?? undefined,
      pwbd: draft.feeReserved ?? undefined,
    },
    applyLast: draft.applyLast ?? undefined,
    notificationDate: draft.notificationDate ?? undefined,
    advertisementNo: draft.advertisementNo ?? undefined,
    officialSourceUrl: link.url,
    discoveredUrl: link.url,
    rawText: rawText.slice(0, MAX_RAW),
    origin: "scraper",
    sourceId: source.id,
    extractionMethod: "rules",
  };

  const already = await prisma.notification.findFirst({ where: { discoveredUrl: link.url } });
  if (already) return;
  await prisma.notification.create({ data });
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
        await saveNotice(source, organizationId, link, rawText);
        newItems++;
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
        message: `Found ${found.length} links, ${newItems} new item(s). ${note}`,
      },
    });
    return { sourceId: source.id, status: "ok", linksFound: found.length, newItems, message: "" };
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
    return { sourceId: source.id, status: "error", linksFound: 0, newItems: 0, message: msg };
  }
}