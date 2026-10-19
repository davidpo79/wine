// What #4's call flow asks about a Portugal-callers call (the lead is linked in pt_calls; human_calls is unchanged).
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
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
