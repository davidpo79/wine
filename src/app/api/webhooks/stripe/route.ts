import { and, eq, isNotNull } from "drizzle-orm";
import type Stripe from "stripe";
import { db, schema } from "@/db";
import { getStripe } from "@/lib/stripe";
import { getOrder, logOrderEvent, setStatus } from "@/lib/orders";
import { markAddonPaid, markOrderPaid, multibancoIssued } from "@/lib/payments";

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
    case "payment_intent.succeeded":
    case "payment_intent.requires_action":
    case "payment_intent.processing":
    case "payment_intent.payment_failed":
    case "payment_intent.canceled": {
      const pi = event.data.object;
      if (pi.metadata?.kind === "addon") return handleAddon(event.type, pi);
      const order = pi.metadata?.order_id ? await getOrder(pi.metadata.order_id) : null;
      if (!order) return;
      if (event.type === "payment_intent.succeeded") return markOrderPaid(order, pi, event.id);
      if (event.type === "payment_intent.requires_action") return multibancoIssued(order, pi);
      if (event.type === "payment_intent.processing") return logOrderEvent(order.id, "payment_processing", { method: pi.payment_method_types });
      if (event.type === "payment_intent.payment_failed") {
        // Card declines can be retried on the same page: just log. Async methods (MB WAY/Multibanco) failing ends the attempt.
        await logOrderEvent(order.id, "payment_failed", { code: pi.last_payment_error?.code, type: pi.last_payment_error?.payment_method?.type });
        const t = pi.last_payment_error?.payment_method?.type;
        if (t === "multibanco" || t === "mb_way") await setStatus(order, "payment_failed", {}, { stripe_event: event.id });
        return;
      }
      if (event.type === "payment_intent.canceled" && order.status === "pending_payment") await setStatus(order, "cancelled", {}, { stripe_event: event.id, reason: "payment_intent_canceled" });
      return;
    }
    case "charge.refunded": {
      const ch = event.data.object;
      const pi = typeof ch.payment_intent === "string" ? ch.payment_intent : ch.payment_intent?.id;
      if (!pi) return;
      const [addon] = await db.select().from(schema.orderAddons).where(eq(schema.orderAddons.stripePaymentIntentId, pi)).limit(1);
      if (addon) {
        await logOrderEvent(addon.orderId, "upsell_refunded", { addon_id: addon.id, amount_refunded: ch.amount_refunded });
        return;
      }
      const [order] = await db.select().from(schema.orders).where(eq(schema.orders.stripePaymentIntentId, pi)).limit(1);
      if (!order) return;
      if (ch.refunded) await setStatus(order, "refunded", {}, { stripe_event: event.id, amount_refunded: ch.amount_refunded });
      else await logOrderEvent(order.id, "partial_refund", { stripe_event: event.id, amount_refunded: ch.amount_refunded });
      return;
    }
    default:
      return;
  }
}

async function handleAddon(type: string, pi: Stripe.PaymentIntent) {
  const [addon] = await db.select().from(schema.orderAddons).where(eq(schema.orderAddons.stripePaymentIntentId, pi.id)).limit(1);
  if (!addon) return;
  if (type === "payment_intent.succeeded") return markAddonPaid(addon, pi);
  if (type === "payment_intent.payment_failed" || type === "payment_intent.canceled") {
    await db.update(schema.orderAddons).set({ status: "failed" }).where(eq(schema.orderAddons.id, addon.id));
    await logOrderEvent(addon.orderId, "upsell_failed", { addon_id: addon.id });
  }
}
