// The Belgian warehouse in the order flow: send paid orders to ShipHero, and turn its shipments into "shipped".
import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Order } from "@/db/schema";
import { getSettings } from "./settings";
import { purchaseComplete } from "./purchase-complete";
import { logOrderEvent, setStatus } from "./orders";
import { sendShipped, sendShippingAlert } from "./email";
import { SHIPHERO_COUNTRIES, addBoxesToShipheroOrder, isBelgianOrder, pushOrderToShiphero, shipheroConfigured, upsTrackingUrl, type ShipheroShipment } from "./shiphero";

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

/**
 * Orders for the Belgian warehouse go to ShipHero once the whole purchase is known (David, 19/11/2026): the Trilogia
 * boxes can get a "more boxes" offer right after paying, which must leave in the same parcel, so they wait for the
 * thank-you page ("thanks"), or for the worker 20 minutes after payment if the buyer never gets there ("late"). With
 * the offer switched off they go at payment ("paid"). A failure alerts the team; the payment is never affected. An order that already has a ShipHero record (sent, or failed once) is left to the admin button.
 */
export async function autoSendToShiphero(o: Order, when: "paid" | "thanks" | "late" = "paid") {
  if (!isBelgianOrder(o) || !shipheroConfigured() || o.status !== "paid") return;
  const settings = await getSettings();
  if (!settings.shiphero.enabled) return;
  // Every order can get an offer after paying (Trilogia and, since 19/11/2026, the Black Friday boxes): it waits until
  // the purchase is complete (thank-you page, no one-click offer possible, or 20 minutes after payment).
  if (when === "paid" && !(await purchaseComplete(o))) {
    await logOrderEvent(o.id, "shiphero_waiting", { reason: "post-purchase offer" }).catch(() => {});
    return;
  }
  const [ship] = await db.select().from(schema.shipments).where(eq(schema.shipments.orderId, o.id));
  if (ship && when !== "paid") return;
  const r = await sendToShiphero(o, `auto:${when}`);
  if ("error" in r) await sendShippingAlert(o.id, `${r.error} Open the order and press "Send to ShipHero" once it is fixed.`, "ShipHero").catch(() => {});
}

/** Worker (every 5 minutes): paid DE/NL/BE orders whose buyer never reached the thank-you page, 20 minutes after payment. */
export async function sendLateShipheroOrders() {
  if (!shipheroConfigured()) return;
  const rows = await db
    .select({ o: schema.orders })
    .from(schema.orders)
    .leftJoin(schema.shipments, eq(schema.shipments.orderId, schema.orders.id))
    .where(and(eq(schema.orders.status, "paid"), inArray(schema.orders.country, [...SHIPHERO_COUNTRIES]), lt(schema.orders.paidAt, new Date(Date.now() - 20 * 60_000)), isNull(schema.shipments.id)));
  for (const { o } of rows) await autoSendToShiphero(o, "late");
}

/** A paid "more boxes" upsell: if its order is already in ShipHero, the boxes join that order; else they go with it. */
export async function shipheroAddonPaid(o: Order, addon: { id: number; boxes: number; amountCents: number }) {
  if (!isBelgianOrder(o) || addon.boxes <= 0 || !shipheroConfigured() || o.status !== "preparing") return;
  try {
    const r = await addBoxesToShipheroOrder(o, addon, await getSettings());
    if (r.added) await logOrderEvent(o.id, "shiphero_addon", { addon_id: addon.id, boxes: addon.boxes });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await logOrderEvent(o.id, "shiphero_error", { by: "addon", error: message });
    await sendShippingAlert(o.id, `ShipHero: the ${addon.boxes} extra box(es) of this order could not be added (${message}). Add them to the ShipHero order by hand.`, "ShipHero").catch(() => {});
  }
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
