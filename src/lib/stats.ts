import { and, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";

export const PAID_STATUSES = ["paid", "preparing", "shipped", "delivered"] as const;

export type PeriodStats = { orders: number; revenueCents: number; aovCents: number; byBundle: Record<string, { orders: number; revenueCents: number }> };

export async function periodStats(since: Date | null): Promise<PeriodStats> {
  const where = since
    ? and(inArray(schema.orders.status, [...PAID_STATUSES]), gte(schema.orders.paidAt, since))
    : inArray(schema.orders.status, [...PAID_STATUSES]);
  const rows = await db
    .select({ key: schema.orders.bundleKey, n: sql<number>`count(*)::int`, rev: sql<number>`coalesce(sum(${schema.orders.totalCents}),0)::int` })
    .from(schema.orders)
    .where(where)
    .groupBy(schema.orders.bundleKey);
  const byBundle: PeriodStats["byBundle"] = {};
  let orders = 0;
  let revenueCents = 0;
  for (const r of rows) {
    byBundle[r.key] = { orders: r.n, revenueCents: r.rev };
    orders += r.n;
    revenueCents += r.rev;
  }
  return { orders, revenueCents, aovCents: orders ? Math.round(revenueCents / orders) : 0, byBundle };
}

/** Orders whose checkout completed but are still waiting for the Multibanco payment. */
export async function pendingMultibanco() {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int`, v: sql<number>`coalesce(sum(${schema.orders.totalCents}),0)::int` })
    .from(schema.orders)
    .where(and(eq(schema.orders.status, "pending_payment"), isNotNull(schema.orders.email)));
  return { count: r?.n ?? 0, valueCents: r?.v ?? 0 };
}

export const FUNNEL = ["PageView", "ViewContent", "SelectBundle", "AddToCart", "InitiateCheckout", "Purchase"] as const;

export async function funnel(since: Date | null) {
  const conds = [eq(schema.trackingEvents.sentTo, "internal")];
  if (since) conds.push(gte(schema.trackingEvents.createdAt, since));
  const rows = await db
    .select({ name: schema.trackingEvents.eventName, n: sql<number>`count(distinct ${schema.trackingEvents.eventId})::int` })
    .from(schema.trackingEvents)
    .where(and(...conds))
    .groupBy(schema.trackingEvents.eventName);
  const map = Object.fromEntries(rows.map((r) => [r.name, r.n]));
  return FUNNEL.map((name) => ({ name, count: (map[name] as number) ?? 0 }));
}

export async function trackingHealth(since: Date) {
  return db
    .select({ sentTo: schema.trackingEvents.sentTo, status: schema.trackingEvents.status, n: sql<number>`count(*)::int` })
    .from(schema.trackingEvents)
    .where(gte(schema.trackingEvents.createdAt, since))
    .groupBy(schema.trackingEvents.sentTo, schema.trackingEvents.status);
}
