import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { loadDraft, publicAmounts } from "@/lib/draft";
import { getCatalog, paidBoxes } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { logOrderEvent } from "@/lib/orders";
import { orderAddons } from "@/lib/payments";
import { findOffer } from "@/lib/upsell";

// Sets the one-time-offer items in the cart (before payment). Prices always come from the server.
export async function POST(req: Request) {
  const parsed = z
    .object({ o: z.string().max(40), t: z.string().max(80), keys: z.array(z.string().max(60)).max(6) })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Pedido inválido." }, { status: 400 });
  const order = await loadDraft(parsed.data.o, parsed.data.t);
  if (!order || order.status !== "pending_payment") return Response.json({ error: "Esta encomenda já não está disponível." }, { status: 409 });
  const [catalog, settings] = await Promise.all([getCatalog(), getSettings()]);
  if (!catalog) return Response.json({ error: "Indisponível." }, { status: 409 });

  const wanted = [...new Set(parsed.data.keys)].map((k) => findOffer(k, order, catalog.bundles, settings)).filter((x) => x !== null);
  const extraBoxes = wanted.reduce((n, w) => n + w.boxes, 0);
  if (extraBoxes && settings.stock_cap_boxes != null && (await paidBoxes()) + order.qtyBoxes + extraBoxes > settings.stock_cap_boxes) {
    return Response.json({ error: "Já não há stock para juntar mais uma caixa." }, { status: 409 });
  }
  await db.delete(schema.orderAddons).where(and(eq(schema.orderAddons.orderId, order.id), eq(schema.orderAddons.status, "pending")));
  if (wanted.length) {
    await db.insert(schema.orderAddons).values(
      wanted.map((w) => ({ orderId: order.id, kind: w.kind, sku: w.kind === "boxes" ? "trilogia-2160" : w.sku, label: w.label, qty: 1, boxes: w.boxes, amountCents: w.priceCents })),
    );
  }
  await logOrderEvent(order.id, wanted.length ? "upsell_accepted" : "upsell_declined", { keys: wanted.map((w) => w.key) });
  return Response.json({ amounts: publicAmounts(order, await orderAddons(order.id, ["pending"])) });
}
