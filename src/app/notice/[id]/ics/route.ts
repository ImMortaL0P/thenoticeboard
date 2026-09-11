import { prisma } from "@/lib/db";
import { siteUrl } from "@/lib/utils";

function icsDate(d: string) {
  return d.replaceAll("-", "");
}
function esc(s: string) {
  return s.replace(/[\\,;]/g, (m) => `\\${m}`).replace(/\n/g, "\\n");
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = await prisma.notification.findFirst({ where: { id, status: { in: ["published", "closed"] } } });
  if (!n) return new Response("Not found", { status: 404 });
  const url = siteUrl(`/notice/${n.id}`);
  const events: [string, string | null][] = [
    ["Last date to apply", n.applyLast],
    ["Exam date", n.examDate],
    ["Admit card", n.admitCardDate],
  ];
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//thenoticeboard//EN", "CALSCALE:GREGORIAN"];
  for (const [label, date] of events) {
    if (!date) continue;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${n.id}-${icsDate(date)}-${label.replace(/\s/g, "")}@thenoticeboard`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
      `DTSTART;VALUE=DATE:${icsDate(date)}`,
      `SUMMARY:${esc(`${label}: ${n.title}`)}`,
      `DESCRIPTION:${esc(url)}`,
      `URL:${url}`,
      "BEGIN:VALARM",
      "TRIGGER:-P1D",
      "ACTION:DISPLAY",
      `DESCRIPTION:${esc(label)}`,
      "END:VALARM",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return new Response(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="notice-${n.id}.ics"`,
    },
  });
}
