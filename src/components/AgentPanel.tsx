"use client";

import { useState, useTransition } from "react";
import { Cpu, Play, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export type AgentPanelState = {
  online: boolean;
  lastSeenSeconds: number | null;
  status: { state?: string; published?: number; review?: number; rejected?: number; message?: string } | null;
  requestedAt: string | null;
};

/**
 * Controls for the local verification agent.
 *
 * The button queues a pass; it does not reach into anyone's laptop and start
 * anything. So the panel leads with whether an agent is actually listening —
 * a button that silently does nothing is worse than no button.
 */
export function AgentPanel({
  state,
  onRun,
  onRefresh,
}: {
  state: AgentPanelState;
  onRun: () => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [pending, start] = useTransition();
  const [queued, setQueued] = useState(false);
  const running = state.status?.state === "running";

  return (
    <section className="panel">
      <h2 className="panel-head">Local verification agent</h2>

      <div className="flex flex-wrap items-center gap-3">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-[13px] font-medium",
            state.online ? "text-open" : "text-muted-foreground",
          )}
        >
          <span
            aria-hidden
            className={cn("size-2 rounded-full", state.online ? "bg-open" : "bg-muted-foreground/40")}
          />
          {state.online ? "Connected" : "No agent running"}
          {state.lastSeenSeconds !== null && (
            <span className="font-mono text-[10.5px] text-muted-foreground">
              · seen {state.lastSeenSeconds}s ago
            </span>
          )}
        </span>

        <button
          type="button"
          className="btn btn-primary btn-sm group/run"
          disabled={!state.online || pending || running}
          onClick={() =>
            start(async () => {
              await onRun();
              setQueued(true);
            })
          }
        >
          <Play className="size-3 group-hover/run:translate-x-0.5" />
          {running ? "Running…" : "Verify queue now"}
        </button>

        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={pending}
          onClick={() => start(async () => { await onRefresh(); setQueued(false); })}
        >
          <RefreshCw className={cn("size-3", pending && "animate-spin")} />
          Refresh
        </button>
      </div>

      {queued && state.online && !running && (
        <p className="mt-3 text-[12.5px] text-muted-foreground">
          Requested. The agent polls every 8 seconds — press Refresh shortly to see progress.
        </p>
      )}

      {state.status?.state === "idle" && state.status.published !== undefined && (
        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
          last pass: {state.status.published} publishable · {state.status.review} for a human ·{" "}
          {state.status.rejected} rejected
        </p>
      )}
      {state.status?.state === "error" && (
        <p className="mt-3 text-[12.5px] text-urgent">Last pass failed: {state.status.message}</p>
      )}

      {!state.online && (
        <div className="mt-4 border-t border-border pt-3 text-[12.5px] leading-relaxed text-muted-foreground">
          <p className="flex items-start gap-2">
            <Cpu className="mt-0.5 size-3.5 shrink-0" />
            <span>
              A browser cannot start a process on your machine, so this button queues work for an agent
              you run yourself. Start one on any admin machine and it will pick up requests:
            </span>
          </p>
          <pre className="mt-2 overflow-x-auto rounded-sm border border-border bg-muted px-3 py-2 font-mono text-[11px]">npm run agent</pre>
          <p className="mt-2">
            It uses the hosted providers first and falls back to your local Ollama model only once their
            daily allowances are spent.
          </p>
        </div>
      )}
    </section>
  );
}
