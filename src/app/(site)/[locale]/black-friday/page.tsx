import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { bfLocaleForVisitor } from "@/lib/black-friday-visitor";
import { getBfCatalog } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { SITE } from "@/lib/site";
import { I18nProvider } from "@/lib/i18n/client";
import { dateFor, deliveryDaysFor, getDict } from "@/lib/i18n";
import { fmt } from "@/lib/i18n/rich";
import { LOCALE_INFO } from "@/lib/markets";
import { getAdmin } from "@/lib/auth";
import { visitor } from "@/lib/visitor";
import { BF_LOCALES, BF_PRODUCT_SLUG, bfCountryFor, bfHref, bfOpen, isBfLocale } from "@/lib/black-friday";
import { BF_COPY } from "@/components/black-friday/copy";
import { BlackFridayPage } from "@/components/black-friday/BlackFridayPage";
import "../../landing.css";
import "@/components/black-friday/black-friday.css";

export const dynamic = "force-dynamic";

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  if (!isBfLocale(locale)) return {};
  const c = BF_COPY[locale];
  const settings = await getSettings();
  const description = fmt(c.metaDescription, { date: dateFor(locale, settings.black_friday.cutoff_at).slice(0, 5) });
  return {
    title: c.metaTitle,
    description,
    alternates: { canonical: bfHref(locale), languages: Object.fromEntries(BF_LOCALES.map((l) => [LOCALE_INFO[l].htmlLang, bfHref(l)])) },
    openGraph: { locale: LOCALE_INFO[locale].og, title: c.metaTitle, description, images: [{ url: `${SITE.url}/lp/bf/bottles.webp`, width: 1200, height: 749 }] },
  };
}

/** Black Friday box for Germany and Spain, in German or Spanish. */
export default async function BlackFriday({ params, searchParams }: { params: Params; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale } = await params;
  if (!isBfLocale(locale)) notFound();
  const [catalog, settings, v, admin, sp] = await Promise.all([getBfCatalog(), getSettings(), visitor(), getAdmin().catch(() => null), searchParams]);
  // Shown in the visitor's language: a German link opened on a Spanish phone goes to the Spanish page (and the other
  // way round), unless the visitor picked the language in the switcher (saved) or the link says ?lang=.
  const wanted = sp.lang ? null : bfLocaleForVisitor(v);
  if (wanted && wanted !== locale) {
    const qs = new URLSearchParams(Object.entries(sp).flatMap(([k, x]) => (Array.isArray(x) ? x.map((y) => [k, y]) : x != null ? [[k, x]] : [])) as [string, string][]).toString();
    redirect(`${bfHref(wanted)}${qs ? `?${qs}` : ""}`);
  }
  const bf = settings.black_friday;
  // Delivery country: the visitor's (IP) when it is a Black Friday country, else the one of the language.
  const country = v.ipCountry && bf.countries.includes(v.ipCountry as never) ? (v.ipCountry as (typeof bf.countries)[number]) : bfCountryFor(locale);
  const bundles = (catalog?.bundles ?? []).map((b) => ({ key: b.key, qty: b.qty, priceCents: b.priceCents, compareAtCents: b.compareAtCents }));
  const cutoffLabel = dateFor(locale, bf.cutoff_at).slice(0, 5);
  const open = (bfOpen(bf) || (!!admin && new Date() <= new Date(bf.cutoff_at))) && bundles.length > 0;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: BF_COPY[locale].productName,
    image: [`${SITE.url}/lp/bf/bottles.webp`],
    sku: BF_PRODUCT_SLUG,
    category: "Wine",
    offers: bundles.map((b) => ({ "@type": "Offer", price: (b.priceCents / 100).toFixed(2), priceCurrency: "EUR", availability: open ? "https://schema.org/InStock" : "https://schema.org/OutOfStock", url: `${SITE.url}${bfHref(locale)}` })),
  };
  return (
    <I18nProvider locale={locale} country={country} languages={[...BF_LOCALES]} dict={getDict(locale)} guide={false}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div lang={LOCALE_INFO[locale].htmlLang} data-locale={locale}>
        <BlackFridayPage copy={BF_COPY[locale]} bundles={bundles} cutoffIso={bf.cutoff_at} cutoffLabel={cutoffLabel} deliveryDays={deliveryDaysFor(locale, bf.delivery_days)} open={open} />
      </div>
    </I18nProvider>
  );
}
