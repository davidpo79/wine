import { fmt } from "./i18n/rich";
import { pt, type Dict } from "./i18n/pt";

// Buy-and-get reading of the bundles: "pague 3, leve 4" when the price is a whole number of single boxes,
// "a 2.ª caixa por 40 €" for two boxes, a percentage otherwise. Shared by the landing page, checkout and upsell.

export type Deal = {
  qty: number;
  saving: number; // vs buying the boxes one by one
  percent: number;
  paid: number | null; // pay N, get qty
  free: number; // boxes offered
  nextBoxCents: number | null; // price of the 2nd box
};

export function dealOf(b: { qty: number; priceCents: number }, singleCents: number): Deal {
  const compare = singleCents * b.qty;
  const saving = Math.max(0, compare - b.priceCents);
  const percent = compare ? Math.round((saving / compare) * 100) : 0;
  let paid: number | null = null;
  let nextBoxCents: number | null = null;
  if (b.qty > 1 && singleCents > 0 && b.priceCents % singleCents === 0 && b.priceCents / singleCents < b.qty) paid = b.priceCents / singleCents;
  else if (b.qty === 2 && saving > 0) nextBoxCents = b.priceCents - singleCents;
  return { qty: b.qty, saving, percent, paid, free: paid ? b.qty - paid : 0, nextBoxCents };
}

/** 4000 -> "40 €", 3990 -> "39,90 €" (pt-PT). */
export function eurShort(cents: number): string {
  const s = cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2).replace(".", ",");
  return `${s} €`;
}

type DealCopy = Dict["deal"];

/** Labels: banner (card header), small (under it), short (milestones, chips), sentence. */
export function dealText(d: Deal, t: DealCopy = pt.deal, moneyShort: (c: number) => string = eurShort) {
  if (d.paid) {
    const v = { paid: d.paid, qty: d.qty, n: d.free };
    return {
      banner: fmt(t.payGetBanner, v),
      small: d.free === 1 ? t.payGetSmallOne : fmt(t.payGetSmallMany, v),
      short: fmt(t.payGetShort, v),
      sentence: fmt(d.free === 1 ? t.payGetSentenceOne : t.payGetSentenceMany, v),
    };
  }
  if (d.nextBoxCents != null) {
    const price = moneyShort(d.nextBoxCents);
    return { banner: fmt(t.nthBanner, { price: price.toUpperCase() }), small: t.deliverySmall, short: fmt(t.nthShort, { price }), sentence: fmt(t.nthSentence, { price }) };
  }
  if (d.percent > 0) return { banner: fmt(t.pctBanner, { pct: d.percent }), small: t.deliverySmall, short: fmt(t.pctShort, { pct: d.percent }), sentence: fmt(t.pctSentence, { pct: d.percent }) };
  return { banner: t.singleBanner, small: t.deliverySmall, short: d.qty === 1 ? "1" : String(d.qty), sentence: "" };
}
