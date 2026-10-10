import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { getCatalog, paidBoxes } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { loadDraft } from "@/lib/draft";
import { findOffer } from "@/lib/upsell";
import { startAddonPayment, upsellMode } from "@/lib/payments";
import { logOrderEvent } from "@/lib/orders";
import { SITE } from "@/lib/site";

// One-time offer after payment. Card buyers: one click with the saved card (Stripe; 3-D Secure in the browser if the
// bank asks). MB WAY buyers: a new MB WAY request to the same phone, approved in the app.
export async function POST(req: Request) {
  const parsed = z.object({ o: z.string().max(40), t: z.string().max(80), offer: z.string().max(60) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Pedido inválido." }, { status: 400 });
  const order = await loadDraft(parsed.data.o, parsed.data.t);
  if (!order || !["paid", "preparing"].includes(order.status) || !upsellMode(order)) return Response.json({ error: "Esta oferta já não está disponível." }, { status: 409 });
  const [catalog, settings] = await Promise.all([getCatalog(), getSettings()]);
  if (!settings.upsell_enabled || !catalog) return Response.json({ error: "Oferta indisponível." }, { status: 409 });
  const offer = findOffer(parsed.data.offer, order, catalog.bundles, settings);
  if (!offer) return Response.json({ error: "Oferta indisponível." }, { status: 404 });
  const sku = offer.kind === "boxes" ? "trilogia-2160" : offer.sku;
  const existing = await db.select().from(schema.orderAddons).where(and(eq(schema.orderAddons.orderId, order.id), eq(schema.orderAddons.sku, sku), inArray(schema.orderAddons.status, ["paid"])));
  if (existing.length) return Response.json({ status: "succeeded", already: true });
  if (offer.boxes && settings.stock_cap_boxes != null && (await paidBoxes()) + offer.boxes > settings.stock_cap_boxes) {
    return Response.json({ error: "Já não há stock para esta oferta." }, { status: 409 });
  }
  // A previous unfinished attempt for the same item (e.g. MB WAY expired) is replaced.
  await db.update(schema.orderAddons).set({ status: "failed" }).where(and(eq(schema.orderAddons.orderId, order.id), eq(schema.orderAddons.sku, sku), eq(schema.orderAddons.status, "pending")));
  const [addon] = await db
    .insert(schema.orderAddons)
    .values({ orderId: order.id, kind: offer.kind, sku, label: offer.label, qty: 1, boxes: offer.boxes, amountCents: offer.priceCents })
    .returning();
  try {
    const r = await startAddonPayment(order, addon, `${SITE.url}/oferta?o=${encodeURIComponent(order.id)}&t=${encodeURIComponent(parsed.data.t)}&a=${addon.id}`);
    await logOrderEvent(order.id, "upsell_accepted", { addon_id: addon.id, offer: offer.key, via: r.kind, status: r.status });
    return Response.json({ ...r, addon_id: addon.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.update(schema.orderAddons).set({ status: "failed" }).where(eq(schema.orderAddons.id, addon.id));
    await logOrderEvent(order.id, "upsell_error", { addon_id: addon.id, message: msg.slice(0, 300) });
    return Response.json({ error: "Não foi possível adicionar. Não foi cobrado nenhum valor." }, { status: 402 });
  }
}
