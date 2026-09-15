// Rules-based extraction of notice fields from raw page/PDF text.
//
// This is not a fallback any more — it runs FIRST, and a model is only called
// when it cannot get enough. Indian recruitment notices are highly conventional
// documents: they label their fields ("Last Date for Submission of Online
// Application", "आवेदन की अंतिम तिथि", "Advt. No. 04/2026"), which makes them far
// more tractable than free prose.
//
// The governing rule: read LABELS, never positions. The old version took the
// first date it found and called it the notification date, which is how an exam
// date ended up in `notificationDate`. A value is only accepted here when the
// document says what it is.
//
// Kept free of "@/..." imports so it runs both in Next.js and under tsx.

export type NoticeDraft = {
  /**
   * Canonical Organization.shortName the model PICKED from the list it was
   * given — never a name it composed. null means "not in the list", which
   * routes the item to review rather than inventing an organisation.
   */
  organizationShortName?: string | null;
  /** Raw organisation name as printed on the document, used for alias learning. */
  organizationNameRaw?: string | null;
  /** One of SECTORS, or null. */
  sector?: string | null;
  /** "recruitment" | "entrance_exam" — decides which fields are applicable. */
  noticeType?: string | null;
  applyUrl?: string | null;
  officialNotificationPdfUrl?: string | null;
  postNames?: string[] | null;
  title: string | null;
  advertisementNo: string | null;
  totalVacancies: number | null;
  minQualification: string;
  minAge: number | null;
  maxAge: number | null;
  feeGeneral: number | null;
  feeReserved: number | null;
  applyLast: string | null;
  applyStart: string | null;
  notificationDate: string | null;
  summary: string | null;
  payLevel: string | null;
  selectionProcess: string | null;
  experienceRequiredYears: number | null;
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
  applyStart: null,
  notificationDate: null,
  summary: null,
  payLevel: null,
  selectionProcess: null,
  experienceRequiredYears: null,
};

function toNumber(s: string | undefined | null): number | null {
  if (!s) return null;
  const n = Number(s.replace(/[^\d]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ---------- dates ----------

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};
const MONTH_HI: Record<string, number> = {
  जनवरी: 1, फरवरी: 2, "फ़रवरी": 2, मार्च: 3, अप्रैल: 4, मई: 5, जून: 6,
  जुलाई: 7, अगस्त: 8, सितंबर: 9, सितम्बर: 9, अक्तूबर: 10, अक्टूबर: 10,
  नवंबर: 11, नवम्बर: 11, दिसंबर: 12, दिसम्बर: 12,
};

function buildDate(d: number, m: number, y: number): string | null {
  if (y < 100) y += 2000;
  if (y < 2020 || y > 2035) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Every date form Indian notices actually use, as one alternation. */
const DATE_PATTERN = new RegExp(
  [
    // 31/01/2026, 31-01-2026, 31.01.2026
    String.raw`(\d{1,2})\s*[\/.\-]\s*(\d{1,2})\s*[\/.\-]\s*(\d{2,4})`,
    // 31 January 2026 / 31st Jan, 2026
    String.raw`(\d{1,2})\s*(?:st|nd|rd|th)?\s*[-\s]\s*([A-Za-zऀ-ॿ]{3,12})\.?\,?\s*(\d{4})`,
    // January 31, 2026
    String.raw`([A-Za-z]{3,12})\.?\s+(\d{1,2})\s*(?:st|nd|rd|th)?\,?\s*(\d{4})`,
    // 2026-01-31
    String.raw`(\d{4})-(\d{1,2})-(\d{1,2})`,
  ].join("|"),
  "gi",
);

/** Parse the first date appearing in `text`, or null. */
export 
function findApplyDateRange(text: string): [string, string] | null {
  const re = /(?:apply|application|registration|online|form|payment)[^.\n]{0,200}?(?:from|start\w*|begin\w*|open\w*)[^.\n]{0,30}?([0-9]{1,2}[-./][0-9]{1,2}[-./][0-9]{2,4}|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+[0-9]{1,2}(?:\s*,\s*|\s+)[0-9]{4})[^.\n]{0,60}?(?:to|till|close\w*|end\w*|-|&)[^.\n]{0,30}?([0-9]{1,2}[-./][0-9]{1,2}[-./][0-9]{2,4}|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+[0-9]{1,2}(?:\s*,\s*|\s+)[0-9]{4})/i;
  let m: RegExpExecArray | null;
  const reG = new RegExp(re.source, re.flags + "g");
  while ((m = reG.exec(text))) {
    const dates1 = findAllDates(m[1]);
    const dates2 = findAllDates(m[2]);
    if (dates1.length > 0 && dates2.length > 0) {
      return [dates1[0], dates2[0]];
    }
  }
  return null;
}

export function findAllDates(text: string): string[] {
  DATE_PATTERN.lastIndex = 0;
  let m: RegExpExecArray | null;
  const found: string[] = [];
  while ((m = DATE_PATTERN.exec(text))) {
    // numeric d/m/y
    if (m[1] && m[2] && m[3]) {
      const got = buildDate(Number(m[1]), Number(m[2]), Number(m[3]));
      if (got) found.push(got);
      continue;
    }
    // d Month y
    if (m[4] && m[5] && m[6]) {
      const key = m[5].toLowerCase();
      const mo = MONTHS[key.slice(0, 4)] ?? MONTHS[key.slice(0, 3)] ?? MONTH_HI[m[5]];
      if (mo) {
        const got = buildDate(Number(m[4]), mo, Number(m[6]));
        if (got) found.push(got);
      }
      continue;
    }
    // Month d, y
    if (m[7] && m[8] && m[9]) {
      const key = m[7].toLowerCase();
      const mo = MONTHS[key.slice(0, 4)] ?? MONTHS[key.slice(0, 3)];
      if (mo) {
        const got = buildDate(Number(m[8]), mo, Number(m[9]));
        if (got) found.push(got);
      }
      continue;
    }
    // ISO
    if (m[10] && m[11] && m[12]) {
      const got = buildDate(Number(m[12]), Number(m[11]), Number(m[10]));
      if (got) found.push(got);
    }
  }
  return found;
}

export function findDate(text: string): string | null {
  const all = findAllDates(text);
  return all.length > 0 ? all[0] : null;
}

/**
 * Find the date belonging to a labelled field.
 *
 * Looks for the label, then takes the first date within the next `window`
 * characters. Anything further away is almost certainly a different field, so
 * we return null rather than reach for it — a missing date is reviewable, a
 * wrong one gets published.
 */
function labelledDate(text: string, label: RegExp, window = 140, mode: "first" | "max" | "min" = "first"): string | null {
  const re = new RegExp(label.source, label.flags.includes("g") ? label.flags : `${label.flags}g`);
  let m: RegExpExecArray | null;
  
  // To handle variations where the date is slightly before the noun in Hindi,
  // we expand the window slightly backwards.
  // Actually the original code just slices forward: text.slice(m.index + m[0].length, ...)
  // But wait, my previous run (or the default) was slicing forward. Let's keep it but grab all dates.
  
  while ((m = re.exec(text))) {
    // For Hindi and some English formats, the date might be just before the label
    const start = Math.max(0, m.index - 25);
    const slice = text.slice(start, m.index + m[0].length + window);
    const dates = findAllDates(slice);
    if (dates.length > 0) {
      if (mode === "max") {
        return dates.sort((a,b) => (a > b ? -1 : 1))[0];
      }
      if (mode === "min") {
        return dates.sort((a,b) => (a < b ? -1 : 1))[0];
      }
      return dates[0];
    }
  }
  return null;
}

const LABELS = {
  applyLast:
    /(?:last\s+date|closing\s+date|last\s+day|final\s+date)[^.\n]{0,60}?(?:appl|submi|registration|online|receipt)?|(?:registration|application)(?:[^.\n]{0,60})?(?:closes?|ends?|till)|(?:आवेदन\s*(?:की)?\s*अंतिम\s*तिथि)|(?:अंतिम\s*तिथि)/i,
  applyStart:
    /(?:date\s+of\s+)?(?:commencement|opening|start(?:ing)?)\s*(?:date)?[^.\n]{0,40}?(?:appl|online|registration)?|(?:appl\w*\s+(?:begin|start|open)\w*)|(?:online\s+application\s+from)|(?:registration|application)(?:[^.\n]{0,80})?(?:from|starts?|begins?|commences?|schedule|opening|:)|(?:प्रारंभ\s*तिथि)|(?:आवेदन\s*प्रारंभ)/i,
  feeLast:
    /last\s+date[^.\n]{0,40}?(?:fee|payment|challan)|fee\s+payment[^.\n]{0,30}last\s+date|शुल्क[^।\n]{0,25}अंतिम\s*तिथि/i,
  examDate:
    /date\s+of\s+(?:exam\w*|test|written)|exam\w*\s+(?:date|scheduled)|tentative\s+date\s+of\s+exam\w*|परीक्षा\s*(?:की)?\s*तिथि/i,
  notificationDate:
    /date\s+of\s+(?:notification|advertisement|issue|publication)|notification\s+(?:released|dated|issued)|advertisement\s+dated|dated\s*:|अधिसूचना|विज्ञापन\s*दिनांक/i,
};

// ---------- qualification ----------

const QUAL_ORDER: ReadonlyArray<{ key: string; re: RegExp }> = [
  { key: "phd", re: /(?:ph\.?\s?d|doctorate)/i },
  { key: "postgraduate", re: /(?:\b(?:m\.?\s?a|m\.?\s?sc|m\.?\s?com|m\.?\s?tech|mba|pg(?:\s?(?:degree|diploma|course))?|post\s?graduat\w*)\b|(?:मास्टर|परास्नातक|स्नातकोत्तर)(?=[\s.,;:।]))/i },
  { key: "engineering", re: /(?:\b(?:b\.?\s?e|b\.?\s?tech|engineer\w*)\b|अभियांत्रिकी(?=[\s.,;:।]))/i },
  { key: "graduate", re: /(?:\b(?:graduat\w*|bachelou?\w*|degree|b\.?\s?a|b\.?\s?sc|b\.?\s?com|ll\.?b)\b|स्नातक(?=[\s.,;:।]))/i },
  { key: "diploma", re: /(?:\bdiploma\b|\biti\b|डिप्लोमा(?=[\s.,;:।]))/i },
  { key: "12th", re: /(?:\b(?:12th|12(?:\^|\s)?th|10\+2|intermediate|higher\s?secondary|senior\s?secondary)\b|(?:इंटरमीडिएट|बारहवीं|द्वादश)(?=[\s.,;:।]))/i },
  { key: "10th", re: /(?:\b(?:10th|10(?:\^|\s)?th|matric\w*|high\s?school)\b|(?:दसवीं|मैट्रिक)(?=[\s.,;:।]))/i },
];

export function detectQualification(text: string): string {
  for (const { key, re } of QUAL_ORDER) if (re.test(text.slice(0, 4000))) return key;
  return "any";
}

// ---------- other fields ----------

function detectVacancies(text: string): number | null {
  const slice = text.slice(0, 12_000);
  // Strongest form first: an explicit total.
  const total = slice.match(
    /(?:total\s+(?:no\.?\s*of\s*)?(?:posts?|vacanc\w*)|कुल\s*(?:पद|रिक्ति)\w*)\s*[:\-–]?\s*([0-9][0-9,]*)/i,
  );
  if (total) return toNumber(total[1]);
  // "1,245 posts" is more specific than "posts ... 1,245", which can drift.
  const after = slice.match(
    /\b([0-9][0-9,]{1,8})\s{0,3}(?:posts?|vacanc\w*|पद\s*ो?\s*ं?|रिक्ति\w{0,3})(?=[\s.,;:।)]|$)/i,
  );
  if (after) return toNumber(after[1]);
  const before = slice.match(
    /(?:vacanc\w*|posts?|पद\s*ो?\s*ं?|रिक्ति\w{0,3})\s*[:\-–]?\s*[^0-9]{0,15}([0-9][0-9,]{1,8})/i,
  );
  return before ? toNumber(before[1]) : null;
}

function detectAge(text: string): { min: number | null; max: number | null } {
  const slice = text.slice(0, 10_000);
  const sane = (n: number | null) => (n !== null && n >= 14 && n <= 70 ? n : null);
  const range = slice.match(
    /(?:age|आयु)[^0-9]{0,50}?([0-9]{2})\s*(?:years?)?\s*(?:to|and|–|—|-|से|till|up\s?to)\s*([0-9]{2})/i,
  );
  if (range) return { min: sane(toNumber(range[1])), max: sane(toNumber(range[2])) };
  const max = slice.match(/(?:maximum\s+age|upper\s+age\s+limit|age\s+limit|अधिकतम\s*आयु|आयु\s*सीमा)[^0-9]{0,30}?([0-9]{2})/i);
  const min = slice.match(/(?:minimum\s+age|न्यूनतम\s*आयु)[^0-9]{0,30}?([0-9]{2})/i);
  return { min: sane(min ? toNumber(min[1]) : null), max: sane(max ? toNumber(max[1]) : null) };
}

const NIL = /\b(?:nil|free|exempt\w*|no\s+fee|शून्य|नि:?शुल्क|निःशुल्क)\b/i;

function detectFees(text: string): { feeGeneral: number | null; feeReserved: number | null } {
  const slice = text.slice(0, 12_000);
  const amount = (s: string | undefined): number | null => {
    if (!s) return null;
    const n = Number(s.replace(/[^\d]/g, ""));
    return Number.isFinite(n) && n >= 0 && n < 100_000 ? n : null;
  };

  // Reserved categories, including the very common "SC/ST/PwBD: Nil".
  let feeReserved: number | null = null;
  const resCtx = slice.match(/(?:sc\s*\/?\s*st|reserved|एससी|एसटी|अनुसूचित)[^0-9\n]{0,40}(?:rs\.?|₹|inr)?\s*([0-9][0-9,]*)/i);
  const resNil = slice.match(/(?:sc\s*\/?\s*st|pwbd|pwd|female|women|reserved|एससी|एसटी)[^.\n]{0,50}/i);
  if (resCtx) feeReserved = amount(resCtx[1]);
  else if (resNil && NIL.test(resNil[0])) feeReserved = 0;

  // General / UR.
  let feeGeneral: number | null = null;
  const genCtx = slice.match(
    /(?:general|\bur\b|unreserved|obc|ews|सामान्य)[^0-9\n]{0,40}(?:rs\.?|₹|inr)?\s*([0-9][0-9,]*)/i,
  );
  if (genCtx) feeGeneral = amount(genCtx[1]);
  if (feeGeneral === null) {
    const anyFee = slice.match(/(?:application\s*)?(?:registration\s*)?fee[^0-9\n]{0,40}(?:rs\.?|₹|inr)?\s*([0-9][0-9,]*)/i);
    const hiFee = slice.match(/(?:शुल्क|फीस)[^0-9\n]{0,30}(?:₹)?\s*([0-9][0-9,]*)/i);
    feeGeneral = amount(anyFee?.[1]) ?? amount(hiFee?.[1]);
  }
  return { feeGeneral, feeReserved };
}

function detectAdvertisementNo(text: string): string | null {
  const slice = text.slice(0, 6000);
  const m = slice.match(
    /(?:advt?\.?|advertisement|notification|notice|cen|employment\s+notice|विज्ञापन)\s*(?:no\.?|number|संख्या|सं\.?)\s*[:\-–]?\s*([A-Za-z0-9][A-Za-z0-9\/\-.]{2,30})/i,
  );
  if (!m) return null;
  const value = m[1].replace(/[.,;]+$/, "");
  // Guard against swallowing a stray word: a real advert number has a digit.
  return /\d/.test(value) ? value : null;
}

function detectPayLevel(text: string): string | null {
  const slice = text.slice(0, 12_000);
  const level = slice.match(/(?:pay\s*(?:matrix\s*)?level|level)\s*[-–:]?\s*([0-9]{1,2})\b/i);
  const band = slice.match(/(?:rs\.?|₹)\s*([0-9][0-9,]{3,})\s*(?:[-–—]|to)\s*(?:rs\.?|₹)?\s*([0-9][0-9,]{3,})/i);
  if (level && band) return `Level ${level[1]} (₹${band[1]}–₹${band[2]})`;
  if (level) return `Level ${level[1]}`;
  if (band) return `₹${band[1]}–₹${band[2]}`;
  return null;
}

function detectExperience(text: string): number | null {
  const slice = text.slice(0, 10_000);
  const m = slice.match(/([0-9]{1,2})\s*(?:\+)?\s*years?[^.\n]{0,30}?experience|experience[^.\n]{0,30}?([0-9]{1,2})\s*years?/i);
  if (!m) return null;
  const n = Number(m[1] ?? m[2]);
  return Number.isFinite(n) && n >= 0 && n <= 40 ? n : null;
}

function detectSelection(text: string): string | null {
  const slice = text.slice(0, 12_000);
  const m = slice.match(
    /(?:selection\s+(?:process|procedure|shall\s+be|will\s+be)|mode\s+of\s+selection|चयन\s*प्रक्रिया)\s*[:\-–]?\s*([^\n.]{10,160})/i,
  );
  if (m) return m[1].trim();
  const stages: string[] = [];
  if (/computer\s*based\s*(?:test|exam)|\bcbt\b/i.test(slice)) stages.push("Computer Based Test");
  if (/written\s*(?:test|exam)/i.test(slice)) stages.push("Written Examination");
  if (/\binterview\b/i.test(slice)) stages.push("Interview");
  if (/physical\s*(?:efficiency|standard|test)|\bpet\b|\bpst\b/i.test(slice)) stages.push("Physical Test");
  if (/skill\s*test|typing\s*test/i.test(slice)) stages.push("Skill Test");
  if (/document\s*verification/i.test(slice)) stages.push("Document Verification");
  return stages.length ? stages.join(", ") : null;
}

/**
 * Titles are found on the RAW text, before whitespace is collapsed.
 *
 * Line breaks are the strongest signal a notice gives about what its heading
 * is — collapsing them first is what made the old pattern swallow "NOTICE
 * Ministry of Railways Railway Recruitment" as one run of text.
 */
function detectTitle(raw: string, fallback: string | null): string | null {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length >= 8 && l.length <= 140)
    .slice(0, 60);

  // Strongest: an explicit "Recruitment of X" heading.
  for (const line of lines) {
    const m = line.match(/((?:recruitment|engagement|appointment)\s+(?:of|to|for)\s+.{4,110})/i);
    if (m) return m[1].replace(/[.,;:]+$/, "").trim();
  }
  // Next: any line that names itself a recruitment.
  for (const line of lines) {
    if (/recruit\w*|भर्ती|बहाली/i.test(line) && !/^applications?\s+are\s+invited/i.test(line)) {
      return line.replace(/[.,;:]+$/, "").trim();
    }
  }
  if (fallback && fallback.trim().length > 8) return fallback.trim();
  return null;
}

function detectPostNames(text: string): string[] | null {
  const slice = text.slice(0, 8000);
  const m = slice.match(/(?:post(?:s)?\s+of|name\s+of\s+post(?:s)?|पद\s*का\s*नाम)\s*[:\-–]?\s*([^\n.]{4,200})/i);
  if (!m) return null;
  const names = m[1]
    .split(/\s*(?:,|\/|&|and)\s*/i)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length >= 3 && p.length <= 60);
  return names.length ? names.slice(0, 12) : null;
}

// ---------- entry point ----------

export function extractFromText(raw: string, fallbackTitle: string | null): NoticeDraft {
  const text = raw.replace(/\s+/g, " ").trim();
  // detectTitle deliberately receives `raw`, not `text` — see its comment.
  const { min, max } = detectAge(text);
  const { feeGeneral, feeReserved } = detectFees(text);

  let applyLast = labelledDate(text, LABELS.applyLast, 140, "max");
  let applyStart = labelledDate(text, LABELS.applyStart, 140, "min");
  let notificationDate = labelledDate(text, LABELS.notificationDate);

  if (!applyLast || !applyStart) {
    const range = findApplyDateRange(text);
    if (range) {
      if (!applyStart) applyStart = range[0];
      if (!applyLast) applyLast = range[1];
    }
  }

  // A notification cannot be issued after its own closing date; if the labelled
  // value disagrees, the label was matched on something else.
  if (notificationDate && applyLast && notificationDate > applyLast) notificationDate = null;

  return {
    ...EMPTY_DRAFT,
    title: detectTitle(raw, fallbackTitle),
    advertisementNo: detectAdvertisementNo(text),
    totalVacancies: detectVacancies(text),
    minQualification: detectQualification(text),
    minAge: min,
    maxAge: max,
    feeGeneral,
    feeReserved,
    applyLast,
    applyStart,
    notificationDate,
    payLevel: detectPayLevel(text),
    selectionProcess: detectSelection(text),
    experienceRequiredYears: detectExperience(text),
    postNames: detectPostNames(text),
    summary: null,
  };
}

/** Exposed for the rules-first gate in ai.ts and for tests. */
export const __internals = { findDate, findAllDates, labelledDate, LABELS, detectAdvertisementNo, detectPayLevel };
