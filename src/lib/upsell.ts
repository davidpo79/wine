import type { Bundle, Order } from "@/db/schema";
import type { Settings } from "./settings-defaults";

export type Offer = {
  key: string; // "boxes" or an upsell product key
  kind: "boxes" | "product";
  sku: string;
  title: string;
  label: string; // stored on the add-on row / shown in emails
  description: string;
  priceCents: number;
  compareCents: number;
  boxes: number;
  image: string | null;
};

/**
 * Offer 1: one more Trilogia box, priced so the order reaches the next tier's price
 * (1 -> 2 boxes: x2 - x1; 2 -> 3: x3 - x2; at 3: the 3-box per-box price). Never below the per-box floor on average.
 */
export function boxesOffer(order: Order, bundles: Bundle[]): Offer | null {
  const byQty = [...bundles].sort((a, b) => a.qty - b.qty);
  const current = byQty.find((b) => b.qty === order.qtyBoxes) ?? byQty.find((b) => b.key === order.bundleKey);
  if (!current) return null;
  const next = byQty.find((b) => b.qty === current.qty + 1);
  const single = byQty.find((b) => b.qty === 1);
  const top = byQty[byQty.length - 1];
  const price = next ? next.priceCents - current.priceCents : Math.round(top.priceCents / top.qty);
  const compare = single?.priceCents ?? price;
  if (price <= 0) return null;
  const pct = Math.round(((compare - price) / compare) * 100);
  return {
    key: "boxes",
    kind: "boxes",
    sku: "trilogia-2160",
    title: current.qty === 1 ? "Mais uma prenda resolvida?" : current.qty === 2 ? "Complete as 3 caixas" : "Mais uma caixa para a lista?",
    label: "Trilogia 2160 · mais 1 caixa (3 garrafas)",
    description:
      current.qty === 1
        ? `Junte mais uma caixa à sua encomenda e fica com o preço de 2 caixas (${pct}% de desconto na segunda). Mais uma prenda resolvida, na mesma entrega.`
        : current.qty === 2
          ? `Passe para 3 caixas e fica com o preço de 3 caixas (${pct}% de desconto nesta caixa). Segue na mesma entrega, sem portes.`
          : `Mais uma caixa ao mesmo preço por caixa da opção de 3 (${pct}% de desconto). Segue na mesma entrega, sem portes.`,
    priceCents: price,
    compareCents: compare,
    boxes: 1,
    image: "/lp/giftbox-768.webp",
  };
}

export function productOffers(settings: Settings): Offer[] {
  return settings.upsell_products
    .filter((p) => p.active && p.price_cents > 0)
    .map((p) => ({
      key: p.key,
      kind: "product" as const,
      sku: p.key,
      title: p.name,
      label: p.name,
      description: p.description,
      priceCents: p.price_cents,
      compareCents: p.compare_cents,
      boxes: 0,
      image: null,
    }));
}

export function findOffer(key: string, order: Order, bundles: Bundle[], settings: Settings): Offer | null {
  if (key === "boxes") return boxesOffer(order, bundles);
  return productOffers(settings).find((o) => o.key === key) ?? null;
}
