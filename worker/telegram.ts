// @ts-ignore
import TelegramBot from "node-telegram-bot-api";
import { prisma } from "../src/lib/db";

const token = process.env.TELEGRAM_BOT_TOKEN;

export function startBot() {
  if (!token) {
    console.log("Telegram bot token not provided, ignoring telegram integration.");
    return;
  }

  const bot = new TelegramBot(token, { polling: true });

  bot.onText(/\/start (.+)/, async (msg: any, match: any) => {
    const chatId = msg.chat.id.toString();
    const linkCode = match?.[1];

    if (!linkCode) {
      bot.sendMessage(chatId, "Welcome to thenoticeboard! Send a valid link code to connect your account.");
      return;
    }

    const user = await prisma.user.findFirst({
      where: { telegramLinkCode: linkCode },
    });

    if (!user) {
      bot.sendMessage(chatId, "Invalid link code. Please generate a new one from your profile.");
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { telegramChatId: chatId, telegramLinkCode: null },
    });

    bot.sendMessage(chatId, "✅ Account successfully linked to thenoticeboard! You will now receive notifications and alerts securely here.");
  });

  bot.on('polling_error', (error: any) => {
    console.error("Telegram Polling Error:", error.message);
  });

  console.log("Started Telegram Bot Listener");
}
