import { and, eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db, schema } from "@/db";
import type { Order, OrderAddon } from "@/db/schema";
import { getStripe } from "./stripe";
import { logOrderEvent, setStatus } from "./orders";
import { sendAddonConfirmation, sendAdminAlert, sendConfirmation, sendPending } from "./email";
import { logFunnel, reportPurchase, sendCapi } from "./tracking";

const PAID = ["paid", "preparing", "shipped", "delivered"];

/** Payment method of a PaymentIntent: "card", "card:apple_pay", "mb_way", "multibanco"... */
export async function describePayment(pi: Stripe.PaymentIntent) {
  try {
    const full = await getStripe().paymentIntents.retrieve(pi.id, { expand: ["latest_charge"] });
    const ch = full.latest_charge as Stripe.Charge | null;
    const type = ch?.payment_method_details?.type ?? full.payment_method_types?.[0] ?? null;
    const wallet = ch?.payment_method_details?.card?.wallet?.type;
    const pmId = typeof full.payment_method === "string" ? full.payment_method : full.payment_method?.id ?? null;
    return { label: wallet ? `card:${wallet}` : type, isCard: type === "card", pmId };
  } catch {
    return { label: null, isCard: false, pmId: null };
  }
}

export async function markOrderPaid(order: Order, pi: Stripe.PaymentIntent, eventId: string) {
  if (PAID.includes(order.status)) {
    await reportPurchase(order); // duplicate signal: Purchase is still reported once
    return;
  }
  if (pi.amount_received && pi.amount_received !== order.totalCents) {
    await logOrderEvent(order.id, "amount_mismatch", { expected: order.totalCents, got: pi.amount_received });
  }
  const pm = await describePayment(pi);
  const from = order.status;
  if (from !== "pending_payment" && from !== "payment_failed" && from !== "cancelled") return;
  const paid = await setStatus(order, "paid", { paymentMethodType: pm.label, stripePaymentMethodId: pm.isCard ? pm.pmId : null, stripePaymentIntentId: pi.id }, { stripe_event: eventId, amount: pi.amount_received });
  if (!paid) return;
  await sendConfirmation(paid);
  await db.update(schema.orders).set({ ebookKeyIssuedAt: new Date() }).where(eq(schema.orders.id, paid.id));
  await reportPurchase(paid);
  await sendAdminAlert(paid);
}

export async function multibancoIssued(order: Order, pi: Stripe.PaymentIntent) {
  const d = pi.next_action?.multibanco_display_details;
  if (!d) return;
  const events = await db.select({ id: schema.orderEvents.id }).from(schema.orderEvents).where(and(eq(schema.orderEvents.orderId, order.id), eq(schema.orderEvents.type, "mb_reference_issued"))).limit(1);
  if (events.length) return;
  await logOrderEvent(order.id, "mb_reference_issued", { entity: d.entity, reference: d.reference, expires_at: d.expires_at });
  await sendPending(order, { entity: d.entity, reference: d.reference, expires_at: d.expires_at, hosted_voucher_url: d.hosted_voucher_url });
}

export async function markAddonPaid(addon: OrderAddon, pi: Stripe.PaymentIntent) {
  if (addon.status === "paid") return;
  const [updated] = await db
    .update(schema.orderAddons)
    .set({ status: "paid", paidAt: new Date() })
    .where(and(eq(schema.orderAddons.id, addon.id), eq(schema.orderAddons.status, addon.status)))
    .returning();
  if (!updated) return;
  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, addon.orderId)).limit(1);
  await logOrderEvent(addon.orderId, "upsell_paid", { addon_id: addon.id, label: addon.label, amount_cents: addon.amountCents, pi: pi.id });
  if (!order) return;
  await sendAddonConfirmation(order, updated).catch(() => {});
  await sendAdminAlert(order).catch(() => {});
  // Extra Purchase for the add-on value (own event id, so it is never deduplicated against the main one).
  const eventId = `purchase_addon_${addon.id}`;
  await logFunnel("Purchase", eventId, order.id);
  if (order.consentTracking) {
    const [first, ...rest] = (order.customerName ?? "").split(" ");
    await sendCapi({
      eventName: "Purchase",
      eventId,
      sourceUrl: `${process.env.SITE_URL ?? ""}/oferta`,
      orderId: order.id,
      user: { email: order.email, phone: order.phone, firstName: first, lastName: rest.join(" "), city: order.shippingAddress?.city, zip: order.shippingAddress?.postal_code, country: "PT", ip: order.clientIp, userAgent: order.userAgent, fbp: order.fbp, fbc: order.fbc },
      customData: { value: updated.amountCents / 100, currency: "EUR", content_ids: [updated.sku], content_type: "product", num_items: updated.qty, order_id: `${order.id}-A${updated.id}` },
    });
  }
}
