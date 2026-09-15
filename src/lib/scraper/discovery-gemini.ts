// Gemini-backed discovery: a safety net, not a source of truth.
//
// The model is used for exactly one thing — proposing URLs of recruitment
// notifications we may not have seen. Whatever it says *about* a notice is
// discarded. Every URL it returns is then fetched and extracted through the
// normal pipeline, so the official document remains the only thing we publish
// from. That separation is what makes an autonomous loop safe to run: a
// hallucinated deadline cannot reach the board, because the model's prose is
// never stored.

const MODEL = process.env.GEMINI_DISCOVERY_MODEL ?? "gemini-flash-latest";

export type Candidate = { url: string; title: string | null };

const DISCOVERY_PROMPT = `List official Indian government, PSU, banking, railway, defence and state
public service commission recruitment notifications whose applications are CURRENTLY OPEN or opened
in the last 21 days.

For each, give the URL of the official notification page or PDF on the conducting body's own domain
(gov.in, nic.in, or the body's official site). Do not return aggregator sites, coaching sites,
news articles, YouTube, Telegram, or job-portal listings.

Return at most 40 results. If you are not confident a URL is the official page, omit it.`;

/**
 * Ask Gemini, with Google Search grounding, for candidate notification URLs.
 *
 * Returns URLs only. Titles are kept purely as link text for the discovery
 * record — they are never written to a Notification.
 */
export async function discoverViaGemini(): Promise<Candidate[]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return [];

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: DISCOVERY_PROMPT }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0 },
      }),
      signal: AbortSignal.timeout(180_000),
    },
  );
  if (!res.ok) throw new Error(`Gemini discovery ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();

  const out = new Map<string, Candidate>();

  // Grounding metadata carries the URLs Search actually returned, which are far
  // more reliable than URLs written out in the model's prose.
  const chunks = data.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  for (const c of chunks) {
    const uri: string | undefined = c?.web?.uri;
    const title: string | undefined = c?.web?.title;
    if (uri && isPlausibleOfficial(uri)) out.set(uri, { url: uri, title: title ?? null });
  }

  // Plus any bare URLs in the text, filtered by the same rule.
  const text: string = data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join(" ") ?? "";
  for (const m of text.matchAll(/https?:\/\/[^\s)"'<>\]]+/g)) {
    const url = m[0].replace(/[.,;]+$/, "");
    if (isPlausibleOfficial(url) && !out.has(url)) out.set(url, { url, title: null });
  }

  return [...out.values()];
}

const BLOCKED_HOSTS =
  /(youtube|youtu\.be|facebook|twitter|x\.com|instagram|telegram|t\.me|whatsapp|linkedin|quora|reddit|blogspot|wordpress|medium|sarkariresult|freejobalert|adda247|testbook|jagranjosh|indiatoday|ndtv|timesofindia|hindustantimes)\./i;

/** Cheap guard so obviously-wrong candidates never cost us a fetch. */
export function isPlausibleOfficial(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (BLOCKED_HOSTS.test(host)) return false;
  // Grounding redirect URLs resolve to the real page on fetch, so allow them.
  if (host.endsWith("googleapis.com") || host.endsWith("google.com")) return true;
  return /\.(gov\.in|nic\.in|ac\.in|res\.in|edu\.in|org\.in|co\.in|com|in|net|org)$/.test(host);
}
