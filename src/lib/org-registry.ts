// Canonical registry of Indian recruitment bodies.
//
// Each entry is the single row that should exist for that body, plus the
// domains it publishes from and the patterns that identify the fragmented
// rows the old scraper created for it. Order matters: more specific entries
// must come before the general ones they would otherwise be swallowed by
// (NSPCL before NTPC, CSIR-NGRI before CSIR, BPSSC before BPSC).
//
// Anything that matches nothing here is left untouched and reported, so a body
// is never merged on a guess.

export type CanonicalOrg = {
  shortName: string;
  name: string;
  sector: string;
  state?: string;
  officialWebsite: string;
  /** Registrable domains this body publishes notices from. */
  domains: string[];
  /** Patterns identifying rows that belong to this body. Tested case-insensitively. */
  match: RegExp[];
};

export const CANONICAL_ORGS: CanonicalOrg[] = [
  // ---- Central commissions -------------------------------------------------
  {
    shortName: "UPSC", name: "Union Public Service Commission", sector: "central_govt",
    officialWebsite: "https://upsc.gov.in", domains: ["upsc.gov.in", "upsconline.nic.in"],
    match: [/union public service commission/i, /\bupsc\b/i],
  },
  {
    shortName: "SSC", name: "Staff Selection Commission", sector: "central_govt",
    officialWebsite: "https://ssc.gov.in", domains: ["ssc.gov.in", "ssc.nic.in"],
    match: [/staff selection commission/i, /\bssc\b/i],
  },

  // ---- Banking & insurance -------------------------------------------------
  {
    shortName: "IBPS", name: "Institute of Banking Personnel Selection", sector: "banking_insurance",
    officialWebsite: "https://www.ibps.in", domains: ["ibps.in"],
    match: [/institute of banking personnel/i, /\bibps\b/i],
  },
  {
    shortName: "SBI", name: "State Bank of India", sector: "banking_insurance",
    officialWebsite: "https://bank.sbi", domains: ["sbi.co.in", "bank.sbi", "sbi.bank.in"],
    match: [/state bank of india/i, /\bsbi\b/i],
  },
  {
    shortName: "RBI", name: "Reserve Bank of India", sector: "banking_insurance",
    officialWebsite: "https://opportunities.rbi.org.in", domains: ["rbi.org.in"],
    match: [/reserve bank of india/i, /\brbi\b/i],
  },
  {
    shortName: "LIC", name: "Life Insurance Corporation of India", sector: "banking_insurance",
    officialWebsite: "https://licindia.in", domains: ["licindia.in"],
    match: [/life insurance corporation/i, /\blic\b/i],
  },
  {
    shortName: "BOI", name: "Bank of India", sector: "banking_insurance",
    officialWebsite: "https://bankofindia.co.in", domains: ["bankofindia.co.in"],
    match: [/bank of india/i, /\bboi\b/i],
  },
  {
    shortName: "BOB", name: "Bank of Baroda", sector: "banking_insurance",
    officialWebsite: "https://www.bankofbaroda.in", domains: ["bankofbaroda.in", "bankofbaroda.co.in"],
    match: [/bank of baroda/i],
  },
  {
    shortName: "PNB", name: "Punjab National Bank", sector: "banking_insurance",
    officialWebsite: "https://www.pnbindia.in", domains: ["pnbindia.in"],
    match: [/punjab national bank/i, /\bpnb\b/i],
  },
  {
    shortName: "UIIC", name: "United India Insurance Company", sector: "banking_insurance",
    officialWebsite: "https://uiic.co.in", domains: ["uiic.co.in"],
    match: [/united india insurance/i, /\buiic\b/i],
  },

  // ---- Railways ------------------------------------------------------------
  {
    shortName: "RRB", name: "Railway Recruitment Boards", sector: "railways",
    officialWebsite: "https://www.rrbcdg.gov.in", domains: ["rrbcdg.gov.in", "rrbapply.gov.in"],
    match: [/railway recruitment board/i, /\brrb\b(?!.*gramin)/i, /\bcen \d/i],
  },
  {
    shortName: "INDIANRAILWAYS", name: "Indian Railways, Ministry of Railways", sector: "railways",
    officialWebsite: "https://indianrailways.gov.in", domains: ["indianrailways.gov.in"],
    match: [/ministry of railways/i, /indian railways/i, /\brrc\b/i],
  },

  // ---- Defence -------------------------------------------------------------
  {
    shortName: "ARMY", name: "Indian Army", sector: "defence",
    officialWebsite: "https://joinindianarmy.nic.in", domains: ["joinindianarmy.nic.in"],
    match: [/indian army/i],
  },
  {
    shortName: "NAVY", name: "Indian Navy", sector: "defence",
    officialWebsite: "https://www.joinindiannavy.gov.in", domains: ["joinindiannavy.gov.in"],
    match: [/indian navy/i],
  },

  // ---- PSUs ----------------------------------------------------------------
  {
    shortName: "NSPCL", name: "NTPC-SAIL Power Company Limited (NSPCL)", sector: "psu",
    officialWebsite: "https://www.nspcl.co.in", domains: ["nspcl.co.in"],
    match: [/\bnspcl\b/i, /ntpc[\s-]*sail/i],
  },
  {
    shortName: "NTPC", name: "NTPC Limited", sector: "psu",
    officialWebsite: "https://careers.ntpc.co.in", domains: ["ntpc.co.in"],
    match: [/\bntpc\b/i],
  },
  {
    shortName: "RCFL", name: "Rashtriya Chemicals and Fertilizers Limited", sector: "psu",
    officialWebsite: "https://www.rcfltd.com", domains: ["rcfltd.com"],
    match: [/rashtriya chemicals/i, /\brcfl?\b/i],
  },
  {
    shortName: "CONCOR", name: "Container Corporation of India Limited", sector: "psu",
    officialWebsite: "https://www.concorindia.co.in", domains: ["concorindia.co.in", "concorindia.com"],
    match: [/container corporation/i, /\bconcor\b/i],
  },
  {
    shortName: "IOCL", name: "Indian Oil Corporation Limited", sector: "psu",
    officialWebsite: "https://www.iocl.com", domains: ["iocl.com"],
    match: [/indian oil corporation/i, /\biocl\b/i],
  },
  {
    shortName: "ONGC", name: "Oil and Natural Gas Corporation", sector: "psu",
    officialWebsite: "https://ongcindia.com", domains: ["ongcindia.com"],
    match: [/oil and natural gas/i, /\bongc\b/i],
  },
  {
    shortName: "POWERGRID", name: "Power Grid Corporation of India Limited", sector: "psu",
    officialWebsite: "https://www.powergrid.in", domains: ["powergrid.in"],
    match: [/power grid corporation/i, /\bpowergrid\b/i],
  },
  {
    shortName: "BEL", name: "Bharat Electronics Limited", sector: "psu",
    officialWebsite: "https://bel-india.in", domains: ["bel-india.in"],
    match: [/bharat electronics/i, /\bbel\b/i],
  },
  {
    shortName: "ECIL", name: "Electronics Corporation of India Limited", sector: "psu",
    officialWebsite: "https://www.ecil.co.in", domains: ["ecil.co.in"],
    match: [/electronics corporation of india/i, /\becil\b/i],
  },
  {
    shortName: "NPCIL", name: "Nuclear Power Corporation of India Limited", sector: "psu",
    officialWebsite: "https://npcilcareers.co.in", domains: ["npcil.nic.in", "npcilcareers.co.in"],
    match: [/nuclear power corporation/i, /\bnpcil\b/i],
  },
  {
    shortName: "RITES", name: "RITES Limited", sector: "psu",
    officialWebsite: "https://rites.com", domains: ["rites.com"],
    match: [/\brites\b/i],
  },

  // ---- Central departments & agencies -------------------------------------
  {
    shortName: "INDIAPOST", name: "Department of Posts, Ministry of Communications", sector: "central_govt",
    officialWebsite: "https://www.indiapost.gov.in", domains: ["indiapost.gov.in", "indiapostgdsonline.gov.in"],
    match: [/department of posts/i, /india post/i, /gramin dak sevak/i, /\bgds\b/i],
  },
  {
    shortName: "ISRO", name: "Indian Space Research Organisation", sector: "central_govt",
    officialWebsite: "https://www.isro.gov.in", domains: ["isro.gov.in", "apps.isro.gov.in"],
    match: [/indian space research/i, /\bisro\b/i],
  },
  {
    shortName: "NIC", name: "National Informatics Centre", sector: "central_govt",
    officialWebsite: "https://www.nic.in", domains: ["nic.in", "recruitment.nic.in"],
    match: [/national informatics centre/i, /\bnic\b(?!.*ngri)/i],
  },
  {
    shortName: "NTA", name: "National Testing Agency", sector: "central_govt",
    officialWebsite: "https://nta.ac.in", domains: ["nta.ac.in", "nta.nic.in"],
    match: [/national testing agency/i, /\bnta\b/i],
  },
  {
    shortName: "NBEMS", name: "National Board of Examinations in Medical Sciences", sector: "central_govt",
    officialWebsite: "https://natboard.edu.in", domains: ["natboard.edu.in"],
    match: [/national board of examinations/i, /\bnbems?\b/i],
  },
  {
    shortName: "CSIRNGRI", name: "CSIR - National Geophysical Research Institute (NGRI)", sector: "central_govt",
    officialWebsite: "https://www.ngri.res.in", domains: ["ngri.res.in"],
    match: [/\bngri\b/i, /geophysical/i],
  },
  {
    shortName: "CSIR", name: "Council of Scientific & Industrial Research", sector: "central_govt",
    officialWebsite: "https://www.csir.res.in", domains: ["csir.res.in"],
    match: [/council of scientific/i, /\bcsir\b/i],
  },
  {
    shortName: "AIIMS", name: "All India Institute of Medical Sciences", sector: "central_govt",
    officialWebsite: "https://www.aiims.edu", domains: ["aiims.edu", "aiimsexams.ac.in"],
    match: [/all india institute of medical/i, /\baiims\b/i],
  },
  {
    shortName: "PFRDA", name: "Pension Fund Regulatory and Development Authority", sector: "central_govt",
    officialWebsite: "https://www.pfrda.org.in", domains: ["pfrda.org.in"],
    match: [/pension fund regulatory/i, /\bpfrda\b/i],
  },
  {
    shortName: "NHM", name: "National Health Mission", sector: "central_govt",
    officialWebsite: "https://nhm.gov.in", domains: ["nhm.gov.in"],
    match: [/national health mission/i, /\bnhm\b/i],
  },
  {
    shortName: "DELHIHC", name: "High Court of Delhi", sector: "central_govt", state: "Delhi",
    officialWebsite: "https://delhihighcourt.nic.in", domains: ["delhihighcourt.nic.in"],
    match: [/high court of delhi/i, /delhi high court/i],
  },

  // ---- State commissions ---------------------------------------------------
  {
    shortName: "BPSSC", name: "Bihar Police Subordinate Services Commission", sector: "state_psc", state: "Bihar",
    officialWebsite: "https://bpssc.bihar.gov.in", domains: ["bpssc.bihar.gov.in", "bpssc.bih.nic.in"],
    match: [/bihar police subordinate/i, /\bbpssc\b/i],
  },
  {
    shortName: "BPSC", name: "Bihar Public Service Commission", sector: "state_psc", state: "Bihar",
    officialWebsite: "https://www.bpsc.bihar.gov.in", domains: ["bpsc.bihar.gov.in", "bpsc.bih.nic.in"],
    match: [/bihar public service commission/i, /\bbpsc\b/i],
  },
  {
    shortName: "MPESB", name: "Madhya Pradesh Employee Selection Board", sector: "state_psc", state: "Madhya Pradesh",
    officialWebsite: "https://esb.mp.gov.in", domains: ["esb.mp.gov.in", "peb.mp.gov.in"],
    match: [/madhya pradesh employee selection/i, /\bmpesb\b/i, /\bmppolice/i, /\bmpps\b/i],
  },
  {
    shortName: "MPPSC", name: "Madhya Pradesh Public Service Commission", sector: "state_psc", state: "Madhya Pradesh",
    officialWebsite: "https://mppsc.mp.gov.in", domains: ["mppsc.mp.gov.in", "mppsc.nic.in"],
    match: [/madhya pradesh public service/i, /\bmppsc\b/i],
  },
  {
    shortName: "UPSSSC", name: "Uttar Pradesh Subordinate Services Selection Commission", sector: "state_psc", state: "Uttar Pradesh",
    officialWebsite: "https://upsssc.gov.in", domains: ["upsssc.gov.in"],
    match: [/uttar pradesh subordinate/i, /\bupsssc\b/i],
  },
  {
    shortName: "UPPSC", name: "Uttar Pradesh Public Service Commission", sector: "state_psc", state: "Uttar Pradesh",
    officialWebsite: "https://uppsc.up.nic.in", domains: ["uppsc.up.nic.in"],
    match: [/uttar pradesh public service/i, /\buppsc\b/i],
  },
  {
    shortName: "HPPSC", name: "Himachal Pradesh Public Service Commission", sector: "state_psc", state: "Himachal Pradesh",
    officialWebsite: "https://www.hppsc.hp.gov.in", domains: ["hppsc.hp.gov.in"],
    match: [/himachal pradesh public service/i, /\bhppsc\b/i],
  },
  {
    shortName: "UKPSC", name: "Uttarakhand Public Service Commission", sector: "state_psc", state: "Uttarakhand",
    officialWebsite: "https://psc.uk.gov.in", domains: ["psc.uk.gov.in", "ukpsc.net.in", "ukpsc.gov.in"],
    match: [/uttarakhand public service/i, /\bukpsc\b/i],
  },

  // ---- Education / entrance bodies -----------------------------------------
  {
    shortName: "NLUCONSORTIUM", name: "Consortium of National Law Universities", sector: "central_govt",
    officialWebsite: "https://consortiumofnlus.ac.in", domains: ["consortiumofnlus.ac.in"],
    match: [/consortium of national law/i, /\bclat\b/i],
  },
  {
    shortName: "IIMCAT", name: "Indian Institutes of Management (CAT)", sector: "central_govt",
    officialWebsite: "https://iimcat.ac.in", domains: ["iimcat.ac.in"],
    match: [/indian institutes of management/i, /\biimcat\b/i],
  },
  {
    shortName: "XLRI", name: "XLRI - Xavier School of Management", sector: "central_govt", state: "Jharkhand",
    officialWebsite: "https://xatonline.in", domains: ["xatonline.in", "xlri.ac.in"],
    match: [/\bxlri\b/i, /\bxat\b/i],
  },
  {
    shortName: "GATE", name: "GATE - National Coordination Board, Ministry of Education", sector: "central_govt",
    officialWebsite: "https://gate.iitm.ac.in", domains: ["gate.iitm.ac.in", "gate2026.iitm.ac.in"],
    match: [/\bgate\b/i, /iit madras/i],
  },
];

/** First canonical entry whose patterns match this organisation name, if any. */
export function canonicalFor(name: string): CanonicalOrg | null {
  for (const entry of CANONICAL_ORGS) {
    if (entry.match.some((re) => re.test(name))) return entry;
  }
  return null;
}

/**
 * Resolve a whole organisation row, short name first.
 *
 * This ordering is what makes the repair idempotent. After one pass the rows
 * carry canonical names, and a canonical name does not necessarily contain its
 * own acronym: "NTPC-SAIL Power Company Limited" has no "NSPCL" in it, so a
 * second pass matched it on /ntpc/ and would have merged NSPCL into NTPC —
 * re-fragmenting in the opposite direction. A row already sitting at a
 * canonical short name IS that canonical row, and is left alone.
 */
export function canonicalForOrg(org: { name: string; shortName: string }): CanonicalOrg | null {
  const exact = CANONICAL_ORGS.find((c) => c.shortName.toUpperCase() === org.shortName.toUpperCase());
  if (exact) return exact;
  return canonicalFor(org.name) ?? canonicalFor(org.shortName);
}
