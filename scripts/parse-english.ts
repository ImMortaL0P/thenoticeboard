import fs from "fs";
import { prisma } from "../src/lib/db";

const md = fs.readFileSync("/Users/mangalam/Downloads/government_job_notifications_india_2026.md", "utf8");
const sections = md.split("### ").slice(1);

const parseDate = (dstr: string) => {
  const match = dstr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
};

const entries = sections.map(sec => {
  const lines = sec.split("\n");
  const title = lines[0].replace(/^\d+\.\s*/, "").trim();
  
  const extract = (key: string) => {
    const rx = new RegExp(`\\* \\*\\*${key}\\*\\*:?\\s*(.+)`);
    const m = sec.match(rx);
    return m ? m[1].trim() : null;
  };
  
  const org = extract("Organization");
  const advt = extract("Advertisement Number");
  const vacancies = extract("Total Vacancies");
  const elig = extract("Eligibility");
  let eligibilityStr = elig;
  if (!elig) {
     const eligMatch = sec.match(/\* \*\*Eligibility\*\*:\s*\n\s+\*\s+(.*)/);
     if (eligMatch) eligibilityStr = eligMatch[1];
  }
  
  const age = extract("Age Limit");
  const timelineMatch = sec.match(/\* \*\*Timeline\*\*:(.+?)(?=\*|$)/s);
  let timeline = extract("Timeline");
  if (timelineMatch) timeline = timelineMatch[1].trim();

  let applyLast = null;
  let minAge = null;
  let maxAge = null;
  let totalVacancies = null;

  if (vacancies) {
    const vMatch = vacancies.match(/([\d,]+)/);
    if (vMatch) totalVacancies = parseInt(vMatch[1].replace(/,/g, ""));
  }

  if (age) {
    const minM = age.match(/(\d\d)\b/);
    const maxM = age.match(/to (\d\d)/) || age.match(/Maximum (\d\d)/) || age.match(/Up to (\d\d)/);
    if (minM) minAge = parseInt(minM[1]);
    if (maxM) maxAge = parseInt(maxM[1]);
  }

  if (timeline) {
     const lastStr = timeline.match(/Last Date[^:]*:\s*([^\|\n]+)/i);
     if (lastStr) {
       applyLast = parseDate(lastStr[1]);
     } else {
       const m = timeline.match(/(\d{2}\/\d{2}\/\d{4})/g);
       if (m && m.length > 1) {
          applyLast = parseDate(m[1]);
       } else if (m) {
          applyLast = parseDate(m[0]);
       }
     }
  }

  return { title, org, advt, totalVacancies, eligibilityStr, minAge, maxAge, applyLast, ageRaw: age, timelineRaw: timeline };
});

fs.writeFileSync("parsed_en.json", JSON.stringify(entries, null, 2));
console.log(`Parsed ${entries.length} items`);
