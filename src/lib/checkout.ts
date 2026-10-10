import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { db, schema } from "@/db";
import type { Utm } from "@/db/schema";
import { canBuy, getCatalog, paidBoxes, salesState } from "./catalog";
import { getSettings } from "./settings";
import { getStripe } from "./stripe";
import { logOrderEvent, nextOrderId } from "./orders";
import { logFunnel, sendCapi, type Consent } from "./tracking";
import { SITE } from "./site";
import { normalizeCode, promoDiscountCents, promoShippingCents } from "./promo";
import { scheduleRecovery } from "./recovery";

const PAYMENT_METHODS = (process.env.STRIPE_PAYMENT_METHODS ?? "card,mb_way,multibanco")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean) as Stripe.Checkout.SessionCreateParams.AllowedPaymentMethodType[];

function clean(s: string) {
  // Strip control characters; Stripe metadata values are limited to 500 chars.
  return s.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 200);
}

export type CheckoutInput = {
  bundle_key: string;
  is_gift: boolean;
  gift_message: string;
  event_id?: string;
  promo?: string;
  customer: { name: string; email: string; phone: string } | null;
  consent_messages: boolean;
  consent_calls: boolean;
  source: "site" | "recovery";
};

export type CheckoutCtx = {
  consent: Consent;
  utm: Utm | null;
  fbp: string | null;
  fbc: string | null;
  gaClientId: string | null;
  ip: string | null;
  ua: string | null;
  referer: string | null;
};

export type CheckoutResult =
  | { ok: true; url: string; order_id: string; initiate_event_id: string; value: number; num_items: number }
  | { ok: false; status: number; error: string };

/** Creates the order row (pending_payment) and a Stripe Checkout Session. Prices always come from the DB. */
export async function createCheckout(input: CheckoutInput, ctx: CheckoutCtx): Promise<CheckoutResult> {
  const { consent, utm, fbp, fbc, gaClientId, ip, ua } = ctx;
  const [catalog, settings, sold] = await Promise.all([getCatalog(), getSettings(), paidBoxes()]);
  const state = salesState(settings, sold);
  if (!catalog || !canBuy(state)) {
    return { ok: false, status: 409, error: "As encomendas estão fechadas de momento." };
  }
  // Price is always read from the DB; the client only sends a key.
  const bundle = catalog.bundles.find((b) => b.key === input.bundle_key && b.active);
  if (!bundle) return { ok: false, status: 404, error: "Opção indisponível." };
  if (settings.stock_cap_boxes != null && sold + bundle.qty > settings.stock_cap_boxes) {
    return { ok: false, status: 409, error: "Não há stock suficiente para esta opção." };
  }

  const giftMessage = input.is_gift ? clean(input.gift_message) : "";

  const orderId = await nextOrderId();
  const eventId = input.event_id ?? `ic_${orderId}`;
  const initiateEventId = `ic_${orderId}`;
  // Promo code (exit popup): validated and computed on the server only.
  const promoCfg = { code: settings.lead_code, percent: settings.lead_discount_percent, maxQty: settings.lead_code_max_qty, plusCode: settings.lead_plus_code };
  const discount = promoDiscountCents(bundle, promoCfg, input.promo);
  const shipping = promoShippingCents(bundle, promoCfg, input.promo);
  const promoCode = discount > 0 || shipping !== bundle.shippingCents ? normalizeCode(input.promo) : null;
  const subtotal = bundle.priceCents - discount;
  const total = subtotal + shipping;
  const bottles = bundle.qty * 3;

  await db.insert(schema.orders).values({
    id: orderId,
    status: "pending_payment",
    bundleId: bundle.id,
    bundleKey: bundle.key,
    qtyBoxes: bundle.qty,
    subtotalCents: subtotal,
    discountCents: discount,
    promoCode,
    shippingCents: shipping,
    totalCents: total,
    currency: "eur",
    isGift: input.is_gift,
    giftMessage: giftMessage || null,
    consentTracking: consent.marketing,
    utm,
    fbp,
    fbc,
    eventId,
    clientIp: consent.marketing ? ip : null,
    userAgent: consent.marketing ? ua : null,
    gaClientId,
    customerName: input.customer?.name ?? null,
    email: input.customer?.email ?? null,
    phone: input.customer?.phone ?? null,
    consentMessages: input.consent_messages,
    consentCalls: input.consent_calls,
    consentMarketing: input.consent_messages,
    source: input.source,
  });

  const site = SITE.url;
  const imagePath = catalog.product.images[0];
  const imageUrl = imagePath && /^https:/.test(site) ? `${site}${imagePath.startsWith("/") ? imagePath : `/media/${imagePath.replace(/^public\//, "")}`}` : undefined;
  const metadata: Record<string, string> = {
    order_id: orderId,
    bundle_key: bundle.key,
    event_id: eventId,
    fbp: fbp ?? "",
    fbc: fbc ?? "",
    gift_message: giftMessage,
    is_gift: input.is_gift ? "1" : "0",
    consent_tracking: consent.marketing ? "1" : "0",
    promo_code: promoCode ?? "",
    ...Object.fromEntries(Object.entries(utm ?? {}).map(([k, v]) => [k, String(v).slice(0, 100)])),
  };

  let session: Stripe.Checkout.Session;
  try {
    session = await getStripe().checkout.sessions.create(
      {
        mode: "payment",
        currency: "eur",
        locale: "pt",
        customer_email: input.customer?.email,
        client_reference_id: orderId,
        allowed_payment_method_types: PAYMENT_METHODS,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "eur",
              unit_amount: subtotal,
              product_data: {
                name: `Trilogia 2160 · ${bundle.label}${promoCode ? ` · código ${promoCode} (−${(discount / 100).toFixed(2).replace(".", ",")} €)` : ""}`,
                description: `${bundle.qty} ${bundle.qty === 1 ? "caixa de oferta" : "caixas de oferta"} com Rosé 2024, Branco 2025 e Tinto 2023, Douro DOC (${bottles} garrafas). Inclui o livro de receitas Sabores de Portugal.`,
                images: imageUrl ? [imageUrl] : undefined,
              },
            },
          },
        ],
        shipping_options: [
          {
            shipping_rate_data: {
              type: "fixed_amount",
              display_name: shipping ? "Envio CTT · Portugal Continental" : "Envio CTT grátis · Portugal Continental",
              fixed_amount: { amount: shipping, currency: "eur" },
              delivery_estimate: { minimum: { unit: "business_day", value: 2 }, maximum: { unit: "business_day", value: 4 } },
            },
          },
        ],
        shipping_address_collection: { allowed_countries: ["PT"] },
        phone_number_collection: { enabled: true },
        billing_address_collection: "auto",
        custom_fields: [
          {
            key: "nif",
            label: { type: "custom", custom: "NIF para fatura (opcional)" },
            type: "numeric",
            numeric: { minimum_length: 9, maximum_length: 9 },
            optional: true,
          },
        ],
        custom_text: {
          shipping_address: { message: "Entregamos apenas em Portugal Continental. Para oferecer, indique a morada de quem recebe." },
          submit: { message: "Ao encomendar confirma que tem 18 anos ou mais." },
        },
        metadata,
        payment_intent_data: { metadata, description: `Encomenda ${orderId}` },
        success_url: `${site}/obrigado?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${site}/?cancelado=1`,
        expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 2,
      },
      { idempotencyKey: `checkout_${orderId}` },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logOrderEvent(orderId, "checkout_error", { message: msg });
    await db.update(schema.orders).set({ status: "cancelled" }).where(eq(schema.orders.id, orderId));
    console.error("[checkout] stripe error", msg);
    return { ok: false, status: 502, error: "Não foi possível iniciar o pagamento. Tente novamente ou contacte-nos por WhatsApp." };
  }

  await db.update(schema.orders).set({ stripeSessionId: session.id }).where(eq(schema.orders.id, orderId));
  await logOrderEvent(orderId, "checkout_created", { session_id: session.id, bundle_key: bundle.key, total_cents: total, promo_code: promoCode, discount_cents: discount });

  // InitiateCheckout: server side, deduplicated with the browser event via the same event_id.
  await logFunnel("InitiateCheckout", initiateEventId, orderId);
  if (consent.marketing) {
    await sendCapi({
      eventName: "InitiateCheckout",
      eventId: initiateEventId,
      sourceUrl: ctx.referer ?? site,
      orderId,
      user: { ip, userAgent: ua, fbp, fbc },
      customData: { value: total / 100, currency: "EUR", num_items: bundle.qty, content_ids: ["trilogia-2160"], content_type: "product" },
    });
  }

  // Abandoned-checkout follow-ups (only with the matching consents; cancelled automatically on payment).
  if (input.source === "site" && input.customer && settings.recovery_enabled) {
    await scheduleRecovery(orderId, input.customer.email).catch((e) => console.error("[recovery] schedule", e));
  }

  return { ok: true, url: session.url!, order_id: orderId, initiate_event_id: initiateEventId, value: total / 100, num_items: bundle.qty };
}
