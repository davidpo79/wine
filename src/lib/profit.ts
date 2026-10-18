// Per-order profit and the daily P&L (Admin → Finance). All amounts in cents.
// Model (David, 10/10/2026): revenue includes VAT; costs exclude recoverable VAT.
//   profit = paid - VAT - wine - gift boxes - shipping cartons - delivery - payment fees - add-on costs - other
import { and, gte, inArray, isNotNull, lte, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Expense, Order, OrderAddon } from "@/db/schema";
import type { CostModel, PaymentFeeKey, ProfitSplit, Settings } from "./settings-defaults";

export type OrderCosts = {
  paid: number; // what the customer paid (order + paid add-ons)
  vat: number;
  net: number; // paid - vat
  wine: number;
  gift_boxes: number;
  shipping_boxes: number;
  delivery: number;
  payment_fees: number;
  products: number; // cost of non-Trilogia add-ons (espumante, porto, printed gift card...)
  other: number;
  costs: number; // all costs except VAT
  profit: number;
  boxes: number;
  parcels: number;
};

/**
 * Cheapest way to pack n Trilogia boxes into parcels with the CTT price rows (e.g. 4 boxes = 2 + 2, not 3 + 1).
 * Each row is "up to max_boxes per parcel costs cents"; a parcel of p boxes costs the first row that fits it.
 */
function cheapestSplit(boxes: number, tiers: CostModel["delivery_tiers"]) {
  const sorted = [...tiers].sort((a, b) => a.max_boxes - b.max_boxes);
  const max = sorted.at(-1)?.max_boxes ?? 3;
  const parcelCost = (p: number) => sorted.find((t) => p <= t.max_boxes)?.cents ?? sorted.at(-1)?.cents ?? 0;
  const n = Math.max(1, boxes);
  const best: { cost: number; parcels: number[] }[] = [{ cost: 0, parcels: [] }];
  for (let i = 1; i <= n; i++) {
    let pick = { cost: Infinity, parcels: [] as number[] };
    for (let p = 1; p <= Math.min(max, i); p++) {
      const c = best[i - p].cost + parcelCost(p);
      // Same price: fewer parcels (fewer shipping cartons).
      if (c < pick.cost || (c === pick.cost && best[i - p].parcels.length + 1 < pick.parcels.length)) pick = { cost: c, parcels: [...best[i - p].parcels, p] };
    }
    best[i] = pick;
  }
  return best[n];
}

/** Parcels needed for n Trilogia boxes, split the cheapest way. */
export function parcelsFor(boxes: number, tiers: CostModel["delivery_tiers"]) {
  return cheapestSplit(boxes, tiers).parcels.sort((a, b) => b - a);
}

export function deliveryCost(boxes: number, tiers: CostModel["delivery_tiers"]) {
  return cheapestSplit(boxes, tiers).cost;
}

export function feeKey(paymentMethodType: string | null | undefined): PaymentFeeKey {
  const m = paymentMethodType ?? "";
  if (m.startsWith("card") || m === "wallet") return "card";
  if (m === "mb_way") return "mb_way";
  if (m === "multibanco") return "multibanco";
  return "other";
}

/**
 * Costs of one paid order. `payments` = number of separate charges (order + each post-purchase add-on charged on its own),
 * so the fixed part of the payment fee is counted per charge.
 */
export function computeOrderCosts(
  order: Pick<Order, "totalCents" | "qtyBoxes" | "paymentMethodType">,
  addons: Pick<OrderAddon, "amountCents" | "boxes" | "kind" | "sku">[],
  settings: Pick<Settings, "cost_model" | "upsell_products"> & Partial<Pick<Settings, "gift_card">>,
  payments = 1,
): OrderCosts {
  const m = settings.cost_model;
  const paid = order.totalCents + addons.reduce((n, a) => n + a.amountCents, 0);
  // The printed card is not wine: its VAT rate is its own (23% by default).
  const card = addons.filter((a) => a.kind === "card").reduce((n, a) => n + a.amountCents, 0);
  const cardVat = settings.gift_card?.vat_percent ?? m.vat_percent;
  const vatExact = paid - card - (paid - card) / (1 + m.vat_percent / 100) + (card - card / (1 + cardVat / 100));
  const vat = Math.round(vatExact);
  const boxes = order.qtyBoxes + addons.reduce((n, a) => n + (a.boxes ?? 0), 0);
  const parcels = parcelsFor(boxes, m.delivery_tiers).length;
  const fee = m.payment_fees[feeKey(order.paymentMethodType)] ?? m.payment_fees.other;
  const productCost =
    addons.filter((a) => a.kind === "product").reduce((n, a) => n + (settings.upsell_products.find((p) => p.key === a.sku)?.cost_cents ?? 0), 0) +
    addons.filter((a) => a.kind === "card").length * (settings.gift_card?.cost_cents ?? 0);
  const parts = {
    wine: boxes * m.wine_per_box_cents,
    gift_boxes: boxes * m.gift_box_cents,
    shipping_boxes: parcels * m.shipping_box_cents,
    delivery: deliveryCost(boxes, m.delivery_tiers),
    payment_fees: (paid * fee.percent) / 100 + fee.fixed_cents * payments,
    products: productCost,
    other: m.other_per_order_cents,
  };
  // Exact until the end, then rounded (matches the spreadsheet: 24,29 / 40,70 / 54,37).
  const costs = Object.values(parts).reduce((n, v) => n + v, 0);
  return { paid, vat, net: paid - vat, ...parts, payment_fees: Math.round(parts.payment_fees), costs: Math.round(costs), profit: Math.round(paid - vatExact - costs), boxes, parcels };
}

const PAID = ["paid", "preparing", "shipped", "delivered"] as const;

/** Recomputes and stores the cost snapshot of one order (called when it is paid and when an add-on is paid). */
export async function snapshotCosts(orderId: string, settings: Pick<Settings, "cost_model" | "upsell_products"> & Partial<Pick<Settings, "gift_card">>) {
  const [o] = await db.select().from(schema.orders).where(sql`${schema.orders.id} = ${orderId}`).limit(1);
  if (!o) return null;
  const addons = await db.select().from(schema.orderAddons).where(and(sql`${schema.orderAddons.orderId} = ${orderId}`, sql`${schema.orderAddons.status} = 'paid'`));
  const separate = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.payments)
    .where(and(sql`${schema.payments.orderId} = ${orderId}`, isNotNull(schema.payments.addonId), sql`${schema.payments.status} = 'paid'`));
  const stripeAddons = addons.filter((a) => a.stripePaymentIntentId).length;
  const c = computeOrderCosts(o, addons, settings, 1 + (separate[0]?.n ?? 0) + stripeAddons);
  await db.update(schema.orders).set({ costs: c }).where(sql`${schema.orders.id} = ${orderId}`);
  return c;
}

export async function resnapshotAll(settings: Pick<Settings, "cost_model" | "upsell_products"> & Partial<Pick<Settings, "gift_card">>) {
  const rows = await db.select({ id: schema.orders.id }).from(schema.orders).where(inArray(schema.orders.status, [...PAID]));
  for (const r of rows) await snapshotCosts(r.id, settings);
  return rows.length;
}

// ---- Daily P&L ------------------------------------------------------------------------------------

export type DayRow = {
  day: string; // YYYY-MM-DD Lisbon
  orders: number;
  boxes: number;
  paid: number;
  vat: number;
  net: number;
  product: number; // wine + gift boxes + add-on products
  shipping: number; // cartons + delivery
  fees: number;
  other: number;
  before_ads: number; // order profit before advertising and other expenses
  ads: number; // advertising spend (expense categories ads_*)
  expenses: number; // other expenses
  profit: number; // order profit - ads - expenses
};

export const isAdCategory = (c: string) => c.startsWith("ads_");

export const lisbonDay = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Europe/Lisbon" });

function eachDay(from: string, to: string) {
  const out: string[] = [];
  const d = new Date(`${from}T12:00:00Z`);
  const end = new Date(`${to}T12:00:00Z`);
  while (d <= end && out.length < 800) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** Share of each expense falling on each day (ranges are spread evenly). */
export function expensesByDay(list: Pick<Expense, "date" | "endDate" | "amountCents">[], from: string, to: string) {
  const map = new Map<string, number>();
  for (const e of list) {
    const days = eachDay(e.date, e.endDate && e.endDate >= e.date ? e.endDate : e.date);
    const per = e.amountCents / days.length;
    for (const d of days) if (d >= from && d <= to) map.set(d, (map.get(d) ?? 0) + per);
  }
  return map;
}

export async function dailyPnl(from: string, to: string, settings: Settings) {
  // Paid orders by Lisbon payment day (a day window with 1 day of margin on each side, filtered after conversion).
  const start = new Date(`${from}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 1);
  const end = new Date(`${to}T23:59:59Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  const orders = await db
    .select()
    .from(schema.orders)
    .where(and(inArray(schema.orders.status, [...PAID]), isNotNull(schema.orders.paidAt), gte(schema.orders.paidAt, start), lte(schema.orders.paidAt, end)));
  const missing = orders.filter((o) => !o.costs);
  for (const o of missing) o.costs = (await snapshotCosts(o.id, settings)) as unknown as Record<string, number>;

  const exps = await db
    .select()
    .from(schema.expenses)
    .where(or(and(gte(schema.expenses.date, from), lte(schema.expenses.date, to)), and(lte(schema.expenses.date, to), gte(schema.expenses.endDate, from))));
  const adsMap = expensesByDay(exps.filter((e) => isAdCategory(e.category)), from, to);
  const expMap = expensesByDay(exps.filter((e) => !isAdCategory(e.category)), from, to);

  const rows = new Map<string, DayRow>();
  for (const day of eachDay(from, to)) rows.set(day, { day, orders: 0, boxes: 0, paid: 0, vat: 0, net: 0, product: 0, shipping: 0, fees: 0, other: 0, before_ads: 0, ads: Math.round(adsMap.get(day) ?? 0), expenses: Math.round(expMap.get(day) ?? 0), profit: 0 });
  for (const o of orders) {
    const r = rows.get(lisbonDay(o.paidAt!));
    if (!r) continue;
    const c = o.costs as unknown as OrderCosts;
    r.orders += 1;
    r.boxes += c.boxes;
    r.paid += c.paid;
    r.vat += c.vat;
    r.net += c.net;
    r.product += c.wine + c.gift_boxes + c.products;
    r.shipping += c.shipping_boxes + c.delivery;
    r.fees += c.payment_fees;
    r.other += c.other;
    r.before_ads += c.profit;
  }
  const list = [...rows.values()].map((r) => ({ ...r, profit: r.before_ads - r.ads - r.expenses }));
  const total = list.reduce(
    (t, r) => {
      for (const k of Object.keys(t) as (keyof typeof t)[]) t[k] += r[k];
      return t;
    },
    { orders: 0, boxes: 0, paid: 0, vat: 0, net: 0, product: 0, shipping: 0, fees: 0, other: 0, before_ads: 0, ads: 0, expenses: 0, profit: 0 },
  );
  // Ad spend by platform in the period (ranges counted only for the days inside the period).
  const byPlatform = new Map<string, number>();
  for (const e of exps.filter((x) => isAdCategory(x.category))) {
    const m = expensesByDay([e], from, to);
    byPlatform.set(e.category, (byPlatform.get(e.category) ?? 0) + [...m.values()].reduce((n, v) => n + v, 0));
  }
  return { days: list.reverse(), total, expenses: exps, adsByPlatform: [...byPlatform.entries()].map(([k, v]) => ({ category: k, cents: Math.round(v) })) };
}

/**
 * Partner split of a net profit (cents) over a period. My part = my % of the profit, never below the minimum per box
 * (if agreed); a loss is not shared (my part is then only the minimum). The partner gets the rest. null = not agreed yet.
 */
export function splitProfit(profit: number, boxes: number, split: ProfitSplit | undefined) {
  if (!split || split.my_percent == null) return null;
  const share = Math.round((Math.max(0, profit) * split.my_percent) / 100);
  const floor = (split.min_per_box_cents ?? 0) * boxes;
  const mine = Math.max(share, floor);
  return { mine, partner: profit - mine, floorApplied: floor > share };
}
