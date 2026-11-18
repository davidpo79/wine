import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCatalog } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { SITE } from "@/lib/site";
import { I18nProvider } from "@/lib/i18n/client";
import { dateFor, deliveryDaysFor, getDict } from "@/lib/i18n";
import { fmt } from "@/lib/i18n/rich";
import { LOCALE_INFO } from "@/lib/markets";
import { getAdmin } from "@/lib/auth";
import { bfCountryFor, bfHref, bfOfferByPath, bfOpen, isBfLocale, type BfLocale, type BfOffer } from "@/lib/black-friday";
import { bfCopyFor } from "@/components/black-friday/copy";
import { BlackFridayPage } from "@/components/black-friday/BlackFridayPage";
import "../../../landing.css";
import "@/components/black-friday/black-friday.css";

export const dynamic = "force-dynamic";

type Params = Promise<{ locale: string; offer: string }>;

/** The offer and its copy for this URL (/es/black-friday/espumoso, /es/black-friday/poco-do-canto), else null. */
function resolve(locale: string, path: string): { offer: BfOffer; locale: BfLocale } | null {
  if (!isBfLocale(locale)) return null;
  const offer = bfOfferByPath(path, locale);
  if (!offer || !isBfLocale(locale) || !offer.locales.includes(locale) || !bfCopyFor(offer.id, locale)) return null;
  return { offer, locale };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const p = await params;
  const r = resolve(p.locale, p.offer);
  if (!r) return {};
  const c = bfCopyFor(r.offer.id, r.locale)!;
  const settings = await getSettings();
  const description = fmt(c.metaDescription, { date: dateFor(r.locale, settings.black_friday.cutoff_at).slice(0, 5) });
  return {
    title: c.metaTitle,
    description,
    alternates: { canonical: bfHref(r.locale, r.offer) },
    openGraph: { locale: LOCALE_INFO[r.locale].og, title: c.metaTitle, description, images: [{ url: `${SITE.url}${c.images.hero}`, width: c.images.heroW, height: c.images.heroH }] },
  };
}

/** The other Black Friday offers (Spain only): same page as the Douro box, with their own product, prices and copy. */
export default async function BlackFridayOffer({ params }: { params: Params }) {
  const p = await params;
  const r = resolve(p.locale, p.offer);
  if (!r) notFound();
  const { offer, locale } = r;
  const copy = bfCopyFor(offer.id, locale)!;
  const [catalog, settings, admin] = await Promise.all([getCatalog(offer.slug), getSettings(), getAdmin().catch(() => null)]);
  const bf = settings.black_friday;
  const country = bfCountryFor(locale);
  // These offers show the reference price set on their bundles (Admin → Products), unlike the Douro box.
  const bundles = (catalog?.bundles ?? []).map((b) => ({ key: b.key, qty: b.qty, priceCents: b.priceCents, compareAtCents: b.compareAtCents }));
  const cutoffLabel = dateFor(locale, bf.cutoff_at).slice(0, 5);
  const sells = bf.countries.includes(country);
  const open = sells && (bfOpen(bf) || (!!admin && new Date() <= new Date(bf.cutoff_at))) && bundles.length > 0;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: copy.productName,
    image: [`${SITE.url}${copy.images.hero}`],
    sku: offer.slug,
    category: "Wine",
    offers: bundles.map((b) => ({ "@type": "Offer", price: (b.priceCents / 100).toFixed(2), priceCurrency: "EUR", availability: open ? "https://schema.org/InStock" : "https://schema.org/OutOfStock", url: `${SITE.url}${bfHref(locale, offer)}` })),
  };
  return (
    <I18nProvider locale={locale} country={country} languages={[...offer.locales]} dict={getDict(locale)} guide={false}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div lang={LOCALE_INFO[locale].htmlLang} data-locale={locale}>
        <BlackFridayPage offer={offer.id} copy={copy} bundles={bundles} cutoffIso={bf.cutoff_at} cutoffLabel={cutoffLabel} deliveryDays={deliveryDaysFor(locale, bf.delivery_days)} open={open} />
      </div>
    </I18nProvider>
  );
}
