"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LANG_COOKIE, makeT, type Lang, type TFn } from "@/lib/i18n";

type Ctx = { lang: Lang; t: TFn; setLang: (l: Lang) => void };
const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const router = useRouter();
  const t = useMemo(() => makeT(lang), [lang]);
  const setLang = useCallback(
    (next: Lang) => {
      document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      document.documentElement.lang = next;
      router.refresh();
    },
    [router],
  );
  return <I18nContext.Provider value={{ lang, t, setLang }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
