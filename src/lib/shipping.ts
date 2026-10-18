// Order shipping with CTT: create the shipment and label from the admin, then follow it automatically.
// Picked up (CTT push "shipped" or status 25) → order "shipped" + email; delivered (push or 99/94/32) → "delivered",
// which also schedules the review invitation.
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Order, Shipment } from "@/db/schema";
import { CTT_DELIVERED, CTT_PICKED_UP, cttConfig, cttConfigured, cttCreateShipment, cttLabel, cttTrack, SHOP_STATUS, type TrackingStatus } from "./ctt";
import { logOrderEvent, setStatus } from "./orders";
import { sendShipped } from "./email";

export async function shipmentOf(orderId: string) {
  const [s] = await db.select().from(schema.shipments).where(eq(schema.shipments.orderId, orderId));
  return s ?? null;
}

/** Admin "Create CTT label": imports the shipment (once) and fetches the label. The order stays "preparing" until CTT picks it up. */
export async function createCttLabel(o: Order, by: string) {
  if (!cttConfigured()) return { error: "CTT is not connected yet (API key)." };
  if (!["paid", "preparing"].includes(o.status)) return { error: `Labels are created for paid orders (this one is "${o.status}").` };
  const simulated = cttConfig().simulate;
  let s = await shipmentOf(o.id);
  try {
    if (!s || s.simulated !== simulated) {
      const r = await cttCreateShipment(o);
      const values = { carrierName: r.carrierName, simulated, error: null, updatedAt: new Date() };
      [s] = s
        ? await db.update(schema.shipments).set(values).where(eq(schema.shipments.id, s.id)).returning()
        : await db.insert(schema.shipments).values({ orderId: o.id, ...values }).returning();
      await logOrderEvent(o.id, "ctt_shipment_created", { by, carrier: r.carrierName, warnings: r.warnings || undefined, simulated });
    }
    const label = await cttLabel(o.id);
    await db
      .update(schema.shipments)
      .set({ labelPdf: label.pdf, trackingId: label.trackingId, trackingUrl: label.trackingUrl, error: null, updatedAt: new Date() })
      .where(eq(schema.shipments.orderId, o.id));
    const fresh = o.status === "paid" ? ((await setStatus(o, "preparing", {}, { by, via: "ctt_label" })) ?? o) : o;
    if (label.trackingId) await db.update(schema.orders).set({ trackingNumber: label.trackingId }).where(eq(schema.orders.id, fresh.id));
    await logOrderEvent(o.id, "ctt_label_created", { by, tracking: label.trackingId, simulated });
    return { ok: true as const, trackingId: label.trackingId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (s) await db.update(schema.shipments).set({ error: msg, updatedAt: new Date() }).where(eq(schema.shipments.id, s.id));
    await logOrderEvent(o.id, "ctt_error", { by, error: msg });
    return { error: msg };
  }
}

async function orderById(id: string) {
  const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, id));
  return o ?? null;
}

/** Moves the order forward from a carrier event. Never moves it back; safe to call repeatedly. */
export async function applyShippingEvent(orderId: string, kind: "shipped" | "delivered", meta: Record<string, unknown>) {
  let o = await orderById(orderId);
  if (!o) return;
  if (o.status === "preparing" || o.status === "paid") {
    const tracking = (meta.tracking as string | undefined) ?? o.trackingNumber ?? undefined;
    const r = await setStatus(o, "shipped", tracking ? { trackingNumber: tracking } : {}, { via: "ctt", ...meta });
    if (r) {
      o = r;
      if (r.trackingNumber) await sendShipped(r);
    }
  }
  if (kind === "delivered" && o.status === "shipped") await setStatus(o, "delivered", {}, { via: "ctt", ...meta });
}

/** Shop update pushed by CTT (Status = our SHOP_STATUS ids). */
export async function handleShopUpdate(orderId: string, status: number, trackingId: string | null, trackingUrl: string | null) {
  const s = await shipmentOf(orderId);
  if (s && (trackingId || trackingUrl)) {
    await db.update(schema.shipments).set({ trackingId: trackingId ?? s.trackingId, trackingUrl: trackingUrl ?? s.trackingUrl, updatedAt: new Date() }).where(eq(schema.shipments.id, s.id));
  }
  await logOrderEvent(orderId, "ctt_push", { status, trackingId });
  if (status === SHOP_STATUS.shipped) await applyShippingEvent(orderId, "shipped", { tracking: trackingId ?? undefined });
  if (status === SHOP_STATUS.delivered) await applyShippingEvent(orderId, "delivered", { tracking: trackingId ?? undefined });
}

function mergeEvents(s: Shipment, statuses: TrackingStatus[]) {
  const key = (e: TrackingStatus) => `${e.code}|${e.at}`;
  const seen = new Set(s.events.map(key));
  return [...s.events, ...statuses.filter((e) => !seen.has(key(e)))].sort((a, b) => a.at.localeCompare(b.at));
}

/** Safety net for missed pushes: polls CTT for every open shipment (worker, every 2 hours). */
export async function syncCttTracking() {
  if (!cttConfigured()) return 0;
  const open = await db
    .select({ s: schema.shipments })
    .from(schema.shipments)
    .innerJoin(schema.orders, eq(schema.orders.id, schema.shipments.orderId))
    .where(and(eq(schema.shipments.simulated, false), inArray(schema.orders.status, ["preparing", "shipped"])));
  if (!open.length) return 0;
  const tracked = await cttTrack(open.map((r) => r.s.orderId));
  let moved = 0;
  for (const { s } of open) {
    const t = tracked.get(s.orderId);
    if (!t?.statuses.length) continue;
    const events = mergeEvents(s, t.statuses);
    const last = events[events.length - 1];
    await db
      .update(schema.shipments)
      .set({ events, lastCode: last.code, lastText: last.text, trackingId: t.trackingId ?? s.trackingId, updatedAt: new Date() })
      .where(eq(schema.shipments.id, s.id));
    const codes = new Set(events.map((e) => e.code));
    if (CTT_DELIVERED.some((c) => codes.has(c))) {
      await applyShippingEvent(s.orderId, "delivered", { tracking: t.trackingId ?? undefined, code: last.code });
      moved += 1;
    } else if (CTT_PICKED_UP.some((c) => codes.has(c))) {
      await applyShippingEvent(s.orderId, "shipped", { tracking: t.trackingId ?? undefined, code: last.code });
    }
  }
  return moved;
}
