"use client";

import { useActionState } from "react";
import { addSourceAction, runAllSourcesAction, type ActionState } from "@/app/admin/actions";

export function RunAllSourcesButton() {
  const [state, action, pending] = useActionState<ActionState, FormData>(runAllSourcesAction, undefined);
  return (
    <form action={action} className="inline-block">
      <button className="btn btn-primary shadow-sm" disabled={pending}>
        {pending ? "Triggering..." : "Run All Active Sources"}
      </button>
      {state && <span className="block mt-2 text-xs text-muted-foreground">{state.message || state.error}</span>}
    </form>
  );
}

export function AddSourceForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(addSourceAction, undefined);
  return (
    <form action={action} className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-4 max-w-4xl shadow-[var(--shadow-card)]">
      <div className="col-span-full border-b border-border pb-2 mb-2">
        <h3 className="font-semibold">Add New Source</h3>
      </div>
      <label className="col-span-2 block">
        <span className="label">Name</span>
        <input name="name" className="input" placeholder="e.g. UPSC Portal" required />
      </label>
      <label className="col-span-2 block">
        <span className="label">URL</span>
        <input name="url" className="input" type="url" placeholder="https://..." required />
      </label>
      <label className="block">
        <span className="label">Sector</span>
        <input name="sector" className="input" placeholder="central_govt" defaultValue="central_govt" required />
      </label>
      <label className="block">
        <span className="label">Kind</span>
        <select name="kind" className="input" defaultValue="html">
          <option value="html">html</option>
          <option value="rss">rss</option>
        </select>
      </label>
      <label className="block">
        <span className="label">Interval (hours)</span>
        <input name="intervalHours" type="number" min={1} max={168} defaultValue={3} className="input" required />
      </label>
      <label className="block">
        <span className="label">Link selector</span>
        <input name="linkSelector" defaultValue="a" className="input" required />
      </label>
      <label className="block">
        <span className="label">Include pattern</span>
        <input name="includePattern" defaultValue="recruit|notification|advertisement|advt|vacanc|bharti|भर्ती|विज्ञापन|engagement|walk-in|apprentice" className="input" required />
      </label>
      <label className="block">
        <span className="label">Exclude pattern</span>
        <input name="excludePattern" defaultValue="result|answer key|admit card|syllabus|tender|archive|index\.php|help\.php|gallery|norms|home|login|register|previous|next" className="input" required />
      </label>
      <div className="col-span-2 flex items-end">
        <button className="btn btn-outline bg-foreground text-background" disabled={pending}>
          {pending ? "Adding..." : "Add Source"}
        </button>
        {state && (
          <span className={`ml-2 text-xs ${state.error ? "text-destructive" : "text-emerald-600"}`}>
            {state.message || state.error}
          </span>
        )}
      </div>
    </form>
  );
}
