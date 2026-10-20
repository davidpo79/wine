import { callDtmf } from "@/lib/human-calls";
import { body, callingAdmin } from "../guard";

// Keypad during a connected call: { callId, digits } of the caller's own call (admins and Portugal-callers reps).
export async function POST(req: Request) {
  const me = await callingAdmin({ rep: true });
  if (me instanceof Response) return me;
  const b = await body(req);
  const r = await callDtmf(me, b.callId, b.digits);
  return Response.json(r.body, { status: r.status });
}
