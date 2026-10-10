import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { GIFT_CARD_SKU } from "./draft";

export type CardRow = { orderId: string; status: string; message: string; name: string | null; city: string | null; paidAt: Date | null; printedAt: string | null };

/** Paid orders that bought the printed card, with the message and whether the card was already printed. */
export async function giftCardOrders(ids?: string[]): Promise<CardRow[]> {
  const addons = await db
    .select({ orderId: schema.orderAddons.orderId })
    .from(schema.orderAddons)
    .where(and(eq(schema.orderAddons.sku, GIFT_CARD_SKU), eq(schema.orderAddons.status, "paid"), ids?.length ? inArray(schema.orderAddons.orderId, ids) : undefined));
  const orderIds = [...new Set(addons.map((a) => a.orderId))];
  if (!orderIds.length) return [];
  const orders = await db.select().from(schema.orders).where(inArray(schema.orders.id, orderIds));
  const printed = await db
    .select({ orderId: schema.orderEvents.orderId, at: schema.orderEvents.createdAt })
    .from(schema.orderEvents)
    .where(and(inArray(schema.orderEvents.orderId, orderIds), eq(schema.orderEvents.type, "gift_card_printed")));
  return orders
    .filter((o) => !["refunded", "cancelled"].includes(o.status))
    .map((o) => ({
      orderId: o.id,
      status: o.status,
      message: o.giftMessage ?? "",
      name: o.shippingAddress?.name ?? o.customerName,
      city: o.shippingAddress?.city ?? null,
      paidAt: o.paidAt,
      printedAt: printed.find((p) => p.orderId === o.id)?.at.toISOString() ?? null,
    }))
    .sort((a, b) => (a.paidAt?.getTime() ?? 0) - (b.paidAt?.getTime() ?? 0));
}
