import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { loadDraft } from "@/lib/draft";
import { latestPayment, refreshMbway } from "@/lib/payments";
import { formatMbReference } from "@/lib/ifthenpay";
import { AutoRefresh } from "@/components/checkout/AutoRefresh";
import { ebookLink } from "@/lib/email";
import { SITE } from "@/lib/site";
import { purchaseEventId } from "@/lib/tracking";
import { Footer, Header, WhatsAppIcon } from "@/components/landing/Chrome";
import { PurchasePixel } from "@/components/landing/PurchasePixel";
import { dateFor, getDict, moneyFor } from "@/lib/i18n";
import { fmt, Rich } from "@/lib/i18n/rich";
import { isLocale, LOCALE_INFO, type Locale } from "@/lib/markets";
import { getSettings } from "@/lib/settings";
import { cookies } from "next/headers";
import { LOCALE_COOKIE } from "@/lib/i18n/paths";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Obrigado pela sua encomenda | Wine Portugal", robots: { index: false } };

export default async function Obrigado({ searchParams }: { searchParams: Promise<{ o?: string; t?: string }> }) {
  const { o, t } = await searchParams;
  const order = await loadDraft(o ?? null, t ?? null);
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale: Locale = isLocale(order?.locale) ? order.locale : isLocale(saved) ? saved : "pt";
  const d = getDict(locale);
  const tx = d.thanks;
  const eur = moneyFor(locale);
  if (!order) {
    return (
      <Shell locale={locale}>
        <h1 className="font-serif text-4xl font-semibold text-night">{tx.notFound}</h1>
        <p className="mt-3 text-ink">{tx.notFoundText}</p>
        <Contact locale={locale} />
      </Shell>
    );
  }
  const settings = await getSettings();
  const isPT = order.country === "PT";
  const days = settings.markets?.[order.country as "PT"]?.delivery_days ?? "";

  let paid = ["paid", "preparing", "shipped", "delivered"].includes(order.status);
  let p = paid ? null : await latestPayment(order.id);
  if (p && p.method === "mbway" && p.status === "pending") {
    await refreshMbway(p);
    p = await latestPayment(order.id);
    if (p?.status === "paid") paid = true;
  }
  const mb = !paid && p?.method === "multibanco" && p.status === "pending" ? p : null;
  // Card / wallet / MB WAY: money may be on its way and the callback not in yet.
  const processing = !paid && !!p && p.status === "pending" && p.method !== "multibanco";
  const addons = await db.select().from(schema.orderAddons).where(and(eq(schema.orderAddons.orderId, order.id), eq(schema.orderAddons.status, paid ? "paid" : "pending")));
  const addonsTotal = addons.reduce((n, a) => n + a.amountCents, 0);
  const due = mb ? mb.amountCents : order.totalCents + addonsTotal;
  const guide = locale === "pt";
  const link = paid && guide ? await ebookLink().catch(() => null) : null;
  const exp = mb?.expiresAt ? mb.expiresAt.toLocaleDateString(LOCALE_INFO[locale].intl, { timeZone: "Europe/Lisbon" }) : null;
  const boxes = order.qtyBoxes === 1 ? d.common.oneBox : fmt(d.common.nBoxes, { n: order.qtyBoxes });

  return (
    <Shell locale={locale}>
      {paid && <PurchasePixel eventId={purchaseEventId(order.id)} value={due / 100} numItems={order.qtyBoxes} orderId={order.id} />}
      {processing && <AutoRefresh seconds={5} />}
      <p className="font-hand text-2xl text-terracotta-ink">{paid ? tx.thanks : tx.almost}</p>
      <h1 className="font-serif text-4xl font-semibold leading-tight text-night sm:text-5xl">
        {paid ? tx.confirmed : processing ? (p?.method === "mbway" ? tx.confirmMbway : tx.confirming) : tx.pending}
      </h1>
      <p className="mt-2 text-lg text-ink">
        <Rich s={tx.orderLine} vars={{ id: order.id, boxes, total: eur(order.totalCents) }} />
      </p>
      {addons.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm text-ink">
          {addons.map((a) => (
            <li key={a.id}>
              + {a.kind === "boxes" ? fmt(d.upsell.boxesLabel, { what: a.boxes === 1 ? d.upsell.whatOne : fmt(d.upsell.whatMany, { n: a.boxes }), bottles: a.boxes * 3 }) : a.label} · {eur(a.amountCents)}
            </li>
          ))}
          <li className="font-semibold">{paid ? tx.totalPaid : tx.total}: {eur(order.totalCents + addonsTotal)}</li>
        </ul>
      )}

      {processing && (
        <div className="mt-6 rounded-xl border border-gold/50 bg-white p-5 text-ink">
          {p?.method === "mbway" ? tx.mbwayOpen : tx.receiving} {tx.autoRefresh}
        </div>
      )}
      {!paid && !processing && (
        <div className="mt-6 rounded-xl border border-gold/50 bg-white p-5">
          {mb ? (
            <>
              <p className="text-ink">{tx.mbText}</p>
              <dl className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-paper p-4 text-center">
                <div><dt className="text-xs uppercase tracking-wider text-muted">{tx.entity}</dt><dd className="text-3xl font-bold">{mb.entity}</dd></div>
                <div><dt className="text-xs uppercase tracking-wider text-muted">{tx.amount}</dt><dd className="text-3xl font-bold">{eur(mb.amountCents)}</dd></div>
                <div className="col-span-2"><dt className="text-xs uppercase tracking-wider text-muted">{tx.reference}</dt><dd className="text-3xl font-bold tracking-wider">{formatMbReference(mb.reference ?? "")}</dd></div>
                {exp && <div className="col-span-2 text-sm text-muted">{fmt(tx.payBy, { date: exp })}</div>}
              </dl>
              <p className="mt-3 text-sm text-muted">{fmt(tx.payByXmas, { date: dateFor(locale, settings.cutoff_at).slice(0, 5) })}</p>
            </>
          ) : (
            <>
              <p className="text-ink">{tx.notCompleted}</p>
              <a href={`/checkout?o=${encodeURIComponent(order.id)}&t=${encodeURIComponent(t ?? "")}`} className="btn-primary mt-4 w-full">{tx.completePayment}</a>
            </>
          )}
        </div>
      )}

      <h2 className="mt-10 font-serif text-3xl font-semibold text-night">{tx.nextTitle}</h2>
      <ol className="mt-4 space-y-3">
        {[
          paid ? tx.stepEmail : tx.stepPay,
          tx.stepPrepare,
          isPT ? fmt(tx.stepShipPT, { days: days || "2 a 4" }) : tx.stepShip,
        ].map((t, i) => (
          <li key={i} className="flex gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-night font-bold text-gold">{i + 1}</span>
            <span className="pt-1 text-ink">{t}</span>
          </li>
        ))}
      </ol>

      {paid && guide && (
        <div className="mt-10 rounded-xl bg-night p-6 text-paper">
          <p className="text-xs uppercase tracking-[0.25em] text-gold">{tx.yourGift}</p>
          <h2 className="mt-1 text-3xl font-bold">{SITE.ebookTitle}</h2>
          {link ? (
            <a href={link} className="mt-4 inline-flex min-h-12 items-center rounded bg-gold px-5 font-semibold text-night hover:bg-gold-soft">{tx.downloadGuide}</a>
          ) : (
            <p className="mt-3 text-paper/80">{tx.guideByEmail}</p>
          )}
        </div>
      )}
      <Contact locale={locale} />
    </Shell>
  );
}

function Shell({ children, locale }: { children: React.ReactNode; locale: Locale }) {
  return (
    <>
      <Header locale={locale} />
      <main className="paper-grain min-h-[60vh]">
        <div className="mx-auto max-w-2xl px-4 py-12">{children}</div>
      </main>
      <Footer locale={locale} />
    </>
  );
}

function Contact({ locale }: { locale: Locale }) {
  const tx = getDict(locale).thanks;
  return (
    <p className="mt-10 text-sm text-muted">
      {tx.questions}{" "}
      <a href={SITE.whatsappLink} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-semibold text-azulejo underline">
        <WhatsAppIcon className="h-4 w-4" /> WhatsApp {SITE.whatsapp}
      </a>{" "}
      {tx.or} <a href={`mailto:${SITE.email}`} className="font-semibold text-azulejo underline">{SITE.email}</a>
    </p>
  );
}
