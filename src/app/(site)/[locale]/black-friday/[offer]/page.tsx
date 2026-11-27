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
import { BF_DOURO_ALIASES, bfCountryFor, bfHref, bfOfferByPath, bfOpen, bfOpenCountries, isBfLocale, type BfLocale, type BfOffer } from "@/lib/black-friday";
import DouroBox, { generateMetadata as douroMetadata } from "../page";
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

/** /de/black-friday/cheda and /es/black-friday/galhofa: the Douro box page under the name of its wine. */
const isDouroAlias = (locale: string, path: string) => isBfLocale(locale) && BF_DOURO_ALIASES[locale] === path;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const p = await params;
  if (isDouroAlias(p.locale, p.offer)) return douroMetadata({ params: Promise.resolve({ locale: p.locale }) });
  const r = resolve(p.locale, p.offer);
  if (!r) return {};
  const c = bfCopyFor(r.offer.id, r.locale)!;
  const settings = await getSettings();
  const description = fmt(c.metaDescription, { date: cutoffText(r.locale, settings.black_friday.cutoff_at) });
  return {
    title: c.metaTitle,
    description,
    alternates: { canonical: bfHref(r.locale, r.offer) },
    openGraph: { locale: LOCALE_INFO[r.locale].og, title: c.metaTitle, description, images: [{ url: `${SITE.url}${c.images.hero}`, width: c.images.heroW, height: c.images.heroH }] },
  };
}

/** Dutch pages (review of 25/11/2026): the full deadline, "vrijdag 27 november, 23.59 uur", in Dutch time, instead of "27-11". */
function cutoffText(locale: string, iso: string) {
  if (locale !== "nl") return dateFor(locale as Parameters<typeof dateFor>[0], iso).slice(0, 5);
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", weekday: "long", day: "numeric", month: "long" }).format(d);
  const time = new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d).replace(":", ".");
  return `${day}, ${time} uur`;
}

/** The other Black Friday offers (Spain only): same page as the Douro box, with their own product, prices and copy. */
export default async function BlackFridayOffer({ params, searchParams }: { params: Params; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await params;
  if (isDouroAlias(p.locale, p.offer)) return DouroBox({ params: Promise.resolve({ locale: p.locale }), searchParams });
  const r = resolve(p.locale, p.offer);
  if (!r) notFound();
  const { offer, locale } = r;
  const copy = bfCopyFor(offer.id, locale)!;
  const [catalog, settings, admin] = await Promise.all([getCatalog(offer.slug), getSettings(), getAdmin().catch(() => null)]);
  const bf = settings.black_friday;
  const country = bfCountryFor(locale);
  // These offers show the reference price set on their bundles (Admin → Products), unlike the Douro box.
  // Not on the Dutch pages: the Dutch Alcohol Act caps alcohol discounts at 25 % and a struck-through price must be the
  // lowest of the last 30 days (review of 25/11/2026). The bundle saving against single boxes (8-12 %) stays.
  const reference = locale !== "nl";
  const bundles = (catalog?.bundles ?? []).map((b) => ({ key: b.key, qty: b.qty, priceCents: b.priceCents, compareAtCents: reference ? b.compareAtCents : null }));
  const cutoffLabel = cutoffText(locale, bf.cutoff_at);
  const sells = bfOpenCountries(bf).includes(country) || !!admin;
  const open = sells && (bfOpen(bf) || !!admin) && bundles.length > 0;
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
        <BlackFridayPage offer={offer.id} copy={copy} bundles={bundles} cutoffIso={bf.cutoff_at} cutoffLabel={cutoffLabel} deliveryDays={deliveryDaysFor(locale, bf.delivery_days)} open={open} leadAmountCents={settings.bf_lead_code ? settings.bf_lead_amount_cents : 0} leadCode={settings.bf_lead_code} />
      </div>
    </I18nProvider>
  );
}
