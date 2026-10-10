// Webhook integration test against a running server (local or staging), PaymentIntent flow.
// Usage: STRIPE_WEBHOOK_SECRET=whsec_... tsx scripts/test-webhooks.ts [baseUrl]
import "./load-env";
import Stripe from "stripe";
import { and, eq, inArray } from "drizzle-orm";
import { sql as pg, db, schema } from "../src/db";

const base = process.argv[2] ?? "http://localhost:3000";
const secret = process.env.STRIPE_WEBHOOK_SECRET!;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_dummy");
let failures = 0;
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${msg}`);
  if (!cond) failures++;
};

async function send(type: string, object: Record<string, unknown>, id = `evt_test_${Math.random().toString(36).slice(2)}`) {
  const payload = JSON.stringify({ id, object: "event", type, api_version: "2026-09-30", created: Math.floor(Date.now() / 1000), data: { object }, livemode: false, pending_webhooks: 1, request: null });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
  const r = await fetch(`${base}/api/webhooks/stripe`, { method: "POST", headers: { "stripe-signature": header, "content-type": "application/json" }, body: payload });
  return { status: r.status, id };
}

const ids: string[] = [];
async function makeOrder(suffix: string) {
  const [b] = await db.select().from(schema.bundles).where(eq(schema.bundles.key, "x2"));
  const id = `WP-TEST-${suffix}-${Date.now() % 100000}`;
  await db.insert(schema.orders).values({ id, bundleId: b.id, bundleKey: b.key, qtyBoxes: b.qty, subtotalCents: b.priceCents, shippingCents: 0, totalCents: b.priceCents, stripePaymentIntentId: `pi_test_${id}`, consentTracking: true, email: "teste@example.com", customerName: "Maria Teste", phone: "+351912345678", shippingAddress: { line1: "Rua A 1", postal_code: "1000-001", city: "Lisboa", country: "PT" } });
  ids.push(id);
  return { id, total: b.priceCents };
}
const pi = (orderId: string, amount: number, status: string, extra: Record<string, unknown> = {}) => ({ id: `pi_test_${orderId}`, object: "payment_intent", amount, amount_received: status === "succeeded" ? amount : 0, currency: "eur", status, metadata: { kind: "order", order_id: orderId }, payment_method_types: ["card"], ...extra });
const status = async (id: string) => (await db.select().from(schema.orders).where(eq(schema.orders.id, id)))[0];
const purchases = async (id: string) =>
  (await db.select().from(schema.trackingEvents).where(and(eq(schema.trackingEvents.orderId, id), eq(schema.trackingEvents.eventName, "Purchase"), eq(schema.trackingEvents.sentTo, "internal")))).length;

{
  const o = await makeOrder("CARD");
  const bad = await fetch(`${base}/api/webhooks/stripe`, { method: "POST", headers: { "stripe-signature": "t=1,v1=bad" }, body: "{}" });
  check(bad.status === 400, "invalid signature rejected");
  const e = await send("payment_intent.succeeded", pi(o.id, o.total, "succeeded"));
  check(e.status === 200, "payment_intent.succeeded accepted");
  check((await status(o.id)).status === "paid", "card order is paid");
  check((await purchases(o.id)) === 1, "Purchase reported once");
  await send("payment_intent.succeeded", pi(o.id, o.total, "succeeded"), e.id);
  await send("payment_intent.succeeded", pi(o.id, o.total, "succeeded"));
  check((await purchases(o.id)) === 1, "Purchase still once after duplicate signals");

  // Upsell add-on paid
  const [addon] = await db.insert(schema.orderAddons).values({ orderId: o.id, kind: "boxes", sku: "trilogia-2160", label: "Trilogia 2160 · mais 1 caixa", qty: 1, boxes: 1, amountCents: 3443, stripePaymentIntentId: `pi_addon_${o.id}` }).returning();
  await send("payment_intent.succeeded", { id: `pi_addon_${o.id}`, object: "payment_intent", amount: 3443, amount_received: 3443, status: "succeeded", metadata: { kind: "addon", addon_id: String(addon.id), order_id: o.id } });
  const [a2] = await db.select().from(schema.orderAddons).where(eq(schema.orderAddons.id, addon.id));
  check(a2.status === "paid", "upsell add-on marked paid");
  check((await db.select().from(schema.trackingEvents).where(and(eq(schema.trackingEvents.eventId, `purchase_addon_${addon.id}`), eq(schema.trackingEvents.sentTo, "internal")))).length === 1, "add-on Purchase reported with its own event id");
  check((await status(o.id)).status === "paid", "add-on does not change the main order");

  await send("charge.refunded", { id: "ch_test", object: "charge", payment_intent: `pi_test_${o.id}`, refunded: true, amount_refunded: o.total });
  check((await status(o.id)).status === "refunded", "full refund marks order refunded");
}

{
  const o = await makeOrder("MB");
  await send("payment_intent.requires_action", pi(o.id, o.total, "requires_action", { payment_method_types: ["multibanco"], next_action: { type: "multibanco_display_details", multibanco_display_details: { entity: "12345", reference: "123456789", expires_at: Math.floor(Date.now() / 1000) + 86400 * 7, hosted_voucher_url: "https://example.com" } } }));
  check((await status(o.id)).status === "pending_payment", "Multibanco: stays pending after reference issued");
  const ev = await db.select().from(schema.orderEvents).where(and(eq(schema.orderEvents.orderId, o.id), eq(schema.orderEvents.type, "mb_reference_issued")));
  check(ev.length === 1, "Multibanco reference logged (stops cart recovery)");
  check((await purchases(o.id)) === 0, "no Purchase before Multibanco payment");
  await send("payment_intent.succeeded", pi(o.id, o.total, "succeeded", { payment_method_types: ["multibanco"] }));
  check((await status(o.id)).status === "paid", "Multibanco paid");
  check((await purchases(o.id)) === 1, "Purchase once after Multibanco payment");
}

{
  const o = await makeOrder("FAIL");
  await send("payment_intent.payment_failed", pi(o.id, o.total, "requires_payment_method", { last_payment_error: { code: "card_declined", payment_method: { type: "card" } } }));
  check((await status(o.id)).status === "pending_payment", "card decline keeps the order open for retry");
  await send("payment_intent.payment_failed", pi(o.id, o.total, "requires_payment_method", { last_payment_error: { code: "expired", payment_method: { type: "multibanco" } } }));
  check((await status(o.id)).status === "payment_failed", "Multibanco failure marks payment_failed");
}

await db.delete(schema.trackingEvents).where(inArray(schema.trackingEvents.orderId, ids));
await db.delete(schema.orderEvents).where(inArray(schema.orderEvents.orderId, ids));
await db.delete(schema.orderAddons).where(inArray(schema.orderAddons.orderId, ids));
await db.delete(schema.orders).where(inArray(schema.orders.id, ids));
console.log(failures ? `\n${failures} FAILED` : "\nall webhook checks passed");
await pg.end();
process.exit(failures ? 1 : 0);
