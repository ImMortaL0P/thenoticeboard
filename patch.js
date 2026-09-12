const fs = require('fs');
const path = './src/lib/domain.ts';
let code = fs.readFileSync(path, 'utf8');

const oldCode = `export function formatDate(value: string | null | undefined, lang = "en"): string {
  if (!value) return "n/a";
  return new Date(\`\${value}T00:00:00Z\`).toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}`;

const newCode = `export function formatDate(value: string | null | undefined, lang = "en"): string {
  if (!value) return "n/a";
  const dateStr = value.includes("T") ? value : \`\${value}T00:00:00Z\`;
  const dateObj = new Date(dateStr);
  if (isNaN(dateObj.getTime())) return "Invalid Date";
  return dateObj.toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}`;

fs.writeFileSync(path, code.replace(oldCode, newCode));
