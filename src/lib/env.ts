/**
 * Environment reads that treat an empty value as absent.
 *
 * `process.env.X ?? "default"` only falls back on undefined, so a line like
 * `GROQ_MODEL=` in a .env file yields "" and sails straight past the default.
 * That is exactly what happened here: every provider was sent `model: ""` and
 * answered "the model `` does not exist", which reads like a bad API key and is
 * nothing of the sort. Placeholder lines in a .env file are normal and should
 * mean "not set".
 */
export function env(key: string): string | undefined {
  const v = process.env[key];
  if (v === undefined) return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

export function envOr(key: string, fallback: string): string {
  return env(key) ?? fallback;
}

export function envNum(key: string, fallback: number): number {
  const v = env(key);
  if (v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function envFlag(key: string): boolean {
  const v = env(key);
  return v === "1" || v?.toLowerCase() === "true";
}
