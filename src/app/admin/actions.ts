"use server";

// Admin mutations: review approve/reject, source management, "run now".
// Every action revalidates the admin routes it touches; data goes to the DB
// via Prisma and pages re-read, so no client refetching is needed.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireStaff, requireAdmin } from "@/lib/auth";
import { runScrapeForSource } from "@/lib/scraper/run";

export type ActionState = { ok?: boolean; error?: string; message?: string } | undefined;

const QUALIFICATIONS = [
  "any", "10th", "12th", "diploma", "graduate", "engineering", "postgraduate", "phd",
] as const;

const reviewSchema = z.object({
  title: z.string().trim().min(3).max(300),
  titleHi: z.string().trim().max(300).optional().or(z.literal("")),
  summary: z.string().trim().max(1000).optional().or(z.literal("")),
  summaryHi: z.string().trim().max(1000).optional().or(z.literal("")),
  advertisementNo: z.string().trim().max(60).optional().or(z.literal("")),
  postNames: z.string().trim().max(1000).optional().or(z.literal("")),
  totalVacancies: z.preprocess(
    (v) => (v === "" || v == null ? null : Number(v)),
    z.number().int().positive().nullable(),
  ),
  minQualification: z.enum(QUALIFICATIONS),
  qualificationDetails: z.string().trim().max(500).optional().or(z.literal("")),
  minAge: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().min(0).nullable()),
  maxAge: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().min(0).nullable()),
  ageCutoffDate: z.string().max(10).optional().or(z.literal("")),
  applyLast: z.string().max(10).optional().or(z.literal("")),
  feeLast: z.string().max(10).optional().or(z.literal("")),
  examDate: z.string().max(10).optional().or(z.literal("")),
  admitCardDate: z.string().max(10).optional().or(z.literal("")),
  resultDate: z.string().max(10).optional().or(z.literal("")),
  notificationDate: z.string().max(10).optional().or(z.literal("")),
  state: z.string().trim().max(60).optional().or(z.literal("")),
  location: z.string().trim().max(120).optional().or(z.literal("")),
  payLevel: z.string().trim().max(60).optional().or(z.literal("")),
  selectionProcess: z.string().trim().max(300).optional().or(z.literal("")),
  applyUrl: z.string().url().or(z.literal("")),
  officialNotificationPdfUrl: z.string().url().or(z.literal("")),
  officialSourceUrl: z.string().url().or(z.literal("")),
  feeGeneral: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().min(0).nullable()),
  feeReserved: z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().int().min(0).nullable()),
  feeOther: z.string().trim().max(300).optional().or(z.literal("")),
  rejectReason: z.string().trim().max(600).optional().or(z.literal("")),
});

type ReviewInput = z.infer<typeof reviewSchema>;

function emptyToNull<T>(v: T | ""): T | null | undefined {
  return v === "" ? null : (v as T);
}

export async function buildReviewData(raw: ReviewInput) {
  const postNames = raw.postNames
    ? raw.postNames.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 40)
    : [];
  const fees = emptyToNull(raw.feeGeneral);
  const feesRes = emptyToNull(raw.feeReserved);
  return {
    title: raw.title,
    titleHi: emptyToNull(raw.titleHi),
    summary: emptyToNull(raw.summary),
    summaryHi: emptyToNull(raw.summaryHi),
    advertisementNo: emptyToNull(raw.advertisementNo),
    postNames,
    totalVacancies: raw.totalVacancies,
    minQualification: raw.minQualification,
    qualificationDetails: emptyToNull(raw.qualificationDetails),
    minAge: raw.minAge,
    maxAge: raw.maxAge,
    ageCutoffDate: emptyToNull(raw.ageCutoffDate),
    applyLast: emptyToNull(raw.applyLast),
    feeLast: emptyToNull(raw.feeLast),
    examDate: emptyToNull(raw.examDate),
    admitCardDate: emptyToNull(raw.admitCardDate),
    resultDate: emptyToNull(raw.resultDate),
    notificationDate: emptyToNull(raw.notificationDate),
    state: emptyToNull(raw.state),
    location: emptyToNull(raw.location),
    payLevel: emptyToNull(raw.payLevel),
    selectionProcess: emptyToNull(raw.selectionProcess),
    applyUrl: emptyToNull(raw.applyUrl),
    officialNotificationPdfUrl: emptyToNull(raw.officialNotificationPdfUrl),
    officialSourceUrl: emptyToNull(raw.officialSourceUrl),
    fees: {
      general: fees ?? undefined,
      sc: feesRes ?? undefined,
      st: feesRes ?? undefined,
      pwbd: feesRes ?? undefined,
      note: emptyToNull(raw.feeOther) ?? undefined,
    },
  };
}

export async function saveDraftAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const id = String(form.get("id") ?? "");
  const parsed = reviewSchema.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) {
    return { error: `Invalid fields: ${parsed.error.issues.map((i) => i.path.join(".")).slice(0, 3).join(", ")}` };
  }
  const data = await buildReviewData(parsed.data);
  await prisma.notification.update({ where: { id }, data });
  revalidatePath(`/admin/review/${id}`);
  revalidatePath("/admin/review");
  return { ok: true, message: "Draft saved." };
}

export async function approveAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireStaff();
  const id = String(form.get("id") ?? "");
  const parsed = reviewSchema.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) {
    return { error: `Invalid fields: ${parsed.error.issues.map((i) => i.path.join(".")).slice(0, 3).join(", ")}` };
  }
  const data = await buildReviewData(parsed.data);
  await prisma.notification.update({
    where: { id },
    data: {
      ...data,
      status: "published",
      reviewedById: user.id,
      reviewedAt: new Date(),
      sourceVerifiedAt: new Date(),
      rejectReason: null,
    },
  });
  revalidatePath("/admin/review");
  revalidatePath("/");
  revalidatePath("/calendar");
  return { ok: true, message: "Approved and published." };
}

export async function rejectAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requireStaff();
  const id = String(form.get("id") ?? "");
  const reason = String(form.get("rejectReason") ?? "").trim();
  if (!reason) return { error: "A rejection reason is required." };
  await prisma.notification.update({
    where: { id },
    data: { status: "rejected", rejectReason: reason.slice(0, 600), reviewedAt: new Date() },
  });
  revalidatePath("/admin/review");
  return { ok: true, message: "Rejected." };
}

// ---------- sources ----------

const sourceSchema = z.object({
  name: z.string().trim().min(2).max(120),
  url: z.string().url(),
  sector: z.string().trim().min(2).max(60),
  kind: z.enum(["html", "rss"]),
  linkSelector: z.string().trim().max(200),
  includePattern: z.string().trim().max(300),
  excludePattern: z.string().trim().max(300),
  intervalHours: z.preprocess((v) => Number(v), z.number().int().min(1).max(168)),
});

export async function updateSourceAction(_: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireAdmin();
  const id = String(form.get("id") ?? "");
  const parsed = sourceSchema.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) {
    return { error: `Invalid fields: ${parsed.error.issues.map((i) => i.path.join(".")).slice(0, 3).join(", ")}` };
  }
  await prisma.source.update({ where: { id }, data: parsed.data });
  revalidatePath("/admin/sources");
  return { ok: true, message: "Source updated." };
}

export async function toggleSourceAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = String(form.get("id") ?? "");
  const active = form.get("active") === "1";
  await prisma.source.update({ where: { id }, data: { active } });
  revalidatePath("/admin/sources");
  return { ok: true, message: active ? "Source enabled." : "Source paused." };
}

export async function runSourceNowAction(_: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = String(form.get("id") ?? "");
  const source = await prisma.source.findUnique({ where: { id }, include: { organization: true } });
  if (!source) return { error: "Source not found." };
  const res = await runScrapeForSource(source);
  revalidatePath("/admin/sources");
  revalidatePath("/admin/runs");
  revalidatePath("/admin/review");
  return {
    ok: res.status === "ok",
    message:
      res.status === "ok"
        ? `Run finished: ${res.linksFound} links found, ${res.newItems} new draft(s).`
        : `Run failed: ${res.message}`,
  };
}