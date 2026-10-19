import { webrtcToken } from "@/lib/human-calls";
import { callingAdmin } from "../guard";

// The admin's short-lived Telnyx WebRTC login token (the credential is created on first use).
export async function POST() {
  const me = await callingAdmin();
  if (me instanceof Response) return me;
  const r = await webrtcToken(me);
  return Response.json(r.body, { status: r.status, headers: { "Cache-Control": "no-store" } });
}
