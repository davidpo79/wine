import type { Bundle, Order } from "@/db/schema";
import type { Settings } from "./settings-defaults";
import { dealOf } from "./offers";
import { getDict, moneyShortFor } from "./i18n";
import { fmt } from "./i18n/rich";
import { isCountry, isLocale, MARKETS } from "./markets";
import { isBfBundle } from "./black-friday";

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
  // Black Friday boxes: the 1 / 2 / 3 box choice is the offer, nothing is added on top.
  if (isBfBundle(order.bundleKey)) return null;
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
  const locale = isLocale(order.locale) ? order.locale : "pt";
  const t = getDict(locale).upsell;
  const p = moneyShortFor(locale)(price);
  const what = boxes === 1 ? t.whatOne : fmt(t.whatMany, { n: boxes });
  return {
    key: "boxes",
    kind: "boxes",
    sku: "trilogia-2160",
    title: deal?.paid ? fmt(t.boxesPayGetTitle, { paid: deal.paid, qty: deal.qty }) : boxes === 1 ? fmt(t.boxesOneTitle, { price: p }) : fmt(t.boxesManyTitle, { n: boxes }),
    // The label is stored on the add-on row and read by the team (admin, shipping list): always Portuguese.
    label: fmt(getDict("pt").upsell.boxesLabel, { what: boxes === 1 ? getDict("pt").upsell.whatOne : fmt(getDict("pt").upsell.whatMany, { n: boxes }), bottles: boxes * 3 }),
    description: deal?.paid
      ? fmt(t.boxesPayGetText, { what, price: p, qty: deal.qty, paid: deal.paid })
      : next
        ? fmt(t.boxesNextText, { n: next.qty, price: p })
        : fmt(t.boxesTopText, { n: top.qty }),
    priceCents: price,
    compareCents: compare,
    boxes,
    image: "/lp/box-cutout.webp",
    percentOff: pct,
  };
}

/** Extra wines from the Portuguese stock: offered for orders shipped from the Douro only. */
export function productOffers(settings: Settings, order?: Pick<Order, "country">): Offer[] {
  if (order && isCountry(order.country) && MARKETS[order.country].warehouse !== "douro") return [];
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
  return productOffers(settings, order).find((o) => o.key === key) ?? null;
}
