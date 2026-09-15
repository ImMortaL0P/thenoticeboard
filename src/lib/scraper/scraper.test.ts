// Manual sanity tests for the rules-based extractor (Phase 5).
//   npx tsx src/lib/scraper/scraper.test.ts
// Kept next to the CLI extraction code since it runs under tsx too.

import { extractFromText } from "../extract";

const EN = `NOTICE
Ministry of Railways
Railway Recruitment Cell, Northern Railway
Advt. No. 01/2026
RECRUITMENT OF GROUP C STAFF

Applications are invited from eligible candidates for 1,245 posts of Clerk,
Train Clerk and Lower Division Clerks. Age between 18 to 27 years as on
01/04/2026. Application fee for General/OBC is Rs. 500/-, for SC/ST/PwBD
Rs. 250/-. Last date to apply online is 31/01/2026. Notification released on
01/01/2026. Minimum qualification: 12th pass or equivalent from a recognised
board. Pay Level 2 with Rs. 19,900 to Rs. 63,200.`;

const HI = `कर्मचारी चयन आयोग
विज्ञापन संख्या 12/2025
कनिष्ठ सहायक (जूनियर असिस्टेंट) की भर्ती

आवेदन पत्र 450 पदों के लिए आमंत्रित हैं। आयु 18 से 27 वर्ष। सामान्य शुल्क 600 रुपये,
एससी/एसटी के लिए 300 रुपये। आवेदन की अंतिम तिथि 15/12/2025 है। अधिसूचना 10/11/2025 को
जारी की गई थी। न्यूनतम योग्यता: स्नातक।`;

function expectEqual(label: string, got: unknown, want: unknown): void {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}: ${JSON.stringify(got)}${ok ? "" : `  (expected ${JSON.stringify(want)})`}`);
  if (!ok) process.exitCode = 1;
}

const en = extractFromText(EN, "Clerk Recruitment");
// The heading of the notice, not the office that issued it. The old expectation
// ("Railway Recruitment Cell, Northern Railway") was the letterhead.
expectEqual("en.title", en.title, "RECRUITMENT OF GROUP C STAFF");
expectEqual("en.advtNo", en.advertisementNo, "01/2026");
expectEqual("en.vacancies", en.totalVacancies, 1245);
expectEqual("en.qual", en.minQualification, "12th");
expectEqual("en.age", [en.minAge, en.maxAge], [18, 27]);
expectEqual("en.fees", [en.feeGeneral, en.feeReserved], [500, 250]);
expectEqual("en.last", en.applyLast, "2026-01-31");
expectEqual("en.issued", en.notificationDate, "2026-01-01");

const hi = extractFromText(HI, "कनिष्ठ सहायक भर्ती");
expectEqual("hi.title", hi.title, "कनिष्ठ सहायक (जूनियर असिस्टेंट) की भर्ती");
expectEqual("hi.advtNo", hi.advertisementNo, "12/2025");
expectEqual("hi.vacancies", hi.totalVacancies, 450);
expectEqual("hi.qual", hi.minQualification, "graduate");
expectEqual("hi.age", [hi.minAge, hi.maxAge], [18, 27]);
expectEqual("hi.feeGeneral", hi.feeGeneral, 600);
expectEqual("hi.last", hi.applyLast, "2025-12-15");
expectEqual("hi.issued", hi.notificationDate, "2025-11-10");

console.log(process.exitCode ? "\nSOME CHECKS FAILED" : "\nALL CHECKS PASSED");