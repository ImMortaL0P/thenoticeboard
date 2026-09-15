/**
 * Verify the review queue.
 *
 *   npx tsx scripts/verify-queue.ts                 # dry run over the queue
 *   npx tsx scripts/verify-queue.ts --apply         # write the results
 *   npx tsx scripts/verify-queue.ts --limit 10
 *   npx tsx scripts/verify-queue.ts --local-only    # use only the local model
 *   npm run agent                                   # stay running, wait for work
 *
 * --watch is the "local agent" mode. It sits idle, heartbeats into the database
 * so the admin panel can show that a machine is listening, and runs the queue
 * whenever an admin presses the button there. That is how the local model gets
 * used from a web page: a browser cannot start a process on your laptop, but a
 * process already running on your laptop can watch for a request.
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { verifyNotice, onlyLocalLeft, verifyChain, type QueuedNotice } from "../src/lib/agents/verify";
import { limiterReport } from "../src/lib/agents/limits";

const APPLY = process.argv.includes("--apply");
const WATCH = process.argv.includes("--watch");
const LOCAL_ONLY = process.argv.includes("--local-only");
const LIMIT = (() => {
  const i = process.argv.indexOf("--limit");
  return i >= 0 ? Number(process.argv[i + 1]) || 0 : 0;
})();

if (LOCAL_ONLY) process.env.VERIFY_PROVIDERS = "ollama";

const HEARTBEAT_KEY = "agent:heartbeat";
const REQUEST_KEY = "agent:request";
const STATUS_KEY = "agent:status";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function kvGet(key: string): Promise<string | null> {
  const row = await prisma.keyValue.findUnique({ where: { key } });
  return row?.value ?? null;
}
async function kvSet(key: string, value: string): Promise<void> {
  await prisma.keyValue.upsert({ where: { key }, create: { key, value }, update: { value } });
}

const SELECT = {
  id: true, serialNumber: true, title: true, officialSourceUrl: true, discoveredUrl: true,
  officialNotificationPdfUrl: true, rawText: true, applyLast: true, applyStart: true,
  notificationDate: true, examDate: true, feeLast: true, minAge: true, maxAge: true,
  totalVacancies: true, organizationId: true,
  updates: { select: { type: true, date: true } },
} as const;

async function runQueue(): Promise<{ published: number; review: number; rejected: number }> {
  const queue = (await prisma.notification.findMany({
    where: { status: "pending_review" },
    select: SELECT,
    orderBy: { createdAt: "asc" },
    ...(LIMIT > 0 ? { take: LIMIT } : {}),
  })) as QueuedNotice[];

  console.log(`\n${queue.length} notice(s) pending review`);
  console.log(`  cascade: ${verifyChain().map((p) => p.name).join(" -> ") || "(none configured)"}`);
  if (onlyLocalLeft()) console.log("  every hosted allowance is spent — running on the local model only\n");

  let published = 0, review = 0, rejected = 0;

  for (const n of queue) {
    console.log(`\n  NB-${n.serialNumber}  ${n.title.slice(0, 64)}`);
    const outcome = await verifyNotice(n, { log: (s) => console.log(s) });

    const mark = outcome.action === "publish" ? "PUBLISH" : outcome.action === "reject" ? "REJECT " : "REVIEW ";
    console.log(`       ${mark} confidence ${outcome.confidence} via ${outcome.providersUsed.join(", ") || "-"}`);
    for (const r of outcome.reasons.slice(0, 4)) console.log(`         · ${r}`);
    const filled = Object.keys(outcome.patch).filter((k) => !["extractionConfidence", "orgConfidence", "rejectReason"].includes(k));
    if (filled.length) console.log(`         + ${filled.join(", ")}`);

    if (outcome.action === "publish") published++;
    else if (outcome.action === "reject") rejected++;
    else review++;

    if (APPLY) {
      const data: Record<string, unknown> = { ...outcome.patch };
      if (outcome.action === "publish") {
        data.status = "published";
        data.sourceVerifiedAt = new Date();
      } else if (outcome.action === "reject") {
        data.status = "rejected";
      }
      data.extractionNotes = `Agent ${new Date().toISOString().slice(0, 16)}: ${outcome.action}, confidence ${outcome.confidence}, via ${outcome.providersUsed.join("+") || "rules"}. ${outcome.reasons.slice(0, 3).join("; ")}`.slice(0, 900);
      await prisma.notification.update({ where: { id: n.id }, data });
    }
  }

  console.log(`\n${"=".repeat(72)}`);
  console.log(`  ${published} publishable · ${review} for a human · ${rejected} rejected`);
  console.log(`  ${limiterReport()}`);
  if (!APPLY) console.log("\n  Dry run. Re-run with --apply to write.\n");
  return { published, review, rejected };
}

async function watch(): Promise<void> {
  console.log("thenoticeboard local agent — waiting for work");
  console.log(`  providers: ${verifyChain().map((p) => p.name).join(", ") || "(none)"}`);
  console.log(`  ${APPLY ? "APPLY mode — results will be written" : "DRY RUN — pass --apply to write"}`);
  console.log("  press the button in Admin -> Review queue to start a pass\n");

  let lastHandled = (await kvGet(REQUEST_KEY)) ?? "";

  for (;;) {
    await kvSet(HEARTBEAT_KEY, new Date().toISOString());
    const request = await kvGet(REQUEST_KEY);

    if (request && request !== lastHandled) {
      lastHandled = request;
      console.log(`\n[${new Date().toLocaleTimeString()}] run requested`);
      await kvSet(STATUS_KEY, JSON.stringify({ state: "running", startedAt: new Date().toISOString() }));
      try {
        const res = await runQueue();
        await kvSet(STATUS_KEY, JSON.stringify({ state: "idle", finishedAt: new Date().toISOString(), ...res }));
      } catch (err) {
        console.error("run failed:", err);
        await kvSet(STATUS_KEY, JSON.stringify({ state: "error", message: String(err).slice(0, 200) }));
      }
      console.log("\nwaiting…");
    }
    await sleep(8_000);
  }
}

async function main() {
  if (WATCH) {
    await watch();
    return;
  }
  await runQueue();
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
