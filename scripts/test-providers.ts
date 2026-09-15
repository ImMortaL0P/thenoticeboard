/**
 * Check every extraction provider independently.
 *
 *   npx tsx scripts/test-providers.ts
 *
 * Sends one tiny notice to each configured provider and reports exactly what
 * came back. Use this when extraction "keeps failing" — it separates "Gemini is
 * overloaded" from "the Anthropic key is wrong", which look identical in the
 * scraper's logs.
 */
import "dotenv/config";
import { gemini, anthropic, openai, ProviderError, type Provider } from "../src/lib/scraper/providers";

const SAMPLE = `
STAFF SELECTION COMMISSION
Advertisement No. SSC-TEST/01/2026
Recruitment of Junior Engineer (Civil). Total posts: 120.
Age limit: 18 to 30 years. Application fee Rs. 100 (SC/ST exempted).
Online applications open 01/10/2026 and close 25/10/2026.
Minimum qualification: Degree in Civil Engineering.
`.trim();

const ORGS = [
  { shortName: "SSC", name: "Staff Selection Commission" },
  { shortName: "UPSC", name: "Union Public Service Commission" },
];

function envFor(p: Provider): string {
  if (p.name === "gemini") return `GEMINI_MODEL=${process.env.GEMINI_MODEL ?? "(default gemini-flash-latest)"}`;
  if (p.name === "anthropic") return `ANTHROPIC_MODEL=${process.env.ANTHROPIC_MODEL ?? "(default)"}`;
  return `OPENAI_MODEL=${process.env.OPENAI_MODEL ?? "(default)"}`;
}

async function check(p: Provider) {
  const label = p.name.padEnd(10);
  if (!p.available()) {
    console.log(`${label} SKIPPED — no API key set`);
    return;
  }
  console.log(`${label} ${envFor(p)}`);
  const started = Date.now();
  try {
    const raw = await p.call({ text: SAMPLE, pdf: null, orgChoices: ORGS });
    const ms = Date.now() - started;
    const got = raw as Record<string, unknown>;
    console.log(`${" ".repeat(10)} OK in ${ms}ms`);
    console.log(`${" ".repeat(10)}   org=${got.organizationShortName}  vacancies=${got.totalVacancies}  applyLast=${got.applyLast}  qual=${got.minQualification}`);
    const wrong: string[] = [];
    if (got.organizationShortName !== "SSC") wrong.push("organisation should be SSC");
    if (got.totalVacancies !== 120) wrong.push("vacancies should be 120");
    if (got.applyLast !== "2026-10-25") wrong.push("applyLast should be 2026-10-25");
    if (wrong.length) console.log(`${" ".repeat(10)}   ! ${wrong.join("; ")}`);
  } catch (err) {
    const ms = Date.now() - started;
    if (err instanceof ProviderError) {
      const kind =
        err.status === 429 ? "RATE LIMITED"
        : err.status >= 500 ? "OVERLOADED (transient — cascade will fail over)"
        : err.status === 401 || err.status === 403 ? "AUTH FAILED — check the API key"
        : err.status === 404 ? "MODEL NOT FOUND — check the model name in .env"
        : err.status === 400 ? "BAD REQUEST — schema or model mismatch"
        : err.status === 0 ? "NETWORK/TIMEOUT"
        : `HTTP ${err.status}`;
      console.log(`${" ".repeat(10)} FAILED after ${ms}ms — ${kind}`);
      console.log(`${" ".repeat(10)}   ${err.message}`);
    } else {
      console.log(`${" ".repeat(10)} FAILED after ${ms}ms — ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  console.log();
}

async function main() {
  console.log(`\nEXTRACT_PROVIDERS=${process.env.EXTRACT_PROVIDERS ?? "(default gemini,anthropic,openai)"}\n`);
  for (const p of [gemini, anthropic, openai]) await check(p);
  console.log("A provider marked AUTH FAILED or MODEL NOT FOUND is a permanent error: the");
  console.log("cascade stops trying it and falls through to the regex rules, which is why");
  console.log("extraction can look like it is 'always failing' even with three keys set.\n");
}

main();
