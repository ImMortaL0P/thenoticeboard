import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ComingSoon } from "@/components/ComingSoon";
import { TelegramConnect } from "@/components/TelegramConnect";

export default async function Page() {
  const sessionUser = await requireUser("/profile");

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
  });

  if (!user) return null;

  const botUsername = process.env.TELEGRAM_BOT_USERNAME || "";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Profile</h1>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="card p-5">
          <TelegramConnect
            chatId={user.telegramChatId}
            linkCode={user.telegramLinkCode}
            botUsername={botUsername}
          />
        </div>
      </div>

      <ComingSoon title={`Form Stub - ${user.email}`} phase="Phase 2">
        Profile form (DOB, category, qualification, stream, experience, state, preferred sectors) and saved notices will go here.
        Once filled, every card on the board shows an Eligible / Not eligible chip.
      </ComingSoon>
    </div>
  );
}
