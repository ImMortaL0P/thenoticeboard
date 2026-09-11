"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createSession, destroySession } from "@/lib/auth";

export type AuthState = { error?: string } | undefined;

function safeNext(v: FormDataEntryValue | null) {
  const s = typeof v === "string" ? v : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
}

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });
const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().trim().max(120).optional(),
});

export async function loginAction(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = loginSchema.safeParse({ email: form.get("email"), password: form.get("password") });
  if (!parsed.success) return { error: "auth.errorInvalid" };
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    return { error: "auth.errorInvalid" };
  }
  await createSession(user.id);
  redirect(safeNext(form.get("next")));
}

export async function signupAction(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = signupSchema.safeParse({
    email: form.get("email"),
    password: form.get("password"),
    fullName: form.get("fullName") || undefined,
  });
  if (!parsed.success) {
    const pw = parsed.error.issues.some((i) => i.path[0] === "password");
    return { error: pw ? "auth.errorPassword" : "auth.errorInvalid" };
  }
  const email = parsed.data.email.toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) return { error: "auth.errorExists" };
  const user = await prisma.user.create({
    data: { email, passwordHash: await bcrypt.hash(parsed.data.password, 10), fullName: parsed.data.fullName },
  });
  await createSession(user.id);
  redirect(safeNext(form.get("next")) === "/" ? "/profile" : safeNext(form.get("next")));
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}
