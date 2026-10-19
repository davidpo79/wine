import { callState } from "@/lib/human-calls";
import { body, callingAdmin } from "../guard";

// Polled every 2 s by the call popup: { callId } of the admin's own call.
export async function POST(req: Request) {
  const me = await callingAdmin({ rep: true });
  if (me instanceof Response) return me;
  const r = await callState(me, (await body(req)).callId);
  return Response.json(r.body, { status: r.status, headers: { "Cache-Control": "no-store" } });
}
