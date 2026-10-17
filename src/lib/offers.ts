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

/** Labels in pt-PT: banner (card header), short (progress milestones), sentence. */
export function dealText(d: Deal) {
  if (d.paid) {
    return {
      banner: `PAGUE ${d.paid}, LEVE ${d.qty}`,
      small: d.free === 1 ? "1 CAIXA OFERECIDA" : `${d.free} CAIXAS OFERECIDAS`,
      short: `Pague ${d.paid}, leve ${d.qty}`,
      sentence: `Pague ${d.paid} caixas e leve ${d.qty}: ${d.free === 1 ? "uma é oferecida" : `${d.free} são oferecidas`}`,
    };
  }
  if (d.nextBoxCents != null) {
    const p = eurShort(d.nextBoxCents);
    return { banner: `2.ª CAIXA POR ${p.toUpperCase()}`, small: "ENVIO INCLUÍDO", short: `2.ª a ${p}`, sentence: `A 2.ª caixa fica por ${p}` };
  }
  if (d.percent > 0) return { banner: `${d.percent}% DE DESCONTO`, small: "ENVIO INCLUÍDO", short: `−${d.percent}%`, sentence: `${d.percent}% de desconto` };
  return { banner: "GUIA DE OFERTA", small: "Envio incluído", short: d.qty === 1 ? "1 caixa" : `${d.qty} caixas`, sentence: "" };
}
