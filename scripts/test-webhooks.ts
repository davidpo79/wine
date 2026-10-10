// Webhook integration test against a running server (local or staging).
// Sends signed Stripe events and checks order state transitions, idempotency and that Purchase is reported once.
// Usage: STRIPE_WEBHOOK_SECRET=whsec_... tsx scripts/test-webhooks.ts [baseUrl]
import "./load-env";
import Stripe from "stripe";
import { eq, and } from "drizzle-orm";
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

async function makeOrder(suffix: string) {
  const [b] = await db.select().from(schema.bundles).where(eq(schema.bundles.key, "x2"));
  const id = `WP-TEST-${suffix}-${Date.now() % 100000}`;
  await db.insert(schema.orders).values({ id, bundleId: b.id, bundleKey: b.key, qtyBoxes: b.qty, subtotalCents: b.priceCents, shippingCents: b.shippingCents, totalCents: b.priceCents + b.shippingCents, stripeSessionId: `cs_test_${id}`, consentTracking: true });
  return { id, total: b.priceCents + b.shippingCents };
}

function session(orderId: string, total: number, payment_status: "paid" | "unpaid") {
  return {
    id: `cs_test_${orderId}`, object: "checkout.session", payment_status, status: "complete", amount_total: total, client_reference_id: orderId,
    metadata: { order_id: orderId }, payment_intent: `pi_test_${orderId}`,
    customer_details: { email: "teste@example.com", name: "Maria Teste", phone: "+351912345678", address: { line1: "Rua A 1", postal_code: "1000-001", city: "Lisboa", country: "PT" } },
    collected_information: { shipping_details: { name: "Maria Teste", address: { line1: "Rua A 1", line2: null, postal_code: "1000-001", city: "Lisboa", state: null, country: "PT" } } },
    custom_fields: [{ key: "nif", type: "numeric", numeric: { value: "123456789" } }],
  };
}

const status = async (id: string) => (await db.select().from(schema.orders).where(eq(schema.orders.id, id)))[0];
const purchases = async (id: string) =>
  (await db.select().from(schema.trackingEvents).where(and(eq(schema.trackingEvents.orderId, id), eq(schema.trackingEvents.eventName, "Purchase"), eq(schema.trackingEvents.sentTo, "internal")))).length;

// 1. Card: paid immediately
{
  const o = await makeOrder("CARD");
  const bad = await fetch(`${base}/api/webhooks/stripe`, { method: "POST", headers: { "stripe-signature": "t=1,v1=bad" }, body: "{}" });
  check(bad.status === 400, "invalid signature rejected");
  const e = await send("checkout.session.completed", session(o.id, o.total, "paid"));
  check(e.status === 200, "completed(paid) accepted");
  const s = await status(o.id);
  check(s.status === "paid", `card order is paid (got ${s.status})`);
  check(s.nif === "123456789" && s.email === "teste@example.com" && s.shippingAddress?.city === "Lisboa", "customer, NIF and address saved");
  check((await purchases(o.id)) === 1, "Purchase reported once");
  const dup = await send("checkout.session.completed", session(o.id, o.total, "paid"), e.id);
  check(dup.status === 200, "duplicate event id acknowledged");
  await send("checkout.session.completed", session(o.id, o.total, "paid")); // same content, new event id
  check((await purchases(o.id)) === 1, "Purchase still reported once after duplicate signals");
  await send("charge.refunded", { id: "ch_test", object: "charge", payment_intent: `pi_test_${o.id}`, refunded: true, amount_refunded: o.total });
  check((await status(o.id)).status === "refunded", "full refund marks order refunded");
}

// 2. Multibanco: pending until async success
{
  const o = await makeOrder("MB");
  await send("checkout.session.completed", session(o.id, o.total, "unpaid"));
  check((await status(o.id)).status === "pending_payment", "Multibanco order stays pending after completed(unpaid)");
  check((await purchases(o.id)) === 0, "no Purchase before Multibanco payment");
  await send("checkout.session.async_payment_succeeded", session(o.id, o.total, "paid"));
  check((await status(o.id)).status === "paid", "async_payment_succeeded marks paid");
  check((await purchases(o.id)) === 1, "Purchase reported once after Multibanco payment");
}

// 3. Multibanco failure and expiry
{
  const o = await makeOrder("MBFAIL");
  await send("checkout.session.completed", session(o.id, o.total, "unpaid"));
  await send("checkout.session.async_payment_failed", session(o.id, o.total, "unpaid"));
  check((await status(o.id)).status === "payment_failed", "async_payment_failed marks payment_failed");
  check((await purchases(o.id)) === 0, "no Purchase on failed payment");
  const o2 = await makeOrder("EXP");
  await send("checkout.session.expired", { ...session(o2.id, o2.total, "unpaid"), status: "expired" });
  check((await status(o2.id)).status === "cancelled", "expired session cancels pending order");
}

// cleanup test rows
for (const t of [schema.trackingEvents, schema.orderEvents]) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.execute(`delete from ${t === schema.trackingEvents ? "tracking_events" : "order_events"} where order_id like 'WP-TEST-%'` as any);
}
await db.execute("delete from orders where id like 'WP-TEST-%'" as never);
console.log(failures ? `\n${failures} FAILED` : "\nall webhook checks passed");
await pg.end();
process.exit(failures ? 1 : 0);
