// thenoticeboard worker — scrape scheduler, Gemini discovery sweep, maintenance.
//
//   npm run worker          → hourly tick; each source runs on its tier's timeslots
//   npm run scrape:once     → sweep every active source now, then exit
//   npm run discover:once   → run the Gemini discovery sweep now, then exit
//
// Scraped items ALWAYS land as status "pending_review". Nothing on this path
// publishes, including anything Gemini proposes.

import "dotenv/config";
import cron from "node-cron";
import { prisma } from "../src/lib/db";
import { runScrapeForSource, ingestLinks, type SourceWithOrg } from "../src/lib/scraper/run";
import { discoverViaGemini } from "../src/lib/scraper/discovery-gemini";
import { usageSummary } from "../src/lib/scraper/ai";
import {
  GEMINI_DISCOVERY_HOUR_IST,
  MAINTENANCE_HOUR_IST,
  TIERS,
  hourIST,
  isDue,
} from "../src/lib/scraper/schedule";
import { startBot } from "./telegram";

const onceScrape = process.argv.includes("--scrape-once");
const onceDiscover = process.argv.includes("--discover-once");

/** The synthetic source every Gemini-proposed URL is filed under. */
const DISCOVERY_SOURCE_URL = "internal://gemini-discovery";

async function scrapeDueSources(manual: boolean): Promise<void> {
  const sources = await prisma.source.findMany({ where: { active: true }, include: { organization: true } });
  const now = new Date();
  const due = manual ? sources : sources.filter((s) => isDue(s, now));

  if (due.length === 0) {
    console.log(`[${now.toISOString()}] IST hour ${hourIST(now)} — no sources due (${sources.length} active).`);
    return;
  }

  console.log(`Scraping ${due.length} of ${sources.length} active source(s)…`);
  for (const source of due) {
    const res = await runScrapeForSource(source);
    const line = `[${res.status.toUpperCase()}] ${source.name} — ${res.linksFound} link(s), ${res.newItems} new, ${res.extendedItems} extended`;
    console.log(res.message ? `${line}\n  ${res.message}` : line);
  }
  console.log(`  ${usageSummary()}`);
}

async function discoverySource(): Promise<SourceWithOrg> {
  const existing = await prisma.source.findFirst({
    where: { url: DISCOVERY_SOURCE_URL },
    include: { organization: true },
  });
  if (existing) return existing;
  return prisma.source.create({
    data: {
      name: "Gemini discovery sweep",
      url: DISCOVERY_SOURCE_URL,
      sector: "central_govt",
      kind: "html",
      tier: "slow",
      intervalHours: 24,
      active: true,
    },
    include: { organization: true },
  });
}

/**
 * Ask Gemini (with Search grounding) what recruitment notifications are open,
 * then push every candidate URL through the ordinary fetch → extract → review
 * pipeline. The model's own description of a notice is never stored.
 */
async function runGeminiDiscovery(): Promise<void> {
  if (!process.env.GEMINI_API_KEY) {
    console.log("Gemini discovery skipped — GEMINI_API_KEY not set.");
    return;
  }
  console.log("Gemini discovery sweep…");
  let candidates: Awaited<ReturnType<typeof discoverViaGemini>>;
  try {
    candidates = await discoverViaGemini();
  } catch (err) {
    console.error("  discovery failed:", err instanceof Error ? err.message : err);
    return;
  }
  console.log(`  ${candidates.length} candidate URL(s) proposed.`);
  if (candidates.length === 0) return;

  const source = await discoverySource();
  const known = await prisma.discoveredLink.findMany({ select: { url: true } });
  const knownUrls = new Set(known.map((k) => k.url));
  const fresh = candidates
    .filter((c) => !knownUrls.has(c.url))
    .map((c) => ({ url: c.url, text: c.title, via: "keyword" as const }));

  console.log(`  ${fresh.length} not seen before; ingesting…`);
  const res = await ingestLinks(source, fresh);
  console.log(`  ${res.newItems} new item(s) queued for review, ${res.skipped} unreachable, ${res.deferred} deferred.`);

  await prisma.source.update({
    where: { id: source.id },
    data: { lastRunAt: new Date(), lastStatus: "ok", lastError: null, failCount: 0 },
  });
}

/**
 * Daily housekeeping: close notices whose apply window has passed, and retire
 * watch sources whose exam is over. Without the second step the watch tier
 * grows forever — every exam ever seeded keeps costing a fetch a day.
 */
async function runMaintenance(): Promise<void> {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

  const closed = await prisma.notification.updateMany({
    where: { status: "published", applyLast: { lt: today } },
    data: { status: "closed" },
  });
  if (closed.count > 0) console.log(`Maintenance: closed ${closed.count} expired notice(s).`);

  const watchSources = await prisma.source.findMany({
    where: { active: true, tier: "watch" },
    include: { notifications: { select: { status: true, applyLast: true } } },
  });
  let retired = 0;
  for (const s of watchSources) {
    if (s.notifications.length === 0) continue; // never produced anything — leave it for review
    const stillLive = s.notifications.some(
      (n) => n.status !== "closed" && n.status !== "archived" && (!n.applyLast || n.applyLast >= today),
    );
    if (stillLive) continue;
    // Keep watching for a fortnight after closing — corrigenda and date
    // extensions often land just after the advertised last date.
    const newest = s.notifications
      .map((n) => n.applyLast)
      .filter((d): d is string => !!d)
      .sort()
      .at(-1);
    if (newest) {
      const grace = new Date(`${newest}T00:00:00Z`);
      grace.setUTCDate(grace.getUTCDate() + 14);
      if (new Date() < grace) continue;
    }
    await prisma.source.update({ where: { id: s.id }, data: { active: false } });
    retired++;
  }
  if (retired > 0) console.log(`Maintenance: retired ${retired} watch source(s) whose exam has closed.`);
}

async function tick(): Promise<void> {
  const now = new Date();
  const h = hourIST(now);
  await scrapeDueSources(false);
  if (h === GEMINI_DISCOVERY_HOUR_IST) await runGeminiDiscovery();
  if (h === MAINTENANCE_HOUR_IST) await runMaintenance();
}

async function main(): Promise<void> {
  if (onceScrape) {
    console.log("thenoticeboard — scrape-once");
    await scrapeDueSources(true);
    await prisma.$disconnect();
    return;
  }
  if (onceDiscover) {
    console.log("thenoticeboard — discover-once");
    await runGeminiDiscovery();
    await prisma.$disconnect();
    return;
  }

  // One hourly tick; the per-source timeslots in schedule.ts decide what
  // actually runs. A single cron beats several because two sweeps can never
  // overlap and fight for the same DiscoveredLink rows.
  console.log("thenoticeboard worker — hourly tick (timeslots per source tier)");
  for (const [name, cfg] of Object.entries(TIERS)) {
    console.log(`  ${name.padEnd(9)} every ${cfg.everyHours}h at IST ${cfg.hoursIST.join(", ")}`);
  }
  console.log(`  gemini discovery at IST ${GEMINI_DISCOVERY_HOUR_IST}:00`);
  console.log(`  maintenance       at IST ${MAINTENANCE_HOUR_IST}:00`);

  // The previous worker imported startBot but never called it, so the Telegram
  // side was dormant. Start it only when a token is configured — no token, no
  // change in behaviour.
  if (process.env.TELEGRAM_BOT_TOKEN) {
    console.log("  telegram bot: starting");
    startBot();
  }

  cron.schedule("0 * * * *", () => {
    tick().catch((err) => console.error("tick failed:", err));
  });
  void tick();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
