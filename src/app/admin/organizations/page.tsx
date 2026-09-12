import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { OrganizationsClient } from "./OrganizationsClient";

export const dynamic = "force-dynamic";

export default async function OrganizationsPage() {
  await requireAdmin();
  const orgs = await prisma.organization.findMany({
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Organizations (Bodies)</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage logos manually for each organization body to ensure high quality rendering.
        </p>
      </header>

      <OrganizationsClient organizations={orgs} />
    </div>
  );
}