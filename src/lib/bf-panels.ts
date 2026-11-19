// Admin → Black Friday panels: the numbers of each offer as in David's panels (price with VAT and delivery, costs per
// box, 3% payment fee, 20% marketing, VAT of the delivery country), per country, and if every box sells.
import { BF_DOURO_ALIASES, BF_OFFERS, bfBoxCost, bfCostsFor, bfHref, type BfOfferId } from "./black-friday";
import type { Country } from "./markets";
import type { Settings } from "./settings-defaults";

export type CountryEconomics = { country: Country; vatPercent: number; vat: number; fee: number; marketing: number; costs: number; profit: number; margin: number };

/** One box at `price` cents (VAT included) delivered to a country. */
export function boxEconomics(price: number, costs: number, vatPercent: number, feePercent: number, marketingPercent: number, country: Country): CountryEconomics {
  const vat = price - price / (1 + vatPercent / 100);
  const fee = (price * feePercent) / 100;
  const marketing = (price * marketingPercent) / 100;
  const profit = price - vat - fee - marketing - costs;
  return { country, vatPercent, vat, fee, marketing, costs, profit, margin: price ? profit / price : 0 };
}

/** The ad shown for each offer and language (public/ads). */
export const BF_PANEL_ADS: Record<BfOfferId, Partial<Record<string, string>>> = {
  douro6: { de: "/ads/bf10_cheda_box_de_4x5.jpg", es: "/ads/bf9_box_es_50_4x5.jpg" },
  burbujas: { es: "/ads/bfs_es_dark_4x5.jpg" },
  poco: { es: "/ads/bfp_es_55_4x5.jpg" },
  pocoeu: { de: "/ads/bfq_poco_de_4x5.jpg", nl: "/ads/bfq_poco_nl_4x5.jpg", fr: "/ads/bfq_poco_fr_4x5.jpg" },
  galhofa: { nl: "/ads/bfg_galhofa_box_nl_4x5.jpg", fr: "/ads/bfg_galhofa_box_fr_4x5.jpg" },
  sekt: { de: "/ads/bfk_sekt_de_4x5.jpg" },
};

/** What each offer is, in the admin's words (the Douro box is two different wines by country). */
export const BF_PANEL_TITLE: Record<BfOfferId, string> = {
  douro6: "6 Douro wines · DE Cheda (Lavradores de Feitoria) · ES Galhofa",
  burbujas: "3 sparkling D. Graça Bruto · Spain",
  poco: "6 Poço do Canto Palhete 2019 · Spain",
  pocoeu: "6 Poço do Canto Palhete 2019 · Germany, Netherlands, Belgium",
  galhofa: "6 Galhofa (3 red, 2 white, 1 rosé) · Netherlands, Belgium",
  sekt: "3 sparkling D. Graça Bruto · Germany (Belgian warehouse)",
};

/** Page addresses of an offer: its own suffix in every language (and the main page for the Douro box). */
export function bfPanelLinks(id: BfOfferId): { locale: string; href: string }[] {
  const o = BF_OFFERS[id];
  return o.locales.map((l) => ({ locale: l, href: id === "douro6" && BF_DOURO_ALIASES[l] ? `/${l}/black-friday/${BF_DOURO_ALIASES[l]}` : bfHref(l, o) }));
}

export type Panel = {
  id: BfOfferId;
  title: string;
  links: { locale: string; href: string }[];
  ads: { locale: string; src: string }[];
  costs: ReturnType<typeof bfCostsFor>;
  boxCost: number;
  price: number | null;
  countries: CountryEconomics[];
  stock: number | null;
  /** If every box sells at the 1-box price: sales, marketing, profit (lowest and highest country). */
  ifAllSold: { sales: number; marketing: number; profitMin: number; profitMax: number } | null;
};

export function bfPanel(id: BfOfferId, s: Pick<Settings, "black_friday" | "cost_model">, price: number | null): Panel {
  const bf = s.black_friday;
  const o = BF_OFFERS[id];
  const fee = bf.fee_percent ?? 3;
  const mkt = bf.marketing_percent ?? 20;
  const boxCost = bfBoxCost(bf, id);
  const countries = price == null ? [] : o.countries.filter((c) => c !== "PT").map((c) => boxEconomics(price, boxCost, bf.vat_percent[c] ?? 21, fee, mkt, c));
  const stock = bf.stock?.[id] ?? null;
  const profits = countries.map((c) => c.profit);
  return {
    id,
    title: BF_PANEL_TITLE[id],
    links: bfPanelLinks(id),
    ads: Object.entries(BF_PANEL_ADS[id]).map(([locale, src]) => ({ locale, src: src! })),
    costs: bfCostsFor(bf, id),
    boxCost,
    price,
    countries,
    stock,
    ifAllSold: stock && price != null && profits.length ? { sales: stock * price, marketing: (stock * price * mkt) / 100, profitMin: stock * Math.min(...profits), profitMax: stock * Math.max(...profits) } : null,
  };
}
