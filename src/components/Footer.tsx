import Link from "next/link";
import { getT } from "@/lib/i18n-server";

export async function Footer() {
  const { t } = await getT();
  return (
    <footer className="mt-16 border-t border-border bg-surface">
      <div className="mx-auto max-w-7xl space-y-3 px-4 py-8 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">{t("footer.disclaimer")}</p>
        <p>{t("footer.sample")}</p>
        <div className="flex flex-wrap gap-4">
          <Link href="/about" className="hover:text-foreground">{t("nav.about")}</Link>
          <Link href="/contact" className="hover:text-foreground">{t("nav.contact")}</Link>
          <Link href="/employer" className="hover:text-foreground">{t("nav.employers")}</Link>
        </div>
        <p>© {new Date().getFullYear()} {t("footer.rights")}</p>
      </div>
    </footer>
  );
}
