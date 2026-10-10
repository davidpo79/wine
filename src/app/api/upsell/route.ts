import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { getCatalog, paidBoxes } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { loadDraft } from "@/lib/draft";
import { getStripe } from "@/lib/stripe";
import { findOffer } from "@/lib/upsell";
import { markAddonPaid } from "@/lib/payments";
import { logOrderEvent } from "@/lib/orders";
import { SITE } from "@/lib/site";

// Post-purchase offer. Card/wallet buyers: one click, charged with the saved payment method (3-D Secure handled in the
// browser if the bank asks). MB WAY / Multibanco buyers: a short payment step for the add-on.
export async function POST(req: Request) {
  const parsed = z.object({ o: z.string().max(40), t: z.string().max(80), offer: z.string().max(60) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Pedido inválido." }, { status: 400 });
  const order = await loadDraft(parsed.data.o, parsed.data.t);
  if (!order || !["paid", "preparing"].includes(order.status)) return Response.json({ error: "Esta oferta já não está disponível." }, { status: 409 });
  const [catalog, settings] = await Promise.all([getCatalog(), getSettings()]);
  if (!settings.upsell_enabled || !catalog) return Response.json({ error: "Oferta indisponível." }, { status: 409 });
  const offer = findOffer(parsed.data.offer, order, catalog.bundles, settings);
  if (!offer) return Response.json({ error: "Oferta indisponível." }, { status: 404 });

  const existing = await db
    .select()
    .from(schema.orderAddons)
    .where(and(eq(schema.orderAddons.orderId, order.id), eq(schema.orderAddons.sku, offer.sku), inArray(schema.orderAddons.status, ["paid", "pending"])));
  if (existing.some((a) => a.status === "paid")) return Response.json({ status: "succeeded", already: true });
  if (offer.boxes && settings.stock_cap_boxes != null && (await paidBoxes()) + offer.boxes > settings.stock_cap_boxes) {
    return Response.json({ error: "Já não há stock para esta oferta." }, { status: 409 });
  }

  const [addon] = await db
    .insert(schema.orderAddons)
    .values({ orderId: order.id, kind: offer.kind, sku: offer.sku, label: offer.label, qty: 1, boxes: offer.boxes, amountCents: offer.priceCents })
    .returning();
  const metadata = { kind: "addon", addon_id: String(addon.id), order_id: order.id, sku: offer.sku };
  const stripe = getStripe();
  try {
    if (order.stripePaymentMethodId && order.stripeCustomerId) {
      const pi = await stripe.paymentIntents.create(
        {
          amount: offer.priceCents,
          currency: "eur",
          customer: order.stripeCustomerId,
          payment_method: order.stripePaymentMethodId,
          allowed_payment_method_types: ["card"],
          confirm: true,
          return_url: `${SITE.url}/oferta?o=${encodeURIComponent(order.id)}&t=${encodeURIComponent(parsed.data.t)}`,
          description: `Encomenda ${order.id} · ${offer.label}`,
          metadata,
        },
        { idempotencyKey: `addon_${addon.id}` },
      );
      await db.update(schema.orderAddons).set({ stripePaymentIntentId: pi.id }).where(eq(schema.orderAddons.id, addon.id));
      await logOrderEvent(order.id, "upsell_accepted", { addon_id: addon.id, offer: offer.key, status: pi.status });
      if (pi.status === "succeeded") await markAddonPaid({ ...addon, stripePaymentIntentId: pi.id }, pi);
      return Response.json({ status: pi.status, client_secret: pi.client_secret, addon_id: addon.id });
    }
    const pi = await stripe.paymentIntents.create(
      {
        amount: offer.priceCents,
        currency: "eur",
        customer: order.stripeCustomerId ?? undefined,
        allowed_payment_method_types: ["mb_way", "multibanco", "card"],
        description: `Encomenda ${order.id} · ${offer.label}`,
        metadata,
      },
      { idempotencyKey: `addon_${addon.id}` },
    );
    await db.update(schema.orderAddons).set({ stripePaymentIntentId: pi.id }).where(eq(schema.orderAddons.id, addon.id));
    await logOrderEvent(order.id, "upsell_accepted", { addon_id: addon.id, offer: offer.key, status: "needs_payment" });
    return Response.json({ status: "needs_payment", client_secret: pi.client_secret, addon_id: addon.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.update(schema.orderAddons).set({ status: "failed" }).where(eq(schema.orderAddons.id, addon.id));
    await logOrderEvent(order.id, "upsell_error", { addon_id: addon.id, message: msg.slice(0, 300) });
    return Response.json({ error: "Não foi possível adicionar. O seu cartão não foi cobrado." }, { status: 402 });
  }
}
