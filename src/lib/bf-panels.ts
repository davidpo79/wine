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

/** The ads running for each offer (public/ads), as in Meta on 22/11/2026. */
export const BF_PANEL_ADS: Record<BfOfferId, { locale: string; src: string; label: string }[]> = {
  douro6: [
    { locale: "es", src: "/ads/bf7_galhofa_es_2711_4x5.jpg", label: "Galhofa box v7 (the winner of 6–10/11, relaunched 21/11)" },
    { locale: "es", src: "/ads/bf7_galhofa_video_es_2711_4x5.jpg", label: "Galhofa harvest video v7" },
    { locale: "de", src: "/ads/bf10_cheda_box_de_4x5.jpg", label: "Cheda box · paused" },
  ],
  burbujas: [
    { locale: "es", src: "/ads/bfs_es_dark_4x5.jpg", label: "Dark · 90 € instead of 180 €" },
    { locale: "es", src: "/ads/bfs_es_cream_4x5.jpg", label: "Cream · 90 € instead of 180 €" },
  ],
  poco: [
    { locale: "es", src: "/ads/bf12_poco_es_new3_55_4x5.jpg", label: "3 boxes · 55 €" },
    { locale: "es", src: "/ads/bf12_poco_es_new2_55_4x5.jpg", label: "Fireplace · 55 €" },
    { locale: "es", src: "/ads/bf12_poco_es_fixed_55.jpg", label: "Wood · 55 €" },
    { locale: "es", src: "/ads/bf13_poco_es_new3_55_9x16.jpg", label: "3 boxes · story 9:16" },
    { locale: "es", src: "/ads/bfp_es_55_4x5.jpg", label: "Barrels · 55 € (first ad)" },
  ],
  pocoeu: [
    { locale: "nl", src: "/ads/bf12_poco_winner_nl_4x5.jpg", label: "Winner style · 60 € · NL + BE" },
    { locale: "fr", src: "/ads/bf12_poco_winner_fr_4x5.jpg", label: "Winner style · 60 € · BE (FR)" },
    { locale: "nl", src: "/ads/bfq_poco_nl_4x5.jpg", label: "1 / 2 boxes · 60 € / 110 € · BE (NL)" },
    { locale: "fr", src: "/ads/bfq_poco_fr_4x5.jpg", label: "1 / 2 boxes · 60 € / 110 € · BE (FR)" },
    { locale: "de", src: "/ads/bf12_poco_winner_de_4x5.jpg", label: "Germany · paused" },
  ],
  galhofa: [
    { locale: "nl", src: "/ads/bfg_galhofa_box_nl_4x5.jpg", label: "Box · NL · paused" },
    { locale: "fr", src: "/ads/bfg_galhofa_box_fr_4x5.jpg", label: "Box · BE (FR) · paused" },
  ],
  sekt: [{ locale: "de", src: "/ads/bf13_sekt_winner_de_4x5.jpg", label: "Winner style · paused" }],
  chedade: [
    { locale: "de", src: "/ads/bfc_cheda_de_55_gold.jpg", label: "Cheda · 55 € · gold (price test)" },
    { locale: "de", src: "/ads/bfc_cheda_de_55_dark.jpg", label: "Cheda · 55 € · dark (price test)" },
  ],
};

/** Meta campaigns per offer on 22/11/2026: status and daily budget (spend and purchases are in Ads Manager). */
export const BF_PANEL_CAMPAIGNS: Record<BfOfferId, { country: string; active: boolean; budget: number; note?: string }[]> = {
  douro6: [
    { country: "ES", active: true, budget: 50, note: "Galhofa, own campaign since 21/11" },
    { country: "DE", active: false, budget: 60, note: "paused 21/11 (cost per sale too high)" },
  ],
  burbujas: [{ country: "ES", active: true, budget: 0, note: "inside the main Spain campaign (250 €/day shared)" }],
  poco: [{ country: "ES", active: true, budget: 250, note: "main Spain campaign, shared with the sparkling" }],
  pocoeu: [
    { country: "BE", active: true, budget: 250 },
    { country: "NL", active: true, budget: 100 },
    { country: "DE", active: false, budget: 60, note: "paused 21/11" },
  ],
  galhofa: [
    { country: "NL", active: false, budget: 100, note: "its only ad paused 20/11 (197 € for 1 sale), spends nothing" },
    { country: "BE", active: false, budget: 100, note: "paused 21/11, budget moved to Poço BE" },
  ],
  sekt: [{ country: "DE", active: false, budget: 40, note: "paused 21/11" }],
  chedade: [{ country: "DE", active: true, budget: 25, note: "price test from 23/11: Cheda at 55 € instead of 68,50 €" }],
};

/** What each offer is, in the admin's words (the Douro box is two different wines by country). */
export const BF_PANEL_TITLE: Record<BfOfferId, string> = {
  douro6: "6 Douro wines · DE Cheda (Lavradores de Feitoria) · ES Galhofa",
  burbujas: "3 sparkling D. Graça Bruto · Spain",
  poco: "6 Poço do Canto Palhete 2019 · Spain",
  pocoeu: "6 Poço do Canto Palhete 2019 · Germany, Netherlands, Belgium",
  galhofa: "6 Galhofa (3 red, 2 white, 1 rosé) · Netherlands, Belgium",
  sekt: "3 sparkling D. Graça Bruto · Germany (Belgian warehouse)",
  chedade: "6 Cheda (3 red, 2 white, 1 rosé) at 55 € · Germany price test (Belgian warehouse)",
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
  ads: { locale: string; src: string; label: string }[];
  campaigns: (typeof BF_PANEL_CAMPAIGNS)[BfOfferId];
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
    ads: BF_PANEL_ADS[id],
    campaigns: BF_PANEL_CAMPAIGNS[id],
    costs: bfCostsFor(bf, id),
    boxCost,
    price,
    countries,
    stock,
    ifAllSold: stock && price != null && profits.length ? { sales: stock * price, marketing: (stock * price * mkt) / 100, profitMin: stock * Math.min(...profits), profitMax: stock * Math.max(...profits) } : null,
  };
}
