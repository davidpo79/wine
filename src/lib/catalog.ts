import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Bundle, Product } from "@/db/schema";
import type { Settings } from "./settings-defaults";

export type Catalog = { product: Product; bundles: Bundle[] };

export async function getCatalog(): Promise<Catalog | null> {
  const [product] = await db
    .select()
    .from(schema.products)
    .where(eq(schema.products.active, true))
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

/** Boxes in orders that are paid or further along (used for the optional stock cap). */
export async function paidBoxes(): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`coalesce(sum(${schema.orders.qtyBoxes}), 0)::int` })
    .from(schema.orders)
    .where(inArray(schema.orders.status, ["paid", "preparing", "shipped", "delivered"]));
  return r?.n ?? 0;
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
