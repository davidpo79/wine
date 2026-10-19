import { publicReviews } from "@/lib/reviews";
import type { Metadata } from "next";
import { guideFor } from "@/lib/ebook";
import { cookies } from "next/headers";
import { getCatalog } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { CheckoutPage } from "@/components/checkout/CheckoutPage";
import { stripePublishableKey } from "@/lib/stripe";
import { I18nProvider } from "@/lib/i18n/client";
import { dateFor, getDict } from "@/lib/i18n";
import { LOCALE_COOKIE } from "@/lib/i18n/paths";
import { loadDraft } from "@/lib/draft";
import { COUNTRIES_FOR_LOCALE, defaultCountry, isCountry, isLocale, type Country, type Locale } from "@/lib/markets";
import { enabledCountries } from "@/lib/visitor";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Checkout · Trilogia 2160 | Wine Portugal", robots: { index: false, follow: false } };

type SP = Promise<Record<string, string | undefined>>;

/** Language and delivery country: those of a resumed order, else the ones the landing page passed (l, c), else the saved language. */
export default async function Checkout({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const [catalog, settings, jar] = await Promise.all([getCatalog(), getSettings(), cookies()]);
  const resumed = sp.o && sp.t ? await loadDraft(sp.o, sp.t) : null;
  const saved = jar.get(LOCALE_COOKIE)?.value;
  const locale: Locale = isLocale(resumed?.locale) ? resumed.locale : isLocale(sp.l) ? sp.l : isLocale(saved) ? saved : "pt";
  const open = await enabledCountries(settings);
  const wanted = isCountry(resumed?.country) ? resumed.country : isCountry(sp.c) ? sp.c : defaultCountry(locale);
  const countries: Country[] = [...new Set([wanted, ...COUNTRIES_FOR_LOCALE[locale], ...open])].filter((c) => open.includes(c) || c === wanted);
  const bundles = (catalog?.bundles ?? []).map((b) => ({ key: b.key, label: b.label, qty: b.qty, priceCents: b.priceCents, compareAtCents: b.compareAtCents, shippingCents: b.shippingCents }));
  const cutoffIso = settings.markets?.[wanted]?.cutoff_at ?? settings.cutoff_at;
  const cutoffLabel = dateFor(locale, cutoffIso).slice(0, 5);
  // Verified reviews with text (Admin → Reviews) first; the manual list in Settings only while there are none.
  const rv = await publicReviews(locale, 12).catch(() => ({ list: [] as Awaited<ReturnType<typeof publicReviews>>["list"] }));
  const verified = rv.list
    .filter((r) => r.text) // newest with text, good or bad: no cherry-picking
    .slice(0, 3)
    .map((r) => ({ name: r.name, text: r.text!, city: undefined, source: `${"★".repeat(r.rating)} · ${getDict(locale).review.verified}` }));
  return (
    <I18nProvider locale={locale} country={wanted} dict={getDict(locale)} guide={guideFor(settings, locale)}>
      <CheckoutPage
        bundles={bundles}
        reviews={verified.length ? verified : locale === "pt" ? settings.reviews ?? [] : []}
        cutoffLabel={cutoffLabel}
        deliveryDays={settings.markets?.[wanted]?.delivery_days ?? ""}
        countries={countries}
        publishableKey={stripePublishableKey()}
        giftCardPrice={settings.gift_card?.enabled ? settings.gift_card.price_cents : null}
      />
    </I18nProvider>
  );
}
