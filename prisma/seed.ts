import "dotenv/config";
import { getNextNotificationSerialNumber } from "../src/lib/serial";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { SEED_NOTICES, SEED_ORGS, SEED_SOURCES, SEED_UPDATES } from "./seed-data";

const prisma = new PrismaClient();

function offset(days: number | null | undefined): string | null {
  if (days === null || days === undefined) return null;
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function upsertOrg(data: { shortName: string; name: string; sector: string; state?: string | null; officialWebsite?: string }) {
  const existing = await prisma.organization.findFirst({ where: { shortName: data.shortName } });
  if (existing) return existing;
  return prisma.organization.create({ data: { ...data, isVerified: true } });
}

async function upsertSource(data: { url: string; name: string; sector: string; organizationId?: string | null }) {
  const existing = await prisma.source.findFirst({ where: { url: data.url } });
  if (existing) return existing;
  return prisma.source.create({ data });
}

async function main() {
  console.log("Seeding organisations...");
  const orgIds = new Map<string, string>();
  for (const o of SEED_ORGS) {
    const org = await upsertOrg(o);
    orgIds.set(o.shortName, org.id);
  }

  const existingSamples = await prisma.notification.count({ where: { isSample: true } });
  if (existingSamples === 0) {
    console.log("Seeding sample notifications...");
    for (const n of SEED_NOTICES) {
      const organizationId = orgIds.get(n.org);
      if (!organizationId) continue;
      const org = SEED_ORGS.find((o) => o.shortName === n.org)!;
      await prisma.notification.create({
        data: {
          serialNumber: await getNextNotificationSerialNumber(),
          organizationId,
          title: n.title,
          titleHi: n.titleHi,
          summary: n.summary,
          summaryHi: n.summaryHi,
          postNames: n.postNames,
          advertisementNo: n.adv,
          totalVacancies: n.vacancies,
          vacancyBreakup: n.breakup,
          status: "published",
          sector: org.sector,
          state: n.state,
          location: n.location,
          minQualification: n.qual,
          qualificationDetails: n.qualDetails,
          streams: n.streams,
          minAge: n.minAge,
          maxAge: n.maxAge,
          ageCutoffDate: offset(n.cutoff),
          ageRelaxation: n.relax,
          experienceRequiredYears: n.exp,
          fees: n.fees,
          selectionProcess: n.selection,
          payLevel: n.pay,
          notificationDate: offset(n.notif),
          applyStart: offset(n.applyStart),
          applyLast: offset(n.applyLast),
          feeLast: offset(n.applyLast),
          examDate: offset(n.exam),
          admitCardDate: offset(n.admit),
          officialNotificationPdfUrl: n.pdf,
          applyUrl: n.apply,
          officialSourceUrl: n.src,
          sourceVerifiedAt: new Date(Date.now() - 86_400_000),
          isSample: true,
          origin: "manual",
        },
      });
    }
    for (const u of SEED_UPDATES) {
      const n = await prisma.notification.findFirst({ where: { advertisementNo: u.adv } });
      if (!n) continue;
      await prisma.notificationUpdate.create({
        data: { notificationId: n.id, type: u.type, title: u.title, link: n.officialSourceUrl, date: offset(-u.daysAgo)! },
      });
    }
  } else {
    console.log(`Skipping sample notifications (${existingSamples} already present).`);
  }

  console.log("Seeding scraper sources...");
  for (const s of SEED_SOURCES) {
    await upsertSource({ name: s.name, url: s.url, sector: s.sector, organizationId: orgIds.get(s.org) ?? null });
  }

  const email = (process.env.ADMIN_EMAIL || "admin@thenoticeboard.local").toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "ChangeMe!2026";
  const admin = await prisma.user.findUnique({ where: { email } });
  if (!admin) {
    await prisma.user.create({
      data: { email, passwordHash: await bcrypt.hash(password, 10), role: "admin", fullName: "Admin" },
    });
    console.log(`Created admin account ${email} (password from ADMIN_PASSWORD). Change it after first login.`);
  } else if (admin.role !== "admin") {
    await prisma.user.update({ where: { email }, data: { role: "admin" } });
  }
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
