// Black Friday 2026 for Germany and Spain: a box of 6 Douro wines (3 red, 2 white, 1 rosé) from the Belgian warehouse,
// sold on its own page (/de/black-friday, /es/black-friday; since 18/11/2026 the German page sells the Cheda mix of
// Lavradores de Feitoria from the Belgian warehouse, the Spanish one the Galhofa mix) with its own product and bundles. Prices live in the
// bundles table (Admin → Products); dates, countries and costs in Settings.black_friday.
import type { Country, Locale } from "./markets";
import type { BlackFridaySettings } from "./settings-defaults";

export const BF_PRODUCT_SLUG = "black-friday-douro-6";
export const BF_BOTTLES_PER_BOX = 6;
/** Languages of the Black Friday pages: German and Spanish (all offers), Dutch and French (Poço do Canto for the Netherlands and Belgium, 18/11/2026). */
// Russian (19/11/2026): the Cheda page for the Russian-speaking community in Germany (delivery to Germany).
// Portuguese (20/11/2026): the Poço do Canto page for Portugal (past customers of the Portuguese shop).
export const BF_LOCALES = ["de", "es", "nl", "fr", "ru", "pt"] as const satisfies readonly Locale[];
export type BfLocale = (typeof BF_LOCALES)[number];
export const isBfLocale = (x: unknown): x is BfLocale => typeof x === "string" && (BF_LOCALES as readonly string[]).includes(x);

/**
 * The Black Friday offers. Each has its own product, bundles (prefix + qty: bf1, bfs2, bfp3...), page and costs; they
 * share the switch, cutoff, delivery days and VAT of Settings.black_friday. "douro6" is the original 6-bottle box (DE,
 * ES); the sparkling wine and Poço do Canto boxes (16/11/2026) sell in Spain; "pocoeu" (18/11/2026) is the Poço do Canto
 * box for Germany, the Netherlands and Belgium, from the Belgian warehouse, with its own prices (same page path).
 */
// "galhofa" (18/11/2026) is the Galhofa mix for the Netherlands and Belgium, with a reference price.
// "sekt" (19/11/2026) is the D. Graça sparkling box for Germany, from the Belgian warehouse (UPS).
// "chedade" (23/11/2026) is the same Cheda box for Germany at 55 € on its own page: a price test (David), Spain keeps 68,50 €.
export type BfOfferId = "douro6" | "burbujas" | "poco" | "pocoeu" | "galhofa" | "sekt" | "chedade";
export type BfOffer = {
  id: BfOfferId;
  slug: string;
  prefix: string;
  bottlesPerBox: number;
  /** Page path after /{locale}/black-friday ("" = the main page). */
  path: string;
  locales: readonly BfLocale[];
  /** Delivery countries it can sell to (while open in Settings → Black Friday). */
  countries: readonly Country[];
  contentName: string;
  productName: Partial<Record<BfLocale, string>>;
};
export const BF_OFFERS: Record<BfOfferId, BfOffer> = {
  douro6: { id: "douro6", slug: BF_PRODUCT_SLUG, prefix: "bf", bottlesPerBox: 6, path: "", locales: ["de", "es", "ru"], countries: ["DE", "ES", "PT"], contentName: "Black Friday 6 Douro", productName: { es: "Black Friday · 6 vinos del Douro", de: "Black Friday · 6 Cheda Douro-Weine", ru: "Black Friday · 6 вин Cheda из Дору" } },
  burbujas: { id: "burbujas", slug: "black-friday-espumoso-3", prefix: "bfs", bottlesPerBox: 3, path: "espumoso", locales: ["es"], countries: ["ES", "PT"], contentName: "Black Friday Espumoso D. Graca 3", productName: { es: "Black Friday · 3 espumosos D. Graça Bruto", de: "Black Friday · 3 D. Graça Sekt" } },
  poco: { id: "poco", slug: "black-friday-poco-do-canto-6", prefix: "bfp", bottlesPerBox: 6, path: "poco-do-canto", locales: ["es", "pt"], countries: ["ES", "PT"], contentName: "Black Friday Poco do Canto 6", productName: { es: "Black Friday · 6 Poço do Canto Palhete 2019", de: "Black Friday · 6 Poço do Canto Palhete 2019", pt: "Black Friday · 6 Poço do Canto Palhete 2019" } },
  galhofa: { id: "galhofa", slug: "black-friday-galhofa-mix-6", prefix: "bfg", bottlesPerBox: 6, path: "galhofa", locales: ["nl", "fr"], countries: ["NL", "BE"], contentName: "Black Friday Galhofa mix 6 NL BE", productName: { nl: "Black Friday · 6 Galhofa-wijnen uit de Douro", fr: "Black Friday · 6 vins Galhofa du Douro" } },
  sekt: { id: "sekt", slug: "black-friday-sekt-3-de", prefix: "bfk", bottlesPerBox: 3, path: "sekt", locales: ["de"], countries: ["DE"], contentName: "Black Friday Sekt D. Graca 3 DE", productName: { de: "Black Friday · 3 D. Graça Sekt" } },
  chedade: { id: "chedade", slug: "black-friday-cheda-6-de-55", prefix: "bfc", bottlesPerBox: 6, path: "cheda-55", locales: ["de"], countries: ["DE"], contentName: "Black Friday Cheda 6 DE 55", productName: { de: "Black Friday · 6 Cheda Douro-Weine" } },
  pocoeu: { id: "pocoeu", slug: "black-friday-poco-do-canto-6-eu", prefix: "bfq", bottlesPerBox: 6, path: "poco-do-canto", locales: ["de", "nl", "fr"], countries: ["DE", "NL", "BE"], contentName: "Black Friday Poco do Canto 6 DE NL BE", productName: { de: "Black Friday · 6 Poço do Canto Palhete 2019", nl: "Black Friday · 6 Poço do Canto Palhete 2019", fr: "Black Friday · 6 Poço do Canto Palhete 2019" } },
};
export const BF_OFFER_IDS = Object.keys(BF_OFFERS) as BfOfferId[];
/** Short names in the admin (Orders, Funnel filters). */
export const BF_OFFER_ADMIN_LABEL: Record<BfOfferId, string> = { douro6: "6 Douro wines (DE Cheda · ES Galhofa)", burbujas: "Sparkling ×3", poco: "Poço do Canto ×6 (ES)", pocoeu: "Poço do Canto ×6 (DE/NL/BE)", galhofa: "Galhofa mix ×6 (NL/BE)", sekt: "Sparkling ×3 (DE)", chedade: "Cheda ×6 at 55 € (DE test)" };
/** Admin funnel filter "bf:<offer>" → the offer (null for "bf", every Black Friday offer). */
export const bfOfferOfFilter = (f: string | null | undefined): BfOfferId | null => {
  const id = f?.startsWith("bf:") ? f.slice(3) : null;
  return id && id in BF_OFFERS ? (id as BfOfferId) : null;
};
export const BF_SLUGS = BF_OFFER_IDS.map((id) => BF_OFFERS[id].slug);
/**
 * Own address of every offer (David, 18/11/2026): the Douro box answers on its main page and also on /de/black-friday/cheda
 * and /es/black-friday/galhofa, so each ad can link to the name of its wine.
 */
export const BF_DOURO_ALIASES: Partial<Record<BfLocale, string>> = { de: "cheda", es: "galhofa", ru: "cheda" };

/** The offer of a page path, in a language (Poço do Canto has one page path for Spain and one offer for DE/NL/BE). */
export const bfOfferByPath = (path: string, locale?: BfLocale) => BF_OFFER_IDS.map((id) => BF_OFFERS[id]).find((o) => o.path && o.path === path && (!locale || o.locales.includes(locale))) ?? null;

/** Bundle keys of the Black Friday offers ("bf1", "bfs2", "bfp3"...); the Trilogia uses x1 / x2 / x4. */
export const isBfBundle = (key: string | null | undefined) => !!key && /^bf[a-z]?\d+$/.test(key);

/** The Black Friday offer a bundle key belongs to (null for the Trilogia). */
export function bfOfferFor(key: string | null | undefined): BfOffer | null {
  const m = key ? /^(bf[a-z]?)\d+$/.exec(key) : null;
  return m ? (BF_OFFER_IDS.map((id) => BF_OFFERS[id]).find((o) => o.prefix === m[1]) ?? null) : null;
}

/** Bottles in one box of the order's product. */
export const bottlesPerBox = (bundleKey: string | null | undefined) => bfOfferFor(bundleKey)?.bottlesPerBox ?? 3;

/**
 * Pricing of 29/10/2026: 68,50 € per box; 2 boxes 129 € (64,50 €/box), 3 boxes 185 € (61,67 €/box). Delivery included.
 * No reference ("usual") price: the box was never sold at one, and a struck-through price in a sale must be the lowest
 * price of the last 30 days (PAngV §11 / EU Omnibus). The page only compares 2 and 3 boxes with buying single boxes.
 */
export type BfBundleSeed = { key: string; label: string; qty: number; priceCents: number; compareAtCents: number | null; shippingCents: number; badge: string | null; sort: number };
export const BF_BUNDLES: BfBundleSeed[] = [
  { key: "bf1", label: "Black Friday · 1 caixa · 6 garrafas", qty: 1, priceCents: 6850, compareAtCents: null, shippingCents: 0, badge: null, sort: 11 },
  { key: "bf2", label: "Black Friday · 2 caixas · 12 garrafas", qty: 2, priceCents: 12900, compareAtCents: null, shippingCents: 0, badge: "Mais escolhido", sort: 12 },
  { key: "bf3", label: "Black Friday · 3 caixas · 18 garrafas", qty: 3, priceCents: 18500, compareAtCents: null, shippingCents: 0, badge: "Melhor preço", sort: 13 },
];

/**
 * Spain, 16/11/2026. Sparkling: 3 bottles of D. Graça Bruto 90 € with the reference price of the ad (180 €, David's
 * choice); Poço do Canto: 6 bottles 55 € with the reference price of its ad (90 €, David 16/11/2026). 2 and 3 boxes follow the Douro box's steps (about -6% and
 * -10% per box). Prices can be changed in Admin → Products.
 */
export const BF_OFFER_BUNDLES: Record<Exclude<BfOfferId, "douro6">, BfBundleSeed[]> = {
  burbujas: [
    { key: "bfs1", label: "Black Friday · Espumante D. Graça · 1 caixa · 3 garrafas", qty: 1, priceCents: 9000, compareAtCents: 18000, shippingCents: 0, badge: null, sort: 21 },
    { key: "bfs2", label: "Black Friday · Espumante D. Graça · 2 caixas · 6 garrafas", qty: 2, priceCents: 16900, compareAtCents: 36000, shippingCents: 0, badge: "Mais escolhido", sort: 22 },
    { key: "bfs3", label: "Black Friday · Espumante D. Graça · 3 caixas · 9 garrafas", qty: 3, priceCents: 23900, compareAtCents: 54000, shippingCents: 0, badge: "Melhor preço", sort: 23 },
  ],
  poco: [
    { key: "bfp1", label: "Black Friday · Poço do Canto · 1 caixa · 6 garrafas", qty: 1, priceCents: 5500, compareAtCents: 9000, shippingCents: 0, badge: null, sort: 31 },
    { key: "bfp2", label: "Black Friday · Poço do Canto · 2 caixas · 12 garrafas", qty: 2, priceCents: 10400, compareAtCents: 18000, shippingCents: 0, badge: "Mais escolhido", sort: 32 },
    { key: "bfp3", label: "Black Friday · Poço do Canto · 3 caixas · 18 garrafas", qty: 3, priceCents: 14900, compareAtCents: 27000, shippingCents: 0, badge: "Melhor preço", sort: 33 },
  ],
  // Germany, the Netherlands and Belgium (David, 18/11/2026): 60 € a box, 2 boxes 110 €, 3 boxes 159 €; reference price
  // 120 € a box as in his ad (his choice, flagged: PAngV §11 / Omnibus wants the lowest price of the last 30 days).
  // Galhofa mix for the Netherlands and Belgium (David, 18/11/2026): the Douro box prices with his reference price of
  // 137 € a box (-50%), as in his ad (his choice; Omnibus flagged).
  galhofa: [
    { key: "bfg1", label: "Black Friday · Galhofa NL/BE · 1 caixa · 6 garrafas", qty: 1, priceCents: 6850, compareAtCents: 13700, shippingCents: 0, badge: null, sort: 51 },
    { key: "bfg2", label: "Black Friday · Galhofa NL/BE · 2 caixas · 12 garrafas", qty: 2, priceCents: 12900, compareAtCents: 27400, shippingCents: 0, badge: "Mais escolhido", sort: 52 },
    { key: "bfg3", label: "Black Friday · Galhofa NL/BE · 3 caixas · 18 garrafas", qty: 3, priceCents: 18500, compareAtCents: 41100, shippingCents: 0, badge: "Melhor preço", sort: 53 },
  ],
  // Germany (David, 19/11/2026): 3 bottles of D. Graça Bruto from the Belgian warehouse, 90 € with the reference price of
  // his ad (180 €, his choice; Omnibus flagged); 2 and 3 boxes as in Spain.
  sekt: [
    { key: "bfk1", label: "Black Friday · Espumante D. Graça DE · 1 caixa · 3 garrafas", qty: 1, priceCents: 9000, compareAtCents: 18000, shippingCents: 0, badge: null, sort: 61 },
    { key: "bfk2", label: "Black Friday · Espumante D. Graça DE · 2 caixas · 6 garrafas", qty: 2, priceCents: 16900, compareAtCents: 36000, shippingCents: 0, badge: "Mais escolhido", sort: 62 },
    { key: "bfk3", label: "Black Friday · Espumante D. Graça DE · 3 caixas · 9 garrafas", qty: 3, priceCents: 23900, compareAtCents: 54000, shippingCents: 0, badge: "Melhor preço", sort: 63 },
  ],
  // Germany price test (David, 23/11/2026): the Cheda box at 55 €, his ad; 2 and 3 boxes as the Poço do Canto box in
  // Spain. No reference price (the box never sold at one).
  chedade: [
    { key: "bfc1", label: "Black Friday · Cheda DE 55 · 1 caixa · 6 garrafas", qty: 1, priceCents: 5500, compareAtCents: null, shippingCents: 0, badge: null, sort: 71 },
    { key: "bfc2", label: "Black Friday · Cheda DE 55 · 2 caixas · 12 garrafas", qty: 2, priceCents: 10400, compareAtCents: null, shippingCents: 0, badge: "Mais escolhido", sort: 72 },
    { key: "bfc3", label: "Black Friday · Cheda DE 55 · 3 caixas · 18 garrafas", qty: 3, priceCents: 14900, compareAtCents: null, shippingCents: 0, badge: "Melhor preço", sort: 73 },
  ],
  pocoeu: [
    { key: "bfq1", label: "Black Friday · Poço do Canto DE/NL/BE · 1 caixa · 6 garrafas", qty: 1, priceCents: 6000, compareAtCents: 12000, shippingCents: 0, badge: null, sort: 41 },
    { key: "bfq2", label: "Black Friday · Poço do Canto DE/NL/BE · 2 caixas · 12 garrafas", qty: 2, priceCents: 11000, compareAtCents: 24000, shippingCents: 0, badge: "Mais escolhido", sort: 42 },
    { key: "bfq3", label: "Black Friday · Poço do Canto DE/NL/BE · 3 caixas · 18 garrafas", qty: 3, priceCents: 15900, compareAtCents: 36000, shippingCents: 0, badge: "Melhor preço", sort: 43 },
  ],
};

/** Product id for Meta / GA4 events. */
export const contentIdFor = (bundleKey: string | null | undefined) => bfOfferFor(bundleKey)?.slug ?? "trilogia-2160";
export const contentNameFor = (bundleKey: string | null | undefined) => bfOfferFor(bundleKey)?.contentName ?? "Trilogia 2160";

/** Product name in customer-facing texts (emails, thank-you page). */
export const bfProductName = (locale: Locale, bundleKey?: string | null) => {
  const o = bfOfferFor(bundleKey) ?? BF_OFFERS.douro6;
  return (isBfLocale(locale) ? o.productName[locale] : undefined) ?? o.contentName;
};

export const bfHref = (locale: BfLocale, offer: BfOffer = BF_OFFERS.douro6) => `/${locale}/black-friday${offer.path ? `/${offer.path}` : ""}`;

/** Delivery countries an offer sells to (of the open Black Friday countries). */
/** Portugal too (16/11/2026, David): a Spanish-page buyer may send the box to a Portuguese address. */
export const bfOfferCountries = (offer: BfOffer, countries: readonly Country[]): Country[] => countries.filter((c) => offer.countries.includes(c));

/** Black Friday language for a delivery country (the page only speaks German and Spanish). */
export const bfLocaleFor = (country: string | null | undefined): BfLocale | null =>
  country === "ES" ? "es" : country === "DE" || country === "AT" || country === "LU" || country === "CH" ? "de" : country === "NL" || country === "BE" ? "nl" : null;

/** Default delivery country of a language (French: Belgium; the checkout lets the buyer pick the other countries). */
export const bfCountryFor = (locale: BfLocale): Country => (locale === "pt" ? "PT" : locale === "es" ? "ES" : locale === "nl" ? "NL" : locale === "fr" ? "BE" : "DE");

/** Countries taking Black Friday orders right now (none once switched off). */
// David, 26/11/2026: the pages never close on their own (no deadline, no country list); the only way to stop
// Black Friday orders is the "Black Friday orders open" switch in Admin → Settings. The deadline is shown only.
export const BF_ALL_COUNTRIES: Country[] = ["DE", "ES", "PT", "NL", "BE"];

export function bfOpenCountries(s: BlackFridaySettings): Country[] {
  return s.enabled ? [...new Set([...BF_ALL_COUNTRIES, ...s.countries])] : [];
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function bfOpen(s: BlackFridaySettings, _now = new Date()) {
  return s.enabled;
}

/** Costs of one box (cents, without recoverable VAT): wine, carton, transport to Belgium, handling, delivery. */
export function bfBoxCost(s: BlackFridaySettings, offer: BfOfferId = "douro6") {
  const c = bfCostsFor(s, offer);
  return c.wine_cents + c.shipping_box_cents + c.transport_cents + c.handling_cents + c.delivery_cents;
}

/** Costs of one box of an offer (the Douro box: Settings.black_friday.costs). */
export function bfCostsFor(s: BlackFridaySettings, offer: BfOfferId): BlackFridaySettings["costs"] {
  if (offer === "douro6") return s.costs;
  return { ...BF_DEFAULT_OFFER_COSTS[offer], ...(s.offer_costs?.[offer] ?? {}) };
}

/**
 * David, 16/11/2026, per box. Sparkling (3 bottles): wine 30 €, shipping box 3 €, delivery to Spain 10 €.
 * Poço do Canto (6 bottles): wine 15 €, shipping box 2,50 €, delivery to Spain 7 €.
 */
export const BF_DEFAULT_OFFER_COSTS: Record<Exclude<BfOfferId, "douro6">, BlackFridaySettings["costs"]> = {
  burbujas: { wine_cents: 3000, shipping_box_cents: 300, transport_cents: 0, handling_cents: 0, delivery_cents: 1000 },
  poco: { wine_cents: 1500, shipping_box_cents: 250, transport_cents: 0, handling_cents: 0, delivery_cents: 700 },
  // David, 18/11/2026 (DE/NL/BE from the Belgian warehouse): wine 12 €, transport to Belgium 2,50 €, box 2,50 €,
  // handling 2 €, delivery 8,50 € (confirmed for Germany, an estimate for NL and BE).
  // Galhofa mix to NL/BE (David, 18/11/2026): as the Douro box, 30,50 € (delivery 8,50 € is an estimate for NL and BE).
  galhofa: { wine_cents: 1500, shipping_box_cents: 250, transport_cents: 250, handling_cents: 200, delivery_cents: 850 },
  sekt: { wine_cents: 2100, shipping_box_cents: 250, transport_cents: 250, handling_cents: 200, delivery_cents: 850 }, // 3 × 7 € (Vinilourenço FCT 2026/786) + the Belgian warehouse costs
  pocoeu: { wine_cents: 1200, shipping_box_cents: 250, transport_cents: 250, handling_cents: 200, delivery_cents: 850 },
  chedade: { wine_cents: 1500, shipping_box_cents: 250, transport_cents: 250, handling_cents: 200, delivery_cents: 850 }, // the Cheda box to Germany (as douro6, 18/11/2026)
};
