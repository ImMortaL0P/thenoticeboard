// Fetching of HTML and PDF pages for the scraper, with timeouts and a PDF size cap.

import pdfParse from "pdf-parse";

const UA = process.env.SCRAPE_USER_AGENT ?? "thenoticeboard-crawler (+notice checker; contact admin)";
const MAX_PDF_BYTES = 4 * 1024 * 1024; // 4 MB safety cap

export class FetchError extends Error {}

export async function fetchPdfText(url: string, timeoutMs = 30000): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "user-agent": UA, accept: "application/pdf" },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new FetchError(`fetch ${url}: ${err instanceof Error ? err.message : err}`);
  }
  if (!res.ok) throw new FetchError(`HTTP ${res.status} for PDF ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_PDF_BYTES) throw new FetchError(`PDF too large (${buf.length} bytes): ${url}`);
  const data = await pdfParse(buf);
  return (data.text ?? "").trim();
}

/** Fetch an HTML page; if the content-type is a PDF, parse it as text instead. */
export async function fetchHtml(url: string, timeoutMs = 20000): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,application/pdf" },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    throw new FetchError(`fetch ${url}: ${err instanceof Error ? err.message : err}`);
  }
  if (!res.ok) throw new FetchError(`HTTP ${res.status} for ${url}`);
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("pdf")) return fetchPdfText(url, timeoutMs);
  return res.text();
}