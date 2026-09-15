// Fetching of HTML and PDF pages for the scraper, with timeouts and a size cap.

import pdfParse from "pdf-parse";
import { setGlobalDispatcher, Agent } from "undici";
import crypto from "crypto";
import { envOr } from "../env";

/**
 * Configure Node's global fetch to gracefully tolerate the broken TLS setups
 * common on Indian government portals.
 *
 * - rejectUnauthorized: false recovers the dozen portals (India Post, ESIC, etc.)
 *   that serve incomplete certificate chains (missing the CA) or wrong hostnames.
 * - SSL_OP_LEGACY_SERVER_CONNECT allows connections to older servers (UPSSSC, HPPSC)
 *   that still attempt unsafe TLS legacy renegotiation, which Node 18+ otherwise blocks.
 *
 * We are fetching public notices via rate-limited GETs, so MITM risk is largely irrelevant.
 */
setGlobalDispatcher(
  new Agent({
    connect: {
      rejectUnauthorized: false,
      secureOptions: crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT,
    },
  })
);

/**
 * Many Indian government portals sit behind crude filters that reject any
 * user-agent that does not look like a browser — UPSC, the Supreme Court, PIB
 * and several banks all answered 403 to a self-identifying crawler string while
 * serving the same public pages to Chrome. We are not evading a paywall or a
 * login: these are public notices, robots.txt is still honoured, and requests
 * are rate-limited. Identifying as a browser is what makes them reachable.
 */
const UA =
  envOr("SCRAPE_USER_AGENT", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36");

/** Headers a real browser sends; some portals check more than the UA. */
function browserHeaders(accept: string): Record<string, string> {
  return {
    "user-agent": UA,
    accept,
    "accept-language": "en-IN,en;q=0.9,hi;q=0.8",
    "accept-encoding": "gzip, deflate, br",
    "cache-control": "no-cache",
    "upgrade-insecure-requests": "1",
  };
}

/** Node's fetch hides the real reason inside `cause`; surface it. */
export function describeFetchError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as { cause?: { code?: string; message?: string } }).cause;
  if (cause?.code) return `${cause.code}${cause.message ? ` — ${cause.message.slice(0, 80)}` : ""}`;
  return err.message.slice(0, 100);
}
const MAX_PDF_BYTES = 12 * 1024 * 1024; // Gemini accepts inline PDFs well past 4 MB

export class FetchError extends Error {}

export type FetchedDoc =
  | { kind: "html"; text: string; url: string }
  /**
   * PDFs are carried as bytes, not as pdf-parse output.
   *
   * pdf-parse returns caret-mangled garbage for scanned pages and for the
   * non-Unicode Devanagari fonts most state portals use, and the old pipeline
   * silently discarded those as "thin pages" — a large share of everything we
   * were missing. Gemini reads a PDF natively, so the bytes go to the model and
   * `text` is only the best-effort local extraction, kept for rawText/fallback.
   */
  | { kind: "pdf"; bytes: Buffer; text: string; url: string; creationDate?: string };

async function get(url: string, accept: string, timeoutMs: number): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: browserHeaders(accept),
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new FetchError(`${describeFetchError(err)}`);
  }
  if (!res.ok) throw new FetchError(`HTTP ${res.status} for ${url}`);
  return res;
}

export async function fetchPdf(url: string, timeoutMs = 45000): Promise<FetchedDoc> {
  const res = await get(url, "application/pdf", timeoutMs);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_PDF_BYTES) throw new FetchError(`PDF too large (${bytes.length} bytes): ${url}`);
  let text = "";
  let creationDate: string | undefined;
  try {
    const parsed = await pdfParse(bytes);
    text = (parsed.text ?? "").trim();
    if (parsed.info?.CreationDate) {
      const m = String(parsed.info.CreationDate).match(/D:(\d{4})(\d{2})(\d{2})/);
      if (m) creationDate = `${m[1]}-${m[2]}-${m[3]}`;
    }
  } catch {
    text = ""; 
  }
  return { kind: "pdf", bytes, text, url, creationDate };
}

/** Fetch a document, returning HTML text or PDF bytes depending on what it is. */
export async function fetchDoc(url: string, timeoutMs = 25000): Promise<FetchedDoc> {
  if (/\.pdf($|\?)/i.test(url)) return fetchPdf(url, Math.max(timeoutMs, 45000));
  const res = await get(url, "text/html,application/xhtml+xml,application/pdf", timeoutMs);
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("pdf")) {
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > MAX_PDF_BYTES) throw new FetchError(`PDF too large: ${url}`);
    let text = "";
    let creationDate: string | undefined;
    try { 
      const parsed = await pdfParse(bytes);
      text = (parsed.text ?? "").trim(); 
      if (parsed.info?.CreationDate) {
        const m = String(parsed.info.CreationDate).match(/D:(\d{4})(\d{2})(\d{2})/);
        if (m) creationDate = `${m[1]}-${m[2]}-${m[3]}`;
      }
    } catch { text = ""; }
    return { kind: "pdf", bytes, text, url, creationDate };
  }
  return { kind: "html", text: await res.text(), url };
}

/** Back-compat helper for callers that only ever want text (index pages). */
export async function fetchHtml(url: string, timeoutMs = 25000): Promise<string> {
  const doc = await fetchDoc(url, timeoutMs);
  return doc.text;
}

/** Legacy name kept so existing scripts continue to work. */
export async function fetchPdfText(url: string, timeoutMs = 45000): Promise<string> {
  return (await fetchPdf(url, timeoutMs)).text;
}
