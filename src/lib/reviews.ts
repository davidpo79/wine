// Verified reviews: an invitation email goes out a few days after delivery, with a signed link to the review form.
// Only that order's customer can write (one review per order); nothing is published before an admin approves it.
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, desc, eq, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Order } from "@/db/schema";

export const REVIEW_DELAY_AFTER_DELIVERY_DAYS = 2;
export const REVIEW_DELAY_AFTER_SHIPPING_DAYS = 6; // when nobody marks the order as delivered

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET must be set");
  return s;
}

export function reviewToken(orderId: string) {
  return createHmac("sha256", secret()).update(`review:${orderId}`).digest("base64url").slice(0, 32);
}

export function validReviewToken(orderId: string, token: string) {
  const a = Buffer.from(reviewToken(orderId));
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function reviewUrl(o: Pick<Order, "id">, rating?: number) {
  const base = process.env.SITE_URL ?? "";
  return `${base}/avaliar?o=${encodeURIComponent(o.id)}&t=${reviewToken(o.id)}${rating ? `&r=${rating}` : ""}`;
}

/** "Maria Santos" -> "Maria S." */
export function defaultDisplayName(customerName: string | null | undefined) {
  const parts = (customerName ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0];
}

export const canReview = (o: Pick<Order, "status">) => o.status === "delivered" || o.status === "shipped";

export async function reviewOfOrder(orderId: string) {
  const [r] = await db.select().from(schema.reviews).where(eq(schema.reviews.orderId, orderId));
  return r ?? null;
}

/** Creates or updates the order's review while it is not published. Returns null when it is already approved. */
export async function saveReview(o: Order, v: { rating: number; title: string; text: string; displayName: string }) {
  const existing = await reviewOfOrder(o.id);
  if (existing?.status === "approved") return null;
  const values = {
    rating: v.rating,
    title: v.title || null,
    text: v.text || null,
    displayName: v.displayName,
    country: o.country,
    locale: o.locale,
    consentPublish: true,
    status: "pending",
    updatedAt: new Date(),
  };
  if (existing) {
    await db.update(schema.reviews).set(values).where(eq(schema.reviews.id, existing.id));
  } else {
    await db.insert(schema.reviews).values({ orderId: o.id, ...values }).onConflictDoNothing();
  }
  return true;
}

/** Orders due for the invitation: delivered N days ago, or shipped N days ago and never marked as delivered. */
export async function dueForReviewRequest(now = new Date(), limit = 20) {
  const day = 86_400_000;
  const delivered = new Date(now.getTime() - REVIEW_DELAY_AFTER_DELIVERY_DAYS * day);
  const shipped = new Date(now.getTime() - REVIEW_DELAY_AFTER_SHIPPING_DAYS * day);
  return db
    .select()
    .from(schema.orders)
    .where(
      and(
        isNull(schema.orders.reviewRequestedAt),
        isNotNull(schema.orders.email),
        or(
          and(eq(schema.orders.status, "delivered"), lte(schema.orders.deliveredAt, delivered)),
          and(eq(schema.orders.status, "shipped"), lte(schema.orders.shippedAt, shipped)),
        ),
      ),
    )
    .limit(limit);
}

/** Sends due invitations (once per order). Runs in the background worker. */
export async function processReviewRequests(send: (o: Order) => Promise<unknown>) {
  const settings = await import("./settings").then((m) => m.getSettings());
  if (settings.reviews_enabled === false) return 0;
  let n = 0;
  for (const o of await dueForReviewRequest()) {
    // Claim first so two workers or a crash can never send it twice.
    const claimed = await db
      .update(schema.orders)
      .set({ reviewRequestedAt: new Date() })
      .where(and(eq(schema.orders.id, o.id), isNull(schema.orders.reviewRequestedAt)))
      .returning({ id: schema.orders.id });
    if (!claimed.length) continue;
    await send(o);
    n += 1;
  }
  return n;
}

export type PublicReview = { id: number; rating: number; title: string | null; text: string | null; name: string; country: string; locale: string; date: Date; reply: string | null };

/** Approved reviews (visitor's language first, then newest) and the average of all approved ones. */
export async function publicReviews(locale: string, limit = 12) {
  const [stats] = await db
    .select({ n: sql<number>`count(*)::int`, avg: sql<number>`coalesce(avg(${schema.reviews.rating}), 0)::float` })
    .from(schema.reviews)
    .where(eq(schema.reviews.status, "approved"));
  const rows = await db
    .select()
    .from(schema.reviews)
    .where(eq(schema.reviews.status, "approved"))
    .orderBy(sql`(${schema.reviews.locale} = ${locale}) desc`, desc(schema.reviews.createdAt))
    .limit(limit);
  const list: PublicReview[] = rows.map((r) => ({ id: r.id, rating: r.rating, title: r.title, text: r.text, name: r.displayName, country: r.country, locale: r.locale, date: r.createdAt, reply: r.reply }));
  return { count: stats?.n ?? 0, average: Math.round((stats?.avg ?? 0) * 10) / 10, list };
}
