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
import * as P from "../src/lib/scraper/providers";
import { ProviderError, type Provider } from "../src/lib/scraper/providers";

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

const KEY_ENV: Record<string, string> = {
  gemini: "GEMINI_API_KEY", groq: "GROQ_API_KEY", cerebras: "CEREBRAS_API_KEY",
  mistral: "MISTRAL_API_KEY", nvidia: "NVIDIA_API_KEY", ovh: "OVH_AI_TOKEN",
  sambanova: "SAMBANOVA_API_KEY", together: "TOGETHER_API_KEY",
  scaleway: "SCALEWAY_API_KEY", huggingface: "HF_TOKEN", cohere: "COHERE_API_KEY",
  cloudflare: "CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID",
  openrouter: "OPENROUTER_API_KEY", github: "GITHUB_MODELS_TOKEN",
  llm7: "LLM7_API_KEY", ollama: "OLLAMA_HOST",
  anthropic: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY",
};

function envFor(p: Provider): string {
  return `${KEY_ENV[p.name] ?? "?"} set`;
}

async function check(p: Provider) {
  const label = p.name.padEnd(10);
  if (!p.available()) {
    console.log(`${label} SKIPPED — ${KEY_ENV[p.name] ?? "key"} not set`);
    return;
  }
  if (!process.env[(KEY_ENV[p.name] ?? "").split(" ")[0]]) {
    console.log(`${label} (anonymous tier — no key set)`);
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
  const all: Provider[] = [
    P.gemini, P.groq, P.cerebras, P.mistral, P.nvidia, P.ovh, P.sambanova,
    P.together, P.scaleway, P.huggingface, P.cohere, P.cloudflare,
    P.openrouter, P.githubModels, P.llm7, P.ollama, P.anthropic, P.openai,
  ];
  for (const p of all) await check(p);
  console.log("A provider marked AUTH FAILED or MODEL NOT FOUND is a permanent error: the");
  console.log("cascade stops trying it and falls through to the regex rules, which is why");
  console.log("extraction can look like it is 'always failing' even with three keys set.\n");
}

main();
