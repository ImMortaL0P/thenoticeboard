"use client";

import { useActionState } from "react";
import { broadcastTelegramAction, type ActionState } from "@/app/admin/actions";
import { Send } from "lucide-react";

export function TelegramBroadcastButton({
  id,
  alertsSentAt
}: {
  id: string;
  alertsSentAt: Date | null;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(broadcastTelegramAction, undefined);

  return (
    <form className="flex items-center gap-3">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        formAction={formAction}
        disabled={pending}
        className="btn btn-outline border-blue-200 text-blue-700 hover:bg-blue-50"
      >
        <Send className="size-4" />
        {pending ? "Sending..." : alertsSentAt ? "Send alert again" : "Send Telegram alert"}
      </button>
      {state?.message && <span className="text-sm text-emerald-600 font-medium">{state.message}</span>}
      {state?.error && <span className="text-sm text-destructive font-medium">{state.error}</span>}
    </form>
  );
}
