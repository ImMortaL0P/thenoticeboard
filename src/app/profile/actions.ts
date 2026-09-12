"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import crypto from "crypto";

export async function generateTelegramLinkCode() {
  const user = await requireUser();
  const code = crypto.randomBytes(4).toString("hex");
  await prisma.user.update({
    where: { id: user.id },
    data: { telegramLinkCode: code },
  });
  revalidatePath("/profile");
}

export async function unlinkTelegram() {
  const user = await requireUser();
  await prisma.user.update({
    where: { id: user.id },
    data: { telegramChatId: null, telegramLinkCode: null },
  });
  revalidatePath("/profile");
}
