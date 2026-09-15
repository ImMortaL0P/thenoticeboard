/**
 * Ask every configured provider what models it actually serves today.
 *
 *   npx tsx scripts/list-models.ts
 *
 * Hardcoded model slugs rot — providers retire them constantly. This prints the
 * live list with the pipeline's own ranking applied, so you can see what is
 * available and pin a choice in .env if you want one specific model rather than
 * whatever the auto-resolver picks.
 */
import "dotenv/config";
import * as P from "../src/lib/scraper/providers";
import { listModels, type Provider } from "../src/lib/scraper/providers";
import { env } from "../src/lib/env";

const ENDPOINTS: { p: Provider; base: string; key?: string; headers?: Record<string, string> }[] = [
  { p: P.groq, base: "https://api.groq.com/openai/v1", key: env("GROQ_API_KEY") },
  { p: P.cerebras, base: "https://api.cerebras.ai/v1", key: env("CEREBRAS_API_KEY") },
  { p: P.mistral, base: "https://api.mistral.ai/v1", key: env("MISTRAL_API_KEY") },
  { p: P.openrouter, base: "https://openrouter.ai/api/v1", key: env("OPENROUTER_API_KEY") },
  { p: P.nvidia, base: "https://integrate.api.nvidia.com/v1", key: env("NVIDIA_API_KEY") },
  { p: P.ovh, base: "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1", key: env("OVH_AI_TOKEN") },
  { p: P.sambanova, base: "https://api.sambanova.ai/v1", key: env("SAMBANOVA_API_KEY") },
  { p: P.together, base: "https://api.together.xyz/v1", key: env("TOGETHER_API_KEY") },
  { p: P.huggingface, base: "https://router.huggingface.co/v1", key: env("HF_TOKEN") },
  { p: P.llm7, base: "https://api.llm7.io/v1", key: env("LLM7_API_KEY") },
  { p: P.ollama, base: `${env("OLLAMA_HOST") ?? "http://localhost:11434"}/v1`, key: env("OLLAMA_HOST") },
];

async function main() {
  for (const e of ENDPOINTS) {
    if (!e.p.available()) {
      console.log(`\n${e.p.name}  — not configured`);
      continue;
    }
    const models = await listModels({ name: e.p.name, baseUrl: e.base, apiKey: e.key, extraHeaders: e.headers });
    if (models.length === 0) {
      console.log(`\n${e.p.name}  — no /models endpoint, or it refused`);
      continue;
    }
    console.log(`\n${e.p.name}  (${models.length} usable, best first)`);
    for (const m of models.slice(0, 8)) console.log(`   ${m}`);
    console.log(`   → pin with ${e.p.name.toUpperCase()}_MODEL=${models[0]}`);
  }
  console.log("\nThe pipeline resolves these automatically when a configured slug is gone,");
  console.log("so pinning is optional — do it only when you want one specific model.\n");
}

main();
