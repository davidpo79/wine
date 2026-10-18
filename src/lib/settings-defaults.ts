import type { Country } from "./markets";

export type PostCutoffMode = "closed" | "after_christmas";

/** Per country: whether it takes orders, delivery time shown to customers ("2 a 4"; empty = not shown) and order cutoff. */
export type MarketSettings = { enabled: boolean; delivery_days: string; cutoff_at: string | null };

export type Settings = {
  cutoff_at: string; // ISO timestamp, interpreted as an instant
  sales_open: boolean;
  post_cutoff_mode: PostCutoffMode;
  announcement: string[];
  stock_cap_boxes: number | null;
  delivery_text: string;
  ebook_previews: string[]; // bucket keys of rasterized e-book pages
  ebook_locales: string[]; // translated editions offered to customers (Portuguese is always offered)
  ebook_files: Record<string, { uploaded_at: string; bytes: number; by: string }>; // last PDF upload per language
  exit_popup_enabled: boolean;
  lead_code: string; // discount code given in the exit popup
  lead_discount_percent: number;
  lead_code_max_qty: number; // code applies to bundles up to this many boxes
  lead_plus_code: string; // step 2 (mobile number): same discount + free shipping
  recovery_enabled: boolean; // abandoned-checkout follow-ups (message, AI call, final email)
  upsell_enabled: boolean;
  upsell_products: UpsellProduct[]; // shown with the one-time offer, before payment
  reviews: Review[]; // only real customer reviews; empty = section hidden
  reviews_enabled: boolean; // invitation email after delivery (verified reviews, Admin → Reviews)
  cost_model: CostModel; // per-order costs for the profit screen (Admin → Finance)
  gift_card: GiftCardSettings; // order bump in the checkout: printed Christmas card with the customer's message
  profit_split: ProfitSplit; // partnership split of the net profit (Admin → Finance); empty until agreed
  markets: Record<Country, MarketSettings>; // Portugal + Belgian-warehouse countries; cutoff_at null = the global cutoff
};

/** Net profit (after order costs, ads and other expenses) split between the two partners. null = not agreed yet. */
export type ProfitSplit = { my_name: string; partner_name: string; my_percent: number | null; min_per_box_cents: number | null };

export type GiftCardSettings = { enabled: boolean; price_cents: number; cost_cents: number; vat_percent: number };

/** All amounts in cents, excluding recoverable VAT. Edited in Admin → Finance. */
export type CostModel = {
  vat_percent: number; // VAT included in the customer price (wine 13%)
  wine_per_box_cents: number; // the 3 wines of one Trilogia box
  gift_box_cents: number; // one gift box per Trilogia box
  shipping_box_cents: number; // one shipping carton per parcel
  delivery_tiers: { max_boxes: number; cents: number }[]; // CTT cost by Trilogia boxes per parcel; above the last tier a new parcel starts
  payment_fees: Record<PaymentFeeKey, { percent: number; fixed_cents: number }>; // percent of the amount the customer pays
  other_per_order_cents: number; // anything else per order (labels, flyer...)
};
export type PaymentFeeKey = "card" | "mb_way" | "multibanco" | "other";

export type UpsellProduct = { key: string; name: string; description: string; price_cents: number; compare_cents: number; active: boolean; image?: string; cost_cents?: number };
export type Review = { name: string; city?: string; text: string; source?: string };

export const DEFAULT_SETTINGS: Settings = {
  // 30/11/2026 23:59 Europe/Lisbon (WET, UTC+0 in November)
  cutoff_at: "2026-11-30T23:59:00Z",
  sales_open: true,
  post_cutoff_mode: "closed",
  announcement: [
    "Entrega antes do Natal",
    "Encomendas até 30/11",
    "Envio incluído em todas as opções",
    "Pague 3, leve 4",
    "Livro de receitas oferecido",
  ],
  stock_cap_boxes: null,
  delivery_text: "Entrega em 2 a 4 dias úteis · Portugal Continental",
  ebook_previews: [],
  ebook_locales: [],
  ebook_files: {},
  exit_popup_enabled: true,
  lead_code: "NATAL5",
  lead_discount_percent: 5,
  lead_code_max_qty: 2,
  lead_plus_code: "NATALMAIS",
  recovery_enabled: true,
  upsell_enabled: true,
  upsell_products: [
    {
      key: "espumante-dgraca-bruto",
      name: "D. Graça Espumante Bruto",
      description: "Espumante do Douro, fresco e elegante, em caixa de oferta. Para brindar na passagem de ano.",
      price_cents: 1490,
      compare_cents: 1690,
      active: true,
      cost_cents: 700,
    },
    {
      key: "porto-vintage-2016-agua-alta",
      name: "Quinta da Água Alta Porto Vintage 2016",
      description: "Porto Vintage de 2016, um dos grandes anos do Douro, em caixa de oferta. Para fechar a ceia com queijos ou sobremesas.",
      price_cents: 1590,
      compare_cents: 1790,
      active: true,
      cost_cents: 900,
    },
  ],
  reviews: [],
  reviews_enabled: true,
  gift_card: { enabled: true, price_cents: 390, cost_cents: 50, vat_percent: 23 },
  // From David's profit calculation (10/10/2026). Payment fee: 3% of what the customer pays, for every method.
  profit_split: { my_name: "David", partner_name: "Partner", my_percent: null, min_per_box_cents: null },
  // Only Portugal sells until excise duties and VAT for the other countries are confirmed (17/10/2026).
  markets: {
    PT: { enabled: true, delivery_days: "2 a 4", cutoff_at: null },
    DE: { enabled: false, delivery_days: "", cutoff_at: null },
    NL: { enabled: false, delivery_days: "", cutoff_at: null },
    BE: { enabled: false, delivery_days: "", cutoff_at: null },
    LU: { enabled: false, delivery_days: "", cutoff_at: null },
  },
  cost_model: {
    vat_percent: 13,
    wine_per_box_cents: 1000,
    gift_box_cents: 80,
    shipping_box_cents: 230,
    // CTT Portugal, 2-day service: up to 8 kg (2 boxes, 6 bottles) 6,04 € (next day: 6,16 €). The cheapest split is used.
    delivery_tiers: [
      { max_boxes: 2, cents: 604 },
      { max_boxes: 3, cents: 1100 },
    ],
    // Price lists (18/10/2026), without recoverable VAT: Stripe EEA cards, ifthenpay MB WAY / Multibanco.
    payment_fees: {
      card: { percent: 1.5, fixed_cents: 25 },
      mb_way: { percent: 0.7, fixed_cents: 7 },
      multibanco: { percent: 1.5, fixed_cents: 20 },
      other: { percent: 3, fixed_cents: 0 },
    },
    other_per_order_cents: 0,
  },
};

// Lowest average price per box (protects the B2B channel). 4 boxes for 149,70 € = 37,43 €/box (pricing of 17/10/2026).
export const PER_BOX_FLOOR_CENTS = 3700;
