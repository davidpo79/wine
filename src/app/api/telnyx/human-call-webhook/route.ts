import { verifyTelnyxWebhook } from "@/lib/telnyx";
import { handleHumanCallEvent } from "@/lib/human-calls";
import { loadOutboundSettings } from "@/lib/outbound-settings";

// Telnyx Call Control webhooks for admin → customer calls (both legs). Signed with Ed25519 over "timestamp|body".
// After the signature check the answer is always 200: an error would only make Telnyx retry the same event.
export async function POST(req: Request) {
  await loadOutboundSettings();
  const raw = await req.text();
  if (!verifyTelnyxWebhook(raw, req.headers.get("telnyx-signature-ed25519"), req.headers.get("telnyx-timestamp"))) {
    return new Response("invalid signature", { status: 400 });
  }
  try {
    const evt = JSON.parse(raw)?.data;
    if (evt) await handleHumanCallEvent(evt);
  } catch (e) {
    console.error("[human-call] webhook", e);
  }
  return Response.json({ received: true });
}
