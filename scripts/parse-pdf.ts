import fs from "fs";
import pdfParse from "pdf-parse";

async function run() {
  const data = fs.readFileSync("/Users/mangalam/Downloads/government_job_notifications_india_2026.pdf");
  const parsed = await pdfParse(data);
  console.log(parsed.text.substring(0, 2000));
}
run();
