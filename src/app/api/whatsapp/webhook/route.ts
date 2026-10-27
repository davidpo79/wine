import { createHmac, timingSafeEqual } from "node:crypto";
import { verifyTelnyxWebhook } from "@/lib/telnyx";
import { loadOutboundSettings } from "@/lib/outbound-settings";
import { receiveWa } from "@/lib/pt-callers/whatsapp";

// Replies from sales prospects on WhatsApp (and delivery statuses). Telnyx signs with Ed25519 (same key as the call
// webhooks); Meta Cloud API with X-Hub-Signature-256 (WHATSAPP_APP_SECRET). Anything unsigned is refused.
export async function POST(req: Request) {
  await loadOutboundSettings();
  const raw = await req.text();
  const tSig = req.headers.get("telnyx-signature-ed25519");
  const mSig = req.headers.get("x-hub-signature-256");
  const ok = tSig
    ? verifyTelnyxWebhook(raw, tSig, req.headers.get("telnyx-timestamp"))
    : !!mSig && !!process.env.WHATSAPP_APP_SECRET && safeEq(mSig, `sha256=${createHmac("sha256", process.env.WHATSAPP_APP_SECRET).update(raw).digest("hex")}`);
  if (!ok) return new Response("invalid signature", { status: 401 });
  try {
    await receiveWa(JSON.parse(raw));
  } catch (e) {
    console.error("[whatsapp] inbound", e);
  }
  return Response.json({ ok: true }); // always 2xx once verified: Telnyx retries otherwise
}

// Meta's one-time subscription check (only with the meta provider).
export function GET(req: Request) {
  const u = new URL(req.url);
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (token && u.searchParams.get("hub.mode") === "subscribe" && u.searchParams.get("hub.verify_token") === token) return new Response(u.searchParams.get("hub.challenge") ?? "");
  return new Response("forbidden", { status: 403 });
}

function safeEq(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
