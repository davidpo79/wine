// Admin → Dashboard: Shopify-style conversion funnel, upsell take rates and new vs returning customers.
import { and, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { sourceFromUtm } from "./utm";
import { PAID_STATUSES } from "./stats";

export const PERIODS = { today: "Today", "7d": "Last 7 days", "30d": "Last 30 days", all: "All time" } as const;
export type Period = keyof typeof PERIODS;

export const isAdSource = (s: string | null | undefined) => !!s && s.endsWith(" ads");

const SESSION_STEPS = ["PageView", "ViewContent", "AddToCart"] as const;
const ORDER_STEPS = ["CheckoutOpened", "InitiateCheckout", "Purchase"] as const;

export type FunnelStep = { key: string; label: string; hint: string; count: number };

/** Sessions by traffic source (all visits in the period) and the order-level steps, attributed to the visit that opened the checkout. */
export async function conversionFunnel(since: Date | null, adsOnly: boolean) {
  const time = since ? [gte(schema.trackingEvents.createdAt, since)] : [];
  const sessionKey = sql<string>`coalesce(${schema.trackingEvents.sessionId}, ${schema.trackingEvents.eventId})`;
  const sessionRows = await db
    .select({ name: schema.trackingEvents.eventName, source: schema.trackingEvents.source, n: sql<number>`count(distinct ${sessionKey})::int` })
    .from(schema.trackingEvents)
    .where(and(eq(schema.trackingEvents.sentTo, "internal"), inArray(schema.trackingEvents.eventName, [...SESSION_STEPS]), ...time))
    .groupBy(schema.trackingEvents.eventName, schema.trackingEvents.source);

  const orderRows = await db
    .selectDistinct({ name: schema.trackingEvents.eventName, orderId: schema.trackingEvents.orderId })
    .from(schema.trackingEvents)
    .where(and(eq(schema.trackingEvents.sentTo, "internal"), inArray(schema.trackingEvents.eventName, [...ORDER_STEPS]), isNotNull(schema.trackingEvents.orderId), ...time));
  const orderIds = [...new Set(orderRows.map((r) => r.orderId!))];
  const sourceOf = await orderSources(orderIds);

  // Upsell step: purchased orders that also paid for a one-time offer (more boxes or a product; the printed card is the order bump).
  const purchased = [...new Set(orderRows.filter((r) => r.name === "Purchase").map((r) => r.orderId!))];
  const withOffer = purchased.length
    ? new Set(
        (
          await db
            .selectDistinct({ id: schema.orderAddons.orderId })
            .from(schema.orderAddons)
            .where(and(inArray(schema.orderAddons.orderId, purchased), eq(schema.orderAddons.status, "paid"), inArray(schema.orderAddons.kind, ["boxes", "product"])))
        ).map((r) => r.id),
      )
    : new Set<string>();

  const keep = (src: string | null | undefined) => !adsOnly || isAdSource(src);
  const sessions = (name: string) => sessionRows.filter((r) => r.name === name && keep(r.source)).reduce((n, r) => n + r.n, 0);
  const orders = (name: string) => new Set(orderRows.filter((r) => r.name === name && keep(sourceOf.get(r.orderId!))).map((r) => r.orderId)).size;

  const steps: FunnelStep[] = [
    { key: "sessions", label: adsOnly ? "Sessions from ads" : "Sessions", hint: "Visits to the site (one per browser tab)", count: sessions("PageView") },
    { key: "view", label: "Viewed the product", hint: "Scrolled to the product / prices", count: sessions("ViewContent") },
    { key: "cart", label: "Added to cart", hint: "Chose a bundle and clicked to buy", count: sessions("AddToCart") },
    { key: "checkout", label: "Reached checkout", hint: "Checkout page opened", count: orders("CheckoutOpened") },
    { key: "pay", label: "Clicked “Pagar”", hint: "Filled in the details and started paying", count: orders("InitiateCheckout") },
    { key: "purchase", label: "Purchased", hint: "Payment confirmed", count: orders("Purchase") },
    { key: "upsell", label: "Took a one-time offer", hint: "Paid for an extra box or product (before or after paying)", count: purchased.filter((id) => withOffer.has(id) && keep(sourceOf.get(id))).length },
  ];

  // Sessions and purchases by source.
  const bySource = new Map<string, { sessions: number; carts: number; checkouts: number; purchases: number }>();
  const row = (s: string) => bySource.get(s) ?? bySource.set(s, { sessions: 0, carts: 0, checkouts: 0, purchases: 0 }).get(s)!;
  for (const r of sessionRows) {
    if (r.name === "PageView") row(r.source ?? "Unknown").sessions += r.n;
    if (r.name === "AddToCart") row(r.source ?? "Unknown").carts += r.n;
  }
  for (const id of new Set(orderRows.filter((r) => r.name === "CheckoutOpened").map((r) => r.orderId!))) row(sourceOf.get(id) ?? "Unknown").checkouts += 1;
  for (const id of purchased) row(sourceOf.get(id) ?? "Unknown").purchases += 1;
  const sources = [...bySource.entries()].map(([source, v]) => ({ source, ...v })).sort((a, b) => b.sessions - a.sessions || b.purchases - a.purchases);

  return { steps, sources };
}

/** Source of each order: the visit that opened its checkout, else its first-touch UTM / Meta click id. */
async function orderSources(ids: string[]) {
  const map = new Map<string, string>();
  if (!ids.length) return map;
  const opened = await db
    .select({ orderId: schema.trackingEvents.orderId, source: schema.trackingEvents.source })
    .from(schema.trackingEvents)
    .where(and(eq(schema.trackingEvents.eventName, "CheckoutOpened"), eq(schema.trackingEvents.sentTo, "internal"), inArray(schema.trackingEvents.orderId, ids), isNotNull(schema.trackingEvents.source)));
  for (const r of opened) if (r.orderId && r.source) map.set(r.orderId, r.source);
  const rest = ids.filter((id) => !map.has(id));
  if (rest.length) {
    const os = await db.select({ id: schema.orders.id, utm: schema.orders.utm, fbc: schema.orders.fbc }).from(schema.orders).where(inArray(schema.orders.id, rest));
    for (const o of os) map.set(o.id, sourceFromUtm(o.utm, o.fbc));
  }
  return map;
}

/** Take rate and revenue of each offer, for orders paid in the period. */
export async function upsellBreakdown(since: Date | null) {
  const paid = await db
    .select({ id: schema.orders.id })
    .from(schema.orders)
    .where(and(inArray(schema.orders.status, [...PAID_STATUSES]), isNotNull(schema.orders.paidAt), ...(since ? [gte(schema.orders.paidAt, since)] : [])));
  const ids = paid.map((o) => o.id);
  const empty = { orders: 0, bump: { orders: 0, cents: 0 }, before: { shown: 0, orders: 0, cents: 0 }, after: { shown: 0, orders: 0, cents: 0 }, addonCents: 0 };
  if (!ids.length) return empty;
  const [addons, separate, events] = await Promise.all([
    db.select().from(schema.orderAddons).where(and(inArray(schema.orderAddons.orderId, ids), eq(schema.orderAddons.status, "paid"))),
    db.selectDistinct({ id: schema.payments.addonId }).from(schema.payments).where(and(inArray(schema.payments.orderId, ids), isNotNull(schema.payments.addonId), eq(schema.payments.status, "paid"))),
    db
      .selectDistinct({ orderId: schema.orderEvents.orderId, type: schema.orderEvents.type })
      .from(schema.orderEvents)
      .where(and(inArray(schema.orderEvents.orderId, ids), inArray(schema.orderEvents.type, ["upsell_shown", "upsell_offer_viewed"]))),
  ]);
  const charged = new Set(separate.map((r) => r.id));
  const post = (a: (typeof addons)[number]) => charged.has(a.id) || !!a.stripePaymentIntentId;
  const tally = (list: typeof addons) => ({ orders: new Set(list.map((a) => a.orderId)).size, cents: list.reduce((n, a) => n + a.amountCents, 0) });
  return {
    orders: ids.length,
    bump: tally(addons.filter((a) => a.kind === "card")),
    before: { shown: events.filter((e) => e.type === "upsell_shown").length, ...tally(addons.filter((a) => a.kind !== "card" && !post(a))) },
    after: { shown: events.filter((e) => e.type === "upsell_offer_viewed").length, ...tally(addons.filter((a) => a.kind !== "card" && post(a))) },
    addonCents: addons.reduce((n, a) => n + a.amountCents, 0),
  };
}

/** New vs returning customers among orders paid in the period (same email, or same phone when there is no email). */
export async function customerStats(since: Date | null) {
  const all = await db
    .select({ id: schema.orders.id, email: schema.orders.email, phone: schema.orders.phone, paidAt: schema.orders.paidAt, total: schema.orders.totalCents })
    .from(schema.orders)
    .where(and(inArray(schema.orders.status, [...PAID_STATUSES]), isNotNull(schema.orders.paidAt)))
    .orderBy(schema.orders.paidAt);
  const firstSeen = new Map<string, Date>();
  const newC = new Set<string>();
  const retC = new Set<string>();
  let retOrders = 0;
  let retCents = 0;
  let orders = 0;
  for (const o of all) {
    const key = o.email?.trim().toLowerCase() || o.phone?.replace(/\D/g, "") || o.id;
    const first = firstSeen.get(key);
    if (!first) firstSeen.set(key, o.paidAt!);
    if (since && o.paidAt! < since) continue;
    orders += 1;
    if (first) {
      // Had a paid order before this one.
      retC.add(key);
      retOrders += 1;
      retCents += o.total;
    } else newC.add(key);
  }
  // A customer whose first order is in the period and who ordered again counts once, as returning.
  for (const k of retC) newC.delete(k);
  const customers = newC.size + retC.size;
  return { customers, newCustomers: newC.size, returning: retC.size, returningRate: customers ? retC.size / customers : 0, orders, returningOrders: retOrders, returningCents: retCents };
}
