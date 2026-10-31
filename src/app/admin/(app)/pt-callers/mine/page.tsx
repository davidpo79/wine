import { redirect } from "next/navigation";
import { and, count, desc, eq, isNull, notInArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { ptFlags } from "@/lib/pt-callers/flags";
import { logAccess } from "@/lib/pt-callers/rules";
import { loadOutboundSettings } from "@/lib/outbound-settings";
import { AdminPanel } from "../AdminPanel";
import { panelConfig, panelLead } from "../panel-data";

export const dynamic = "force-dynamic";

const NO_CREDITS = { today: 0, month: 0, open: 0, caps: { daily: null, monthly: null }, remaining: { daily: null, monthly: null } };

// A sales rep's own leads, worked from start to finish: take new ones, get phones, prepare, call or e-mail.
// Only leads assigned to her; the service refuses any action on someone else's lead.
export default async function MyLeads() {
  const me = await requireAdmin({ allowPtCaller: true });
  if (me.role !== "pt_caller") redirect("/admin/pt-callers");
  await loadOutboundSettings();
  const L = schema.ptLeads;
  const [leads, [free]] = await Promise.all([
    db.select().from(L).where(eq(L.assignedTo, me.id)).orderBy(sql`${L.phone} is null`, desc(L.id)).limit(500),
    db.select({ n: count() }).from(L).where(and(isNull(L.assignedTo), notInArray(L.status, ["opt_out", "blocked"]))),
  ]);
  await logAccess(me.id, null, "rep_view", { leads: leads.length });
  return (
    <AdminPanel
      limited
      unclaimed={free?.n ?? 0}
      flags={ptFlags()}
      config={panelConfig()}
      credits={{ real: NO_CREDITS, demo: NO_CREDITS }}
      reps={[{ id: me.id, email: me.email }]}
      leads={leads.map((l) => ({ ...panelLead(l, true), note: l.noteBy === me.id ? l.note : null }))}
      requests={[]}
    />
  );
}
