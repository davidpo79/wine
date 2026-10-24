import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { loadDraft } from "@/lib/draft";
import { getCatalog } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { boxesOffer, productOffers } from "@/lib/upsell";
import { upsellMode } from "@/lib/payments";
import { logOrderEvent } from "@/lib/orders";
import { stripePublishableKey } from "@/lib/stripe";
import { UpsellFlow } from "@/components/checkout/UpsellFlow";
import { I18nProvider } from "@/lib/i18n/client";
import { getDict } from "@/lib/i18n";
import { isCountry, isLocale, LOCALE_INFO } from "@/lib/markets";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Oferta única · Wine Portugal",
  robots: { index: false, follow: false },
};

export default async function Oferta({
  searchParams,
}: {
  searchParams: Promise<{ o?: string; t?: string }>;
}) {
  const { o, t } = await searchParams;
  const order = await loadDraft(o ?? null, t ?? null);
  if (!order || !o || !t) redirect("/");
  const q = `o=${encodeURIComponent(o)}&t=${encodeURIComponent(t)}`;
  const mode = upsellMode(order);
  const [catalog, settings] = await Promise.all([getCatalog(), getSettings()]);
  if (!mode || !settings.upsell_enabled || !catalog) redirect(`/obrigado?${q}`);
  const paidAddons = await db
    .select({ sku: schema.orderAddons.sku })
    .from(schema.orderAddons)
    .where(
      and(
        eq(schema.orderAddons.orderId, order.id),
        eq(schema.orderAddons.status, "paid"),
      ),
    );
  const taken = new Set(paidAddons.map((a) => a.sku));
  const first = boxesOffer(order, catalog.bundles);
  const others = productOffers(settings, order).filter(
    (p) => !taken.has(p.sku),
  );
  // For the funnel (Admin → Dashboard): the post-purchase offer was seen, once per order.
  const seen = await db
    .select({ id: schema.orderEvents.id })
    .from(schema.orderEvents)
    .where(
      and(
        eq(schema.orderEvents.orderId, order.id),
        eq(schema.orderEvents.type, "upsell_offer_viewed"),
      ),
    )
    .limit(1);
  if (!seen.length)
    await logOrderEvent(order.id, "upsell_offer_viewed", { mode });
  const locale = isLocale(order.locale) ? order.locale : "pt";
  return (
    <I18nProvider
      locale={locale}
      country={isCountry(order.country) ? order.country : "PT"}
      dict={getDict(locale)}
    >
      {/* lang and data-locale: the cookie banner (outside the provider) speaks the order's language. */}
      <div lang={LOCALE_INFO[locale].htmlLang} data-locale={locale} style={{ display: "contents" }}>
      <UpsellFlow
        orderId={order.id}
        token={t}
        firstName={(order.customerName ?? "").split(" ")[0]}
        boxes={order.qtyBoxes}
        first={first && !taken.has("trilogia-2160") ? first : null}
        others={others}
        mode={mode}
        phone={order.phone ?? ""}
        publishableKey={stripePublishableKey()}
      />
      </div>
    </I18nProvider>
  );
}
