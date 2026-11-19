import { publicReviews } from "@/lib/reviews";
import type { Metadata } from "next";
import { guideFor } from "@/lib/ebook";
import { cookies } from "next/headers";
import { getCatalog } from "@/lib/catalog";
import { bfCountryFor, bfHref, bfOfferCountries, bfOfferFor, bfOpenCountries, isBfLocale } from "@/lib/black-friday";
import { bfCopyFor } from "@/components/black-friday/copy";
import { getAdmin } from "@/lib/auth";
import { fmt } from "@/lib/i18n/rich";
import { getSettings } from "@/lib/settings";
import { CheckoutPage } from "@/components/checkout/CheckoutPage";
import { stripePublishableKey } from "@/lib/stripe";
import { I18nProvider } from "@/lib/i18n/client";
import { dateFor, deliveryDaysFor, getDict } from "@/lib/i18n";
import { LOCALE_COOKIE } from "@/lib/i18n/paths";
import { loadDraft } from "@/lib/draft";
import { COUNTRIES_FOR_LOCALE, defaultCountry, isCountry, isLocale, LOCALE_INFO, type Country, type Locale } from "@/lib/markets";
import { enabledCountries } from "@/lib/visitor";

export const dynamic = "force-dynamic";
/** The tab title names what is being bought: the Black Friday offer of the link (?b=bfs2) or of a resumed order. */
export async function generateMetadata({ searchParams }: { searchParams: SP }): Promise<Metadata> {
  const sp = await searchParams;
  const resumed = sp.o && sp.t ? await loadDraft(sp.o, sp.t) : null;
  const offer = bfOfferFor(resumed ? resumed.bundleKey : sp.b);
  const locale = resumed?.locale ?? sp.l;
  const name = offer ? (isBfLocale(locale) && offer.locales.includes(locale) ? offer.productName[locale] : offer.productName[offer.locales[0]]) : "Trilogia 2160";
  return { title: `Checkout · ${name} | Wine Portugal`, robots: { index: false, follow: false } };
}

type SP = Promise<Record<string, string | undefined>>;

/** Language and delivery country: those of a resumed order, else the ones the landing page passed (l, c), else the saved language. */
export default async function Checkout({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const resumed = sp.o && sp.t ? await loadDraft(sp.o, sp.t) : null;
  // Black Friday checkout: an order of its boxes, or a link from its page (?b=bf2).
  const offer = bfOfferFor(resumed ? resumed.bundleKey : sp.b);
  const bf = !!offer;
  const [catalog, settings, jar] = await Promise.all([offer ? getCatalog(offer.slug) : getCatalog(), getSettings(), cookies()]);
  const saved = jar.get(LOCALE_COOKIE)?.value;
  let locale: Locale = isLocale(resumed?.locale) ? resumed.locale : isLocale(sp.l) ? sp.l : isLocale(saved) ? saved : "pt";
  if (offer && !(isBfLocale(locale) && offer.locales.includes(locale))) locale = offer.locales.includes("de") ? "de" : offer.locales[0];
  const bfAll = offer ? bfOfferCountries(offer, (await getAdmin().catch(() => null)) ? settings.black_friday.countries : bfOpenCountries(settings.black_friday)) : [];
  // The Russian Cheda page is for the community in Germany: it delivers to Germany only.
  const bfCountries = offer && locale === "ru" ? bfAll.filter((c) => c === "DE") : bfAll;
  const open = bf ? bfCountries : await enabledCountries(settings);
  const wanted = isCountry(resumed?.country) ? resumed.country : isCountry(sp.c) ? sp.c : bf && isBfLocale(locale) ? bfCountryFor(locale) : defaultCountry(locale);
  const countries: Country[] = bf
    ? [...new Set([wanted, ...open])].filter((c) => open.includes(c) || c === wanted)
    : [...new Set([wanted, ...COUNTRIES_FOR_LOCALE[locale], ...open])].filter((c) => open.includes(c) || c === wanted);
  const bundles = (catalog?.bundles ?? []).map((b) => ({ key: b.key, label: b.label, qty: b.qty, priceCents: b.priceCents, compareAtCents: bf ? null : b.compareAtCents, shippingCents: b.shippingCents })); // Black Friday: no reference price
  const cutoffIso = bf ? settings.black_friday.cutoff_at : (settings.markets?.[wanted]?.cutoff_at ?? settings.cutoff_at);
  const cutoffLabel = dateFor(locale, cutoffIso).slice(0, 5);
  const deliveryDays = deliveryDaysFor(locale, bf ? settings.black_friday.delivery_days : (settings.markets?.[wanted]?.delivery_days ?? ""));
  const bfCopy = offer && isBfLocale(locale) ? bfCopyFor(offer.id, locale) : null;
  const product = offer && bfCopy && isBfLocale(locale)
    ? {
        bf: true,
        name: bfCopy.productName,
        image: bfCopy.images.hero,
        bottlesPerBox: offer.bottlesPerBox,
        defaultKey: bundles.find((b) => b.qty === 2)?.key ?? `${offer.prefix}2`,
        backHref: bfHref(locale, offer),
        trust: bfCopy.trust.map((l) => fmt(l, { days: deliveryDays, date: cutoffLabel })),
        banner: fmt(bfCopy.topBar, { date: cutoffLabel }),
      }
    : undefined;
  // Verified reviews with text (Admin → Reviews) first; the manual list in Settings only while there are none.
  const rv = await publicReviews(locale, 12).catch(() => ({ list: [] as Awaited<ReturnType<typeof publicReviews>>["list"] }));
  const verified = rv.list
    .filter((r) => r.text) // newest with text, good or bad: no cherry-picking
    .slice(0, 3)
    .map((r) => ({ name: r.name, text: r.text!, city: undefined, source: `${"★".repeat(r.rating)} · ${getDict(locale).review.verified}` }));
  return (
    <I18nProvider locale={locale} country={wanted} dict={getDict(locale)} guide={guideFor(settings, locale)}>
      {/* data-locale: the cookie banner (outside the provider) speaks the checkout's language, also on a resumed
          order (/retomar/<token> -> /checkout?o=&t=, no ?l= in the URL and maybe no language cookie on that device). */}
      <div lang={LOCALE_INFO[locale].htmlLang} data-locale={locale} style={{ display: "contents" }}>
      <CheckoutPage
        bundles={bundles}
        reviews={verified.length ? verified : locale === "pt" ? settings.reviews ?? [] : []}
        cutoffLabel={cutoffLabel}
        deliveryDays={deliveryDays}
        countries={countries}
        publishableKey={stripePublishableKey()}
        giftCardPrice={settings.gift_card?.enabled && !bf ? settings.gift_card.price_cents : null}
        product={product}
      />
      </div>
    </I18nProvider>
  );
}
