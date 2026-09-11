import Link from "next/link";
import { getT } from "@/lib/i18n-server";
import { Logo } from "@/components/Logo";

export async function Footer() {
  const { t } = await getT();
  return (
    <footer className="mt-16 border-t border-border bg-surface">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-sm text-sm text-muted-foreground">{t("footer.sample")}</p>
        </div>

        <div className="space-y-3 text-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("nav.links")}</h2>
          <div className="flex flex-col items-start gap-2">
            <Link href="/about" className="text-foreground/80 hover:text-foreground">{t("nav.about")}</Link>
            <Link href="/contact" className="text-foreground/80 hover:text-foreground">{t("nav.contact")}</Link>
            <Link href="/employer" className="text-foreground/80 hover:text-foreground">{t("nav.employers")}</Link>
            <Link href="/eligibility" className="text-foreground/80 hover:text-foreground">{t("nav.eligibility")}</Link>
          </div>
        </div>

        <div className="space-y-3 text-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("nav.verify")}</h2>
          <p className="max-w-sm text-muted-foreground">{t("footer.disclaimer")}</p>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto max-w-7xl px-4 py-4 text-xs text-muted-foreground sm:px-6">
          <p>© {new Date().getFullYear()} {t("footer.rights")}</p>
        </div>
      </div>
    </footer>
  );
}