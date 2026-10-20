import { dial } from "@/lib/pt-callers/service";
import { jsonBody, repSession } from "../../guard";

// Click-to-call one lead: the server rechecks everything, then rings the caller's browser phone (#4).
// Admins may call too, from the admin screen (an unassigned lead becomes theirs).
export async function POST(req: Request) {
  const me = await repSession({ allowAdmin: true });
  if (me instanceof Response) return me;
  const r = await dial(me, Number((await jsonBody(req)).leadId));
  if (!r.ok) return Response.json({ ok: false, reason: r.reason, dialError: r.dialError ?? null }, { status: 200 });
  return Response.json({ ok: true, callId: r.callId, status: r.status, dialed: true });
}
