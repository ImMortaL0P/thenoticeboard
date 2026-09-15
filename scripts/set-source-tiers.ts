/**
 * Assign a scheduling tier to every source.
 *
 *   npx tsx scripts/set-source-tiers.ts          # dry run
 *   npx tsx scripts/set-source-tiers.ts --apply
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { TIERS, defaultTierFor } from "../src/lib/scraper/schedule";

const APPLY = process.argv.includes("--apply");

async function main() {
  const sources = await prisma.source.findMany({ include: { organization: true } });
  const buckets: Record<string, string[]> = { hot: [], standard: [], slow: [], watch: [] };

  for (const s of sources) {
    const tier = defaultTierFor({
      sector: s.sector,
      name: s.name,
      shortName: s.organization?.shortName,
      url: s.url,
    });
    buckets[tier].push(s.name);
    if (APPLY) {
      await prisma.source.update({
        where: { id: s.id },
        data: { tier, intervalHours: TIERS[tier].everyHours },
      });
    }
  }

  for (const [tier, names] of Object.entries(buckets)) {
    const cfg = TIERS[tier as keyof typeof TIERS];
    console.log(`\n${cfg.label} — every ${cfg.everyHours}h at IST ${cfg.hoursIST.join(", ")}  (${names.length})`);
    for (const n of names) console.log(`   ${n}`);
  }
  console.log(APPLY ? "\nApplied.\n" : "\nDry run. Re-run with --apply.\n");
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect().catch(() => {}); process.exit(1); });
