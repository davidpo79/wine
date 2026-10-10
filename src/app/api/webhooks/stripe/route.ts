import { and, eq, isNotNull } from "drizzle-orm";
import type Stripe from "stripe";
import { db, schema } from "@/db";
import type { Order } from "@/db/schema";
import { getStripe, multibancoDetails } from "@/lib/stripe";
import { getOrder, getOrderBySession, logOrderEvent, setStatus } from "@/lib/orders";
import { sendAdminAlert, sendConfirmation, sendPending } from "@/lib/email";
import { reportPurchase } from "@/lib/tracking";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) return new Response("missing signature", { status: 400 });
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, sig, secret);
  } catch {
    return new Response("invalid signature", { status: 400 });
  }

  // Idempotency: one row per Stripe event id. A row without processed_at means a previous attempt failed, so retry.
  await db
    .insert(schema.webhookLog)
    .values({ source: "stripe", eventId: event.id, type: event.type, payload: event as unknown as Record<string, unknown> })
    .onConflictDoNothing();
  const [done] = await db
    .select({ id: schema.webhookLog.id })
    .from(schema.webhookLog)
    .where(and(eq(schema.webhookLog.eventId, event.id), isNotNull(schema.webhookLog.processedAt)))
    .limit(1);
  if (done) return Response.json({ received: true, duplicate: true });

  try {
    await handle(event);
  } catch (e) {
    console.error("[webhook] handler error", event.type, event.id, e);
    return new Response("handler error", { status: 500 }); // Stripe retries
  }
  await db.update(schema.webhookLog).set({ processedAt: new Date() }).where(eq(schema.webhookLog.eventId, event.id));
  return Response.json({ received: true });
}

async function handle(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object;
      const order = await findOrder(s);
      if (!order) return;
      const withCustomer = await saveCustomer(order, s);
      await logOrderEvent(order.id, "stripe:checkout.session.completed", { event_id: event.id, payment_status: s.payment_status });
      if (s.payment_status === "paid" || s.payment_status === "no_payment_required") {
        await markPaid(withCustomer, s, event.id);
      } else {
        // Async method (Multibanco): stays pending until async_payment_succeeded.
        const mb = await multibancoDetails(s);
        await sendPending(withCustomer, mb);
      }
      return;
    }
    case "checkout.session.async_payment_succeeded": {
      const s = event.data.object;
      const order = await findOrder(s);
      if (!order) return;
      const withCustomer = await saveCustomer(order, s);
      await markPaid(withCustomer, s, event.id);
      return;
    }
    case "checkout.session.async_payment_failed": {
      const s = event.data.object;
      const order = await findOrder(s);
      if (order) await setStatus(order, "payment_failed", {}, { stripe_event: event.id });
      return;
    }
    case "checkout.session.expired": {
      const s = event.data.object;
      const order = await findOrder(s);
      if (order && order.status === "pending_payment") await setStatus(order, "cancelled", {}, { stripe_event: event.id, reason: "session_expired" });
      return;
    }
    case "charge.refunded": {
      const ch = event.data.object;
      const pi = typeof ch.payment_intent === "string" ? ch.payment_intent : ch.payment_intent?.id;
      if (!pi) return;
      const [order] = await db.select().from(schema.orders).where(eq(schema.orders.stripePaymentIntentId, pi)).limit(1);
      if (!order) return;
      if (ch.refunded) {
        await setStatus(order, "refunded", {}, { stripe_event: event.id, amount_refunded: ch.amount_refunded });
      } else {
        await logOrderEvent(order.id, "partial_refund", { stripe_event: event.id, amount_refunded: ch.amount_refunded });
      }
      return;
    }
    default:
      return;
  }
}

async function findOrder(s: Stripe.Checkout.Session): Promise<Order | null> {
  const id = s.metadata?.order_id || s.client_reference_id;
  const o = (id ? await getOrder(id) : null) ?? (await getOrderBySession(s.id));
  if (!o) console.warn("[webhook] order not found for session", s.id);
  return o;
}

async function saveCustomer(order: Order, s: Stripe.Checkout.Session): Promise<Order> {
  const cd = s.customer_details;
  const ship = s.collected_information?.shipping_details;
  const nif = s.custom_fields?.find((f) => f.key === "nif")?.numeric?.value ?? null;
  const news = s.custom_fields?.find((f) => f.key === "news")?.dropdown?.value === "sim";
  const pi = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id ?? null;
  const [updated] = await db
    .update(schema.orders)
    .set({
      customerName: ship?.name ?? cd?.name ?? order.customerName,
      email: cd?.email ?? order.email,
      phone: cd?.phone ?? order.phone,
      shippingAddress: ship ? { name: ship.name, ...ship.address } : order.shippingAddress,
      billingAddress: cd?.address ? { ...cd.address } : order.billingAddress,
      nif: nif ?? order.nif,
      consentMarketing: news || order.consentMarketing,
      stripeSessionId: s.id,
      stripePaymentIntentId: pi ?? order.stripePaymentIntentId,
    })
    .where(eq(schema.orders.id, order.id))
    .returning();
  return updated;
}

async function paymentMethodType(s: Stripe.Checkout.Session): Promise<string | null> {
  const piId = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id;
  if (!piId) return null;
  try {
    const pi = await getStripe().paymentIntents.retrieve(piId, { expand: ["latest_charge"] });
    const ch = pi.latest_charge as Stripe.Charge | null;
    const t = ch?.payment_method_details?.type ?? null;
    const wallet = ch?.payment_method_details?.card?.wallet?.type;
    return wallet ? `card:${wallet}` : t;
  } catch {
    return null;
  }
}

async function markPaid(order: Order, s: Stripe.Checkout.Session, eventId: string) {
  if (["paid", "preparing", "shipped", "delivered"].includes(order.status)) {
    // Already paid (duplicate signal from completed + async_succeeded): make sure Purchase was reported once.
    await reportPurchase(order);
    return;
  }
  const pmt = await paymentMethodType(s);
  const amount = s.amount_total ?? order.totalCents;
  if (amount !== order.totalCents) {
    await logOrderEvent(order.id, "amount_mismatch", { expected: order.totalCents, got: amount });
  }
  const paid = await setStatus(order, "paid", { paymentMethodType: pmt }, { stripe_event: eventId, amount_total: amount });
  if (!paid) return;
  await sendConfirmation(paid);
  await db.update(schema.orders).set({ ebookKeyIssuedAt: new Date() }).where(eq(schema.orders.id, paid.id));
  await reportPurchase(paid);
  await sendAdminAlert(paid);
}
