"use server";

import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { canReview, saveReview, validReviewToken } from "@/lib/reviews";
import { getDict } from "@/lib/i18n";
import { isLocale } from "@/lib/markets";

export type ReviewFormState = { error?: string; done?: boolean } | undefined;

export async function submitReview(_: ReviewFormState, fd: FormData): Promise<ReviewFormState> {
  const orderId = String(fd.get("o") ?? "");
  const token = String(fd.get("t") ?? "");
  const [o] = orderId ? await db.select().from(schema.orders).where(eq(schema.orders.id, orderId)) : [];
  const t = getDict(isLocale(o?.locale) ? o.locale : "pt").review;
  if (!o || !validReviewToken(o.id, token)) return { error: t.invalid };
  if (!canReview(o)) return { error: t.notYet };
  const rating = Number(fd.get("rating"));
  const title = String(fd.get("title") ?? "").trim().slice(0, 120);
  const text = String(fd.get("text") ?? "").trim().slice(0, 3000);
  const displayName = String(fd.get("name") ?? "").trim().slice(0, 40);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { error: t.errorRating };
  if (!displayName) return { error: t.errorName };
  if (fd.get("consent") !== "on") return { error: t.errorConsent };
  const r = await saveReview(o, { rating, title, text, displayName });
  if (!r) return { error: t.published };
  return { done: true };
}
