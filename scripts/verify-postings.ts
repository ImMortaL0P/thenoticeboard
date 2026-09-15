import { prisma } from "../src/lib/db";

async function verify() {
  const pending = await prisma.notification.findMany({
    where: { status: "pending_review" }
  });
  
  for (const p of pending) {
    if (p.title.includes("Ad") || p.title.includes("English") || p.title.includes("Hindi") || p.title.includes("RTI Act") || p.title.includes("Result") || p.title.includes("Cut-off") || p.title.includes("Interview")) {
      // mark as rejected
      await prisma.notification.update({ where: { id: p.id }, data: { status: "rejected", rejectReason: "Not a core recruitment notice or auxiliary document" }});
      console.log(`Rejected: ${p.title}`);
    } else {
      // approve
      await prisma.notification.update({ where: { id: p.id }, data: { status: "published", reviewedAt: new Date() }});
      console.log(`Approved: ${p.title}`);
    }
  }
}
verify();
