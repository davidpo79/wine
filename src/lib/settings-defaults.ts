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
};

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
};

export const PER_BOX_FLOOR_CENTS = 3900;
