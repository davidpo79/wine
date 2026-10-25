import { and, eq, isNotNull } from "drizzle-orm";
import type Stripe from "stripe";
import { db, schema } from "@/db";
import { getStripe } from "@/lib/stripe";
import { applyStripePi } from "@/lib/payments";
import { logOrderEvent, setStatus } from "@/lib/orders";

export const dynamic = "force-dynamic";

// Stripe (cards, Apple Pay, Google Pay, one-click add-ons). MB WAY / Multibanco come from ifthenpay's callback.
export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  // Trimmed: a space or line break pasted into the Railway variable would fail every signature.
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!sig || !secret) return new Response("missing signature", { status: 400 });
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, sig, secret);
  } catch (e) {
    // Never the secret itself: only its shape and Stripe's reason, to tell a wrong secret from a clock or body issue.
    console.error("[stripe webhook] signature check failed", { reason: (e instanceof Error ? e.message : String(e)).slice(0, 160), secretPrefix: secret.slice(0, 6), secretLength: secret.length });
    return new Response("invalid signature", { status: 400 });
  }
  await db.insert(schema.webhookLog).values({ source: "stripe", eventId: event.id, type: event.type, payload: event as unknown as Record<string, unknown> }).onConflictDoNothing();
  const [done] = await db.select({ id: schema.webhookLog.id }).from(schema.webhookLog).where(and(eq(schema.webhookLog.eventId, event.id), isNotNull(schema.webhookLog.processedAt))).limit(1);
  if (done) return Response.json({ received: true, duplicate: true });
  try {
    if (event.type === "payment_intent.succeeded" || event.type === "payment_intent.payment_failed" || event.type === "payment_intent.canceled") {
      await applyStripePi(event.data.object, `stripe:${event.id}`);
    } else if (event.type === "charge.refunded") {
      const ch = event.data.object;
      const pi = typeof ch.payment_intent === "string" ? ch.payment_intent : ch.payment_intent?.id;
      const [p] = pi ? await db.select().from(schema.payments).where(and(eq(schema.payments.provider, "stripe"), eq(schema.payments.requestId, pi))).limit(1) : [];
      if (p) {
        await db.update(schema.payments).set({ refundedCents: ch.amount_refunded, status: ch.refunded ? "refunded" : p.status }).where(eq(schema.payments.id, p.id));
        if (p.addonId) await logOrderEvent(p.orderId, "upsell_refunded", { addon_id: p.addonId, amount_refunded: ch.amount_refunded });
        else {
          const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, p.orderId)).limit(1);
          if (order && ch.refunded) await setStatus(order, "refunded", {}, { stripe_event: event.id, amount_refunded: ch.amount_refunded });
          else if (order) await logOrderEvent(order.id, "partial_refund", { stripe_event: event.id, amount_refunded: ch.amount_refunded });
        }
      }
    }
  } catch (e) {
    console.error("[webhook] stripe", event.type, event.id, e);
    return new Response("handler error", { status: 500 });
  }
  await db.update(schema.webhookLog).set({ processedAt: new Date() }).where(eq(schema.webhookLog.eventId, event.id));
  return Response.json({ received: true });
}
