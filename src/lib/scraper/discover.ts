// Link discovery for one source page.
//
// The original version gated every link on a single keyword regex over the link
// text plus URL. Real notices routinely fail that gate — a link reading
// "Advt. No. 05/2026" or a bare "Download" next to a PDF contains none of the
// keywords — which is a large part of why the board was missing postings. The
// include pattern is now a strong signal rather than the only door in.

import * as cheerio from "cheerio";

export type DiscoveredItem = {
  url: string;
  text: string | null;
  via: "keyword" | "pdf" | "advt";
  /**
   * When this URL was reached by following an aggregator, the aggregator page
   * it came from. `url` is always the official document; this is the trail.
   */
  discoveredVia?: string;
};

/** "Advt. No. 05/2026", "CEN 04/2026", "No. 3/1/2026-Estt" and friends. */
const ADVT_PATTERN =
  /\b(?:advt|advertisement|notice|cen|notification)\.?\s*(?:no\.?|number)?\s*[:.\-]?\s*\d+\s*[\/\-]\s*\d{2,4}|\b\d{1,3}\s*\/\s*20\d{2}\b/i;

export function discoverLinks(
  html: string,
  baseUrl: string,
  source: { linkSelector?: string | null; includePattern?: string | null; excludePattern?: string | null },
): DiscoveredItem[] {
  const $ = cheerio.load(html);
  const include = source.includePattern ? new RegExp(source.includePattern, "i") : null;
  const exclude = source.excludePattern ? new RegExp(source.excludePattern, "i") : null;

  let baseHost = "";
  try { baseHost = new URL(baseUrl).hostname.replace(/^www\./, ""); } catch { /* keep empty */ }

  const out: DiscoveredItem[] = [];
  const seen = new Set<string>();

  $(source.linkSelector || "a").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || /^(javascript:|mailto:|tel:|#)/i.test(href)) return;
    let abs: string;
    try { abs = new URL(href, baseUrl).href; } catch { return; }
    if (seen.has(abs)) return;

    const text = $(el).text().trim().replace(/\s+/g, " ").slice(0, 200) || null;
    const hay = `${text ?? ""} ${abs}`;

    // Exclusions still bind — they are what keeps results, syllabi and tenders out.
    if (exclude && exclude.test(hay.toLowerCase())) return;

    let via: DiscoveredItem["via"] | null = null;
    if (include && include.test(hay)) {
      via = "keyword";
    } else if (/\.pdf($|\?)/i.test(abs)) {
      // A PDF linked from a recruitment index page is almost always the notice
      // itself, whatever the anchor text says ("Download", "click here", "हिंदी").
      let sameHost = false;
      try { sameHost = new URL(abs).hostname.replace(/^www\./, "") === baseHost; } catch { /* ignore */ }
      if (sameHost || !baseHost) via = "pdf";
    } else if (text && ADVT_PATTERN.test(text)) {
      via = "advt";
    }
    if (!via) return;

    seen.add(abs);
    out.push({ url: abs, text, via });
  });

  return out;
}

/**
 * Parse an RSS 2.0 or Atom feed into the same shape as HTML discovery.
 *
 * `Source.kind` already had an "rss" value but nothing ever honoured it, so
 * every feed source was being parsed as HTML — which finds nothing, because a
 * feed has no <a> tags. Several central bodies publish clean feeds, and a feed
 * is strictly better than scraping: it is ordered, dated and stable.
 */
export function discoverFromFeed(xml: string, baseUrl: string): DiscoveredItem[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  const out: DiscoveredItem[] = [];
  const seen = new Set<string>();

  const push = (href: string | undefined, title: string | undefined) => {
    if (!href) return;
    let abs: string;
    try { abs = new URL(href.trim(), baseUrl).href; } catch { return; }
    if (seen.has(abs)) return;
    seen.add(abs);
    out.push({ url: abs, text: (title ?? "").replace(/\s+/g, " ").trim().slice(0, 200) || null, via: "keyword" });
  };

  // RSS 2.0
  $("item").each((_, el) => {
    const item = $(el);
    push(item.find("link").first().text() || item.find("guid").first().text(), item.find("title").first().text());
  });
  // Atom
  $("entry").each((_, el) => {
    const entry = $(el);
    const link = entry.find('link[rel="alternate"]').attr("href") ?? entry.find("link").first().attr("href");
    push(link, entry.find("title").first().text());
  });

  return out;
}

/**
 * Every absolute link on a page, unfiltered.
 *
 * Used for the aggregator hop: an aggregator's listing page is not itself a
 * notice, it is a signpost, and what matters is which official URL it points at.
 */
export function allLinks(html: string, baseUrl: string): { url: string; text: string | null }[] {
  const $ = cheerio.load(html);
  const out: { url: string; text: string | null }[] = [];
  const seen = new Set<string>();
  $("a").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || /^(javascript:|mailto:|tel:|#)/i.test(href)) return;
    let abs: string;
    try { abs = new URL(href, baseUrl).href; } catch { return; }
    if (seen.has(abs)) return;
    seen.add(abs);
    out.push({ url: abs, text: $(el).text().replace(/\s+/g, " ").trim().slice(0, 200) || null });
  });
  return out;
}

/** Does this response body look like a feed rather than a page? */
export function looksLikeFeed(body: string): boolean {
  const head = body.slice(0, 1200);
  return /<rss[\s>]|<feed[\s>][^>]*xmlns|<rdf:RDF/i.test(head);
}

/**
 * Additional index pages to sweep on the same run: explicit "next"/page-number
 * links. Listing pages routinely push last month's notices onto page 2, which a
 * single-page crawl never sees.
 */
export function discoverPaginationUrls(html: string, baseUrl: string, maxPages = 3): string[] {
  const $ = cheerio.load(html);
  const urls = new Set<string>();
  $("a").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const text = $(el).text().trim().toLowerCase();
    const looksPaged = /[?&](page|pageno|p|start|offset)=\d+/i.test(href) || /^\d{1,2}$/.test(text) || /next|आगे|अगला/i.test(text);
    if (!looksPaged) return;
    try {
      const abs = new URL(href, baseUrl).href;
      if (abs !== baseUrl) urls.add(abs);
    } catch { /* ignore */ }
  });
  return [...urls].slice(0, maxPages);
}
