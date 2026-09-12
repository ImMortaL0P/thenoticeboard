import { extractFromText, type NoticeDraft } from "../extract";

const AI_PROMPT = `You are a recruitment extraction expert for the Indian job market. You are given the raw text of a government/PSU/banking job notification.
Extract the following exact fields as JSON. For missing fields write null.
- title: clear job title (e.g., 'UPSC Civil Services 2026', 'SBI Junior Associate')
- advertisementNo: the specific advert identifier
- totalVacancies: integer of all posts advertised, or null if unstated
- minQualification: EXACTLY ONE of: "10th", "12th", "diploma", "graduate", "engineering", "postgraduate", "phd", or "any"
- minAge: integer (general category lowest bound)
- maxAge: integer (general category maximum bound without relaxations)
- feeGeneral: integer amount in INR for general category
- feeReserved: integer amount in INR for SC/ST category
- applyStart: date string as 'YYYY-MM-DD'
- applyLast: date string as 'YYYY-MM-DD' (closing date)
- notificationDate: date string as 'YYYY-MM-DD' (date of issue)
- summary: a short 2-3 sentence overview describing the recruitment
- payLevel: string (e.g. 'Level 7', '₹44,900-1,42,400', 'Pay Matrix Level 10')
- selectionProcess: short string (e.g., 'Written test & Interview', 'CBT only')
- experienceRequiredYears: integer years of prior experience required (0 if none)

IMPORTANT: RESPOND ONLY WITH RAW JSON. NO MARKDOWN. NO CODE BLOCKS. JUST VALID JSON.`;

async function callGemini(key: string, text: string): Promise<NoticeDraft> {
  // Gemini 1.5 Flash via REST API (which supports 1M context, we send ~10k chars)
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: AI_PROMPT + "\n\nTEXT:\n" + text.slice(0, 40000) }]
      }],
      generationConfig: {
        responseMimeType: "application/json",
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini Error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error("No content generated");
  return JSON.parse(content);
}

async function callGroq(key: string, text: string): Promise<NoticeDraft> {
  // Groq standard OpenAI-compatible completions
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: AI_PROMPT },
        { role: "user", content: text.slice(0, 16000) }
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`Groq Error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("No content generated");
  return JSON.parse(content);
}

async function callAnthropic(key: string, text: string): Promise<NoticeDraft> {
  const model = process.env.ANTHROPIC_MODEL || "claude-3-haiku-20240307";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: AI_PROMPT,
      messages: [
        { role: "user", content: text.slice(0, 40000) }
      ],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic Error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const content = data.content?.[0]?.text;
  // Usually it might output JSON in codeblock, strip it
  const clean = content.replace(/```json/g, "").replace(/```/g, "").trim();
  return JSON.parse(clean);
}

async function callOpenAI(key: string, text: string): Promise<NoticeDraft> {
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: AI_PROMPT },
        { role: "user", content: text.slice(0, 40000) }
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI Error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  return JSON.parse(content);
}

/**
 * Extracts a NoticeDraft from raw text using AI, cascading through available API keys.
 * If all configured AI providers fail, it gracefully falls back to Regex-based `extractFromText`.
 */
export async function autoExtract(rawText: string, linkText: string | null): Promise<{ draft: NoticeDraft, method: string }> {
  // Sanitize down to workable context sizes
  const text = rawText.replace(/\s+/g, ' ').trim();

  const rulesFallback = () => ({ draft: extractFromText(text, linkText), method: "rules" });

  if (text.length < 50) {
    return rulesFallback();
  }

  // Chain: Gemini -> Groq -> OpenAI -> Anthropic
  if (process.env.GEMINI_API_KEY) {
    try {
      const draft = await callGemini(process.env.GEMINI_API_KEY, text);
      return { draft, method: "ai-gemini" };
    } catch (e) {
      console.warn("Gemini extraction failed, failing over...", e instanceof Error ? e.message : String(e));
    }
  }

  if (process.env.GROQ_API_KEY) {
    try {
      const draft = await callGroq(process.env.GROQ_API_KEY, text);
      return { draft, method: "ai-groq" };
    } catch (e) {
      console.warn("Groq extraction failed, failing over...", e instanceof Error ? e.message : String(e));
    }
  }

  if (process.env.OPENAI_API_KEY) {
    try {
      const draft = await callOpenAI(process.env.OPENAI_API_KEY, text);
      return { draft, method: "ai-openai" };
    } catch (e) {
      console.warn("OpenAI extraction failed, failing over...", e instanceof Error ? e.message : String(e));
    }
  }

  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const draft = await callAnthropic(process.env.ANTHROPIC_API_KEY, text);
      return { draft, method: "ai-anthropic" };
    } catch (e) {
      console.warn("Anthropic extraction failed, failing over...", e instanceof Error ? e.message : String(e));
    }
  }

  // Ultimate Failsafe - runs natively on device without AI
  return rulesFallback();
}
