// The Belgian warehouse in the order flow: send paid orders to ShipHero, and turn its shipments into "shipped".
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Order } from "@/db/schema";
import { getSettings } from "./settings";
import { logOrderEvent, setStatus } from "./orders";
import { sendShipped, sendShippingAlert } from "./email";
import { isBelgianOrder, pushOrderToShiphero, shipheroConfigured, upsTrackingUrl, type ShipheroShipment } from "./shiphero";

/** Admin button and automatic push: creates the order in ShipHero and moves it to "preparing". */
export async function sendToShiphero(o: Order, by: string): Promise<{ ok: string } | { error: string }> {
  if (!shipheroConfigured()) return { error: "ShipHero is not connected yet (SHIPHERO_REFRESH_TOKEN in Railway)." };
  if (!isBelgianOrder(o)) return { error: "Only orders to Germany, the Netherlands and Belgium go to the Belgian warehouse." };
  if (!["paid", "preparing"].includes(o.status)) return { error: `Only paid orders go to the warehouse (this one is "${o.status}").` };
  const settings = await getSettings();
  try {
    const r = await pushOrderToShiphero(o, settings);
    await logOrderEvent(o.id, "shiphero_order", { by, shiphero_id: r.shipheroId, existed: r.existed });
    if (o.status === "paid") await setStatus(o, "preparing", {}, { by, via: "shiphero" });
    return { ok: r.existed ? "Already in ShipHero." : "Sent to the Belgian warehouse (ShipHero)." };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const [prev] = await db.select().from(schema.shipments).where(eq(schema.shipments.orderId, o.id));
    if (prev) await db.update(schema.shipments).set({ error: message, updatedAt: new Date() }).where(eq(schema.shipments.id, prev.id));
    else await db.insert(schema.shipments).values({ orderId: o.id, provider: "shiphero", carrierName: "ShipHero · Belgium", error: message });
    await logOrderEvent(o.id, "shiphero_error", { by, error: message });
    return { error: `ShipHero: ${message}` };
  }
}

/** Right after payment (lib/payments): orders for the Belgian warehouse go to ShipHero; a failure alerts the team. */
export async function autoSendToShiphero(o: Order) {
  if (!isBelgianOrder(o) || !shipheroConfigured()) return;
  const settings = await getSettings();
  if (!settings.shiphero.enabled) return;
  const r = await sendToShiphero(o, "auto");
  if ("error" in r) await sendShippingAlert(o.id, `${r.error} Open the order and press "Send to ShipHero" once it is fixed.`, "ShipHero").catch(() => {});
}

/** "Shipment Update" from ShipHero: tracking on the order, status "shipped" and the email to the customer. */
export async function handleShipheroShipment(s: ShipheroShipment) {
  const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, s.orderNumber));
  if (!o) return { ignored: "unknown order" };
  const url = s.trackingUrl || (s.trackingNumber && /ups/i.test(s.carrier ?? "") ? upsTrackingUrl(s.trackingNumber) : null);
  const event = { code: "shipped", at: new Date().toISOString(), text: [s.carrier, s.method, s.packages > 1 ? `${s.packages} packages` : null].filter(Boolean).join(" · ") };
  const [prev] = await db.select().from(schema.shipments).where(eq(schema.shipments.orderId, o.id));
  const values = { provider: "shiphero", carrierName: s.carrier ? `ShipHero · ${s.carrier}` : "ShipHero · Belgium", trackingId: s.trackingNumber, trackingUrl: url, lastText: event.text, error: null, updatedAt: new Date() };
  if (prev) await db.update(schema.shipments).set({ ...values, events: [...prev.events, event] }).where(eq(schema.shipments.id, prev.id));
  else await db.insert(schema.shipments).values({ orderId: o.id, ...values, events: [event] });
  if (!["paid", "preparing"].includes(o.status)) return { ignored: `order is ${o.status}` };
  const shipped = await setStatus(o, "shipped", { trackingNumber: s.trackingNumber }, { via: "shiphero", tracking: s.trackingNumber, carrier: s.carrier });
  if (shipped && s.trackingNumber) await sendShipped(shipped, url).catch((e) => console.error("[email] shipped", e));
  return { shipped: !!shipped };
}
