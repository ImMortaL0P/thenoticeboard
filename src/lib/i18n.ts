import { en, type TranslationKey } from "@/locales/en";
import { hi } from "@/locales/hi";

export type Lang = "en" | "hi";
export type { TranslationKey };
export const LANG_COOKIE = "tnb-lang";

const dictionaries: Record<Lang, Partial<Record<TranslationKey, string>>> = { en, hi };

export type TFn = (key: TranslationKey | string, vars?: Record<string, string | number>) => string;

/**
 * Last-resort display for a key with no translation.
 *
 * Scraped rows sometimes carry a non-canonical `sector` / `minQualification`
 * (e.g. "Banking" or "Diploma/Degree (as per trade)") because extraction wrote
 * free text instead of an enum value. Rendering the raw lookup key on a card
 * ("sector.Banking") looks broken to a candidate, so fall back to the value
 * itself, tidied up. The underlying data still needs normalising — this only
 * stops a data problem from surfacing as a UI bug.
 */
function humanizeMissingKey(key: string): string {
  const value = key.includes(".") ? key.slice(key.indexOf(".") + 1) : key;
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\p{Ll}/u, (c) => c.toUpperCase());
}

export function makeT(lang: Lang): TFn {
  return (key, vars) => {
    const k = key as TranslationKey;
    const raw = dictionaries[lang][k] ?? en[k] ?? humanizeMissingKey(String(key));
    if (!vars) return raw;
    return Object.keys(vars).reduce((acc, name) => acc.replaceAll(`{${name}}`, String(vars[name])), raw);
  };
}
