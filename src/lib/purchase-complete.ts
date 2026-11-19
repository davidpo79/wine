// When an order is complete and can be packed (David, 19/11/2026): a post-purchase offer can still add to it until the
// buyer reaches the thank-you page, so nothing ships before that. An order is complete once the thank-you page was
// shown ("purchase_complete" event), when no one-click offer is possible after paying, or 20 minutes after payment.
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Order } from "@/db/schema";
import { getSettings } from "./settings";
import { upsellMode } from "./payments";

export const OFFER_WINDOW_MS = 20 * 60_000;

export async function markPurchaseComplete(orderId: string) {
  const [seen] = await db.select({ id: schema.orderEvents.id }).from(schema.orderEvents).where(and(eq(schema.orderEvents.orderId, orderId), eq(schema.orderEvents.type, "purchase_complete"))).limit(1);
  if (!seen) await db.insert(schema.orderEvents).values({ orderId, type: "purchase_complete", payload: null });
}

export async function purchaseComplete(o: Order, now = Date.now()): Promise<boolean> {
  if (o.paidAt && now - o.paidAt.getTime() >= OFFER_WINDOW_MS) return true;
  const settings = await getSettings();
  if (!settings.upsell_enabled || !upsellMode(o)) return true;
  const [seen] = await db.select({ id: schema.orderEvents.id }).from(schema.orderEvents).where(and(eq(schema.orderEvents.orderId, o.id), eq(schema.orderEvents.type, "purchase_complete"))).limit(1);
  return !!seen;
}
