import { cookies, headers } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { ensurePaymentIntent, loadDraft, validateForPayment } from "@/lib/draft";
import { getStripe } from "@/lib/stripe";
import { logOrderEvent } from "@/lib/orders";
import { CONSENT_COOKIE, logFunnel, parseConsent, sendCapi } from "@/lib/tracking";
import { clientIp } from "@/lib/request";
import { SITE } from "@/lib/site";

// Called right before stripe.confirmPayment: final validation + shipping/receipt on the PaymentIntent.
export async function POST(req: Request) {
  const parsed = z.object({ o: z.string().max(40), t: z.string().max(80) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Pedido inválido." }, { status: 400 });
  const order = await loadDraft(parsed.data.o, parsed.data.t);
  if (!order || order.status !== "pending_payment") return Response.json({ error: "Esta encomenda já não está disponível." }, { status: 409 });
  const errors = validateForPayment(order);
  if (Object.keys(errors).length) return Response.json({ errors }, { status: 422 });

  const withPi = await ensurePaymentIntent(order);
  if (!withPi.clientSecret || !withPi.stripePaymentIntentId) return Response.json({ error: withPi.paymentError ?? "Pagamento indisponível." }, { status: 502 });
  const a = order.shippingAddress ?? {};
  try {
    const stripe = getStripe();
    await stripe.paymentIntents.update(withPi.stripePaymentIntentId, {
      receipt_email: order.email!,
      shipping: { name: order.customerName!, phone: order.phone ?? undefined, address: { line1: a.line1!, line2: a.line2 ?? undefined, postal_code: a.postal_code!, city: a.city!, country: "PT" } },
      metadata: { kind: "order", order_id: order.id, bundle_key: order.bundleKey, promo_code: order.promoCode ?? "", is_gift: order.isGift ? "1" : "0" },
    });
    if (withPi.stripeCustomerId) await stripe.customers.update(withPi.stripeCustomerId, { email: order.email!, name: order.customerName!, phone: order.phone ?? undefined });
  } catch (e) {
    return Response.json({ error: "Não foi possível preparar o pagamento. Tente novamente." }, { status: 502 });
  }

  // InitiateCheckout (server side, deduplicated with the browser event via the same id).
  const eventId = `ic_${order.id}`;
  await logFunnel("InitiateCheckout", eventId, order.id);
  const jar = await cookies();
  const consent = parseConsent(jar.get(CONSENT_COOKIE)?.value);
  if (consent.marketing) {
    const h = await headers();
    const [first, ...rest] = (order.customerName ?? "").split(" ");
    await sendCapi({
      eventName: "InitiateCheckout",
      eventId,
      sourceUrl: `${SITE.url}/checkout`,
      orderId: order.id,
      user: { email: order.email, phone: order.phone, firstName: first, lastName: rest.join(" "), city: a.city, zip: a.postal_code, country: "PT", ip: clientIp(h), userAgent: h.get("user-agent"), fbp: order.fbp, fbc: order.fbc },
      customData: { value: order.totalCents / 100, currency: "EUR", num_items: order.qtyBoxes, content_ids: ["trilogia-2160"], content_type: "product" },
    });
  }
  await db.update(schema.orders).set({ consentTracking: consent.marketing || order.consentTracking }).where(eq(schema.orders.id, order.id));
  await logOrderEvent(order.id, "payment_started", { total_cents: order.totalCents });
  return Response.json({ ok: true, client_secret: withPi.clientSecret, initiate_event_id: eventId, value: order.totalCents / 100, num_items: order.qtyBoxes });
}
