import { en, type TranslationKey } from "@/locales/en";
import { hi } from "@/locales/hi";

export type Lang = "en" | "hi";
export type { TranslationKey };
export const LANG_COOKIE = "tnb-lang";

const dictionaries: Record<Lang, Partial<Record<TranslationKey, string>>> = { en, hi };

export type TFn = (key: TranslationKey | string, vars?: Record<string, string | number>) => string;

export function makeT(lang: Lang): TFn {
  return (key, vars) => {
    const k = key as TranslationKey;
    const raw = dictionaries[lang][k] ?? en[k] ?? String(key);
    if (!vars) return raw;
    return Object.keys(vars).reduce((acc, name) => acc.replaceAll(`{${name}}`, String(vars[name])), raw);
  };
}
