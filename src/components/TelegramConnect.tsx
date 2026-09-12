"use client";

import { useTransition } from "react";
import { generateTelegramLinkCode, unlinkTelegram } from "@/app/profile/actions";

export function TelegramConnect({
  chatId,
  linkCode,
  botUsername,
}: {
  chatId: string | null;
  linkCode: string | null;
  botUsername: string;
}) {
  const [isPending, startTransition] = useTransition();

  if (chatId) {
    return (
      <div className="space-y-3">
        <h3 className="font-semibold text-lg">Telegram Alerts</h3>
        <p className="text-sm text-emerald-600 font-medium">✅ Linked to Telegram successfully.</p>
        <p className="text-sm text-muted-foreground">You will receive broadcast alerts.</p>
        <button
          className="btn btn-outline border-destructive/20 text-destructive mt-2 text-xs h-7 px-3"
          disabled={isPending}
          onClick={() => startTransition(() => unlinkTelegram())}
        >
          {isPending ? "Unlinking..." : "Unlink Account"}
        </button>
      </div>
    );
  }

  if (linkCode) {
    const deepLink = `https://t.me/${botUsername}?start=${linkCode}`;
    return (
      <div className="space-y-3">
        <h3 className="font-semibold text-lg">Connect Telegram</h3>
        <p className="text-sm text-muted-foreground">Send your unique code to the bot to get alerts.</p>
        
        <div className="bg-muted p-3 rounded-lg border border-border">
          <p className="text-xs uppercase tracking-widest text-muted-foreground font-semibold mb-1">Your Code</p>
          <div className="font-mono text-xl tracking-wider select-all">{linkCode}</div>
        </div>

        <div className="flex gap-2">
          <a
            href={deepLink}
            target="_blank"
            rel="noreferrer"
            className="btn btn-primary"
          >
            Open in Telegram ↗
          </a>
          <button
            className="btn btn-outline"
            disabled={isPending}
            onClick={() => startTransition(() => unlinkTelegram())}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-lg">Connect Telegram</h3>
      <p className="text-sm text-muted-foreground">Link your Telegram account to receive instant notifications and alerts when notices are published.</p>
      <button
        className="btn btn-primary"
        disabled={isPending}
        onClick={() => startTransition(() => generateTelegramLinkCode())}
      >
        {isPending ? "Generating..." : "Generate Link Code"}
      </button>
    </div>
  );
}
