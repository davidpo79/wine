import type { Bundle, Order } from "@/db/schema";
import type { Settings } from "./settings-defaults";
import { dealOf, eurShort } from "./offers";

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
  percentOff: number;
};

/**
 * Offer 1: more Trilogia boxes, priced so the order reaches the next bundle's price
 * (1 -> 2 boxes: the 2nd box at x2 - x1; 2 -> 4: two more boxes at x4 - x2, "pague 3, leve 4").
 * At the top bundle: one more box at its per-box price.
 */
export function boxesOffer(order: Order, bundles: Bundle[]): Offer | null {
  const byQty = [...bundles].sort((a, b) => a.qty - b.qty);
  const current = byQty.find((b) => b.qty === order.qtyBoxes) ?? byQty.find((b) => b.key === order.bundleKey);
  if (!current) return null;
  const next = byQty.find((b) => b.qty > current.qty);
  const single = byQty.find((b) => b.qty === 1);
  const top = byQty[byQty.length - 1];
  const boxes = next ? next.qty - current.qty : 1;
  const price = next ? next.priceCents - current.priceCents : Math.round(top.priceCents / top.qty);
  const compare = (single?.priceCents ?? price) * boxes;
  if (price <= 0) return null;
  const pct = Math.round(((compare - price) / compare) * 100);
  const deal = next && single ? dealOf(next, single.priceCents) : null;
  const what = boxes === 1 ? "mais 1 caixa" : `mais ${boxes} caixas`;
  return {
    key: "boxes",
    kind: "boxes",
    sku: "trilogia-2160",
    title: deal?.paid ? `Pague ${deal.paid}, leve ${deal.qty}` : boxes === 1 ? `Mais uma caixa por ${eurShort(price)}` : `Mais ${boxes} caixas Trilogia 2160`,
    label: `Trilogia 2160 · ${what} (${boxes * 3} garrafas)`,
    description: deal?.paid
      ? `Junte ${what} por ${eurShort(price)} e fique com ${deal.qty} caixas ao preço de ${deal.paid}. Seguem na mesma entrega, sem custos de envio.`
      : next
        ? `Mais uma prenda resolvida: a ${next.qty}.ª caixa fica por ${eurShort(price)}. Segue na mesma entrega, sem custos de envio.`
        : `Mais uma caixa ao preço por caixa da opção de ${top.qty}. Segue na mesma entrega, sem custos de envio.`,
    priceCents: price,
    compareCents: compare,
    boxes,
    image: "/lp/box-cutout.webp",
    percentOff: pct,
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
      image: p.image || null,
      percentOff: p.compare_cents > p.price_cents ? Math.round(((p.compare_cents - p.price_cents) / p.compare_cents) * 100) : 0,
    }));
}

export function findOffer(key: string, order: Order, bundles: Bundle[], settings: Settings): Offer | null {
  if (key === "boxes") return boxesOffer(order, bundles);
  return productOffers(settings).find((o) => o.key === key) ?? null;
}
