// What #4's call flow asks about a Portugal-callers call (the lead is linked in pt_calls; human_calls is unchanged).
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { voicemailMode } from "./flags";
import { leadById, leadRefusal, logAccess, releaseAfterCall } from "./rules";

async function link(callId: string) {
  const [c] = await db.select().from(schema.ptCalls).where(eq(schema.ptCalls.humanCallId, callId)).limit(1);
  return c ?? null;
}

export const isPtCall = async (callId: string) => !!(await link(callId));

/** Right before the lead's own phone rings: the same rules again. A reason = do not dial the lead. */
export async function customerLegRefusal(callId: string) {
  const c = await link(callId);
  if (!c) return null;
  const lead = await leadById(c.leadId);
  if (!lead) return "not_found";
  const r = await leadRefusal(lead, c.repId, { forCall: true });
  if (r) await logAccess(c.repId, c.leadId, "dial_refused", { at: "customer_leg", reason: r, callId });
  return r;
}

/** The call is over (any outcome): release the lock; the rep records the business outcome. */
export async function onCallEnded(callId: string) {
  const c = await link(callId);
  if (!c || c.endedAt) return;
  const [first] = await db.update(schema.ptCalls).set({ endedAt: new Date() }).where(eq(schema.ptCalls.id, c.id)).returning({ id: schema.ptCalls.id });
  if (!first) return;
  await releaseAfterCall(c.leadId, c.repId);
}

export const autoHangupOnVoicemail = () => voicemailMode() === "hangup";

/** An answering machine took the call (detection on): logged as a voicemail summary; the lead goes to "no answer". */
export async function onVoicemail(callId: string) {
  const c = await link(callId);
  if (!c) return;
  await db
    .update(schema.ptCalls)
    .set({ outcome: "voicemail", summarizedAt: new Date() })
    .where(and(eq(schema.ptCalls.id, c.id), isNull(schema.ptCalls.outcome)));
  // Still in the call: the release that follows the hang-up restores this status. Already released: set it directly.
  await db.update(schema.ptLeads).set({ statusBeforeCall: "no_answer" }).where(and(eq(schema.ptLeads.id, c.leadId), eq(schema.ptLeads.status, "calling")));
  await db.update(schema.ptLeads).set({ status: "no_answer" }).where(and(eq(schema.ptLeads.id, c.leadId), inArray(schema.ptLeads.status, ["ready", "callback"])));
  await logAccess(c.repId, c.leadId, "outcome", { status: "voicemail", auto: true, callId });
}
