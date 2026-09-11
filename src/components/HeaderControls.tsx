"use client";

import { Moon, Sun } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";

export function HeaderControls() {
  const { lang, setLang, t } = useI18n();

  function toggleTheme() {
    const dark = document.documentElement.classList.toggle("dark");
    try {
      localStorage.setItem("tnb-theme", dark ? "dark" : "light");
    } catch {}
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => setLang(lang === "en" ? "hi" : "en")}
        className="btn btn-ghost btn-sm"
        aria-label="Change language"
      >
        {lang === "en" ? "हिं" : "EN"}
      </button>
      <button type="button" onClick={toggleTheme} className="btn btn-ghost btn-sm" aria-label={t("nav.theme")}>
        <Sun className="size-4 dark:hidden" />
        <Moon className="hidden size-4 dark:block" />
      </button>
    </div>
  );
}
