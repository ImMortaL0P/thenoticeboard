import Link from "next/link";
import { Logo } from "@/components/Logo";
import { HeaderControls } from "@/components/HeaderControls";
import { NavLinks } from "@/components/NavLinks";
import { getCurrentUser, isStaff } from "@/lib/auth";
import { getT } from "@/lib/i18n-server";
import { logoutAction } from "@/app/(auth)/actions";

export async function Header() {
  const [{ t }, user] = await Promise.all([getT(), getCurrentUser()]);
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="thenoticeboard home">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          <NavLinks
            admin={
              isStaff(user?.role) ? (
                <Link href="/admin" className="btn btn-ghost btn-sm font-medium text-primary">
                  {t("nav.admin")}
                </Link>
              ) : undefined
            }
          />
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
        <NavLinks />
      </nav>
    </header>
  );
}
