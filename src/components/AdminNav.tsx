"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ClipboardCheck, FileText, Database, Activity, Users } from "lucide-react";

type Props = {
  pendingCount: number;
  role: string;
  userLabel: string;
};

type LinkDef = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: "pendingCount";
};

const links: LinkDef[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/review", label: "Review queue", icon: ClipboardCheck, badge: "pendingCount" },
  { href: "/admin/sources", label: "Sources", icon: Database },
  { href: "/admin/organizations", label: "Organizations", icon: Users },
  { href: "/admin/runs", label: "Scrape runs", icon: Activity },
];

export function AdminNav({ pendingCount, role, userLabel }: Props) {
  const path = usePathname();
  const badges: Record<string, number> = { pendingCount };
  return (
    <nav className="space-y-1">
      <div className="mb-3 px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Admin
      </div>
      {links.map((l) => {
        if ((l.href === "/admin/sources" || l.href === "/admin/organizations") && role !== "admin") return null;
        const active =
          l.href === "/admin" ? path === "/admin" : path.startsWith(l.href);
        const badge = l.badge ? badges[l.badge] : undefined;
        const Icon = l.icon;
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            <Icon size={16} className="shrink-0" />
            {l.label}
            {typeof badge === "number" && badge > 0 && (
              <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                {badge}
              </span>
            )}
          </Link>
        );
      })}
      <div className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
        Signed in as {userLabel}
      </div>
    </nav>
  );
}