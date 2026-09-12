"use client";

import { useActionState, useState } from "react";
import { Search, Image as ImageIcon, Save, X } from "lucide-react";
import { updateOrganizationLogoAction } from "@/app/admin/actions";

export function OrganizationsClient({ organizations }: { organizations: any[] }) {
  const [search, setSearch] = useState("");

  const filtered = organizations.filter(o =>
    o.name.toLowerCase().includes(search.toLowerCase()) ||
    o.shortName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 max-w-sm">
        <Search className="size-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search bodies..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input flex-1"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(org => (
          <OrgCard key={org.id} org={org} />
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full py-12 text-center text-muted-foreground text-sm">
            No organizations found matching "{search}".
          </div>
        )}
      </div>
    </div>
  );
}

function OrgCard({ org }: { org: any }) {
  const [isEditing, setIsEditing] = useState(false);
  const [state, formAction, pending] = useActionState(updateOrganizationLogoAction, undefined);

  return (
    <div className="card p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-sm truncate" title={org.name}>{org.name}</h3>
          <p className="text-xs text-muted-foreground">{org.shortName}</p>
        </div>
        <div className="shrink-0 size-10 rounded-lg border bg-muted flex items-center justify-center overflow-hidden">
          {org.logoUrl ? (
            <img src={org.logoUrl} alt={org.shortName} className="size-full object-contain bg-white" onError={(e) => e.currentTarget.style.display = 'none'} />
          ) : (
            <span className="text-xs font-bold text-muted-foreground">{org.shortName.slice(0, 2).toUpperCase()}</span>
          )}
        </div>
      </div>

      {state?.error && <div className="text-xs text-urgent">{state.error}</div>}
      {state?.message && !isEditing && <div className="text-xs text-open">{state.message}</div>}

      {isEditing ? (
        <form action={async (formData) => {
          await formAction(formData);
          setIsEditing(false);
        }} className="mt-2 space-y-2">
          <input type="hidden" name="id" value={org.id} />
          <div className="space-y-1">
            <label className="text-[10px] font-medium text-muted-foreground uppercase">Local File (Overrides Link)</label>
            <input
              type="file"
              name="logoFile"
              accept=".png,.svg,.jpg,.jpeg,.webp"
              className="input text-xs w-full py-1.5 px-2"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-medium text-muted-foreground uppercase">Logo URL (or existing local path)</label>
            <input
              type="text"
              name="logoUrl"
              defaultValue={org.logoUrl || ""}
              placeholder="https://example.com/logo.png"
              className="input text-xs w-full"
            />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button type="submit" disabled={pending} className="btn btn-primary btn-sm flex-1">
              <Save className="size-3" /> Save
            </button>
            <button type="button" onClick={() => setIsEditing(false)} disabled={pending} className="btn btn-outline btn-sm">
              <X className="size-3" />
            </button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setIsEditing(true)} className="btn btn-outline btn-sm w-full mt-auto">
          <ImageIcon className="size-3" /> {org.logoUrl ? "Change Logo" : "Add Logo"}
        </button>
      )}
    </div>
  );
}