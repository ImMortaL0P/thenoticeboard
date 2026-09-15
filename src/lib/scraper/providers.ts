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

/** 5xx and rate-limit 429s are load, not a bad request — worth retrying. */
export function isTransient(err: unknown): boolean {
  if (!(err instanceof ProviderError)) return false;
  if (isQuotaExhausted(err)) return false;
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
export const CALL_TIMEOUT_MS = Number(process.env.EXTRACT_TIMEOUT_MS ?? 60_000);

/**
 * Above this size a PDF is not sent inline, even when its text layer is poor.
 *
 * Free tiers are metered in tokens, not requests, and a 12MB scanned PDF can be
 * tens of thousands of tokens — a handful of them exhausts a day's allowance.
 * Sending the local text instead is worse extraction on one document; sending
 * the PDF is no extraction at all on the fifty that follow.
 */
export const MAX_PDF_INLINE_BYTES = Number(process.env.MAX_PDF_INLINE_BYTES ?? 4 * 1024 * 1024);

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
  available: () => !!process.env.GEMINI_API_KEY,
  async call(input) {
    // Pin a concrete version rather than a "-latest" alias: aliases point at the
    // newest model, which is also the most contended.
    const model = process.env.GEMINI_MODEL ?? "gemini-flash-latest";
    const parts: unknown[] = [];
    if (input.pdf) {
      parts.push({ inline_data: { mime_type: "application/pdf", data: input.pdf.bytes.toString("base64") } });
    } else {
      parts.push({ text: `DOCUMENT:\n${input.text.slice(0, TEXT_CAP)}` });
    }
    parts.push({ text: buildPrompt(input.orgChoices) });

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
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
  available: () => !!process.env.ANTHROPIC_API_KEY,
  async call(input) {
    countCall("anthropic");
    const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5";
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
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
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
  baseUrl: string;
  defaultModel: string;
  modelEnv: string;
  /** Strict json_schema support; false falls back to json_object + prompt. */
  jsonSchema?: boolean;
  extraHeaders?: Record<string, string>;
}): Provider {
  return {
    name: cfg.name,
    readsPdf: false,
    available: () => !!process.env[cfg.envKey],
    async call(input) {
      countCall(cfg.name);
      const model = process.env[cfg.modelEnv] ?? cfg.defaultModel;
      const schema = jsonSchema(input.orgChoices);
      const responseFormat = cfg.jsonSchema
        ? { type: "json_schema", json_schema: { name: "notice", strict: true, schema } }
        : { type: "json_object" };
      const system = cfg.jsonSchema
        ? buildPrompt(input.orgChoices)
        : `${buildPrompt(input.orgChoices)}\n\nReturn JSON with exactly these keys: ${Object.keys(
            (schema as { properties: Record<string, unknown> }).properties,
          ).join(", ")}.`;

      const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env[cfg.envKey]}`,
          ...(cfg.extraHeaders ?? {}),
        },
        body: JSON.stringify({
          model,
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
      if (!res.ok) throw new ProviderError((await res.text()).slice(0, 200), res.status, cfg.name);
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
  extraHeaders: { "HTTP-Referer": process.env.SITE_URL ?? "https://thenoticeboard.in", "X-Title": "thenoticeboard" },
});

/** 10-15 RPM · 50-150/day · free with any GitHub account. Small but high quality. */
export const githubModels = openAiCompatible({
  name: "github", envKey: "GITHUB_MODELS_TOKEN", modelEnv: "GITHUB_MODELS_MODEL",
  baseUrl: "https://models.inference.ai.azure.com", defaultModel: "gpt-4o-mini", jsonSchema: true,
});

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
    gemini, groq, cerebras, mistral, openrouter, github: githubModels, anthropic, openai,
  };
  // Gemini first (reads PDFs, cheapest), then the free text tiers in descending
  // order of daily allowance, then the paid ones if keys exist.
  const configured = (process.env.EXTRACT_PROVIDERS ??
    "gemini,groq,cerebras,mistral,openrouter,github,anthropic,openai")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return configured.map((n) => all[n]).filter((p): p is Provider => !!p && p.available());
}
