// Canonical organisation resolution.
//
// The scraper used to create one Organization per Source, named after the
// slugified source name. That is what produced sbisco / sbiwo / SBOI-411 —
// the same body split across a dozen rows. The fix is not a better prompt: it
// is to resolve against a canonical registry and to refuse to invent new
// organisations automatically.
//
// Resolution order, strongest signal first:
//   1. the Source's explicit organizationId
//   2. the registrable domain of the notice URL      (deterministic)
//   3. an exact match on name / shortName            (normalised)
//   4. a learned alias                               (assigned once by an admin)
//   5. an acronym in parentheses, e.g. "… (SSC)"
//   6. unresolved -> quarantine for review, never auto-create

import { prisma } from "./db";
import type { Organization } from "@prisma/client";


/** Indian public suffixes that need two labels kept, plus the common generics. */
const MULTI_LABEL_SUFFIXES = [
  "gov.in", "nic.in", "co.in", "ac.in", "org.in", "net.in", "res.in", "edu.in", "firm.in", "gen.in", "ind.in",
  "co.uk", "com.au",
];

/** "https://www.recruitment.sbi.co.in/x" -> "sbi.co.in" */
export function registrableDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  let host: string;
  try {
    host = new URL(input.includes("://") ? input : `https://${input}`).hostname.toLowerCase();
  } catch {
    return null;
  }
  host = host.replace(/^www\./, "");
  const parts = host.split(".");
  if (parts.length <= 2) return host;
  for (const suffix of MULTI_LABEL_SUFFIXES) {
    if (host.endsWith(`.${suffix}`)) {
      const labels = suffix.split(".").length;
      return parts.slice(-(labels + 1)).join(".");
    }
  }
  return parts.slice(-2).join(".");
}

/** Lowercase, punctuation-free form used for every name comparison. */
export function normalizeName(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(the|of|and|govt|government|india|indian|limited|ltd)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Pull "SSC" out of "Staff Selection Commission (SSC)". */
export function acronymIn(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = s.match(/\(([A-Z][A-Z0-9&.\-]{1,12})\)/);
  return m ? m[1].replace(/[^A-Z0-9]/g, "") : null;
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  return [];
}

export type OrgMatch = {
  organizationId: string;
  organization: Organization;
  confidence: "source" | "domain" | "name" | "alias" | "acronym";
};

type ResolveInput = {
  /** Source's own organizationId, if the admin linked one. */
  sourceOrganizationId?: string | null;
  /** URL the notice was discovered at — the best signal we have. */
  url?: string | null;
  /** Organisation name as extracted from the document, if any. */
  extractedName?: string | null;
};

/**
 * Resolve to an existing organisation, or null.
 *
 * Deliberately never creates. An unresolved notice is worth a single admin
 * click; an auto-created organisation is worth weeks of duplicate cleanup.
 */
export async function resolveOrganization(input: ResolveInput): Promise<OrgMatch | null> {
  if (input.sourceOrganizationId) {
    const org = await prisma.organization.findUnique({ where: { id: input.sourceOrganizationId } });
    if (org) return { organizationId: org.id, organization: org, confidence: "source" };
  }

  const orgs = await prisma.organization.findMany();

  // 2. Domain — deterministic, so it wins over anything name-based.
  const domain = registrableDomain(input.url);
  if (domain) {
    for (const org of orgs) {
      const declared = asStringArray(org.domains).map((d) => d.toLowerCase());
      const fromWebsite = registrableDomain(org.officialWebsite);
      if (declared.includes(domain) || fromWebsite === domain) {
        return { organizationId: org.id, organization: org, confidence: "domain" };
      }
    }
  }

  const wanted = normalizeName(input.extractedName);
  if (wanted) {
    // 3. Exact normalised name or short name.
    for (const org of orgs) {
      if (normalizeName(org.name) === wanted || normalizeName(org.shortName) === wanted) {
        return { organizationId: org.id, organization: org, confidence: "name" };
      }
    }
    // 4. A previously learned alias.
    for (const org of orgs) {
      if (asStringArray(org.aliases).some((a) => normalizeName(a) === wanted)) {
        return { organizationId: org.id, organization: org, confidence: "alias" };
      }
    }
  }

  // 5. Acronym in parentheses.
  const acro = normalizeName(acronymIn(input.extractedName));
  if (acro) {
    for (const org of orgs) {
      if (normalizeName(org.shortName) === acro || normalizeName(org.name) === acro) {
        return { organizationId: org.id, organization: org, confidence: "acronym" };
      }
      if (asStringArray(org.aliases).some((a) => normalizeName(a) === acro)) {
        return { organizationId: org.id, organization: org, confidence: "acronym" };
      }
    }
  }

  return null;
}

/**
 * Record a spelling so the same unknown name never reaches a human twice.
 * Call this from the admin action that assigns an organisation by hand.
 */
export async function learnAlias(organizationId: string, alias: string): Promise<void> {
  const clean = alias.trim();
  if (!clean) return;
  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!org) return;
  const existing = asStringArray(org.aliases);
  if (existing.some((a) => normalizeName(a) === normalizeName(clean))) return;
  await prisma.organization.update({
    where: { id: organizationId },
    data: { aliases: [...existing, clean] },
  });
}

/** Record a domain on an organisation so future notices resolve deterministically. */
export async function learnDomain(organizationId: string, url: string): Promise<void> {
  const domain = registrableDomain(url);
  if (!domain) return;
  const org = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!org) return;
  const existing = asStringArray(org.domains);
  if (existing.includes(domain)) return;
  await prisma.organization.update({
    where: { id: organizationId },
    data: { domains: [...existing, domain] },
  });
}

/** The bucket unresolved scraped notices are parked in, created on first use. */
export const UNASSIGNED_SHORTNAME = "unassigned";

export async function unassignedOrg(): Promise<Organization> {
  const existing = await prisma.organization.findFirst({ where: { shortName: UNASSIGNED_SHORTNAME } });
  if (existing) return existing;
  return prisma.organization.create({
    data: {
      name: "Unassigned — needs review",
      shortName: UNASSIGNED_SHORTNAME,
      sector: "central_govt",
      isVerified: false,
    },
  });
}

/**
 * Domains an Indian public body actually publishes from.
 *
 * Deliberately narrow. This is the gate that decides whether something may be
 * published as verified, so it accepts the government namespaces plus the
 * academic and research ones that conduct national exams — and nothing else.
 */
const OFFICIAL_SUFFIXES = [
  ".gov.in", ".nic.in", ".ac.in", ".res.in", ".edu.in", ".org.in", ".mil.in",
];

/** Domains of bodies that publish from a commercial TLD (PSUs, mostly). */
let cachedOrgDomains: Set<string> | null = null;
export async function officialOrgDomains(): Promise<Set<string>> {
  if (cachedOrgDomains) return cachedOrgDomains;
  const orgs = await prisma.organization.findMany({ select: { domains: true, officialWebsite: true } });
  const set = new Set<string>();
  for (const o of orgs) {
    for (const d of asStringArray(o.domains)) set.add(d.toLowerCase());
    const fromSite = registrableDomain(o.officialWebsite);
    if (fromSite) set.add(fromSite);
  }
  cachedOrgDomains = set;
  return set;
}

/**
 * May a notice at this URL be treated as coming from the source?
 *
 * True for the government namespaces, and for any domain a verified
 * Organization already declares. Everything else — aggregators, coaching sites,
 * news, link shorteners — is discovery material only.
 */
export async function isOfficialUrl(url: string | null | undefined): Promise<boolean> {
  const domain = registrableDomain(url);
  if (!domain) return false;
  if (OFFICIAL_SUFFIXES.some((suffix) => domain.endsWith(suffix) || domain === suffix.slice(1))) return true;
  return (await officialOrgDomains()).has(domain);
}

/** Compact list handed to the extraction model so it can only pick, never invent. */
export async function organizationChoices(): Promise<{ shortName: string; name: string }[]> {
  const orgs = await prisma.organization.findMany({
    where: { shortName: { not: UNASSIGNED_SHORTNAME } },
    select: { shortName: true, name: true },
    orderBy: { shortName: "asc" },
  });
  return orgs;
}
