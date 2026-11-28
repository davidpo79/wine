import { and, asc, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Bundle, Product } from "@/db/schema";
import type { Settings } from "./settings-defaults";
import { BF_OFFERS, BF_SLUGS, bfOfferFor, type BfOfferId } from "./black-friday";

export type Catalog = { product: Product; bundles: Bundle[] };

/** The Christmas Trilogia (the main shop), or with `slug` another product (the Black Friday box). */
export async function getCatalog(slug?: string): Promise<Catalog | null> {
  const [product] = await db
    .select()
    .from(schema.products)
    .where(and(eq(schema.products.active, true), slug ? eq(schema.products.slug, slug) : notInArray(schema.products.slug, BF_SLUGS)))
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

export const getBfCatalog = (offer: BfOfferId = "douro6") => getCatalog(BF_OFFERS[offer].slug);

/** The catalog an order or a bundle key belongs to (Black Friday keys: bf1, bfs2, bfp3...; see BF_OFFERS). */
export const catalogForBundle = (bundleKey: string | null | undefined) => {
  const offer = bfOfferFor(bundleKey);
  return offer ? getCatalog(offer.slug) : getCatalog();
};

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
    // David (28/11/2026): the deadline never closes the shop on its own; only the switch in Admin → Settings does.
    // After the deadline the page keeps selling (with the "after Christmas" notice when that mode is chosen).
    return s.post_cutoff_mode === "after_christmas" ? { mode: "after_christmas" } : { mode: "open" };
  }
  return { mode: "open" };
}

export function canBuy(state: SalesState) {
  return state.mode === "open" || state.mode === "after_christmas";
}
