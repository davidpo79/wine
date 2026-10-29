// Black Friday 2026 for Germany and Spain: a box of 6 Douro wines (3 red, 2 white, 1 rosé) from the Belgian warehouse,
// sold on its own page (/de/black-friday, /es/black-friday) with its own product and bundles. Prices live in the
// bundles table (Admin → Products); dates, countries and costs in Settings.black_friday.
import type { Country, Locale } from "./markets";
import type { BlackFridaySettings } from "./settings-defaults";

export const BF_PRODUCT_SLUG = "black-friday-douro-6";
export const BF_BOTTLES_PER_BOX = 6;
export const BF_LOCALES = ["de", "es"] as const satisfies readonly Locale[];
export type BfLocale = (typeof BF_LOCALES)[number];
export const isBfLocale = (x: unknown): x is BfLocale => x === "de" || x === "es";

/** Bundle keys of the Black Friday product ("bf1", "bf2", "bf3"); the Trilogia uses x1 / x2 / x4. */
export const isBfBundle = (key: string | null | undefined) => !!key && /^bf\d+$/.test(key);

/** Bottles in one box of the order's product. */
export const bottlesPerBox = (bundleKey: string | null | undefined) => (isBfBundle(bundleKey) ? BF_BOTTLES_PER_BOX : 3);

/** Pricing of 29/10/2026: 68,50 € per box; 2 boxes 129 € (64,50 €/box), 3 boxes 185 € (61,67 €/box). Delivery included. */
export const BF_BUNDLES = [
  { key: "bf1", label: "Black Friday · 1 caixa · 6 garrafas", qty: 1, priceCents: 6850, compareAtCents: 14000, shippingCents: 0, badge: null, sort: 11 },
  { key: "bf2", label: "Black Friday · 2 caixas · 12 garrafas", qty: 2, priceCents: 12900, compareAtCents: 28000, shippingCents: 0, badge: "Mais escolhido", sort: 12 },
  { key: "bf3", label: "Black Friday · 3 caixas · 18 garrafas", qty: 3, priceCents: 18500, compareAtCents: 42000, shippingCents: 0, badge: "Melhor preço", sort: 13 },
];

/** Product id for Meta / GA4 events. */
export const contentIdFor = (bundleKey: string | null | undefined) => (isBfBundle(bundleKey) ? BF_PRODUCT_SLUG : "trilogia-2160");
export const contentNameFor = (bundleKey: string | null | undefined) => (isBfBundle(bundleKey) ? "Black Friday 6 Douro" : "Trilogia 2160");

/** Product name in customer-facing texts (emails, thank-you page). */
export const bfProductName = (locale: Locale) => (locale === "es" ? "Black Friday · 6 vinos del Douro" : locale === "de" ? "Black Friday · 6 Douro-Weine" : "Black Friday · 6 Douro wines");

export const bfHref = (locale: BfLocale) => `/${locale}/black-friday`;

/** Black Friday language for a delivery country (the page only speaks German and Spanish). */
export const bfLocaleFor = (country: string | null | undefined): BfLocale | null => (country === "ES" ? "es" : country === "DE" || country === "AT" || country === "LU" || country === "CH" ? "de" : null);

export const bfCountryFor = (locale: BfLocale): Country => (locale === "es" ? "ES" : "DE");

/** Countries taking Black Friday orders right now (none once switched off). */
export function bfOpenCountries(s: BlackFridaySettings): Country[] {
  return s.enabled ? s.countries : [];
}

export function bfOpen(s: BlackFridaySettings, now = new Date()) {
  return s.enabled && now.getTime() <= new Date(s.cutoff_at).getTime();
}

/** Costs of one box (cents, without recoverable VAT): wine, carton, transport to Belgium, handling, delivery. */
export function bfBoxCost(s: BlackFridaySettings) {
  const c = s.costs;
  return c.wine_cents + c.shipping_box_cents + c.transport_cents + c.handling_cents + c.delivery_cents;
}
