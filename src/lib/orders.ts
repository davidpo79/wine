import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Order, OrderStatus } from "@/db/schema";

export async function nextOrderId(year = new Date().getFullYear()): Promise<string> {
  const [r] = await db.execute<{ n: string }>(sql`select nextval('order_number_seq') as n`);
  return `WP-${year}-${String(r.n).padStart(4, "0")}`;
}

export async function getOrder(id: string) {
  const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, id)).limit(1);
  return o ?? null;
}


export async function logOrderEvent(orderId: string, type: string, payload?: Record<string, unknown>) {
  await db.insert(schema.orderEvents).values({ orderId, type, payload: payload ?? null });
}

/** Allowed manual/automatic transitions. Webhooks may move pending orders to paid/failed/cancelled; refunds can come from any paid state. */
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending_payment: ["paid", "payment_failed", "cancelled"],
  payment_failed: ["paid", "cancelled"],
  cancelled: ["paid"], // a late async success on an expired session still means money arrived
  paid: ["preparing", "shipped", "refunded", "cancelled"],
  preparing: ["shipped", "refunded", "cancelled"],
  shipped: ["delivered", "refunded"],
  delivered: ["refunded"],
  refunded: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus) {
  return TRANSITIONS[from].includes(to);
}

export async function setStatus(
  order: Order,
  to: OrderStatus,
  extra: Partial<typeof schema.orders.$inferInsert> = {},
  eventPayload?: Record<string, unknown>,
): Promise<Order | null> {
  if (order.status === to) return order;
  if (!canTransition(order.status, to)) {
    await logOrderEvent(order.id, "transition_rejected", { from: order.status, to, ...eventPayload });
    return null;
  }
  const now = new Date();
  const stamps: Partial<typeof schema.orders.$inferInsert> = {};
  if (to === "paid") stamps.paidAt = now;
  if (to === "shipped") stamps.shippedAt = now;
  if (to === "delivered") stamps.deliveredAt = now;
  const [updated] = await db
    .update(schema.orders)
    .set({ status: to, ...stamps, ...extra })
    // Compare-and-set on the previous status so concurrent webhooks cannot both win the same transition.
    .where(and(eq(schema.orders.id, order.id), eq(schema.orders.status, order.status)))
    .returning();
  if (!updated) return null;
  await logOrderEvent(order.id, `status:${to}`, { from: order.status, ...eventPayload });
  return updated;
}

/** Admin-facing (English) status labels. */
export const STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: "Pending payment",
  paid: "Paid",
  preparing: "Preparing",
  shipped: "Shipped",
  delivered: "Delivered",
  payment_failed: "Payment failed",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export function ctTrackingUrl(tracking: string) {
  return `https://www.ctt.pt/feapl_2/app/open/objectSearch/objectSearch.jspx?objects=${encodeURIComponent(tracking)}`;
}
