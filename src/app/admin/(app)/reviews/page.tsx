import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { lisbonDateTime } from "@/lib/time";
import { REVIEW_DELAY_AFTER_DELIVERY_DAYS, REVIEW_DELAY_AFTER_SHIPPING_DAYS } from "@/lib/reviews";
import { reviewAction, reviewsSettingsAction } from "../../actions";
import { ActionForm, Submit } from "../../ui";

const TABS = { pending: "To review", approved: "Published", rejected: "Not published" } as const;
type Tab = keyof typeof TABS;

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<{ s?: string }> }) {
  await requireAdmin({ role: "admin" });
  const sp = await searchParams;
  const tab: Tab = sp.s && sp.s in TABS ? (sp.s as Tab) : "pending";
  const [rows, counts, settings, [invited]] = await Promise.all([
    db
      .select({ r: schema.reviews, customer: schema.orders.customerName, email: schema.orders.email })
      .from(schema.reviews)
      .innerJoin(schema.orders, eq(schema.orders.id, schema.reviews.orderId))
      .where(eq(schema.reviews.status, tab))
      .orderBy(desc(schema.reviews.updatedAt))
      .limit(200),
    db.select({ status: schema.reviews.status, n: sql<number>`count(*)::int`, avg: sql<number>`avg(${schema.reviews.rating})::float` }).from(schema.reviews).groupBy(schema.reviews.status),
    getSettings(),
    db.select({ n: sql<number>`count(*)::int` }).from(schema.orders).where(sql`${schema.orders.reviewRequestedAt} is not null and ${schema.orders.status} in ('shipped','delivered')`),
  ]);
  const count = (s: string) => counts.find((c) => c.status === s)?.n ?? 0;
  const published = counts.find((c) => c.status === "approved");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-serif text-3xl font-semibold">Reviews</h1>
        <p className="text-sm text-muted">
          {published?.n ? `${published.n} published · average ${(published.avg ?? 0).toFixed(1)} / 5` : "None published yet"} · {invited?.n ?? 0} customers invited
        </p>
      </div>
      <p className="rounded-lg border border-gold/50 bg-[#fff8e8] p-3 text-sm">
        Only customers with a delivered order can review (invitation email {REVIEW_DELAY_AFTER_DELIVERY_DAYS} days after “delivered”, or {REVIEW_DELAY_AFTER_SHIPPING_DAYS} days after “shipped” if nobody marks it delivered).
        EU law: publish every genuine review, good and bad. Only reject abusive content, personal data or reviews unrelated to the order, and never edit what the customer wrote.
      </p>

      <div className="flex flex-wrap gap-1 text-xs">
        {(Object.keys(TABS) as Tab[]).map((s) => (
          <Link key={s} href={`/admin/reviews?s=${s}`} className={`rounded-full border px-2.5 py-1 ${s === tab ? "bg-night text-paper" : "bg-white hover:bg-paper"}`}>
            {TABS[s]} ({count(s === "approved" ? "approved" : s)})
          </Link>
        ))}
      </div>

      <ul className="space-y-3">
        {rows.map(({ r, customer, email }) => (
          <li key={r.id} className="rounded-lg border bg-white p-4 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-lg text-gold" aria-label={`${r.rating} of 5`}>
                {"★".repeat(r.rating)}
                <span className="text-paper-2">{"★".repeat(5 - r.rating)}</span>
              </span>
              <span className="text-xs text-muted">
                {lisbonDateTime(r.updatedAt)} · {r.country} · {r.locale} · <Link className="underline" href={`/admin/orders/${encodeURIComponent(r.orderId)}`}>{r.orderId}</Link>
              </span>
            </div>
            {r.title && <p className="mt-1 font-semibold">{r.title}</p>}
            {r.text && <p className="mt-1 whitespace-pre-wrap">{r.text}</p>}
            <p className="mt-2 text-xs text-muted">
              Shown as <strong>{r.displayName}</strong> · customer {customer} ({email}) · consent to publish: {r.consentPublish ? "yes" : "no"}
              {r.moderatedBy && ` · ${r.status} by ${r.moderatedBy}`}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {r.status !== "approved" && (
                <ActionForm action={reviewAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="op" value="approve" />
                  <Submit>Publish</Submit>
                </ActionForm>
              )}
              {r.status !== "rejected" && (
                <ActionForm action={reviewAction} confirm="Do not publish this review? Only for abusive content, personal data or unrelated text.">
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="op" value="reject" />
                  <button className="rounded-md border px-3 py-2 text-sm">Don&apos;t publish</button>
                </ActionForm>
              )}
            </div>
            <ActionForm action={reviewAction} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="op" value="reply" />
              <label className="flex-1">
                <span className="text-xs font-semibold">Public reply (optional)</span>
                <textarea name="reply" rows={2} defaultValue={r.reply ?? ""} className="mt-1 w-full rounded border p-2" />
              </label>
              <button className="rounded-md border px-3 py-2 text-sm">Save reply</button>
            </ActionForm>
          </li>
        ))}
        {!rows.length && <li className="rounded-lg border bg-white p-6 text-sm text-muted">Nothing here.</li>}
      </ul>

      <ActionForm action={reviewsSettingsAction} className="flex flex-wrap items-center gap-3 rounded-lg border bg-white p-4 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="reviews_enabled" defaultChecked={settings.reviews_enabled !== false} /> Send the review invitation after delivery
        </label>
        <Submit>Save</Submit>
      </ActionForm>
    </div>
  );
}
