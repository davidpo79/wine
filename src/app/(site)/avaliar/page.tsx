import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { Footer, Header } from "@/components/landing/Chrome";
import { getDict } from "@/lib/i18n";
import { fmt } from "@/lib/i18n/rich";
import { isLocale, type Locale } from "@/lib/markets";
import { canReview, defaultDisplayName, reviewOfOrder, validReviewToken } from "@/lib/reviews";
import { ReviewForm } from "./ReviewForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Avaliar | Wine Portugal", robots: { index: false } };

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ o?: string; t?: string; r?: string }> }) {
  const sp = await searchParams;
  const [order] = sp.o ? await db.select().from(schema.orders).where(eq(schema.orders.id, sp.o)) : [];
  const valid = !!order && !!sp.t && validReviewToken(order.id, sp.t);
  const locale: Locale = valid && isLocale(order.locale) ? order.locale : "pt";
  const t = getDict(locale).review;
  const existing = valid ? await reviewOfOrder(order.id) : null;
  const fromLink = Number(sp.r);

  let body: React.ReactNode;
  if (!valid) body = <p className="mt-4 text-ink">{t.invalid}</p>;
  else if (!canReview(order)) body = <p className="mt-4 text-ink">{t.notYet}</p>;
  else if (existing?.status === "approved") body = <p className="mt-4 text-ink">{t.published}</p>;
  else
    body = (
      <>
        <p className="mt-2 text-ink">{fmt(t.pageIntro, { id: order.id })}</p>
        {existing && <p className="mt-3 rounded bg-paper px-3 py-2 text-sm text-ink">{t.editNote}</p>}
        <ReviewForm
          o={order.id}
          t={sp.t!}
          initial={{
            rating: Number.isInteger(fromLink) && fromLink >= 1 && fromLink <= 5 ? fromLink : existing?.rating ?? 0,
            title: existing?.title ?? "",
            text: existing?.text ?? "",
            name: existing?.displayName ?? defaultDisplayName(order.customerName),
          }}
          copy={t}
        />
      </>
    );

  return (
    <>
      <Header locale={locale} />
      <main className="paper-grain min-h-[60vh]">
        <div className="mx-auto max-w-xl px-4 py-12">
          <h1 className="font-serif text-4xl font-semibold text-night">{t.pageTitle}</h1>
          {body}
        </div>
      </main>
      <Footer locale={locale} />
    </>
  );
}
