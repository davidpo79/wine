const fmt = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" });

/** 8490 -> "84,90 €" (pt-PT format). */
export function eur(cents: number): string {
  return fmt.format(cents / 100).replace(/ /g, " ");
}

/** 8490 -> "€84,90" (compact, ad-style). */
export function eurPrefix(cents: number): string {
  return "€" + (cents / 100).toFixed(2).replace(".", ",");
}

export function perBottleCents(priceCents: number, bottles: number): number {
  return Math.round(priceCents / bottles);
}

/** "84,90" or "84.90" -> 8490. Returns null if invalid. */
export function parseEuroToCents(input: string): number | null {
  const s = input.trim().replace(/€/g, "").replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}
