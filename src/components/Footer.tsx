import Link from "next/link";
import { getT } from "@/lib/i18n-server";
import { Logo } from "@/components/Logo";

export async function Footer() {
  const { t } = await getT();
  return (
    <footer className="mt-20 border-t-2 border-foreground">
      <div className="mx-auto grid max-w-[78rem] gap-10 px-4 py-10 sm:px-6 md:grid-cols-[minmax(0,1.5fr)_minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-sm text-[13px] leading-relaxed text-muted-foreground">{t("footer.sample")}</p>
        </div>

        <div className="space-y-2.5">
          <h2 className="eyebrow border-b border-border pb-1.5">{t("nav.links")}</h2>
          <div className="flex flex-col items-start gap-1.5 text-[13px]">
            <Link href="/about" className="text-foreground/80 hover:text-foreground hover:underline">{t("nav.about")}</Link>
            <Link href="/contact" className="text-foreground/80 hover:text-foreground hover:underline">{t("nav.contact")}</Link>
            <Link href="/employer" className="text-foreground/80 hover:text-foreground hover:underline">{t("nav.employers")}</Link>
            <Link href="/eligibility" className="text-foreground/80 hover:text-foreground hover:underline">{t("nav.eligibility")}</Link>
          </div>
        </div>

        <div className="space-y-2.5">
          <h2 className="eyebrow border-b border-border pb-1.5">{t("nav.verify")}</h2>
          <p className="max-w-sm text-[13px] leading-relaxed text-muted-foreground">{t("footer.disclaimer")}</p>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto max-w-[78rem] px-4 py-4 font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground sm:px-6">
          © {new Date().getFullYear()} {t("footer.rights")}
        </div>
      </div>
    </footer>
  );
}
