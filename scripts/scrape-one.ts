// Run one source through the scraper and print what landed in the DB.
//   npx tsx scripts/scrape-one.ts <sourceId|sourceUrl|sourceName>
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { runScrapeForSource } from "../src/lib/scraper/run";

async function main() {
  const q = process.argv[2];
  if (!q) {
    console.error("usage: npx tsx scripts/scrape-one.ts <sourceId|URL|name>");
    process.exit(1);
  }
  const source = await prisma.source.findFirst({
    where: {
      OR: [
        ...(/^[0-9a-fA-F]{24}$/.test(q) ? [{ id: q }] : []),
        { url: q },
        { name: { contains: q } },
      ],
    },
    include: { organization: true },
  });
  if (!source) {
    console.error(`No source matches "${q}".`);
    const all = await prisma.source.findMany({ select: { id: true, name: true, url: true } });
    console.table(all);
    process.exit(1);
  }
  console.log(`Scraping: ${source.name} — ${source.url}`);
  const res = await runScrapeForSource(source);
  console.log(
    `[${res.status.toUpperCase()}] found=${res.linksFound} new=${res.newItems} ${res.message}`,
  );
  if (res.status === "error") console.error(res.message);

  const drafts = await prisma.notification.findMany({
    where: { sourceId: source.id, status: "pending_review" },
    include: { organization: true },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  for (const d of drafts) {
    console.log(`\n• ${d.title}`);
    console.log(`  advt=${d.advertisementNo} posts=${d.totalVacancies} qual=${d.minQualification}` +
      ` age=${d.minAge ?? "?"}-${d.maxAge ?? "?"} fees=${JSON.stringify(d.fees)}`);
    console.log(`  applyLast=${d.applyLast} notification=${d.notificationDate}`);
    console.log(`  url=${d.discoveredUrl}`);
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});