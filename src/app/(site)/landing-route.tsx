import { publicReviews } from "@/lib/reviews";
import type { Metadata } from "next";
import { guideFor } from "@/lib/ebook";
import { getCatalog, paidBoxes, salesState } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { SITE } from "@/lib/site";
import { BuyProvider, type PublicBundle, type SalesMode } from "@/components/landing/BuyContext";
import { LandingPage } from "@/components/landing/LandingPage";
import { I18nProvider } from "@/lib/i18n/client";
import { dateFor, deliveryDaysFor, getDict } from "@/lib/i18n";
import { homeHref } from "@/lib/i18n/paths";
import { COUNTRIES_FOR_LOCALE, LOCALE_INFO, LOCALES, type Locale } from "@/lib/markets";
import { countryFor, enabledCountries, languagesOf, visitor } from "@/lib/visitor";

export function landingMetadata(locale: Locale): Metadata {
  const d = getDict(locale);
  return {
    title: d.lp.metaTitle,
    description: d.lp.metaDescription,
    alternates: { canonical: homeHref(locale), languages: Object.fromEntries(LOCALES.map((l) => [LOCALE_INFO[l].htmlLang, homeHref(l)])) },
    openGraph: { locale: LOCALE_INFO[locale].og, title: d.lp.metaTitle, description: d.lp.metaDescription },
  };
}

/** The landing page in one language. The delivery country is the visitor's (IP) when it speaks this language. */
export async function LandingRoute({ locale }: { locale: Locale }) {
  const [catalog, settings, sold, v] = await Promise.all([getCatalog(), getSettings(), paidBoxes(), visitor()]);
  const d = getDict(locale);
  if (!catalog || catalog.bundles.length === 0) {
    return <main style={{ padding: 40, textAlign: "center" }}>{locale === "pt" ? "Loja em preparação. Volte em breve." : "…"}</main>;
  }
  const open = await enabledCountries(settings);
  const country = countryFor(locale, v);
  const market = settings.markets[country];
  const cutoffIso = market?.cutoff_at ?? settings.cutoff_at;
  let mode: SalesMode = salesState({ ...settings, cutoff_at: cutoffIso }, sold).mode;
  if (!open.includes(country)) mode = "coming_soon";
  const bundles: PublicBundle[] = catalog.bundles.map((b) => ({
    key: b.key,
    label: b.label,
    qty: b.qty,
    priceCents: b.priceCents,
    compareAtCents: b.compareAtCents,
    shippingCents: b.shippingCents,
    badge: b.badge,
  }));
  const defaultKey = bundles.find((b) => b.qty === 2)?.key ?? bundles[0].key;
  const url = `${SITE.url}${homeHref(locale) === "/" ? "" : homeHref(locale)}`;

  const rv = await publicReviews(locale, 24).catch(() => ({ count: 0, average: 0, list: [] }));
  const reviewsData = { count: rv.count, average: rv.average, list: rv.list.map((r) => ({ ...r, date: r.date.toISOString() })) };

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "Trilogia 2160",
    description: catalog.product.shortDescription,
    brand: { "@type": "Brand", name: "2160 Onde Tudo Nasce" },
    category: "Vinho",
    image: [`${SITE.url}/lp/giftbox.webp`, `${SITE.url}/lp/table.webp`],
    offers: bundles.map((b) => ({
      "@type": "Offer",
      name: b.label,
      price: (b.priceCents / 100).toFixed(2),
      priceCurrency: "EUR",
      availability: mode === "open" || mode === "after_christmas" ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url,
    })),
    // Only real, verified reviews (Admin → Reviews); absent until the first one is published.
    ...(rv.count ? { aggregateRating: { "@type": "AggregateRating", ratingValue: rv.average.toFixed(1), reviewCount: rv.count, bestRating: 5, worstRating: 1 } } : {}),
  };

  return (
    <I18nProvider locale={locale} country={country} languages={languagesOf(open)} dict={d} guide={guideFor(settings, locale)}>
      <BuyProvider bundles={bundles} defaultKey={defaultKey} mode={mode} promoConfig={COUNTRIES_FOR_LOCALE[locale].includes("PT") /* the lead code is a Portugal-market offer: pt and ru pages (?codigo= links in the lead emails) */ && settings.lead_code && settings.lead_discount_percent > 0 ? { code: settings.lead_code, percent: settings.lead_discount_percent, maxQty: settings.lead_code_max_qty, plusCode: settings.lead_plus_code } : null}>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
        <div lang={LOCALE_INFO[locale].htmlLang}>
          <LandingPage
            deliveryDays={deliveryDaysFor(locale, market?.delivery_days ?? "")}
            deliveryTextOverride={country === "PT" && locale === "pt" ? settings.delivery_text : undefined /* the Settings text is Portuguese */}
            cutoffLabel={dateFor(locale, cutoffIso)}
            cutoffIso={cutoffIso}
            exitPopup={locale === "pt" && settings.exit_popup_enabled}
            reviews={reviewsData}
          />
        </div>
      </BuyProvider>
    </I18nProvider>
  );
}
