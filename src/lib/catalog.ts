import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Bundle, Product } from "@/db/schema";
import type { Settings } from "./settings-defaults";
import { BF_PRODUCT_SLUG, isBfBundle } from "./black-friday";

export type Catalog = { product: Product; bundles: Bundle[] };

/** The Christmas Trilogia (the main shop), or with `slug` another product (the Black Friday box). */
export async function getCatalog(slug?: string): Promise<Catalog | null> {
  const [product] = await db
    .select()
    .from(schema.products)
    .where(and(eq(schema.products.active, true), slug ? eq(schema.products.slug, slug) : ne(schema.products.slug, BF_PRODUCT_SLUG)))
    .orderBy(asc(schema.products.id))
    .limit(1);
  if (!product) return null;
  const bundles = await db
    .select()
    .from(schema.bundles)
    .where(and(eq(schema.bundles.productId, product.id), eq(schema.bundles.active, true)))
    .orderBy(asc(schema.bundles.sort));
  return { product, bundles };
}

export const getBfCatalog = () => getCatalog(BF_PRODUCT_SLUG);

/** The catalog an order or a bundle key belongs to (Black Friday keys are bf1, bf2, bf3). */
export const catalogForBundle = (bundleKey: string | null | undefined) => (isBfBundle(bundleKey) ? getBfCatalog() : getCatalog());

/** Boxes in orders that are paid or further along (used for the optional stock cap). */
export async function paidBoxes(): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`coalesce(sum(${schema.orders.qtyBoxes}), 0)::int` })
    .from(schema.orders)
    .where(inArray(schema.orders.status, ["paid", "preparing", "shipped", "delivered"]));
  const [ad] = await db
    .select({ n: sql<number>`coalesce(sum(${schema.orderAddons.boxes}), 0)::int` })
    .from(schema.orderAddons)
    .where(eq(schema.orderAddons.status, "paid"));
  return (r?.n ?? 0) + (ad?.n ?? 0);
}

export type SalesState =
  | { mode: "open" }
  | { mode: "after_christmas" }
  | { mode: "closed"; reason: "manual" | "cutoff" }
  | { mode: "sold_out" };

export function salesState(s: Settings, boxesSold: number, now = new Date()): SalesState {
  if (!s.sales_open) return { mode: "closed", reason: "manual" };
  if (s.stock_cap_boxes != null && boxesSold >= s.stock_cap_boxes) return { mode: "sold_out" };
  if (now.getTime() > new Date(s.cutoff_at).getTime()) {
    return s.post_cutoff_mode === "after_christmas" ? { mode: "after_christmas" } : { mode: "closed", reason: "cutoff" };
  }
  return { mode: "open" };
}

export function canBuy(state: SalesState) {
  return state.mode === "open" || state.mode === "after_christmas";
}
