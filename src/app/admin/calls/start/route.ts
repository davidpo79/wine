import { startCall } from "@/lib/human-calls";
import { body, callingAdmin } from "../guard";

// Starts a call to an order's customer or a lead: { orderId } or { leadId }. The number always comes from the DB.
export async function POST(req: Request) {
  const me = await callingAdmin();
  if (me instanceof Response) return me;
  const b = await body(req);
  const r = await startCall(me, { orderId: b.orderId, leadId: b.leadId });
  return Response.json(r.body, { status: r.status });
}
