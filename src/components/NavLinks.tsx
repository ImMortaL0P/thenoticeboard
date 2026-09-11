"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useI18n } from "@/components/I18nProvider";

const LINKS = [
  { href: "/", labelKey: "nav.board" },
  { href: "/eligibility", labelKey: "nav.eligibility" },
  { href: "/calendar", labelKey: "nav.calendar" },
] as const;

export function NavLinks({ admin }: { admin?: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useI18n();
  return (
    <>
      {LINKS.map(({ href, labelKey }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn("btn btn-ghost btn-sm shrink-0 font-medium", active && "bg-accent text-foreground")}
          >
            {t(labelKey)}
          </Link>
        );
      })}
      {admin}
    </>
  );
}