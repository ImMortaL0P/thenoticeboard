// Link discovery for one source page: collect <a> hrefs that match the source's
// include/exclude patterns, resolve relative URLs, and return deduplicated items.

import * as cheerio from "cheerio";

export type DiscoveredItem = { url: string; text: string | null };

export function discoverLinks(
  html: string,
  baseUrl: string,
  source: { linkSelector?: string | null; includePattern?: string | null; excludePattern?: string | null },
): DiscoveredItem[] {
  const $ = cheerio.load(html);
  const include = source.includePattern ? new RegExp(source.includePattern, "i") : null;
  const exclude = source.excludePattern ? new RegExp(source.excludePattern, "i") : null;

  const out: DiscoveredItem[] = [];
  const seen = new Set<string>();

  $(source.linkSelector || "a").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    let abs: string;
    try {
      abs = new URL(href, baseUrl).href;
    } catch {
      return;
    }
    if (seen.has(abs)) return;
    const text = $(el).text().trim().replace(/\s+/g, " ").slice(0, 200) || null;
    const hay = `${text ?? ""} ${abs}`.toLowerCase();
    if (include && !include.test(hay)) return;
    if (exclude && exclude.test(hay)) return;
    seen.add(abs);
    out.push({ url: abs, text });
  });

  return out;
}