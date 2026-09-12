import * as cheerio from 'cheerio';
async function search(q) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
  });
  const html = await res.text();
  const $ = cheerio.load(html);
  $('.result__snippet').each((i, el) => {
    console.log($(el).text());
  });
}
search('UPSC EPFO APFC 2026 exam date extended sarkari result');
