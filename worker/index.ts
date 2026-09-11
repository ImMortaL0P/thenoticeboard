// thenoticeboard worker (Phase 5): scraper cron.
//   npm run worker            → run due sources on SCRAPE_CRON schedule
//   npm run scrape:once       → scrape all active sources once, then exit
//
// Scraped items always land as status "pending_review" — nothing is auto-published.

import "dotenv/config";
import cron from "node-cron";
import { prisma } from "../src/lib/db";
import { runScrapeForSource } from "../src/lib/scraper/run";

const once = process.argv.includes("--scrape-once");
const cronExpr = process.env.SCRAPE_CRON ?? "0 */3 * * *";

async function scrapeDueSources(manual: boolean): Promise<void> {
  const sources = await prisma.source.findMany({
    where: { active: true },
    include: { organization: true },
  });
  const now = Date.now();
  const due = sources.filter(
    (s) => manual || !s.lastRunAt || now - s.lastRunAt.getTime() >= s.intervalHours * 3_600_000,
  );

  if (due.length === 0) {
    console.log(`No sources due (${sources.length} active${manual ? ", manual run" : ""}).`);
    return;
  }

  console.log(`Scraping ${due.length} of ${sources.length} active source(s)…`);
  for (const source of due) {
    const res = await runScrapeForSource(source);
    const summary = `[${res.status.toUpperCase()}] ${source.name} — found ${res.linksFound} link(s), ${res.newItems} new item(s)`;
    console.log(res.status === "ok" ? summary : `${summary}\n  ${res.message}`);
  }
}

async function main(): Promise<void> {
  if (once) {
    console.log("thenoticeboard scraper — scrape-once mode");
    await scrapeDueSources(true);
    await prisma.$disconnect();
    return;
  }

  if (!cron.validate(cronExpr)) {
    console.error(`Invalid SCRAPE_CRON: ${cronExpr}`);
    process.exit(1);
  }
  console.log(`thenoticeboard worker — cron: ${cronExpr}`);
  cron.schedule(cronExpr, () => {
    scrapeDueSources(false).catch((err) => console.error("scheduled scrape failed:", err));
  });
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});