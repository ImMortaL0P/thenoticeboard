/**
 * Repair the organisation graph and normalise notice fields.
 *
 *   npx tsx scripts/repair-data.ts            # dry run — prints the plan, writes nothing
 *   npx tsx scripts/repair-data.ts --apply    # performs the merges and edits
 *
 * What it does
 *   1. Clusters Organization rows onto the canonical registry in src/lib/org-registry.ts
 *   2. Picks one survivor per body, fills in its real name / shortName / sector / website / domains
 *   3. Folds every duplicate's name into the survivor's `aliases`, so the same
 *      spelling is never asked about again
 *   4. Repoints Notification.organizationId and Source.organizationId, then deletes the empties
 *   5. Normalises non-enum `sector` and `minQualification` values (the cause of
 *      cards rendering "sector.Banking" / "qual.Diploma/Degree (as per trade)")
 *   6. Strips placeholder junk: trailing full stops on names, "Not available"
 *      advertisement numbers
 *   7. Reports remaining data gaps per published notice
 *
 * Organisations that match no canonical entry are left completely alone and
 * listed at the end, so nothing is merged on a guess.
 */

import "dotenv/config";
import { prisma } from "../src/lib/db";
import { CANONICAL_ORGS, canonicalForOrg, type CanonicalOrg } from "../src/lib/org-registry";
import { SECTORS, QUALIFICATIONS, detectNoticeType, NOT_APPLICABLE_FIELDS } from "../src/lib/domain";

const APPLY = process.argv.includes("--apply");

function log(...a: unknown[]) { console.log(...a); }
function head(s: string) { log(`\n${"=".repeat(72)}\n${s}\n${"=".repeat(72)}`); }

/** "Staff Selection Commission (SSC)." -> "Staff Selection Commission (SSC)" */
function stripTrailingPunctuation(s: string): string {
  return s.replace(/\s*[.,;:]+\s*$/, "").trim();
}

/**
 * Several notices have two URLs crammed into one field, e.g.
 *   "Brochure: https://ugcnet.nta.ac.in/... | Apply: https://ugcnet.ntaonline.in/"
 * which is not a URL at all — every fetch of it fails, and it is why the gap
 * report claimed zero missing apply links while no apply link was usable.
 */
function extractUrls(v: string | null | undefined): { url: string; label: string }[] {
  if (!v) return [];
  const out: { url: string; label: string }[] = [];
  for (const part of v.split(/\s*[|;]\s*/)) {
    const m = part.match(/https?:\/\/[^\s|"'<>]+/);
    if (!m) continue;
    const label = part.slice(0, m.index ?? 0).replace(/[:\-\s]+$/, "").trim().toLowerCase();
    out.push({ url: m[0].replace(/[.,;]+$/, ""), label });
  }
  return out;
}

const APPLY_RE = /apply|registration|register|login|submit|candidate/i;
const DOC_RE = /brochure|bulletin|notification|advert|detailed|information|prospectus|syllabus|pdf/i;

/**
 * Classify one URL as the apply link, the notification document, or the source.
 *
 * The label wins when there is one. Falling back to the URL uses only its PATH,
 * never its host: "xatonline.in" and "ntaonline.in" both contain "online", which
 * previously made the brochure look like the apply link and swapped the two.
 */
function classifyUrl({ url, label }: { url: string; label: string }): "apply" | "doc" | "source" {
  if (label) {
    if (DOC_RE.test(label)) return "doc";
    if (APPLY_RE.test(label)) return "apply";
  }
  if (/\.pdf($|\?)/i.test(url)) return "doc";
  let path = url;
  try {
    const u = new URL(url);
    path = `${u.pathname}${u.search}`;
  } catch {
    /* keep the raw string */
  }
  if (DOC_RE.test(path)) return "doc";
  if (APPLY_RE.test(path)) return "apply";
  return "source";
}

/** A field is usable only if it holds one bare, fetchable URL. */
function usableUrlValue(v: string | null | undefined): boolean {
  const t = (v ?? "").trim();
  return /^https?:\/\/\S+$/.test(t) && !/[|;\s]/.test(t);
}

const PLACEHOLDER = /^(n\/?a|not available|none|null|unknown|tbd|-{1,2})$/i;
function cleanOptional(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  return !t || PLACEHOLDER.test(t) ? null : t;
}

// ---- sector / qualification normalisation ---------------------------------

const SECTOR_SYNONYMS: Record<string, string> = {
  banking: "banking_insurance", bank: "banking_insurance", insurance: "banking_insurance",
  "banking insurance": "banking_insurance", "banking & insurance": "banking_insurance",
  central: "central_govt", "central government": "central_govt", "central govt": "central_govt",
  govt: "central_govt", government: "central_govt",
  railway: "railways", "indian railways": "railways",
  "state govt": "state_psc", "state government": "state_psc", state: "state_psc", psc: "state_psc",
  "public sector": "psu", "public sector undertaking": "psu",
  army: "defence", navy: "defence", military: "defence",
  "private sector": "private",
};

function normalizeSector(raw: string): string | null {
  const v = raw.trim();
  if ((SECTORS as readonly string[]).includes(v)) return null; // already fine
  const key = v.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  if (SECTOR_SYNONYMS[key]) return SECTOR_SYNONYMS[key];
  const snake = key.replace(/\s+/g, "_");
  if ((SECTORS as readonly string[]).includes(snake)) return snake;
  for (const [needle, target] of Object.entries(SECTOR_SYNONYMS)) {
    if (key.includes(needle)) return target;
  }
  return "central_govt"; // safest default; surfaces in the report either way
}

const QUAL_ORDER: [string, RegExp][] = [
  ["phd", /ph\.?\s?d|doctorate/i],
  ["postgraduate", /post\s?grad|\bpg\b|\bm\.?\s?(a|sc|com|tech|e)\b|\bmba\b|master/i],
  ["engineering", /\bb\.?\s?(e|tech)\b|engineering|engineer/i],
  ["graduate", /graduat|bachelor|\bdegree\b|\bb\.?\s?(a|sc|com)\b|\bll\.?b\b/i],
  ["diploma", /diploma|\biti\b/i],
  ["12th", /12th|10\+2|intermediate|higher secondary|senior secondary/i],
  ["10th", /10th|matric|high school/i],
];

function normalizeQualification(raw: string): string | null {
  const v = raw.trim();
  if (v === "any" || (QUALIFICATIONS as readonly string[]).includes(v)) return null;
  for (const [key, re] of QUAL_ORDER) if (re.test(v)) return key;
  return "any";
}

// ---- main ------------------------------------------------------------------

type Plan = {
  canonical: CanonicalOrg;
  survivorId: string;
  survivorName: string;
  absorb: { id: string; name: string; shortName: string; notices: number }[];
  aliases: string[];
};


/**
 * Some Notification documents have serialNumber null or missing, which Prisma
 * refuses to read at all because the schema declares it a non-nullable Int
 * (P2032). That makes the whole collection unreadable through the client, so it
 * has to be repaired underneath Prisma with a raw command before anything else
 * can run.
 */
async function fixSerialNumbers(apply: boolean): Promise<number> {
  const broken = (await prisma.$runCommandRaw({
    find: "Notification",
    filter: { $or: [{ serialNumber: null }, { serialNumber: { $exists: false } }] },
    projection: { _id: 1, title: 1 },
    limit: 5000,
  })) as { cursor?: { firstBatch?: { _id: unknown; title?: string }[] } };

  const rows = broken.cursor?.firstBatch ?? [];
  if (rows.length === 0) return 0;

  head(`SERIAL NUMBERS (${rows.length} notice(s) with no serial number)`);
  for (const r of rows.slice(0, 10)) log(`  "${(r.title ?? "(untitled)").slice(0, 70)}"`);
  if (rows.length > 10) log(`  …and ${rows.length - 10} more`);

  if (!apply) {
    log("\n  These block every later step. They are repaired first when you run with --apply.");
    return rows.length;
  }

  const top = (await prisma.$runCommandRaw({
    find: "Notification",
    filter: { serialNumber: { $type: "number" } },
    sort: { serialNumber: -1 },
    projection: { serialNumber: 1 },
    limit: 1,
  })) as { cursor?: { firstBatch?: { serialNumber?: number }[] } };

  let next = (top.cursor?.firstBatch?.[0]?.serialNumber ?? 0) + 1;
  const updates = rows.map((r) => ({
    q: { _id: r._id },
    u: { $set: { serialNumber: next++ } },
    multi: false,
  }));
  await prisma.$runCommandRaw({ update: "Notification", updates, ordered: false } as never);
  log(`  assigned serial numbers ${next - rows.length}..${next - 1}`);
  return rows.length;
}

/**
 * Documents written before the noticeType column existed simply lack the field.
 * Prisma falls back to the declared default on read, so this is not the hard
 * failure serialNumber was — but writing the value in makes the classification
 * below idempotent and keeps the collection queryable by noticeType directly.
 */
async function ensureNoticeType(apply: boolean): Promise<number> {
  const missing = (await prisma.$runCommandRaw({
    count: "Notification",
    query: { noticeType: { $exists: false } },
  })) as { n?: number };
  const count = missing.n ?? 0;
  if (count === 0) return 0;

  log(`  ${count} notice(s) predate the noticeType column${apply ? " — backfilling to \"recruitment\"" : ""}`);
  if (apply) {
    await prisma.$runCommandRaw({
      update: "Notification",
      updates: [{ q: { noticeType: { $exists: false } }, u: { $set: { noticeType: "recruitment" } }, multi: true }],
    } as never);
  }
  return count;
}

async function main() {
  log(APPLY ? ">>> APPLY MODE — changes will be written\n" : ">>> DRY RUN — nothing will be written (pass --apply to commit)\n");

  // Both must run before any typed read of Notification, or Prisma throws P2032.
  const brokenSerials = await fixSerialNumbers(APPLY);
  const missingType = await ensureNoticeType(APPLY);

  const orgs = await prisma.organization.findMany();
  const counts = await prisma.notification.groupBy({ by: ["organizationId"], _count: { _all: true } });
  const noticeCount = new Map(counts.map((c) => [c.organizationId, c._count._all]));

  // --- 1. cluster -----------------------------------------------------------
  const clusters = new Map<string, typeof orgs>();
  const unmatched: typeof orgs = [];
  for (const org of orgs) {
    const hit = canonicalForOrg(org);
    if (!hit) { unmatched.push(org); continue; }
    const list = clusters.get(hit.shortName) ?? [];
    list.push(org);
    clusters.set(hit.shortName, list);
  }

  // --- 2. build the plan ----------------------------------------------------
  const plans: Plan[] = [];
  for (const [shortName, members] of clusters) {
    const canonical = CANONICAL_ORGS.find((c) => c.shortName === shortName)!;
    // Prefer a row already carrying the canonical short name; otherwise the row
    // holding the most notices, so we repoint as few documents as possible.
    const preferred =
      members.find((m) => m.shortName.toUpperCase() === shortName.toUpperCase()) ??
      [...members].sort((a, b) => (noticeCount.get(b.id) ?? 0) - (noticeCount.get(a.id) ?? 0))[0];

    const absorb = members
      .filter((m) => m.id !== preferred.id)
      .map((m) => ({ id: m.id, name: m.name, shortName: m.shortName, notices: noticeCount.get(m.id) ?? 0 }));

    const aliases = Array.from(new Set(
      members
        .flatMap((m) => [m.name, m.shortName])
        .map(stripTrailingPunctuation)
        .filter((a) => a && a.toLowerCase() !== canonical.name.toLowerCase() && a.toLowerCase() !== canonical.shortName.toLowerCase())
        .filter((a) => !/^[a-z0-9-]{20,}$/i.test(a) || true),
    ));

    plans.push({ canonical, survivorId: preferred.id, survivorName: preferred.name, absorb, aliases });
  }

  head("ORGANISATION MERGE PLAN");
  let mergedAway = 0;
  let movedNotices = 0;
  for (const p of plans.sort((a, b) => b.absorb.length - a.absorb.length)) {
    if (p.absorb.length === 0) {
      log(`  ${p.canonical.shortName.padEnd(15)} ok (1 row)`);
      continue;
    }
    mergedAway += p.absorb.length;
    const moving = p.absorb.reduce((s, a) => s + a.notices, 0);
    movedNotices += moving;
    log(`\n  ${p.canonical.shortName}  ->  "${p.canonical.name}"`);
    log(`    survivor : ${p.survivorName}`);
    log(`    domains  : ${p.canonical.domains.join(", ")}`);
    for (const a of p.absorb) log(`    absorb   : "${a.name}" (${a.shortName}) — ${a.notices} notice(s)`);
  }
  log(`\n  ${orgs.length} organisations -> ${orgs.length - mergedAway}. ${mergedAway} rows merged away, ${movedNotices} notice(s) repointed.`);

  // --- 3. notice field normalisation ---------------------------------------
  if (!APPLY && brokenSerials > 0) {
    head("FIELD NORMALISATION & DATA GAPS — SKIPPED");
    log(`  ${brokenSerials} notice(s) still have no serial number, so Prisma cannot read the`);
    log("  collection yet. Run with --apply: serials are repaired first, then these run.");
    head("UNMATCHED ORGANISATIONS (left untouched — decide by hand)");
    for (const o of unmatched) log(`  ${String(noticeCount.get(o.id) ?? 0).padStart(3)} notices  "${o.name}"  (${o.shortName})`);
    log("\nDry run complete.\n");
    await prisma.$disconnect();
    return;
  }

  const notices = await prisma.notification.findMany({
    select: {
      id: true, serialNumber: true, title: true, sector: true, minQualification: true,
      advertisementNo: true, applyLast: true, applyUrl: true, officialNotificationPdfUrl: true,
      officialSourceUrl: true, organizationId: true, noticeType: true,
      totalVacancies: true, fees: true, status: true, minAge: true, maxAge: true,
    },
  });

  type UrlFix = { id: string; serial: number; patch: Record<string, string | null>; from: string };
  const urlFixes: UrlFix[] = [];
  for (const n of notices) {
    const found = extractUrls(n.officialSourceUrl);
    const bare = (n.officialSourceUrl ?? "").trim();
    const isClean = found.length === 1 && found[0].url === bare;
    if (found.length === 0 || isClean) continue;

    const tagged = found.map((f) => ({ ...f, role: classifyUrl(f) }));
    const apply = tagged.find((f) => f.role === "apply");
    const doc = tagged.find((f) => f.role === "doc");
    // The source is the citable page: the notification document if we have one,
    // otherwise anything that is not the apply form.
    const source = doc ?? tagged.find((f) => f.role === "source") ?? tagged.find((f) => f !== apply) ?? tagged[0];

    const patch: Record<string, string | null> = { officialSourceUrl: source.url };
    if (apply && !usableUrlValue(n.applyUrl)) patch.applyUrl = apply.url;
    if (doc && !usableUrlValue(n.officialNotificationPdfUrl)) patch.officialNotificationPdfUrl = doc.url;
    urlFixes.push({ id: n.id, serial: n.serialNumber, patch, from: bare.slice(0, 90) });
  }

  // Classify entrance / eligibility examinations. They belong on the board —
  // UGC-NET, CAT, CLAT and NEET PG matter as much as any recruitment — but they
  // advertise no posts, so those fields must read "Not applicable" instead of
  // being counted as data we failed to collect.
  const orgById = new Map(orgs.map((o) => [o.id, o]));
  const typeFixes: { id: string; serial: number; title: string; to: string }[] = [];
  for (const n of notices) {
    const detected = detectNoticeType({
      title: n.title,
      orgShortName: orgById.get(n.organizationId)?.shortName,
    });
    const current = n.noticeType ?? "recruitment";
    if (detected !== current) typeFixes.push({ id: n.id, serial: n.serialNumber, title: n.title, to: detected });
  }

  const sectorFixes: { id: string; from: string; to: string }[] = [];
  const qualFixes: { id: string; from: string; to: string }[] = [];
  const advFixes: string[] = [];
  for (const n of notices) {
    const s = normalizeSector(n.sector);
    if (s) sectorFixes.push({ id: n.id, from: n.sector, to: s });
    const q = normalizeQualification(n.minQualification);
    if (q) qualFixes.push({ id: n.id, from: n.minQualification, to: q });
    if (n.advertisementNo && cleanOptional(n.advertisementNo) === null) advFixes.push(n.id);
  }

  head("FIELD NORMALISATION");
  log(`  sector values to fix        : ${sectorFixes.length}`);
  for (const f of sectorFixes.slice(0, 12)) log(`     "${f.from}" -> ${f.to}`);
  log(`  qualification values to fix : ${qualFixes.length}`);
  for (const f of qualFixes.slice(0, 12)) log(`     "${f.from}" -> ${f.to}`);
  log(`  placeholder advert numbers  : ${advFixes.length}`);

  const nameFixes = orgs.filter((o) => stripTrailingPunctuation(o.name) !== o.name);
  log(`  org names with trailing "." : ${nameFixes.length}`);
  log(`  malformed source URLs       : ${urlFixes.length}`);
  log(`  entrance exams to classify  : ${typeFixes.length}${missingType ? `  (${missingType} row(s) predate the column)` : ""}`);
  for (const f of typeFixes.slice(0, 14)) log(`     NB-${f.serial}  ${f.title.slice(0, 62)}  -> ${f.to}`);
  for (const f of urlFixes.slice(0, 8)) {
    log(`     NB-${f.serial}  "${f.from}…"`);
    for (const [k, v] of Object.entries(f.patch)) log(`        ${k.padEnd(28)} ${v}`);
  }

  // --- 4. data gaps ---------------------------------------------------------
  const published = notices.filter((n) => n.status === "published" || n.status === "closed");

  // Effective type after the classification above, so the report reflects what
  // the data will look like once applied.
  const pendingType = new Map(typeFixes.map((f) => [f.id, f.to]));
  const typeOf = (n: { id: string; noticeType?: string | null }) =>
    (pendingType.get(n.id) ?? n.noticeType ?? "recruitment") as keyof typeof NOT_APPLICABLE_FIELDS;
  const applies = (n: { id: string; noticeType?: string | null }, field: string) =>
    !NOT_APPLICABLE_FIELDS[typeOf(n)].includes(field);

  /** Counts a notice only when the field is meaningful for it. */
  const gap = (fn: (n: (typeof published)[number]) => boolean, field?: string) =>
    published.filter((n) => (field ? applies(n, field) : true) && fn(n)).length;
  const examCount = published.filter((n) => typeOf(n) === "entrance_exam").length;
  head(`DATA GAPS (${published.length} live notices, of which ${examCount} entrance exam(s))`);
  log(`  no last date to apply   : ${gap((n) => !n.applyLast)}`);
  // Counts a field only if it holds a single, bare, fetchable URL — the old
  // report said "0 missing apply links" while most were unusable label strings.
  log(`  no usable apply link    : ${gap((n) => !usableUrlValue(n.applyUrl))}`);
  log(`  no usable source link   : ${gap((n) => !usableUrlValue(n.officialSourceUrl))}`);
  log(`  no official PDF link    : ${gap((n) => !usableUrlValue(n.officialNotificationPdfUrl))}`);
  log(`  no vacancy count        : ${gap((n) => n.totalVacancies == null, "totalVacancies")}`);
  log(`  no advertisement no.    : ${gap((n) => !cleanOptional(n.advertisementNo), "advertisementNo")}`);
  log(`  no age limits           : ${gap((n) => n.minAge == null && n.maxAge == null)}`);
  log(`  no fee information      : ${gap((n) => !n.fees || Object.keys(n.fees as object).length === 0)}`);

  head("UNMATCHED ORGANISATIONS (left untouched — decide by hand)");
  for (const o of unmatched) log(`  ${String(noticeCount.get(o.id) ?? 0).padStart(3)} notices  "${o.name}"  (${o.shortName})`);

  if (!APPLY) {
    log("\nDry run complete. Re-run with --apply to commit these changes.\n");
    await prisma.$disconnect();
    return;
  }

  // --- 5. apply -------------------------------------------------------------
  head("APPLYING");
  for (const p of plans) {
    await prisma.organization.update({
      where: { id: p.survivorId },
      data: {
        name: p.canonical.name,
        shortName: p.canonical.shortName,
        sector: p.canonical.sector,
        state: p.canonical.state ?? null,
        officialWebsite: p.canonical.officialWebsite,
        domains: p.canonical.domains,
        aliases: p.aliases,
        isVerified: true,
      },
    });
    for (const a of p.absorb) {
      await prisma.notification.updateMany({ where: { organizationId: a.id }, data: { organizationId: p.survivorId } });
      await prisma.source.updateMany({ where: { organizationId: a.id }, data: { organizationId: p.survivorId } });
      await prisma.employerProfile.updateMany({ where: { organizationId: a.id }, data: { organizationId: null } });
      await prisma.organization.delete({ where: { id: a.id } });
    }
    log(`  ${p.canonical.shortName}: merged ${p.absorb.length}, aliases ${p.aliases.length}`);
  }

  for (const o of unmatched) {
    const clean = stripTrailingPunctuation(o.name);
    if (clean !== o.name) await prisma.organization.update({ where: { id: o.id }, data: { name: clean } });
  }

  for (const f of sectorFixes) await prisma.notification.update({ where: { id: f.id }, data: { sector: f.to } });
  for (const f of qualFixes) await prisma.notification.update({ where: { id: f.id }, data: { minQualification: f.to } });
  for (const id of advFixes) await prisma.notification.update({ where: { id }, data: { advertisementNo: null } });
  for (const f of urlFixes) await prisma.notification.update({ where: { id: f.id }, data: f.patch });
  for (const f of typeFixes) {
    await prisma.notification.update({ where: { id: f.id }, data: { noticeType: f.to } });
  }

  log(`\n  fixed ${sectorFixes.length} sector(s), ${qualFixes.length} qualification(s), ${advFixes.length} advert number(s), ${urlFixes.length} URL field(s), ${typeFixes.length} notice type(s).`);
  log("\nDone.\n");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
