import { cookies } from "next/headers";
import { LANG_COOKIE, makeT, type Lang } from "@/lib/i18n";

export async function getLang(): Promise<Lang> {
  const store = await cookies();
  return store.get(LANG_COOKIE)?.value === "hi" ? "hi" : "en";
}

export async function getT() {
  const lang = await getLang();
  return { lang, t: makeT(lang) };
}
