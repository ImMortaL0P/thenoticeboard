// Rules-based extraction of notice fields from raw page/PDF text.
// Never auto-publishes: callers create draft Notifications with status "pending_review".
// Kept free of "@/..." imports so it runs both in Next.js and under tsx (worker).

export type NoticeDraft = {
  title: string | null;
  advertisementNo: string | null;
  totalVacancies: number | null;
  minQualification: string; // any | 10th | 12th | diploma | graduate | engineering | postgraduate | phd
  minAge: number | null;
  maxAge: number | null;
  feeGeneral: number | null;
  feeReserved: number | null;
  applyLast: string | null;
  notificationDate: string | null;
  summary: string | null;
};

export const EMPTY_DRAFT: NoticeDraft = {
  title: null,
  advertisementNo: null,
  totalVacancies: null,
  minQualification: "any",
  minAge: null,
  maxAge: null,
  feeGeneral: null,
  feeReserved: null,
  applyLast: null,
  notificationDate: null,
  summary: null,
};

function toNumber(s: string | undefined | null): number | null {
  if (!s) return null;
  const n = Number(s.replace(/[^\d]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ---------- qualification ----------

// `\b` does not span Devanagari in JS (\w is ASCII-only), so Hindi alternatives use
// an explicit BOW/later-boundary via (?=[\s.,;:।]) or drop the boundary entirely.
const QUAL_ORDER: ReadonlyArray<{ key: string; re: RegExp }> = [
  { key: "phd", re: /(?:ph\.?\s?d|doctorate)/i },
  { key: "postgraduate", re: /(?:\b(?:m\.?\s?a|m\.?\s?sc|m\.?\s?com|m\.?\s?tech|mba|pg(?:\s?(?:degree|diploma|course))?|post\s?graduat\w*)\b|(?:मास्टर|परास्नातक|स्नातकोत्तर)(?=[\s.,;:।]))/i },
  { key: "engineering", re: /(?:\b(?:b\.?\s?e|b\.?\s?tech|engineer\w*)\b|अभियांत्रिकी(?=[\s.,;:।]))/i },
  { key: "graduate", re: /(?:\b(?:graduat\w*|bachelou?\w*|degree|b\.?\s?a|b\.?\s?sc|b\.?\s?com|ll\.?b)\b|स्नातक(?=[\s.,;:।]))/i },
  { key: "diploma", re: /(?:\bdiploma\b|डिप्लोमा(?=[\s.,;:।]))/i },
  { key: "12th", re: /(?:\b(?:12th|12(\^|\s)?th|10\+2|intermediate|higher\s?secondary|senior\s?secondary)\b|(?:इंटरमीडिएट|बारहवीं|द्वादश)(?=[\s.,;:।]))/i },
  { key: "10th", re: /(?:\b(?:10th|10(\^|\s)?th|matric\w*|high\s?school)\b|(?:दसवीं|मैट्रिक)(?=[\s.,;:।]))/i },
];

export function detectQualification(text: string): string {
  for (const { key, re } of QUAL_ORDER) if (re.test(text.slice(0, 4000))) return key;
  return "any";
}

// ---------- fields via regex ----------

function detectVacancies(text: string): number | null {
  const slice = text.slice(0, 8000);
  // Number-before-keyword ("450 पद", "1,245 posts") is more specific than the
  // keyword-before-number form, so try it first — the second form's skip-ahead
  // can drift across the next sentence into an age ("450 पद ... आयु 18") otherwise.
  const after = slice.match(
    /\b([0-9][0-9,]*(?:\.\d+)?)\s{0,3}(?:posts?|vacanc\w*|पद\s*ो?\s*ं?|रिक्ति\w{0,3})(?=[\s.,;:।]|$)/i,
  );
  if (after) return toNumber(after[1]);
  const before = slice.match(
    /(?:vacanc\w*|total\s+posts?|पद\s*ो?\s*ं?|रिक्ति\w{0,3})\s*[:\-]?\s*[^0-9]{0,25}([0-9][0-9,]*(?:\.\d+)?)/i,
  );
  return before ? toNumber(before[1]) : null;
}

function detectAge(text: string): { min: number | null; max: number | null } {
  const slice = text.slice(0, 6000);
  const range = slice.match(/(?:age|आयु)[^0-9]{0,40}?([0-9]{2})\s*(?:to|and|ndash|–|-|से|till|up\s?to)\s*([0-9]{2})/i);
  if (range) return { min: toNumber(range[1]), max: toNumber(range[2]) };
  const single = slice.match(/(?:age\s+limit|maximum\s+age|आयु\s+सीमा|अधिकतम\s+आयु)[^0-9]{0,30}?([0-9]{2})/i);
  if (single) return { min: null, max: toNumber(single[1]) };
  return { min: null, max: null };
}

function detectFees(text: string): { feeGeneral: number | null; feeReserved: number | null } {
  const slice = text.slice(0, 6000);
  const gen = slice.match(/(?:application\s*)?(?:reg\w*\s*)?fee[^0-9]{0,40}(?:rs\.?|₹)?\s*([0-9][0-9,]*)/i);
  const hi = slice.match(/(?:शुल्क|फीस)[^0-9]{0,30}(?:₹)?\s*([0-9][0-9,]*)/i);
  const general = gen ? toNumber(gen[1]) : hi ? toNumber(hi[1]) : null;
  const res = slice.match(/(?:sc\/?st|reserved)[^0-9]{0,20}(?:rs\.?|₹)?\s*([0-9][0-9,]*)/i);
  return { feeGeneral: general, feeReserved: res ? toNumber(res[1]) : null };
}

// ---------- dates ----------

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const MONTH_HI: Record<string, number> = {
  जनवरी: 1, फ़रवरी: 2, फ़रवरी: 2, फरवरी: 2, मार्च: 3, अप्रैल: 4, मई: 5, जून: 6, जुलाई: 7, अगस्त: 8, सितंबर: 9, सितम्बर: 9, अक्तूबर: 10, अक्टूबर: 10, नवंबर: 11, दिसंबर: 12, दिसम्बर: 12,
};

function parseDateParts(d: number, m: number, y: number): string | null {
  if (y < 100) y += 2000;
  if (y < 2020 || y > 2035) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function normalizeDate(tok: string): string | null {
  const slash = tok.match(/^(\d{1,2})\s*[\/\-]\s*(\d{1,2})\s*[\/\-]\s*(\d{2,4})$/);
  if (slash) return parseDateParts(Number(slash[1]), Number(slash[2]), Number(slash[3]));
  const named = tok.match(/^(\d{1,2})[a-z]+\.?\s+([A-Za-zअ-हऀ-ॿ]{3,})\s+(\d{4})$/i);
  if (named) {
    const [, d, mo, y] = named;
    let m = MONTHS[mo.toLowerCase().slice(0, 3)];
    if (!m) m = MONTH_HI[mo];
    if (!m) return null;
    return parseDateParts(Number(d), m, Number(y));
  }
  return null;
}

function tokenizeDates(text: string): { offset: number; date: string }[] {
  const re = /\b(\d{1,2}\s*[\/\-]\s*\d{1,2}\s*[\/\-]\s*\d{2,4}|\d{1,2}[a-z]+\.?\s+[A-Za-zअ-हऀ-ॿ]{3,}\s+\d{4})\b/gi;
  const out: { offset: number; date: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const date = normalizeDate(m[1].replace(/\s+/g, " "));
    if (date) out.push({ offset: m.index, date });
  }
  return out;
}

function detectDates(text: string): { applyLast: string | null; notificationDate: string | null } {
  const dates = tokenizeDates(text);
  if (!dates.length) return { applyLast: null, notificationDate: null };
  const last = dates.find(({ offset }) => {
    const ctx = text.slice(Math.max(0, offset - 160), offset).toLowerCase();
    return /last date|closing|अंतिम|आवेदन|apply\s*(?:before|online)/.test(ctx);
  });
  const issued = dates.find(({ offset }) => {
    const ctx = text.slice(Math.max(0, offset - 160), offset).toLowerCase();
    return /(?:notification|circular)\s+(?:issued|on|dated|released)|released\s+on|issued\s+on|dated|अधिसूचना|जारी|प्रकाशित/.test(ctx);
  });
  const maxDate = dates.reduce((a, b) => (a.date > b.date ? a : b));
  return {
    applyLast: last?.date ?? maxDate.date,
    notificationDate: issued?.date ?? dates[0].date,
  };
}

// ---------- misc fields ----------

function detectAdNo(text: string): string | null {
  const m = text
    .slice(0, 4000)
    .match(/(?:advt\w*\.?\s*no\.?|advertisement\s*(?:no\.?|number)|विज्ञापन\s*(?:संख्या|नं\.?))\s*[:\-]?\s*([A-Za-z]{0,6}[0-9]+(?:[\/\-.][A-Za-z0-9]+)*)/i);
  if (!m) return null;
  // Single compact token only ("01/2026", "CEN-01/2026", "A-12013/01/2026") —
  // never span whitespace into following headings.
  const v = m[1].trim();
  if (v.length < 2 || v.length > 40) return null;
  return v;
}

// ---------- title / summary ----------

const TITLE_HINT = /recruit\w*|vacanc\w*|posts?\s+of|भर्ती|रिक्ति\w*|notification\s+no\.?/i;

function pickTitle(lines: string[], fallback: string | null): string | null {
  let first: string | null = null;
  for (const line of lines) {
    const t = line.replace(/[.:\-—_|#*•]+$/g, "").trim();
    if (t.length < 8) continue;
    if (t.length > 300) continue;
    if (/^https?:\/\//i.test(t)) continue;
    if (/^\d[\d\s\/\-.,]*(?:वर्ष|years)?$/i.test(t)) continue;
    if (/^(govt\.? of|भारत सरकार|आधिकारिक|official\s)/i.test(t)) continue;
    first ??= t;
    if (TITLE_HINT.test(t)) return t; // prefer the recruitment/vacancy heading
  }
  return first ?? (fallback && fallback.length <= 300 ? fallback : null);
}

function pickSummary(lines: string[], title: string | null): string | null {
  const start = title ? lines.findIndex((l) => l === title) + 1 : 0;
  for (let i = start; i < Math.min(start + 6, lines.length); i++) {
    const s = lines[i];
    if (s.length >= 40 && s.length <= 400) return s;
  }
  return null;
}

function clean(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------- main ----------

export function extractFromText(raw: string, fallbackTitle: string | null): NoticeDraft {
  const text = clean(raw);
  if (text.length < 40) return EMPTY_DRAFT;
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const title = pickTitle(lines, fallbackTitle);

  const fees = detectFees(text);
  const dates = detectDates(text);
  const age = detectAge(text);

  return {
    ...EMPTY_DRAFT,
    title,
    minQualification: detectQualification(text),
    totalVacancies: detectVacancies(text),
    minAge: age.min,
    maxAge: age.max,
    feeGeneral: fees.feeGeneral,
    feeReserved: fees.feeReserved,
    applyLast: dates.applyLast,
    notificationDate: dates.notificationDate,
    advertisementNo: detectAdNo(text),
    summary: pickSummary(lines, title),
  };
}