"use client";

import { useI18n } from "./I18nProvider";

export function BackedBy() {
  const { t } = useI18n();

  return (
    <section className="mt-16 w-full pb-8">
      <div className="border-t-2 border-foreground pt-5 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground mb-6">
          {t("home.backedBy")}
        </p>

        <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-8 opacity-90 saturate-0 hover:saturate-100 transition-all duration-300">

          {/* Physics Wallah Text Logo */}
          <div className="flex items-center gap-1.5 font-display select-none">
            <span className="font-bold text-[1.4rem] tracking-tight text-slate-800 dark:text-slate-200">
              PHYSICS
            </span>
            <span className="font-semibold text-[1.4rem] tracking-tight text-slate-800 dark:text-slate-200 opacity-90">
              WALLAH
            </span>
          </div>

          {/* Unacademy Text Logo */}
          <div className="flex items-center select-none font-display text-[1.45rem] font-bold tracking-tight text-[#08BD80] dark:text-[#08BD80]">
            <svg
              className="mr-2 h-7 w-auto fill-current"
              viewBox="0 0 100 100"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Simplified Unacademy logo mark (book/pages concept) */}
              <path d="M50 10C27.9 10 10 27.9 10 50s17.9 40 40 40 40-17.9 40-40S72.1 10 50 10Zm0 68c-15.4 0-28-12.6-28-28s12.6-28 28-28 28 12.6 28 28-12.6 28-28 28Z" opacity="0.3" />
              <path d="M72 41c-3.5 0-9.4 3.7-18 9.5-2.6-6-6.1-13-8.8-19.1-.5-1.2-2.3-1.2-2.9-.1-1.3 2.6-4.9 10-8.2 16.5-6.5-6.2-9.7-11-9.9-11.2-1-1.2-3.1-.3-2.9 1.4.5 4.5 4.1 12.5 7.6 15.3 1.9 1.5 5.8 4.2 9.2-1.9 1.1-2 4.1-7.8 6.5-12.9 4 8.7 8.3 19.8 11.2 26 1 2.2 4.1 1.9 4.7-.4C64.6 51.5 72.8 45 74.2 44c1.2-1-1.1-3-2.2-3Z" />
            </svg>
            Unacademy
          </div>

        </div>
      </div>
    </section>
  );
}
