import { redirect } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { ptFlags } from "@/lib/pt-callers/flags";
import { creditSummary, listForRep, sweepTimeouts } from "@/lib/pt-callers/service";
import { logAccess } from "@/lib/pt-callers/rules";
import { loadOutboundSettings } from "@/lib/outbound-settings";
import { RepPanel } from "./RepPanel";
import { AdminPanel } from "./AdminPanel";
import { panelConfig, panelLead } from "./panel-data";

export const dynamic = "force-dynamic";

// Portugal HR callers. One page, two halves: the sales rep's (pt-PT, assigned leads only) and the admin's (English).
export default async function PtCallers() {
  const me = await requireAdmin({ allowPtCaller: true });
  await loadOutboundSettings();
  const flags = ptFlags();
  if (me.role === "pt_caller") {
    const leads = await listForRep(me);
    return <RepPanel leads={leads} live={flags.live} />;
  }
  if (me.role !== "admin") redirect("/admin/orders");

  await sweepTimeouts();
  const [leads, reps, requests, credits] = await Promise.all([
    // Leads with a phone first (the ones that can be called), newest first inside each group.
    db.select().from(schema.ptLeads).orderBy(sql`${schema.ptLeads.phone} is null`, desc(schema.ptLeads.id)).limit(500),
    db.select({ id: schema.adminUsers.id, email: schema.adminUsers.email }).from(schema.adminUsers).where(eq(schema.adminUsers.role, "pt_caller")),
    db.select().from(schema.ptEnrichmentRequests).orderBy(desc(schema.ptEnrichmentRequests.sentAt)).limit(50),
    creditSummary(me),
  ]);
  await logAccess(me.id, null, "admin_view", { leads: leads.length });
  return (
    <AdminPanel
      flags={flags}
      config={panelConfig()}
      credits={credits}
      reps={reps}
      leads={leads.map((l) => panelLead(l))}
      requests={requests.map((r) => ({ id: r.id, mode: r.mode, status: r.status, apolloRequestId: r.apolloRequestId, demo: r.demo, sentAt: r.sentAt.toISOString(), error: r.error }))}
    />
  );
}
