// The Portugal-callers rules that decide whether a lead may be dialed now. Used before the admin's browser rings
// (service.predialCheck) and again right before the lead's own phone rings (call-hooks.customerLegRefusal).
// No import of human-calls here (the call flow imports this module).
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { PtLead } from "@/db/schema";
import { DIALABLE, dailyCallCap, dncRequired, inCallHours, pilotNumbers, ptFlags, type LeadStatus } from "./flags";
import { blockHash, isDialablePt } from "./phone";
import { checkDnc } from "./dnc";

export type Refusal =
  | "flags_off"
  | "not_found"
  | "not_assigned"
  | "blocked"
  | "bad_status"
  | "demo_lead"
  | "not_pt_number"
  | "not_business_number"
  | "no_legal_basis"
  | "dnc_unavailable"
  | "dnc_listed"
  | "outside_call_hours"
  | "not_in_pilot_list"
  | "call_cap"
  | "locked_by_other";

/** A "calling" lead whose lock expired (the call-end event never came): free to be dialed again. */
export const staleCall = (lead: Pick<PtLead, "status" | "lockUntil">) => lead.status === "calling" && (!lead.lockUntil || lead.lockUntil.getTime() <= Date.now());

export async function isBlocked(lead: Pick<PtLead, "apolloPersonId" | "phone" | "status">) {
  if (lead.status === "opt_out" || lead.status === "blocked") return true;
  const keys = [blockHash("apollo_id", lead.apolloPersonId), ...(lead.phone ? [blockHash("phone", lead.phone)] : [])];
  const r = await db.select({ id: schema.ptBlocks.id }).from(schema.ptBlocks).where(inArray(schema.ptBlocks.valueHash, keys)).limit(1);
  return r.length > 0;
}

async function callsToday() {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.ptCalls)
    .where(gte(schema.ptCalls.createdAt, sql`(date_trunc('day', now() at time zone 'Europe/Lisbon') at time zone 'Europe/Lisbon')`));
  return r?.n ?? 0;
}

/**
 * Everything about the lead and the moment. `forCall` is set on the customer-leg recheck: the call itself already
 * counts in today's total and holds the lock, and the lead is already in status "calling".
 */
export async function leadRefusal(lead: PtLead, repId: number, o: { forCall?: boolean } = {}): Promise<Refusal | null> {
  if (!ptFlags().live) return "flags_off";
  if (lead.assignedTo !== repId) return "not_assigned";
  if (await isBlocked(lead)) return "blocked";
  if (lead.demo) return "demo_lead";
  if (!(o.forCall ? lead.status === "calling" : DIALABLE.includes(lead.status as LeadStatus) || staleCall(lead))) return "bad_status";
  if (!isDialablePt(lead.phone)) return "not_pt_number";
  if (lead.numberClass !== "business") return "not_business_number";
  if (!lead.legalBasis?.trim()) return "no_legal_basis";
  const d = await checkDnc(lead.phone!);
  if (d.status === "unavailable" && dncRequired()) return "dnc_unavailable";
  if (d.status === "listed") return "dnc_listed";
  if (!inCallHours()) return "outside_call_hours";
  const pilot = pilotNumbers();
  if (pilot && !pilot.includes(lead.phone!)) return "not_in_pilot_list";
  if (!o.forCall && (await callsToday()) >= dailyCallCap()) return "call_cap";
  if (lead.lockedBy && lead.lockedBy !== repId && lead.lockUntil && lead.lockUntil.getTime() > Date.now()) return "locked_by_other";
  return null;
}

export async function leadById(id: number) {
  const [l] = await db.select().from(schema.ptLeads).where(eq(schema.ptLeads.id, id)).limit(1);
  return l ?? null;
}

export const logAccess = (adminId: number | null, leadId: number | null, action: string, detail?: Record<string, unknown>) =>
  db.insert(schema.ptAccessLog).values({ adminId, leadId, action, detail: detail ?? null });

/** Releases the lock and puts a lead that is still "calling" back to where it was. */
export async function releaseAfterCall(leadId: number, repId: number) {
  await db
    .update(schema.ptLeads)
    .set({
      lockedBy: null,
      lockUntil: null,
      status: sql`case when ${schema.ptLeads.status} = 'calling' then coalesce(${schema.ptLeads.statusBeforeCall}, 'ready') else ${schema.ptLeads.status} end`,
      statusBeforeCall: null,
      updatedAt: new Date(),
    })
    .where(and(eq(schema.ptLeads.id, leadId), eq(schema.ptLeads.lockedBy, repId)));
}
