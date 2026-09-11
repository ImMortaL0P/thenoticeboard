"use client";

import { useActionState } from "react";
import { LinkIcon } from "lucide-react";
import {
  runSourceNowAction,
  toggleSourceAction,
  updateSourceAction,
  type ActionState,
} from "@/app/admin/actions";

export type SourceRowData = {
  id: string;
  name: string;
  url: string;
  sector: string;
  kind: string;
  intervalHours: number;
  active: boolean;
  linkSelector: string;
  includePattern: string;
  excludePattern: string;
  createdAt: string;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastError: string | null;
  failCount: number;
};

function RunButton({ id }: { id: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(runSourceNowAction, undefined);
  return (
    <form action={action} className="flex flex-col items-start gap-1">
      <input type="hidden" name="id" value={id} />
      <button className="btn btn-outline !px-3 !py-1.5 text-xs" disabled={pending}>
        {pending ? "Running…" : "Run now"}
      </button>
      {state && <span className="text-xs text-muted-foreground">{state.message}</span>}
    </form>
  );
}

function ToggleButton({ id, active }: { id: string; active: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(toggleSourceAction, undefined);
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="active" value={active ? "0" : "1"} />
      <button
        className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
          active
            ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
            : "bg-muted text-muted-foreground hover:bg-border"
        }`}
        disabled={pending}
      >
        {active ? "Active" : "Paused"}
      </button>
    </form>
  );
}

function EditForm({ source }: { source: SourceRowData }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateSourceAction, undefined);
  return (
    <form action={action} className="mt-3 grid grid-cols-2 gap-3 rounded-xl border border-border p-4 md:grid-cols-4">
      <input type="hidden" name="id" value={source.id} />
      <label className="col-span-2 block">
        <span className="label">Name</span>
        <input name="name" defaultValue={source.name} className="input" required />
      </label>
      <label className="col-span-2 block">
        <span className="label">URL</span>
        <input name="url" defaultValue={source.url} className="input" type="url" required />
      </label>
      <label className="block">
        <span className="label">Sector</span>
        <input name="sector" defaultValue={source.sector} className="input" required />
      </label>
      <label className="block">
        <span className="label">Kind</span>
        <select name="kind" defaultValue={source.kind} className="input">
          <option value="html">html</option>
          <option value="rss">rss</option>
        </select>
      </label>
      <label className="block">
        <span className="label">Interval (hours)</span>
        <input name="intervalHours" type="number" min={1} max={168} defaultValue={source.intervalHours} className="input" />
      </label>
      <label className="block">
        <span className="label">Link selector</span>
        <input name="linkSelector" defaultValue={source.linkSelector} className="input" />
      </label>
      <label className="block">
        <span className="label">Include pattern</span>
        <input name="includePattern" defaultValue={source.includePattern} className="input" />
      </label>
      <label className="block">
        <span className="label">Exclude pattern</span>
        <input name="excludePattern" defaultValue={source.excludePattern} className="input" />
      </label>
      <div className="col-span-2 flex items-end">
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save source"}
        </button>
        {state?.message && <span className="ml-2 text-xs text-muted-foreground">{state.message}</span>}
      </div>
    </form>
  );
}

export function SourcesTable({ sources, isAdmin }: { sources: SourceRowData[]; isAdmin: boolean }) {
  return (
    <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
      {sources.map((s) => (
        <li key={s.id} className="px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold">{s.name}</span>
                <span className="hidden rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground sm:block">
                  {s.sector}
                </span>
              </div>
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
              >
                <LinkIcon size={12} />
                <span className="max-w-[26rem] truncate">{s.url}</span>
              </a>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span>every {s.intervalHours}h</span>
                {s.lastRunAt && <span>· last run {new Date(s.lastRunAt).toLocaleString("en-IN")}</span>}
                {s.lastStatus && (
                  <span className={s.lastStatus === "ok" ? "text-emerald-600" : "text-red-600"}>
                    · {s.lastStatus === "ok" ? "ok" : `error${s.failCount > 1 ? ` ×${s.failCount}` : ""}`}
                  </span>
                )}
              </div>
              {s.lastStatus !== "ok" && s.lastError && (
                <div className="mt-1 truncate text-xs text-red-600">{s.lastError}</div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <RunButton id={s.id} />
              <ToggleButton id={s.id} active={s.active} />
            </div>
          </div>

          {isAdmin && (
            <details className="mt-2">
              <summary className="cursor-pointer select-none text-xs font-medium text-muted-foreground hover:text-foreground">
                Edit source settings
              </summary>
              <EditForm source={s} />
            </details>
          )}
        </li>
      ))}
    </ul>
  );
}