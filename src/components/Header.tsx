import Link from "next/link";
import { Logo } from "@/components/Logo";
import { HeaderControls } from "@/components/HeaderControls";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { getT } from "@/lib/i18n-server";
import { logoutAction } from "@/app/(auth)/actions";

export async function Header() {
  const [{ t }, user] = await Promise.all([getT(), getCurrentUser()]);
  const links = [
    { href: "/", label: t("nav.board") },
    { href: "/eligibility", label: t("nav.eligibility") },
    { href: "/calendar", label: t("nav.calendar") },
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
        <Link href="/" aria-label="thenoticeboard home">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="btn btn-ghost btn-sm font-medium">
              {l.label}
            </Link>
          ))}
          {isStaff(user?.role) && (
            <Link href="/admin" className="btn btn-ghost btn-sm font-medium text-primary">
              {t("nav.admin")}
            </Link>
          )}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <HeaderControls />
          {user ? (
            <>
              <Link href="/profile" className="btn btn-outline btn-sm">
                {t("nav.profile")}
              </Link>
              <form action={logoutAction}>
                <button className="btn btn-ghost btn-sm">{t("nav.signOut")}</button>
              </form>
            </>
          ) : (
            <Link href="/login" className="btn btn-primary btn-sm">
              {t("nav.signIn")}
            </Link>
          )}
        </div>
      </div>
      {/* mobile nav */}
      <nav className="flex gap-1 overflow-x-auto border-t border-border px-2 py-1 md:hidden">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="btn btn-ghost btn-sm shrink-0 font-medium">
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
