// Per-provider rate limiting.
//
// Free tiers are metered on requests per minute, requests per day and tokens
// per minute, and every one of them answers 429 rather than queueing. So the
// pipeline paces itself: each provider gets a token bucket sized to its
// published allowance, and a call waits for its turn rather than being fired
// and retried. Waiting two seconds is cheaper than a 429 plus backoff, and it
// keeps the daily allowance for work instead of spending it on rejections.

export type Limit = {
  /** Requests per minute. */
  rpm: number;
  /** Requests per day, if the provider caps one. */
  rpd?: number;
  /** Concurrent requests. Local models are one-at-a-time; hosted ones are not. */
  concurrency?: number;
};

/**
 * Published free-tier allowances, deliberately set slightly below the real
 * limits. Sitting exactly on a published number means every clock-skew or
 * retry pushes you over it.
 */
export const LIMITS: Record<string, Limit> = {
  gemini: { rpm: 12, rpd: 1_400 },
  groq: { rpm: 25, rpd: 14_000 },
  cerebras: { rpm: 25, rpd: 14_000 },
  mistral: { rpm: 50 },
  nvidia: { rpm: 35 },
  ovh: { rpm: 45 },
  sambanova: { rpm: 20 },
  together: { rpm: 20 },
  scaleway: { rpm: 20 },
  huggingface: { rpm: 4 },
  cohere: { rpm: 18 },
  cloudflare: { rpm: 20 },
  openrouter: { rpm: 18, rpd: 190 },
  github: { rpm: 10, rpd: 140 },
  llm7: { rpm: 25 },
  // Local: no quota, but one request at a time — a 7B on an Air will thrash if
  // two inferences compete for the same unified memory.
  ollama: { rpm: 600, concurrency: 1 },
  anthropic: { rpm: 45 },
  openai: { rpm: 45 },
};

type Bucket = { times: number[]; dayCount: number; dayStamp: string; active: number };
const buckets = new Map<string, Bucket>();

function todayKey(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

function bucketFor(provider: string): Bucket {
  let b = buckets.get(provider);
  if (!b) {
    b = { times: [], dayCount: 0, dayStamp: todayKey(), active: 0 };
    buckets.set(provider, b);
  }
  if (b.dayStamp !== todayKey()) {
    b.dayStamp = todayKey();
    b.dayCount = 0;
  }
  return b;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Has this provider used up its daily allowance? */
export function dailyExhausted(provider: string): boolean {
  const limit = LIMITS[provider];
  if (!limit?.rpd) return false;
  return bucketFor(provider).dayCount >= limit.rpd;
}

/**
 * Wait until this provider may be called, then record the call.
 *
 * Returns false when the provider's daily allowance is gone, so the caller can
 * move down the cascade instead of sleeping until midnight.
 */
export async function acquire(provider: string, signal?: { cancelled: boolean }): Promise<boolean> {
  const limit = LIMITS[provider] ?? { rpm: 15 };
  const b = bucketFor(provider);

  if (dailyExhausted(provider)) return false;

  // Concurrency gate.
  const maxActive = limit.concurrency ?? 4;
  while (b.active >= maxActive) {
    if (signal?.cancelled) return false;
    await sleep(250);
  }

  // Rolling one-minute window.
  for (;;) {
    const now = Date.now();
    b.times = b.times.filter((t) => now - t < 60_000);
    if (b.times.length < limit.rpm) break;
    const waitMs = 60_000 - (now - b.times[0]) + 50;
    if (signal?.cancelled) return false;
    await sleep(Math.min(waitMs, 5_000));
  }

  b.times.push(Date.now());
  b.dayCount++;
  b.active++;
  return true;
}

export function release(provider: string): void {
  const b = bucketFor(provider);
  b.active = Math.max(0, b.active - 1);
}

/** Human-readable state, for the run summary and the admin dashboard. */
export function limiterReport(): string {
  const rows: string[] = [];
  for (const [name, b] of buckets) {
    const limit = LIMITS[name];
    const daily = limit?.rpd ? ` · ${b.dayCount}/${limit.rpd} today` : "";
    rows.push(`${name} ${b.dayCount} call(s)${daily}`);
  }
  return rows.length ? rows.join(" | ") : "no provider calls yet";
}
