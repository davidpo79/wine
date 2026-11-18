import type { Bundle, Order } from "@/db/schema";
import type { Settings } from "./settings-defaults";
import { dealOf } from "./offers";
import { getDict, moneyShortFor } from "./i18n";
import { fmt } from "./i18n/rich";
import { isCountry, isLocale, MARKETS } from "./markets";
import { BF_OFFERS, bfOfferFor, isBfBundle, isBfLocale, type BfOfferId } from "./black-friday";

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
export function productOffers(settings: Settings, order?: Pick<Order, "country"> & Partial<Pick<Order, "bundleKey">>): Offer[] {
  if (order && isCountry(order.country) && MARKETS[order.country].warehouse !== "douro") return [];
  // Black Friday orders sent to Portugal: not the Christmas extras (their prices are not the Black Friday ones).
  if (order && isBfBundle(order.bundleKey)) return [];
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

/**
 * Black Friday one-time offer after payment (Spain, 16/11/2026, prices approved by David): the other offer, from the
 * same warehouse and in the same parcel, below its page price. Douro box or Poço do Canto buyers: 3 sparkling for 69 €
 * (page: 90 €); sparkling buyers: the 6-bottle Douro box for 55 € (page: 68,50 €). No ads and no extra delivery on it.
 */
export const BF_CROSS_OFFERS: Record<BfOfferId, { to: BfOfferId; priceCents: number; compareCents: number }> = {
  douro6: { to: "burbujas", priceCents: 6900, compareCents: 9000 },
  poco: { to: "burbujas", priceCents: 6900, compareCents: 9000 },
  burbujas: { to: "douro6", priceCents: 5500, compareCents: 6850 },
  pocoeu: { to: "burbujas", priceCents: 6900, compareCents: 9000 }, // never used: the offer after payment is for Spanish orders only
};

const BF_CROSS_COPY: Record<BfOfferId, { title: string; label: string; description: string; image: string }> = {
  burbujas: {
    title: "3 espumosos D. Graça Bruto para las fiestas",
    label: "Black Friday · 3 espumosos D. Graça Bruto (oferta tras la compra)",
    description: "3 botellas de espumoso brut del Douro, para Navidad y Nochevieja. Llegan en la misma caja, sin gastos de envío.",
    image: "/lp/bf/espumoso-hero.webp",
  },
  douro6: {
    title: "La caja de 6 vinos del Douro",
    label: "Black Friday · 6 vinos del Douro (oferta tras la compra)",
    description: "3 tintos, 2 blancos y 1 rosado del Douro DOC. Llegan en el mismo envío, sin gastos de envío.",
    image: "/lp/bf/bottles-cut.webp",
  },
  poco: { title: "", label: "", description: "", image: "" },
  pocoeu: { title: "", label: "", description: "", image: "" },
};

/** The one-time offer shown after a Black Friday order is paid (Spanish orders only), else null. */
export function bfCrossOffer(order: Pick<Order, "bundleKey" | "country" | "locale">): Offer | null {
  const from = bfOfferFor(order.bundleKey);
  if (!from || order.country !== "ES" || !isBfLocale(order.locale) || order.locale !== "es") return null;
  const x = BF_CROSS_OFFERS[from.id];
  const to = BF_OFFERS[x.to];
  const c = BF_CROSS_COPY[x.to];
  return {
    key: `bfx-${to.id}`,
    kind: "product",
    sku: to.slug,
    title: c.title,
    label: c.label,
    description: c.description,
    priceCents: x.priceCents,
    compareCents: x.compareCents,
    boxes: 0, // not Trilogia boxes (those count for the Christmas stock cap)
    image: c.image,
    percentOff: Math.round(((x.compareCents - x.priceCents) / x.compareCents) * 100),
  };
}
