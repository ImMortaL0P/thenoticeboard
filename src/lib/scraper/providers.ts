// Extraction providers.
//
// The pipeline must not depend on one vendor being up. Gemini returns 503
// "high demand" often enough — and, per Google's own developer forum, on the
// PAID tier too — that a single-provider design silently degrades to regex
// during every busy period, which is exactly when new notices appear.
//
// Each provider gets the same job: read a notice (as PDF bytes where possible)
// and return JSON matching one schema, with categories constrained to values
// that already exist in our database. They differ only in how that constraint
// is expressed: Gemini uses responseSchema, OpenAI json_schema strict mode,
// Anthropic a forced tool call.

import { SECTORS, QUALIFICATIONS, NOTICE_TYPES } from "../domain";
import { env, envNum, envOr } from "../env";

export const UNKNOWN = "unknown";

export type ProviderInput = {
  text: string;
  pdf?: { bytes: Buffer } | null;
  orgChoices: { shortName: string; name: string }[];
};

export class ProviderError extends Error {
  constructor(message: string, readonly status: number, readonly provider: string) {
    super(message);
  }
}

/**
 * A 429 means two very different things.
 *
 *   Rate limited  — too many requests per minute. Waiting seconds fixes it.
 *   Quota exhausted — the daily/free allowance is gone. Waiting seconds does
 *                     nothing; only billing or a new day fixes it.
 *
 * Retrying the second kind is what turns an exhausted key into a pipeline that
 * appears to hang: four attempts and ~23s of backoff burned per document, for a
 * call that cannot succeed.
 */
export function isQuotaExhausted(err: unknown): boolean {
  if (!(err instanceof ProviderError) || err.status !== 429) return false;
  return /quota|billing|exceeded your current quota|insufficient_quota|credit/i.test(err.message);
}

/**
 * Nothing is listening at all — the host is down, refused the connection, or
 * does not resolve.
 *
 * This is NOT a transient overload. A local Ollama that is not running will
 * refuse every connection for the whole run, and retrying it four times with
 * backoff burns ~23 seconds per document to learn what the first failure
 * already told us. Treated as "this provider is not here", and skipped.
 */
export function isUnreachable(err: unknown): boolean {
  if (!(err instanceof ProviderError)) return false;
  if (err.status !== 0) return false;
  return /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ECONNRESET|socket hang up|other side closed/i.test(err.message);
}

/** 5xx and rate-limit 429s are load, not a bad request — worth retrying. */
export function isTransient(err: unknown): boolean {
  if (!(err instanceof ProviderError)) return false;
  if (isQuotaExhausted(err) || isUnreachable(err)) return false;
  return err.status === 429 || (err.status >= 500 && err.status < 600) || err.status === 0;
}

export function buildPrompt(orgChoices: { shortName: string; name: string }[]): string {
  const list = orgChoices.map((o) => `  ${o.shortName} = ${o.name}`).join("\n");
  return `You extract structured data from Indian government, PSU, banking and railway recruitment notifications.

Return ONE JSON object matching the schema. Rules you must not break:

ORGANISATION
- "organizationShortName" MUST be one of the codes below, or "${UNKNOWN}".
- Choose the body that CONDUCTS the recruitment, not the post, wing, circle or
  exam. "SBI Trade Finance Officer" and "SBI SCO Wealth" are both SBI.
  "SSC CHSL" and "SSC CGL" are both SSC.
- If the conducting body is not listed, return "${UNKNOWN}". Never invent a code.
- "organizationNameRaw" is the body's name exactly as printed on the document.

Allowed organisation codes:
${list}

CATEGORIES
- "sector", "minQualification" and "noticeType" must be exactly one of their
  allowed values, or "${UNKNOWN}".
- "noticeType" is "entrance_exam" for a national entrance or eligibility test
  (UGC-NET, CSIR-NET, CAT, XAT, CUET, GATE, CLAT, NEET, INI-CET, JEE and the
  like) and "recruitment" for anything advertising posts to be filled. An
  entrance exam has no vacancies, advertisement number or pay level — return
  null for those rather than inventing them.

VALUES
- Dates are strict "YYYY-MM-DD". If a date is not stated, return null — never guess.
- Money is a plain integer of rupees; free is 0.
- "totalVacancies" is the sum across all posts in this advertisement. If the
  document advertises no posts, return null, not 0.
- Return null for anything the document does not state. A wrong value is far
  worse than a missing one: missing fields get filled by a reviewer, wrong ones
  get published.`;
}

const STR_FIELDS = [
  "organizationNameRaw", "title", "advertisementNo", "applyStart", "applyLast",
  "notificationDate", "summary", "payLevel", "selectionProcess", "applyUrl",
  "officialNotificationPdfUrl",
] as const;
const INT_FIELDS = [
  "totalVacancies", "minAge", "maxAge", "feeGeneral", "feeReserved", "experienceRequiredYears",
] as const;

/** Standard JSON Schema — used by OpenAI (strict) and Anthropic (tool input). */
export function jsonSchema(orgChoices: { shortName: string; name: string }[]) {
  const properties: Record<string, unknown> = {
    organizationShortName: { type: "string", enum: [...orgChoices.map((o) => o.shortName), UNKNOWN] },
    sector: { type: "string", enum: [...SECTORS, UNKNOWN] },
    noticeType: { type: "string", enum: [...NOTICE_TYPES, UNKNOWN] },
    minQualification: { type: "string", enum: [...QUALIFICATIONS, "any", UNKNOWN] },
    postNames: { type: ["array", "null"], items: { type: "string" } },
  };
  for (const f of STR_FIELDS) properties[f] = { type: ["string", "null"] };
  for (const f of INT_FIELDS) properties[f] = { type: ["integer", "null"] };
  return {
    type: "object",
    properties,
    // OpenAI strict mode requires every property listed as required; nullability
    // is expressed in the type union above, not by omission.
    required: [
      "organizationShortName", "sector", "noticeType", "minQualification", "postNames",
      ...STR_FIELDS, ...INT_FIELDS,
    ],
    additionalProperties: false,
  };
}

/** Gemini's dialect of the same schema. */
export function geminiSchema(orgChoices: { shortName: string; name: string }[]) {
  const properties: Record<string, unknown> = {
    organizationShortName: { type: "STRING", enum: [...orgChoices.map((o) => o.shortName), UNKNOWN] },
    sector: { type: "STRING", enum: [...SECTORS, UNKNOWN] },
    noticeType: { type: "STRING", enum: [...NOTICE_TYPES, UNKNOWN] },
    minQualification: { type: "STRING", enum: [...QUALIFICATIONS, "any", UNKNOWN] },
    postNames: { type: "ARRAY", items: { type: "STRING" }, nullable: true },
  };
  for (const f of STR_FIELDS) properties[f] = { type: "STRING", nullable: true };
  for (const f of INT_FIELDS) properties[f] = { type: "INTEGER", nullable: true };
  return {
    type: "OBJECT",
    properties,
    required: ["organizationShortName", "sector", "noticeType", "minQualification", "title"],
  };
}

export type Provider = {
  name: string;
  /** Configured and usable right now. */
  available: () => boolean;
  /** Can read a PDF without local text extraction. */
  readsPdf: boolean;
  call: (input: ProviderInput) => Promise<Record<string, unknown>>;
};

const TEXT_CAP = 120_000;

/**
 * Per-call ceiling. 120s was too generous: three providers × four attempts each
 * could silently occupy 20+ minutes on one document. A model that has not
 * answered in a minute is not about to.
 */
export const CALL_TIMEOUT_MS = envNum("EXTRACT_TIMEOUT_MS", 60_000);

/**
 * Above this size a PDF is not sent inline, even when its text layer is poor.
 *
 * Free tiers are metered in tokens, not requests, and a 12MB scanned PDF can be
 * tens of thousands of tokens — a handful of them exhausts a day's allowance.
 * Sending the local text instead is worse extraction on one document; sending
 * the PDF is no extraction at all on the fifty that follow.
 */
export const MAX_PDF_INLINE_BYTES = envNum("MAX_PDF_INLINE_BYTES", 4 * 1024 * 1024);

/**
 * Model slugs rot.
 *
 * Every hardcoded default in this file will be retired by its provider sooner
 * or later — Groq, Cerebras and OpenRouter each dropped a llama-3.3 slug within
 * months. Rather than guess again, a provider that answers "model not found"
 * asks its own /models endpoint what it actually serves, picks the best match
 * and retries. The configured default becomes a hint, not a hard dependency.
 */
const resolvedModels = new Map<string, string>();

function modelNotFound(status: number, body: string): boolean {
  if (status !== 404 && status !== 400) return false;
  return /model_not_found|does not exist|model.{0,20}unavailable|invalid_model|no models provided|unknown model/i.test(body);
}

/**
 * Score a model slug for "can it follow a JSON schema over a long document".
 *
 * Prefers instruction-tuned chat models at a useful size, and rejects anything
 * that is not a text generator at all — an embedding or speech model answering
 * a chat request fails in confusing ways.
 */
function scoreModel(id: string): number {
  const m = id.toLowerCase();
  if (/embed|whisper|tts|speech|rerank|guard|moderat|vision|image|diffus|bge|clip/.test(m)) return -1;
  let score = 0;
  if (/instruct|chat|-it\b/.test(m)) score += 30;
  if (/llama|qwen|mistral|gemma|deepseek|gpt|phi|command/.test(m)) score += 20;
  // Bigger is better for instruction-following, up to a point.
  const size = m.match(/(\d{1,3})\s*b\b/);
  if (size) {
    const b = Number(size[1]);
    score += b >= 200 ? 22 : b >= 60 ? 25 : b >= 20 ? 18 : b >= 7 ? 12 : 4;
  }
  if (/:free\b|free/.test(m)) score += 15;  // free variants matter on paid-tier routers
  if (/preview|alpha|beta|experimental|deprecated/.test(m)) score -= 12;
  if (/nano|tiny|mini|1b\b|0\.5b/.test(m)) score -= 6;
  return score;
}

/** Ask a provider what it currently serves, best candidate first. */
export async function listModels(cfg: { name: string; baseUrl: string; apiKey?: string; extraHeaders?: Record<string, string> }): Promise<string[]> {
  try {
    const res = await fetch(`${cfg.baseUrl}/models`, {
      headers: {
        ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
        ...(cfg.extraHeaders ?? {}),
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const ids: string[] = (data.data ?? data.models ?? [])
      .map((m: { id?: string; name?: string }) => m.id ?? m.name)
      .filter((x: unknown): x is string => typeof x === "string");
    return ids
      .map((id) => ({ id, score: scoreModel(id) }))
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.id);
  } catch {
    return [];
  }
}

/** Model calls made this process, for the run summary. */
export const usage = { calls: 0, byProvider: {} as Record<string, number> };
export function countCall(provider: string) {
  usage.calls++;
  usage.byProvider[provider] = (usage.byProvider[provider] ?? 0) + 1;
}

// ---------------------------------------------------------------- Gemini ----

export const gemini: Provider = {
  name: "gemini",
  readsPdf: true,
  available: () => !!env("GEMINI_API_KEY"),
  async call(input) {
    // Pin a concrete version rather than a "-latest" alias: aliases point at the
    // newest model, which is also the most contended.
    const model = envOr("GEMINI_MODEL", "gemini-flash-latest");
    const parts: unknown[] = [];
    if (input.pdf) {
      parts.push({ inline_data: { mime_type: "application/pdf", data: input.pdf.bytes.toString("base64") } });
    } else {
      parts.push({ text: `DOCUMENT:\n${input.text.slice(0, TEXT_CAP)}` });
    }
    parts.push({ text: buildPrompt(input.orgChoices) });

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env("GEMINI_API_KEY")}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
            responseSchema: geminiSchema(input.orgChoices),
          },
        }),
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      },
    ).catch((e) => {
      throw new ProviderError(String(e), 0, "gemini");
    });
    if (!res.ok) throw new ProviderError((await res.text()).slice(0, 200), res.status, "gemini");
    const data = await res.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) throw new ProviderError("no content", 0, "gemini");
    return JSON.parse(content);
  },
};

// ------------------------------------------------------------- Anthropic ----

export const anthropic: Provider = {
  name: "anthropic",
  readsPdf: true,
  available: () => !!env("ANTHROPIC_API_KEY"),
  async call(input) {
    countCall("anthropic");
    const model = envOr("ANTHROPIC_MODEL", "claude-sonnet-4-5");
    const content: unknown[] = [];
    if (input.pdf) {
      content.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: input.pdf.bytes.toString("base64") },
      });
    } else {
      content.push({ type: "text", text: `DOCUMENT:\n${input.text.slice(0, TEXT_CAP)}` });
    }
    content.push({ type: "text", text: buildPrompt(input.orgChoices) });

    // A forced tool call is how the schema is enforced: the model cannot reply
    // with prose, only with arguments matching input_schema.
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env("ANTHROPIC_API_KEY")!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        temperature: 0,
        tools: [{ name: "record_notice", description: "Record the extracted notice fields.", input_schema: jsonSchema(input.orgChoices) }],
        tool_choice: { type: "tool", name: "record_notice" },
        messages: [{ role: "user", content }],
      }),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    }).catch((e) => {
      throw new ProviderError(String(e), 0, "anthropic");
    });
    if (!res.ok) throw new ProviderError((await res.text()).slice(0, 200), res.status, "anthropic");
    const data = await res.json();
    const block = (data.content ?? []).find((c: { type?: string }) => c.type === "tool_use");
    if (!block?.input) throw new ProviderError("no tool_use block", 0, "anthropic");
    return block.input as Record<string, unknown>;
  },
};

// ------------------------------------------------- OpenAI-compatible tier ----

/**
 * Most free providers speak the OpenAI chat-completions dialect, so one
 * implementation covers all of them and adding another is three lines of
 * config. None of these read PDFs, which is fine: the text-first policy in
 * ai.ts means a PDF only goes to a model when its text layer is unusable, and
 * Gemini/Anthropic handle that case.
 *
 * Between them these free tiers are worth roughly 30,000 requests a day, which
 * is two orders of magnitude more than this pipeline needs. The point is not
 * volume, it is that no single vendor's bad afternoon stops the board updating.
 */
function openAiCompatible(cfg: {
  name: string;
  envKey: string;
  baseUrl: string | (() => string);
  defaultModel: string;
  modelEnv: string;
  /** Strict json_schema support; false falls back to json_object + prompt. */
  jsonSchema?: boolean;
  extraHeaders?: Record<string, string>;
  /**
   * Usable with no key at all. A couple of endpoints serve an anonymous tier at
   * a lower rate limit, which makes them worth keeping in the chain for someone
   * who has not signed up for anything — a key only raises the ceiling.
   */
  anonymousOk?: boolean;
}): Provider {
  return {
    name: cfg.name,
    readsPdf: false,
    available: () => !!env(cfg.envKey) || !!cfg.anonymousOk,
    async call(input) {
      countCall(cfg.name);
      const model = envOr(cfg.modelEnv, cfg.defaultModel);
      const base = typeof cfg.baseUrl === "function" ? cfg.baseUrl() : cfg.baseUrl;
      const schema = jsonSchema(input.orgChoices);
      const responseFormat = cfg.jsonSchema
        ? { type: "json_schema", json_schema: { name: "notice", strict: true, schema } }
        : { type: "json_object" };
      const system = cfg.jsonSchema
        ? buildPrompt(input.orgChoices)
        : `${buildPrompt(input.orgChoices)}\n\nReturn JSON with exactly these keys: ${Object.keys(
            (schema as { properties: Record<string, unknown> }).properties,
          ).join(", ")}.`;

      const send = (useModel: string) =>
        fetch(`${base}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // Anonymous tiers reject a malformed Authorization header, so it is
            // sent only when a key actually exists.
            ...(env(cfg.envKey) ? { Authorization: `Bearer ${env(cfg.envKey)}` } : {}),
            ...(cfg.extraHeaders ?? {}),
          },
          body: JSON.stringify({
            model: useModel,
            temperature: 0,
            response_format: responseFormat,
            messages: [
              { role: "system", content: system },
              { role: "user", content: input.text.slice(0, 40_000) },
            ],
          }),
          signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
        }).catch((e) => {
          throw new ProviderError(String(e), 0, cfg.name);
        });

      const chosen = resolvedModels.get(cfg.name) ?? model;
      let res = await send(chosen);

      // The slug is gone. Ask the provider what it serves today, take the best
      // candidate, and remember it for the rest of this process.
      if (!res.ok) {
        const body = await res.text();
        if (modelNotFound(res.status, body) && !resolvedModels.has(cfg.name)) {
          const candidates = await listModels({
            name: cfg.name,
            baseUrl: base,
            apiKey: env(cfg.envKey),
            extraHeaders: cfg.extraHeaders,
          });
          for (const candidate of candidates.slice(0, 3)) {
            if (candidate === chosen) continue;
            const retry = await send(candidate);
            if (retry.ok) {
              console.warn(`  ${cfg.name}: "${chosen}" is no longer served — using "${candidate}"`);
              resolvedModels.set(cfg.name, candidate);
              res = retry;
              break;
            }
          }
        }
        if (!res.ok) throw new ProviderError(body.slice(0, 200), res.status, cfg.name);
      }

      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new ProviderError("no content", 0, cfg.name);
      return JSON.parse(content);
    },
  };
}

/** 30 RPM · 14,400/day · no card. Fastest of the free tiers. */
export const groq = openAiCompatible({
  name: "groq", envKey: "GROQ_API_KEY", modelEnv: "GROQ_MODEL",
  baseUrl: "https://api.groq.com/openai/v1", defaultModel: "llama-3.3-70b-versatile",
});

/** 30 RPM · 14,400/day · 60k TPM · no card. */
export const cerebras = openAiCompatible({
  name: "cerebras", envKey: "CEREBRAS_API_KEY", modelEnv: "CEREBRAS_MODEL",
  baseUrl: "https://api.cerebras.ai/v1", defaultModel: "llama-3.3-70b",
});

/** ~1 req/sec · 1B tokens a month · no card. The most generous by token volume. */
export const mistral = openAiCompatible({
  name: "mistral", envKey: "MISTRAL_API_KEY", modelEnv: "MISTRAL_MODEL",
  baseUrl: "https://api.mistral.ai/v1", defaultModel: "mistral-small-latest",
});

/** 20 RPM · 200/day · no card. Routes to several open models. */
export const openrouter = openAiCompatible({
  name: "openrouter", envKey: "OPENROUTER_API_KEY", modelEnv: "OPENROUTER_MODEL",
  baseUrl: "https://openrouter.ai/api/v1", defaultModel: "meta-llama/llama-3.3-70b-instruct:free",
  extraHeaders: { "HTTP-Referer": envOr("SITE_URL", "https://thenoticeboard.in"), "X-Title": "thenoticeboard" },
});

/** 10-15 RPM · 50-150/day · free with any GitHub account. Small but high quality. */
export const githubModels = openAiCompatible({
  name: "github", envKey: "GITHUB_MODELS_TOKEN", modelEnv: "GITHUB_MODELS_MODEL",
  baseUrl: "https://models.inference.ai.azure.com", defaultModel: "gpt-4o-mini", jsonSchema: true,
});

/** 40 RPM · no card · 100+ models including large open-weight ones. */
export const nvidia = openAiCompatible({
  name: "nvidia", envKey: "NVIDIA_API_KEY", modelEnv: "NVIDIA_MODEL",
  baseUrl: "https://integrate.api.nvidia.com/v1", defaultModel: "meta/llama-3.3-70b-instruct",
});

/**
 * Works with NO account: OVH serves an anonymous tier at a reduced rate limit,
 * so this provider is live out of the box. Setting OVH_AI_TOKEN (OVHcloud
 * control panel -> Public Cloud -> AI Endpoints -> API keys) raises the ceiling
 * to ~400 RPM, but is not required to start.
 */
export const ovh = openAiCompatible({
  name: "ovh", envKey: "OVH_AI_TOKEN", modelEnv: "OVH_MODEL",
  baseUrl: "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1",
  defaultModel: "Meta-Llama-3_3-70B-Instruct",
  anonymousOk: true,
});

/** 300 requests/hour on a free Hugging Face account. */
export const huggingface = openAiCompatible({
  name: "huggingface", envKey: "HF_TOKEN", modelEnv: "HF_MODEL",
  baseUrl: "https://router.huggingface.co/v1", defaultModel: "meta-llama/Llama-3.3-70B-Instruct",
});

/** 20 RPM on Cohere's free trial keys, via their OpenAI-compatible endpoint. */
export const cohere = openAiCompatible({
  name: "cohere", envKey: "COHERE_API_KEY", modelEnv: "COHERE_MODEL",
  baseUrl: "https://api.cohere.ai/compatibility/v1", defaultModel: "command-r-08-2024",
});

/** Free while in beta, EU-hosted. */
export const scaleway = openAiCompatible({
  name: "scaleway", envKey: "SCALEWAY_API_KEY", modelEnv: "SCALEWAY_MODEL",
  baseUrl: "https://api.scaleway.ai/v1", defaultModel: "llama-3.3-70b-instruct",
});

export const sambanova = openAiCompatible({
  name: "sambanova", envKey: "SAMBANOVA_API_KEY", modelEnv: "SAMBANOVA_MODEL",
  baseUrl: "https://api.sambanova.ai/v1", defaultModel: "Meta-Llama-3.3-70B-Instruct",
});

export const together = openAiCompatible({
  name: "together", envKey: "TOGETHER_API_KEY", modelEnv: "TOGETHER_MODEL",
  baseUrl: "https://api.together.xyz/v1", defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo-Free",
});

/**
 * 10,000 neurons/day. The account id is part of the URL, so both it and the
 * token must be set for this provider to be considered available.
 */
export const cloudflare: Provider = {
  ...openAiCompatible({
    name: "cloudflare", envKey: "CLOUDFLARE_API_TOKEN", modelEnv: "CLOUDFLARE_MODEL",
    baseUrl: () => `https://api.cloudflare.com/client/v4/accounts/${env("CLOUDFLARE_ACCOUNT_ID")}/ai/v1`,
    defaultModel: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  }),
  available: () => !!env("CLOUDFLARE_API_TOKEN") && !!env("CLOUDFLARE_ACCOUNT_ID"),
};

/**
 * 30 RPM with no signup at all — useful as a last-ditch fallback, but it is an
 * anonymous shared endpoint, so it sits at the end of the chain and is best
 * treated as "better than nothing" rather than dependable.
 */
export const llm7 = openAiCompatible({
  name: "llm7", envKey: "LLM7_API_KEY", modelEnv: "LLM7_MODEL",
  baseUrl: "https://api.llm7.io/v1", defaultModel: "gpt-4.1-nano-2025-04-14",
  anonymousOk: true,
});

/**
 * Ollama running on your own machine. No key, no quota, no network — the only
 * provider here that cannot run out. Slower and weaker than the hosted models,
 * but for pulling labelled dates and numbers out of text a local 7B is often
 * enough, and it makes a backfill run free and unlimited.
 *
 * Set OLLAMA_HOST to enable, e.g. OLLAMA_HOST=http://localhost:11434
 */
export const ollama: Provider = {
  ...openAiCompatible({
    name: "ollama", envKey: "OLLAMA_HOST", modelEnv: "OLLAMA_MODEL",
    baseUrl: () => `${envOr("OLLAMA_HOST", "http://localhost:11434")}/v1`,
    defaultModel: "noticeboard",
  }),
  available: () => !!env("OLLAMA_HOST"),
};

/** Paid. Last in the chain, and only runs if a key is actually set. */
export const openai = openAiCompatible({
  name: "openai", envKey: "OPENAI_API_KEY", modelEnv: "OPENAI_MODEL",
  baseUrl: "https://api.openai.com/v1", defaultModel: "gpt-4o-mini", jsonSchema: true,
});

/**
 * Order is deliberate: Gemini first (cheapest, reads PDFs), Anthropic second
 * (also reads PDFs, so a scanned notice still gets read when Gemini is down),
 * OpenAI last on the text path. Override with EXTRACT_PROVIDERS="gemini,openai".
 */
export function providerChain(): Provider[] {
  const all: Record<string, Provider> = {
    gemini, groq, cerebras, mistral, nvidia, ovh, sambanova, together, scaleway,
    huggingface, cohere, cloudflare, openrouter, github: githubModels, llm7,
    ollama, anthropic, openai,
  };
  // Gemini first (reads PDFs, cheapest), then the free text tiers in descending
  // order of daily allowance, then the paid ones if keys exist.
  const configured = (env("EXTRACT_PROVIDERS") ??
    [
      "gemini",                                    // reads PDFs, cheapest
      "groq", "cerebras", "ovh", "nvidia",         // fastest / largest free allowances
      "mistral", "sambanova", "together", "scaleway",
      "huggingface", "cohere", "cloudflare",
      "openrouter", "github",                      // small daily caps, keep late
      "ollama",                                    // local, unlimited, slower
      "llm7",                                      // anonymous shared endpoint
      "anthropic", "openai",                       // paid, only if keys exist
    ].join(","))
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return configured.map((n) => all[n]).filter((p): p is Provider => !!p && p.available());
}
