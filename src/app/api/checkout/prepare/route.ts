import { cookies, headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { GIFT_CARD_SKU, loadDraft, publicAmounts, validateForPayment } from "@/lib/draft";
import { getCatalog } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { logOrderEvent } from "@/lib/orders";
import { orderAddons, stripeSavesCard } from "@/lib/payments";
import { isCountry, isLocale } from "@/lib/markets";
import { enabledCountries } from "@/lib/visitor";
import { getDict } from "@/lib/i18n";
import { boxesOffer, productOffers } from "@/lib/upsell";
import { CONSENT_COOKIE, logFunnel, parseConsent, sendCapi } from "@/lib/tracking";
import { clientIp } from "@/lib/request";
import { SITE } from "@/lib/site";
import { stripeConfigured } from "@/lib/stripe";

// Called when the customer clicks "Pagar": final validation, InitiateCheckout, and (once per order) the one-time offer.
export async function POST(req: Request) {
  const parsed = z
    .object({ o: z.string().max(40), t: z.string().max(80), method: z.enum(["mbway", "multibanco", "card", "wallet"]).optional(), check_only: z.boolean().optional() })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Pedido inválido." }, { status: 400 });
  const order = await loadDraft(parsed.data.o, parsed.data.t);
  if (!order || order.status !== "pending_payment") return Response.json({ error: "Esta encomenda já não está disponível." }, { status: 409 });
  const errors = validateForPayment(order, await enabledCountries(await getSettings()));
  const pendingAddons = await orderAddons(order.id, ["pending"]);
  if (pendingAddons.some((x) => x.sku === GIFT_CARD_SKU) && !(order.giftMessage ?? "").trim()) errors.giftMessage = getDict(isLocale(order.locale) ? order.locale : "pt").checkout.errors.giftMessage;
  if (Object.keys(errors).length) return Response.json({ errors }, { status: 422 });

  const a = order.shippingAddress ?? {};
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
      user: { email: order.email, phone: order.phone, firstName: first, lastName: rest.join(" "), city: a.city, zip: a.postal_code, country: order.country, ip: clientIp(h), userAgent: h.get("user-agent"), fbp: order.fbp, fbc: order.fbc },
      customData: { value: order.totalCents / 100, currency: "EUR", num_items: order.qtyBoxes, content_ids: ["trilogia-2160"], content_type: "product" },
    });
  }
  if (consent.marketing && !order.consentTracking) await db.update(schema.orders).set({ consentTracking: true }).where(eq(schema.orders.id, order.id));

  // One-time offer before payment only where no one-click offer is possible after it (Multibanco, ifthenpay card page).
  // Card via Stripe (saved card) and MB WAY (new push to the same phone) get the offer right after paying instead.
  let offer = null;
  let products: ReturnType<typeof productOffers> = [];
  const [settings, catalog] = await Promise.all([getSettings(), getCatalog()]);
  const m = parsed.data.method;
  const afterPayment = m === "mbway" || (m === "card" && stripeConfigured() && stripeSavesCard(isCountry(order.country) ? order.country : "PT"));
  if (settings.upsell_enabled && catalog && !afterPayment && !parsed.data.check_only) {
    const shown = await db
      .select({ id: schema.orderEvents.id })
      .from(schema.orderEvents)
      .where(and(eq(schema.orderEvents.orderId, order.id), eq(schema.orderEvents.type, "upsell_shown")))
      .limit(1);
    if (!shown.length) {
      offer = boxesOffer(order, catalog.bundles);
      products = productOffers(settings, order);
      if (offer || products.length) await logOrderEvent(order.id, "upsell_shown", { offer: offer?.priceCents ?? null, products: products.map((p) => p.key) });
    }
  }
  const addons = await orderAddons(order.id, ["pending"]);
  return Response.json({ ok: true, initiate_event_id: eventId, value: order.totalCents / 100, num_items: order.qtyBoxes, offer, products, amounts: publicAmounts(order, addons) });
}
