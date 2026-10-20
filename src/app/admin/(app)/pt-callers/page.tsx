import { redirect } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { ptFlags, businessLineRequired, creditCaps, dailyCallCap, dncRequired, legalBasisRequired, pilotNumbers, resultMode } from "@/lib/pt-callers/flags";
import { creditSummary, listForRep, sweepTimeouts } from "@/lib/pt-callers/service";
import { logAccess } from "@/lib/pt-callers/rules";
import { humanCallMissing } from "@/lib/telnyx-call-control";
import { loadOutboundSettings, outboundEnv } from "@/lib/outbound-settings";
import { RepPanel } from "./RepPanel";
import { AdminPanel } from "./AdminPanel";

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
      config={{
        apolloKey: !!process.env.APOLLO_API_KEY,
        webhookBase: outboundEnv().APOLLO_WEBHOOK_BASE_URL ?? null,
        resultMode: resultMode(),
        caps: creditCaps(),
        callCap: dailyCallCap(),
        callHours: outboundEnv().PT_CALLERS_CALL_HOURS ?? null,
        pilot: pilotNumbers(),
        telnyxMissing: humanCallMissing(),
        dncRequired: dncRequired(),
        legalBasisRequired: legalBasisRequired(),
        businessLineRequired: businessLineRequired(),
      }}
      credits={credits}
      reps={reps}
      leads={leads.map((l) => ({
        id: l.id,
        name: [l.firstName, l.lastName].filter(Boolean).join(" ") || "—",
        firstName: l.firstName,
        hasSurname: !!l.lastName,
        email: l.email,
        emailedAt: l.emailedAt?.toISOString() ?? null,
        title: l.title,
        company: l.company,
        companySize: l.companySize,
        location: l.location,
        phone: l.phone,
        phoneType: l.phoneType,
        numberClass: l.numberClass,
        legalBasis: l.legalBasis,
        status: l.status,
        approved: !!l.approvedAt,
        assignedTo: l.assignedTo,
        demo: l.demo,
        attempts: l.attempts,
        note: l.note,
        failReason: l.failReason,
        fetchedAt: l.fetchedAt.toISOString(),
        retentionUntil: l.retentionUntil.toISOString(),
      }))}
      requests={requests.map((r) => ({ id: r.id, mode: r.mode, status: r.status, apolloRequestId: r.apolloRequestId, demo: r.demo, sentAt: r.sentAt.toISOString(), error: r.error }))}
    />
  );
}
