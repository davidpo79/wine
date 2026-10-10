export type PostCutoffMode = "closed" | "after_christmas";

export type Settings = {
  cutoff_at: string; // ISO timestamp, interpreted as an instant
  sales_open: boolean;
  post_cutoff_mode: PostCutoffMode;
  announcement: string[];
  stock_cap_boxes: number | null;
  delivery_text: string;
  ebook_previews: string[]; // bucket keys of rasterized e-book pages
  exit_popup_enabled: boolean;
  lead_code: string; // discount code given in the exit popup
  lead_discount_percent: number;
  lead_code_max_qty: number; // code applies to bundles up to this many boxes
  lead_plus_code: string; // step 2 (mobile number): same discount + free shipping
  recovery_enabled: boolean; // abandoned-checkout follow-ups (message, AI call, final email)
  upsell_enabled: boolean;
  upsell_products: UpsellProduct[]; // shown with the one-time offer, before payment
  reviews: Review[]; // only real customer reviews; empty = section hidden
  cost_model: CostModel; // per-order costs for the profit screen (Admin → Finance)
  gift_card: GiftCardSettings; // order bump in the checkout: printed Christmas card with the customer's message
};

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
    "Portes grátis a partir de 2 caixas",
    "Livro de receitas oferecido",
  ],
  stock_cap_boxes: null,
  delivery_text: "Entrega em 2 a 4 dias úteis · Portugal Continental",
  ebook_previews: [],
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
    },
    {
      key: "porto-vintage-2016-agua-alta",
      name: "Quinta da Água Alta Porto Vintage 2016",
      description: "Porto Vintage de 2016, um dos grandes anos do Douro, em caixa de oferta. Para fechar a ceia com queijos ou sobremesas.",
      price_cents: 1590,
      compare_cents: 1790,
      active: true,
    },
  ],
  reviews: [],
  gift_card: { enabled: true, price_cents: 390, cost_cents: 0, vat_percent: 23 },
  // From David's profit calculation (10/10/2026). Payment fee: 3% of what the customer pays, for every method.
  cost_model: {
    vat_percent: 13,
    wine_per_box_cents: 1000,
    gift_box_cents: 80,
    shipping_box_cents: 230,
    delivery_tiers: [
      { max_boxes: 2, cents: 604 },
      { max_boxes: 3, cents: 1100 },
    ],
    payment_fees: {
      card: { percent: 3, fixed_cents: 0 },
      mb_way: { percent: 3, fixed_cents: 0 },
      multibanco: { percent: 3, fixed_cents: 0 },
      other: { percent: 3, fixed_cents: 0 },
    },
    other_per_order_cents: 0,
  },
};

export const PER_BOX_FLOOR_CENTS = 3900;
