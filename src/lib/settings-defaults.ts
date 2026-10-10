export type PostCutoffMode = "closed" | "after_christmas";

export type Settings = {
  cutoff_at: string; // ISO timestamp, interpreted as an instant
  sales_open: boolean;
  post_cutoff_mode: PostCutoffMode;
  announcement: string[];
  stock_cap_boxes: number | null;
  delivery_text: string;
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
};

export const PER_BOX_FLOOR_CENTS = 3900;
