/**
 * Add official recruitment sources, verifying each one before it is stored.
 *
 *   npx tsx scripts/add-sources.ts            # probe every candidate, change nothing
 *   npx tsx scripts/add-sources.ts --apply    # add only the ones that actually worked
 *   npx tsx scripts/add-sources.ts --recheck  # re-probe sources already in the DB
 *
 * Every URL below is a candidate, not a fact. Government portals move, rename
 * and restructure constantly, so the script FETCHES each one and runs real link
 * discovery against it, then reports how many notice links it found. Only
 * candidates that actually yield links are added, which is the difference
 * between a source list and a list of dead ends.
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { fetchHtml } from "../src/lib/scraper/fetch";
import { allLinks, discoverLinks, discoverFromFeed, looksLikeFeed } from "../src/lib/scraper/discover";
import { defaultTierFor } from "../src/lib/scraper/schedule";
import { registrableDomain, isOfficialUrl } from "../src/lib/orgs";

const APPLY = process.argv.includes("--apply");
const RECHECK = process.argv.includes("--recheck");

type Candidate = {
  name: string;
  url: string;
  sector: string;
  org?: string;
  kind?: "html" | "rss";
  /**
   * "official" — the body's own site, or a government-run listing. Publishable.
   * "aggregator" — third-party listing. Discovery only: the crawler follows it
   *   to the official domain and reads the notice there, never from the
   *   aggregator itself.
   */
  trust?: "official" | "aggregator";
};

const CANDIDATES: Candidate[] = [
  // ---- Central commissions & major recruiters ----
  { name: "SSC — Notice board", url: "https://ssc.gov.in/", sector: "central_govt", org: "SSC" },
  { name: "UPSC — What's new", url: "https://upsc.gov.in/whats-new", sector: "central_govt", org: "UPSC" },
  { name: "UPSC — Examinations", url: "https://upsc.gov.in/examinations/active-examinations", sector: "central_govt", org: "UPSC" },
  { name: "India Post GDS", url: "https://indiapostgdsonline.gov.in/", sector: "central_govt", org: "INDIAPOST" },
  { name: "India Post — Recruitment", url: "https://www.indiapost.gov.in/VAS/Pages/Recruitments.aspx", sector: "central_govt", org: "INDIAPOST" },
  { name: "ISRO — Careers", url: "https://www.isro.gov.in/Careers.html", sector: "central_govt", org: "ISRO" },
  { name: "NTA — Notifications", url: "https://nta.ac.in/", sector: "central_govt", org: "NTA" },
  { name: "NBEMS — Notices", url: "https://natboard.edu.in/", sector: "central_govt", org: "NBEMS" },
  { name: "AIIMS Exams", url: "https://www.aiimsexams.ac.in/", sector: "central_govt", org: "AIIMS" },
  { name: "CSIR — Vacancies", url: "https://www.csir.res.in/careers", sector: "central_govt", org: "CSIR" },
  { name: "PFRDA — Careers", url: "https://www.pfrda.org.in/index1.cshtml?lsid=237", sector: "central_govt", org: "PFRDA" },
  { name: "DRDO RAC — Advertisements", url: "https://rac.gov.in/", sector: "central_govt" },
  { name: "ESIC — Recruitments", url: "https://www.esic.gov.in/recruitments", sector: "central_govt" },
  { name: "EPFO — Recruitment", url: "https://www.epfindia.gov.in/site_en/Recruitments.php", sector: "central_govt" },
  { name: "Supreme Court of India — Recruitment", url: "https://www.sci.gov.in/recruitment/", sector: "central_govt" },
  { name: "Delhi High Court — Recruitment", url: "https://delhihighcourt.nic.in/recruitment", sector: "central_govt", org: "DELHIHC" },

  // ---- Banking & insurance ----
  { name: "IBPS — Announcements", url: "https://www.ibps.in/", sector: "banking_insurance", org: "IBPS" },
  { name: "SBI — Careers", url: "https://sbi.co.in/web/careers", sector: "banking_insurance", org: "SBI" },
  { name: "RBI — Vacancies", url: "https://www.rbi.org.in/Scripts/Vacancies.aspx", sector: "banking_insurance", org: "RBI" },
  { name: "LIC — Careers", url: "https://licindia.in/careers", sector: "banking_insurance", org: "LIC" },
  { name: "NABARD — Careers", url: "https://www.nabard.org/careers.aspx", sector: "banking_insurance" },
  { name: "Bank of Baroda — Careers", url: "https://www.bankofbaroda.in/career", sector: "banking_insurance", org: "BOB" },
  { name: "Bank of India — Careers", url: "https://bankofindia.co.in/career", sector: "banking_insurance", org: "BOI" },
  { name: "Punjab National Bank — Recruitment", url: "https://www.pnbindia.in/Recruitments.html", sector: "banking_insurance", org: "PNB" },
  { name: "Canara Bank — Careers", url: "https://canarabank.com/pages/careers", sector: "banking_insurance" },
  { name: "Union Bank — Recruitment", url: "https://www.unionbankofindia.co.in/english/recruitment.aspx", sector: "banking_insurance" },
  { name: "UIIC — Recruitment", url: "https://uiic.co.in/en/recruitment", sector: "banking_insurance", org: "UIIC" },

  // ---- Railways ----
  { name: "RRB Chandigarh — Notices", url: "https://www.rrbcdg.gov.in/", sector: "railways", org: "RRB" },
  { name: "RRB Apply — Live CENs", url: "https://www.rrbapply.gov.in/", sector: "railways", org: "RRB" },
  { name: "Indian Railways — Recruitment", url: "https://indianrailways.gov.in/railwayboard/view_section.jsp?lang=0&id=0,7,1281", sector: "railways", org: "INDIANRAILWAYS" },

  // ---- Defence & paramilitary ----
  { name: "Join Indian Army", url: "https://joinindianarmy.nic.in/", sector: "defence", org: "ARMY" },
  { name: "Join Indian Navy", url: "https://www.joinindiannavy.gov.in/", sector: "defence", org: "NAVY" },
  { name: "Indian Air Force — Careers", url: "https://indianairforce.nic.in/", sector: "defence" },
  { name: "Indian Coast Guard — Recruitment", url: "https://joinindiancoastguard.cdac.in/", sector: "defence" },
  { name: "BSF — Recruitment", url: "https://rectt.bsf.gov.in/", sector: "defence" },
  { name: "CISF — Recruitment", url: "https://www.cisf.gov.in/", sector: "defence" },
  { name: "ITBP — Recruitment", url: "https://recruitment.itbpolice.nic.in/", sector: "defence" },

  // ---- PSUs ----
  { name: "NTPC — Careers", url: "https://careers.ntpc.co.in/", sector: "psu", org: "NTPC" },
  { name: "ONGC — Careers", url: "https://ongcindia.com/web/eng/career", sector: "psu", org: "ONGC" },
  { name: "IOCL — Careers", url: "https://iocl.com/latest-job-openings", sector: "psu", org: "IOCL" },
  { name: "POWERGRID — Careers", url: "https://www.powergrid.in/careers", sector: "psu", org: "POWERGRID" },
  { name: "BEL — Careers", url: "https://bel-india.in/careers/", sector: "psu", org: "BEL" },
  { name: "NPCIL — Careers", url: "https://npcilcareers.co.in/", sector: "psu", org: "NPCIL" },
  { name: "ECIL — Careers", url: "https://www.ecil.co.in/careers.html", sector: "psu", org: "ECIL" },
  { name: "RITES — Careers", url: "https://rites.com/careers", sector: "psu", org: "RITES" },
  { name: "CONCOR — Careers", url: "https://www.concorindia.co.in/career.jsp", sector: "psu", org: "CONCOR" },
  { name: "RCFL — Careers", url: "https://www.rcfltd.com/careers", sector: "psu", org: "RCFL" },
  { name: "NSPCL — Careers", url: "https://www.nspcl.co.in/pages/career", sector: "psu", org: "NSPCL" },
  { name: "SAIL — Careers", url: "https://sail.co.in/en/jobs", sector: "psu" },
  { name: "GAIL — Careers", url: "https://gailonline.com/HRCareers.html", sector: "psu" },
  { name: "HAL — Careers", url: "https://hal-india.co.in/Career", sector: "psu" },
  { name: "BHEL — Careers", url: "https://www.bhel.com/careers", sector: "psu" },

  // ---- State public service commissions ----
  { name: "BPSC — Advertisements", url: "https://www.bpsc.bihar.gov.in/", sector: "state_psc", org: "BPSC" },
  { name: "BPSSC — Advertisements", url: "https://bpssc.bihar.gov.in/", sector: "state_psc", org: "BPSSC" },
  { name: "UPPSC — Advertisements", url: "https://uppsc.up.nic.in/Notifications.aspx", sector: "state_psc", org: "UPPSC" },
  { name: "UPSSSC — Advertisements", url: "https://upsssc.gov.in/AllNotifications.aspx", sector: "state_psc", org: "UPSSSC" },
  { name: "MPPSC — Advertisements", url: "https://mppsc.mp.gov.in/advertisements", sector: "state_psc", org: "MPPSC" },
  { name: "MPESB — Advertisements", url: "https://esb.mp.gov.in/", sector: "state_psc", org: "MPESB" },
  { name: "RPSC — Recruitment", url: "https://rpsc.rajasthan.gov.in/recruitmentadvertisement", sector: "state_psc" },
  { name: "MPSC Maharashtra", url: "https://mpsc.gov.in/", sector: "state_psc" },
  { name: "TNPSC — Notifications", url: "https://www.tnpsc.gov.in/English/Notification.aspx", sector: "state_psc" },
  { name: "KPSC Karnataka", url: "https://kpsc.kar.nic.in/", sector: "state_psc" },
  { name: "TSPSC Telangana", url: "https://www.tspsc.gov.in/", sector: "state_psc" },
  { name: "APPSC Andhra Pradesh", url: "https://psc.ap.gov.in/", sector: "state_psc" },
  { name: "WBPSC West Bengal", url: "https://wbpsc.gov.in/", sector: "state_psc" },
  { name: "JPSC Jharkhand", url: "https://jpsc.gov.in/", sector: "state_psc" },
  { name: "CGPSC Chhattisgarh", url: "https://psc.cg.gov.in/", sector: "state_psc" },
  { name: "HPSC Haryana", url: "https://hpsc.gov.in/en-us/Advertisement", sector: "state_psc" },
  { name: "HPPSC Himachal", url: "https://www.hppsc.hp.gov.in/hppsc/", sector: "state_psc", org: "HPPSC" },
  { name: "PPSC Punjab", url: "https://ppsc.gov.in/", sector: "state_psc" },
  { name: "UKPSC Uttarakhand", url: "https://psc.uk.gov.in/", sector: "state_psc", org: "UKPSC" },
  { name: "GPSC Gujarat", url: "https://gpsc.gujarat.gov.in/", sector: "state_psc" },
  { name: "OPSC Odisha", url: "https://www.opsc.gov.in/", sector: "state_psc" },
  { name: "Kerala PSC", url: "https://www.keralapsc.gov.in/notifications", sector: "state_psc" },
  { name: "APSC Assam", url: "https://apsc.nic.in/", sector: "state_psc" },

  // ---- State staff selection boards (the high-volume, non-PSC recruiters) ----
  { name: "DSSSB Delhi", url: "https://dsssb.delhi.gov.in/", sector: "state_psc" },
  { name: "BSSC Bihar", url: "https://bssc.bihar.gov.in/", sector: "state_psc" },
  { name: "UP Police Recruitment Board", url: "https://uppbpb.gov.in/", sector: "state_psc" },
  { name: "RSMSSB Rajasthan", url: "https://rsmssb.rajasthan.gov.in/", sector: "state_psc" },
  { name: "HSSC Haryana", url: "https://hssc.gov.in/", sector: "state_psc" },
  { name: "JSSC Jharkhand", url: "https://jssc.nic.in/", sector: "state_psc" },
  { name: "OSSC Odisha", url: "https://www.ossc.gov.in/", sector: "state_psc" },
  { name: "WB Police Recruitment Board", url: "https://wbpolice.gov.in/", sector: "state_psc" },
  { name: "MahaTransco / Maharashtra jobs", url: "https://www.mahadiscom.in/en/careers/", sector: "state_psc" },

  // ---- More central bodies ----
  { name: "SEBI — Careers", url: "https://www.sebi.gov.in/careers.html", sector: "banking_insurance" },
  { name: "IRDAI — Careers", url: "https://irdai.gov.in/careers", sector: "banking_insurance" },
  { name: "BARC — Careers", url: "https://www.barc.gov.in/careers/", sector: "central_govt" },
  { name: "ICAR — Recruitment", url: "https://icar.org.in/recruitment", sector: "central_govt" },
  { name: "NIELIT — Recruitment", url: "https://www.nielit.gov.in/content/recruitment", sector: "central_govt" },
  { name: "NHPC — Careers", url: "https://www.nhpcindia.com/career", sector: "psu" },
  { name: "SJVN — Careers", url: "https://www.sjvn.nic.in/career", sector: "psu" },
  { name: "Central Bank of India — Recruitment", url: "https://www.centralbankofindia.co.in/en/recruitment", sector: "banking_insurance" },
  { name: "Indian Bank — Careers", url: "https://www.indianbank.in/careers/", sector: "banking_insurance" },

  // ---- Government-run listings ----
  // These are aggregators in form but official in status: Employment News is
  // the Government of India's own weekly recruitment publication, and NCS is
  // the Ministry of Labour's national portal. Trusted as sources.
  { name: "Employment News — Job highlights", url: "https://www.employmentnews.gov.in/", sector: "central_govt", trust: "official" },
  { name: "National Career Service", url: "https://www.ncs.gov.in/", sector: "central_govt", trust: "official" },
  { name: "PIB — Press releases", url: "https://www.pib.gov.in/allRel.aspx", sector: "central_govt", trust: "official" },

  // ---- Third-party aggregators: DISCOVERY ONLY ----
  // The crawler follows these to the official domain and reads the notice
  // there. Nothing is ever published from the aggregator's own page, because
  // their transcriptions carry stale dates and typos often enough that
  // "verified at the source" would stop being true.
  { name: "SarkariResult (discovery only)", url: "https://www.sarkariresult.com/", sector: "central_govt", trust: "aggregator" },
  { name: "FreeJobAlert (discovery only)", url: "https://www.freejobalert.com/", sector: "central_govt", trust: "aggregator" },
  { name: "SarkariExam (discovery only)", url: "https://sarkariexam.com/", sector: "central_govt", trust: "aggregator" },
];

type Probe = { candidate: Candidate; status: string; links: number; note: string; resolvedUrl?: string };

const INCLUDE =
  "recruit|notification|advertisement|advt|vacanc|bharti|भर्ती|विज्ञापन|engagement|walk-in|apprentice|career|opening|notice";
const EXCLUDE =
  "result|answer key|admit card|syllabus|tender|archive|gallery|login|register|previous|next|sitemap|privacy|disclaimer";

function countNoticeLinks(body: string, url: string, aggregator: boolean): number {
  if (looksLikeFeed(body)) return discoverFromFeed(body, url).length;
  if (aggregator) {
    // An aggregator is probed the way it is crawled: every link counts, because
    // what matters is how many of them lead somewhere official — not whether
    // their anchor text happens to contain our keywords.
    return allLinks(body, url).length;
  }
  return discoverLinks(body, url, { linkSelector: "a", includePattern: INCLUDE, excludePattern: EXCLUDE }).length;
}

/** Words a recruitment section is signposted with, on Indian public portals. */
const SECTION_HINT =
  /recruit|career|vacanc|job|opportunit|advertisement|advt|notification|what'?s\s*new|notice\s*board|भर्ती|विज्ञापन|रोजगार|नौकरी/i;

/**
 * Find a body's real recruitment page, starting from its domain root.
 *
 * Hardcoding "https://x.gov.in/careers" is guesswork that rots: these portals
 * restructure constantly, which is why so many of the candidate paths returned
 * 404. Far better to open the front page, read where it says its own
 * recruitment section is, and try those — the site tells us the answer.
 */
async function findRecruitmentPage(
  rootUrl: string,
  aggregator: boolean,
): Promise<{ url: string; links: number } | null> {
  let origin: string;
  try {
    origin = new URL(rootUrl).origin;
  } catch {
    return null;
  }

  let rootBody: string;
  try {
    rootBody = await fetchHtml(origin, 25_000);
  } catch {
    return null;
  }

  // The root itself may already be the listing.
  const rootLinks = countNoticeLinks(rootBody, origin, aggregator);
  let best: { url: string; links: number } | null = rootLinks >= 3 ? { url: origin, links: rootLinks } : null;

  const sections = allLinks(rootBody, origin)
    .filter((l) => SECTION_HINT.test(`${l.text ?? ""} ${l.url}`))
    .filter((l) => {
      try {
        return new URL(l.url).origin === origin;
      } catch {
        return false;
      }
    })
    .slice(0, 8);

  for (const section of sections) {
    try {
      const body = await fetchHtml(section.url, 20_000);
      const links = countNoticeLinks(body, section.url, aggregator);
      if (links > (best?.links ?? 0)) best = { url: section.url, links };
    } catch {
      /* a dead section link is not a reason to stop */
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  return best && best.links >= 3 ? best : null;
}

/**
 * Is crawling this path disallowed for everyone?
 *
 * A courtesy check, not a security boundary — but a public-interest project
 * scraping public bodies should not be ignoring their stated wishes, and a
 * disallowed path is also a good hint that we are pointed at the wrong URL.
 */
async function robotsAllows(url: string): Promise<boolean> {
  try {
    const u = new URL(url);
    const txt = await fetchHtml(`${u.origin}/robots.txt`, 10_000);
    if (!/user-agent:\s*\*/i.test(txt)) return true;
    const section = txt.split(/user-agent:\s*\*/i)[1]?.split(/user-agent:/i)[0] ?? "";
    const disallowed = [...section.matchAll(/disallow:\s*(\S+)/gi)].map((m) => m[1]);
    return !disallowed.some((d) => d === "/" || (d.length > 1 && u.pathname.startsWith(d)));
  } catch {
    return true; // no robots.txt, or unreachable — not a reason to refuse
  }
}

/** Few links but lots of script usually means the listing is client-rendered. */
function looksJsRendered(body: string, linkCount: number): boolean {
  if (linkCount > 3) return false;
  const scripts = (body.match(/<script[\s>]/gi) ?? []).length;
  const anchors = (body.match(/<a[\s>]/gi) ?? []).length;
  return scripts >= 3 && anchors < 10;
}

async function probe(c: Candidate): Promise<Probe> {
  const aggregator = c.trust === "aggregator";
  if (!(await robotsAllows(c.url))) {
    return { candidate: c, status: "disallowed", links: 0, note: "robots.txt disallows this path" };
  }

  let body: string | null = null;
  let firstError = "";
  try {
    body = await fetchHtml(c.url, 25_000);
  } catch (err) {
    firstError = (err instanceof Error ? err.message : String(err)).slice(0, 90);
  }

  if (body) {
    const feed = c.kind === "rss" || looksLikeFeed(body);
    const links = countNoticeLinks(body, c.url, aggregator);
    if (links > 0) {
      const notes: string[] = [feed ? "feed" : "html"];
      if (aggregator) notes.push("discovery only");
      return { candidate: c, status: "ok", links, note: notes.join(" · ") };
    }
    // Reachable but empty — the notices are probably on a sub-page.
    const found = await findRecruitmentPage(c.url, aggregator);
    if (found) {
      return { candidate: c, status: "ok", links: found.links, note: `html · found real listing`, resolvedUrl: found.url };
    }
    const notes = ["html"];
    if (looksJsRendered(body, 0)) notes.push("likely JavaScript-rendered");
    return { candidate: c, status: "no-links", links: 0, note: notes.join(" · ") };
  }

  // The given path failed. Try to find the right one from the domain root
  // before writing the whole body off — a 404 usually means the site moved its
  // recruitment page, not that it stopped recruiting.
  const found = await findRecruitmentPage(c.url, aggregator);
  if (found) {
    return { candidate: c, status: "ok", links: found.links, note: `recovered from root (${firstError})`, resolvedUrl: found.url };
  }
  return { candidate: c, status: "unreachable", links: 0, note: firstError };
}

async function main() {
  console.log(APPLY ? ">>> APPLY MODE\n" : ">>> DRY RUN — probing only, nothing written\n");

  const existing = await prisma.source.findMany({ select: { url: true } });
  const have = new Set(existing.map((s) => s.url));
  const todo = RECHECK ? CANDIDATES : CANDIDATES.filter((c) => !have.has(c.url));
  console.log(`${CANDIDATES.length} candidates · ${todo.length} to probe · ${CANDIDATES.length - todo.length} already present\n`);

  const results: Probe[] = [];
  // Sequential and unhurried: these are public services, not a load test.
  for (const c of todo) {
    const r = await probe(c);
    results.push(r);
    const mark = r.status === "ok" ? "+" : r.status === "no-links" ? "?" : "!";
    console.log(`  ${mark} ${String(r.links).padStart(3)} links  ${c.name}`);
    if (r.resolvedUrl) console.log(`             -> ${r.resolvedUrl}`);
    if (r.status !== "ok") console.log(`             ${r.note}`);
    await new Promise((res) => setTimeout(res, 800));
  }

  const good = results.filter((r) => r.status === "ok");
  const empty = results.filter((r) => r.status === "no-links");
  const dead = results.filter((r) => r.status === "unreachable");
  const blocked = results.filter((r) => r.status === "disallowed");
  const js = results.filter((r) => r.note.includes("JavaScript-rendered"));

  console.log(`\n${"=".repeat(72)}`);
  console.log(`  ${good.length} usable · ${empty.length} reachable but no links · ${dead.length} unreachable · ${blocked.length} disallowed by robots.txt`);
  if (js.length) {
    console.log(`\n  ${js.length} look JavaScript-rendered. Static fetching cannot see those`);
    console.log(`  listings at all — they need a headless browser, or a direct URL to the`);
    console.log(`  underlying notice page.`);
    for (const r of js) console.log(`     ${r.candidate.name}`);
  }
  const aggregators = good.filter((r) => r.candidate.trust === "aggregator");
  if (aggregators.length) {
    console.log(`\n  ${aggregators.length} aggregator(s) added as DISCOVERY ONLY — the crawler follows`);
    console.log(`  them to the official domain and reads the notice there. Nothing is`);
    console.log(`  published from an aggregator's own page.`);
  }
  console.log(`\n  "no links" usually means the listing is rendered by JavaScript, or the`);
  console.log(`  notices sit on a sub-page. Those need a specific URL rather than the`);
  console.log(`  site root — worth doing by hand for the bodies you care about most.`);

  if (!APPLY) {
    console.log("\n  Dry run. Re-run with --apply to add the usable ones.\n");
    await prisma.$disconnect();
    return;
  }

  let added = 0;
  for (const r of good) {
    const c = r.candidate;
    const url = r.resolvedUrl ?? c.url;
    if (have.has(url)) continue;
    const org = c.org ? await prisma.organization.findFirst({ where: { shortName: c.org } }) : null;
    const tier = defaultTierFor({ sector: c.sector, name: c.name, shortName: c.org, url });
    await prisma.source.create({
      data: {
        name: c.name,
        url,
        sector: c.sector,
        kind: r.note.startsWith("feed") ? "rss" : "html",
        trust: c.trust ?? "official",
        organizationId: org?.id ?? null,
        tier,
        active: true,
      },
    });
    // Teach the resolver this domain so notices from it never go unassigned.
    if (org) {
      const domain = registrableDomain(url);
      const current = Array.isArray(org.domains) ? (org.domains as string[]) : [];
      if (domain && !current.includes(domain)) {
        await prisma.organization.update({ where: { id: org.id }, data: { domains: [...current, domain] } });
      }
    }
    added++;
  }
  console.log(`\n  Added ${added} source(s).\n`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect().catch(() => {}); process.exit(1); });
