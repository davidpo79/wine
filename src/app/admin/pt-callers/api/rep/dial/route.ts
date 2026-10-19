import { dial } from "@/lib/pt-callers/service";
import { jsonBody, repSession } from "../../guard";

// Click-to-call one lead: the server rechecks everything, then rings the rep's browser phone (#4).
export async function POST(req: Request) {
  const me = await repSession();
  if (me instanceof Response) return me;
  const r = await dial(me, Number((await jsonBody(req)).leadId));
  if (!r.ok) return Response.json({ ok: false, reason: r.reason, dialError: r.dialError ?? null }, { status: 200 });
  return Response.json({ ok: true, callId: r.callId, status: r.status, dialed: true });
}
