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
  // Who holds leads, with their role: anyone who is not a Sales rep sees every lead, so the leads are not split for them.
  // And leads that more than one sales rep worked on in the last 30 days (a shared login, or a lead moved between reps).
  const holders = (await db.execute(sql`
    select u.id, u.email, u.role, u.disabled_at is not null as disabled, u.last_login_at, count(l.id)::int as leads
    from admin_users u left join pt_leads l on l.assigned_to = u.id
    where u.role = 'pt_caller' or l.id is not null
    group by u.id order by u.id`)) as unknown as Record<string, unknown>[];
  const [shared] = [...((await db.execute(sql`
    select count(*)::int as n from (
      select a.lead_id from pt_access_log a join admin_users u on u.id = a.admin_id
      where u.role = 'pt_caller' and a.lead_id is not null and a.created_at > now() - interval '30 days'
      group by a.lead_id having count(distinct a.admin_id) > 1) x`)) as unknown as { n: number }[])];
  return (
    <AdminPanel
      flags={flags}
      config={panelConfig()}
      credits={credits}
      reps={reps}
      holders={[...holders].map((h) => ({ id: Number(h.id), email: String(h.email), role: String(h.role), disabled: !!h.disabled, lastLogin: h.last_login_at ? new Date(h.last_login_at as string).toISOString() : null, leads: Number(h.leads) }))}
      sharedLeads={shared?.n ?? 0}
      leads={leads.map((l) => panelLead(l))}
      requests={requests.map((r) => ({ id: r.id, mode: r.mode, status: r.status, apolloRequestId: r.apolloRequestId, demo: r.demo, sentAt: r.sentAt.toISOString(), error: r.error }))}
    />
  );
}
