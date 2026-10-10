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
  upsell_products: UpsellProduct[]; // offer 2 (shown if offer 1 is declined)
  reviews: Review[]; // only real customer reviews; empty = section hidden
};

export type UpsellProduct = { key: string; name: string; description: string; price_cents: number; compare_cents: number; active: boolean };
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
};

export const PER_BOX_FLOOR_CENTS = 3900;
