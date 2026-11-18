import { db, schema } from "@/db";
import { logOrderEvent } from "@/lib/orders";
import { sendShippingAlert } from "@/lib/email";
import { parseShipmentUpdate, validShipheroSignature } from "@/lib/shiphero";
import { handleShipheroShipment } from "@/lib/shiphero-fulfilment";

// ShipHero webhooks (registered with `npx tsx scripts/shiphero.ts webhooks`): "Shipment Update" brings the tracking and
// marks the order shipped; "Order Canceled" alerts the team. Signed with x-shiphero-hmac-sha256 (base64 HMAC-SHA256 of
// the raw body with SHIPHERO_WEBHOOK_SECRET); X-Shiphero-Message-ID makes redeliveries harmless.
export async function POST(req: Request) {
  const raw = await req.text();
  if (!validShipheroSignature(raw, req.headers.get("x-shiphero-hmac-sha256"))) return new Response("invalid signature", { status: 401 });
  let body: { webhook_type?: string; test?: string; fulfillment?: unknown; order_number?: string; partner_order_id?: string } | null = null;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("bad request", { status: 400 });
  }
  const type = body?.webhook_type ?? "unknown";
  const messageId = req.headers.get("x-shiphero-message-id");
  if (messageId) {
    const fresh = await db.insert(schema.webhookLog).values({ source: "shiphero", eventId: `shiphero:${messageId}`, type, payload: body as object }).onConflictDoNothing().returning();
    if (!fresh.length) return Response.json({ code: "200", Status: "Success" }); // already handled
  }
  try {
    if (type === "Shipment Update" && body?.test !== "1") {
      const s = parseShipmentUpdate(body);
      if (s) await handleShipheroShipment(s);
    } else if (type === "Order Canceled") {
      const id = body?.partner_order_id ?? body?.order_number;
      if (id) {
        await logOrderEvent(id, "shiphero_canceled", {}).catch(() => {});
        await sendShippingAlert(id, "The order was cancelled in ShipHero (Belgian warehouse).", "ShipHero").catch(() => {});
      }
    }
  } catch (e) {
    console.error("[shiphero] webhook", e);
    return new Response("retry", { status: 500 });
  }
  return Response.json({ code: "200", Status: "Success" });
}

/** ShipHero checks the URL with HEAD when the webhook is registered. */
export async function HEAD() {
  return new Response(null, { status: 200 });
}
