// Belgian warehouse on ShipHero (David, 18/11/2026). Orders delivered to Germany, the Netherlands and Belgium
// (the only countries the Belgian warehouse ships to) are created in ShipHero as soon as they are paid, and again from the
// admin if that failed. ShipHero's "Shipment Update" webhook (app/api/webhooks/shiphero) brings the tracking back:
// the order becomes "shipped" and the customer gets the email with the tracking link.
//
// Railway variables: SHIPHERO_REFRESH_TOKEN (Third-Party Developer user: ShipHero → Dashboard → Users → Add
// Third-Party Developer), optionally SHIPHERO_ACCESS_TOKEN (its bearer token, saves the first refresh),
// SHIPHERO_CUSTOMER_ACCOUNT_ID (only when the warehouse is a 3PL acting for us), SHIPHERO_WAREHOUSE_ID (to pin a
// warehouse) and SHIPHERO_WEBHOOK_SECRET (the shared_signature_secret printed by `npx tsx scripts/shiphero.ts webhooks`).
// API: https://developer.shiphero.com (GraphQL at /graphql, tokens at /auth; access tokens last 28 days).
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Order } from "@/db/schema";
import { bfOfferFor } from "./black-friday";
import { MARKETS, isCountry } from "./markets";
import type { Settings, ShipheroItemKey } from "./settings-defaults";

const API = process.env.SHIPHERO_API_URL ?? "https://public-api.shiphero.com";

export const shipheroConfigured = () => !!process.env.SHIPHERO_REFRESH_TOKEN || !!process.env.SHIPHERO_ACCESS_TOKEN;

/**
 * Orders the Belgian warehouse ships: delivery to DE, NL or BE (not LU). Spain is still "belgium" in MARKETS (the first Black
 * Friday plan) but its parcels leave from Lisbon with CTT (lib/fulfilment), so it never goes to ShipHero.
 */
export const SHIPHERO_COUNTRIES = ["DE", "NL", "BE"] as const; // the warehouse ships to these three only (David, 18/11/2026)
export const isBelgianOrder = (o: Pick<Order, "country">) => isCountry(o.country) && MARKETS[o.country].warehouse === "belgium" && (SHIPHERO_COUNTRIES as readonly string[]).includes(o.country);

export const SHIPHERO_ITEM_LABEL: Record<ShipheroItemKey, string> = {
  cheda_mix_6: "Cheda mix · 6 bottles (3 red, 2 white, 1 rosé)",
  galhofa_mix_6: "Galhofa mix · 6 bottles (3 red, 2 white, 1 rosé)",
  poco_6: "Poço do Canto Palhete 2019 · 6 bottles",
  dgraca_3: "D. Graça Espumante Bruto · 3 bottles",
  trilogia_2160: "Trilogia 2160 Christmas box · 3 bottles",
  dgraca_trio_3: "D. Graça & Galhofa Christmas box · 3 bottles (D. Graça red, D. Graça white, Galhofa rosé)",
};

/** What the warehouse picks for an order: one line per box type, quantity = boxes. */
export function shipheroItemsFor(o: Pick<Order, "bundleKey" | "qtyBoxes" | "country">): { key: ShipheroItemKey; qty: number }[] {
  const offer = bfOfferFor(o.bundleKey);
  const key: ShipheroItemKey = !offer
    ? "trilogia_2160"
    : offer.id === "pocoeu" || offer.id === "poco"
      ? "poco_6"
      : offer.id === "galhofa"
        ? "galhofa_mix_6"
        : offer.id === "xmasde"
          ? "trilogia_2160" // the Christmas box for Germany (19/11/2026)
          : offer.id === "xmasnlbe"
            ? "dgraca_trio_3" // the D. Graça & Galhofa Christmas box for the Netherlands and Belgium
            : offer.id === "burbujas" || offer.id === "sekt"
          ? "dgraca_3"
          : o.country === "ES" || o.country === "PT"
            ? "galhofa_mix_6" // the Douro box: Galhofa in Spain, Cheda from the Belgian warehouse (18/11/2026)
            : "cheda_mix_6";
  return [{ key, qty: o.qtyBoxes }];
}

// --- tokens -------------------------------------------------------------------------------------------------------

type Token = { access_token: string; expires_at: number };
let memo: Token | null = null;

async function storedToken(): Promise<Token | null> {
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, "shiphero_token"));
  return (row?.value as Token | undefined) ?? null;
}

/** Access token: cached (memory, then the settings table), refreshed with the refresh token a day before it expires. */
export async function shipheroToken(force = false): Promise<string> {
  const now = Date.now();
  if (!force && memo && memo.expires_at - 86_400_000 > now) return memo.access_token;
  if (!force) {
    const t = await storedToken();
    if (t && t.expires_at - 86_400_000 > now) return (memo = t).access_token;
    if (!t && process.env.SHIPHERO_ACCESS_TOKEN && !process.env.SHIPHERO_REFRESH_TOKEN) return process.env.SHIPHERO_ACCESS_TOKEN;
  }
  const refresh = process.env.SHIPHERO_REFRESH_TOKEN;
  if (!refresh) {
    if (process.env.SHIPHERO_ACCESS_TOKEN) return process.env.SHIPHERO_ACCESS_TOKEN;
    throw new Error("ShipHero is not connected: set SHIPHERO_REFRESH_TOKEN in Railway.");
  }
  const r = await fetch(`${API}/auth/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: refresh }) });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; message?: string };
  if (!r.ok || !j.access_token) throw new Error(`ShipHero token refresh failed (${r.status}): ${j.error ?? j.message ?? "no access_token"}`);
  memo = { access_token: j.access_token, expires_at: now + (j.expires_in ?? 2_419_200) * 1000 };
  await db.insert(schema.settings).values({ key: "shiphero_token", value: memo }).onConflictDoUpdate({ target: schema.settings.key, set: { value: memo } });
  return memo.access_token;
}

// --- GraphQL ------------------------------------------------------------------------------------------------------

export class ShipheroError extends Error {}

/** One GraphQL call; waits and retries once when the credit quota is short (error code 30) or the token expired. */
export async function shipheroGql<T>(query: string, variables: Record<string, unknown> = {}, retry = true): Promise<T> {
  const r = await fetch(`${API}/graphql`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${await shipheroToken()}` }, body: JSON.stringify({ query, variables }) });
  if (r.status === 401 && retry) {
    await shipheroToken(true);
    return shipheroGql(query, variables, false);
  }
  const j = (await r.json().catch(() => ({}))) as { data?: T; errors?: { message: string; code?: number; time_remaining?: string }[] };
  const err = j.errors?.[0];
  if (err?.code === 30 && retry) {
    const secs = Math.min(30, Number(String(err.time_remaining ?? "3").replace(/\D/g, "")) || 3);
    await new Promise((res) => setTimeout(res, secs * 1000));
    return shipheroGql(query, variables, false);
  }
  if (!r.ok || err || !j.data) throw new ShipheroError(err?.message ?? `ShipHero HTTP ${r.status}`);
  return j.data;
}

/**
 * ShipHero refuses customer_account_id: null ("Invalid customer_account_id"), so the argument is only declared and sent
 * when SHIPHERO_CUSTOMER_ACCOUNT_ID is set (a 3PL account acting for us).
 */
export function customerArg(): { decl: string; arg: string; vars: Record<string, string> } {
  const cid = process.env.SHIPHERO_CUSTOMER_ACCOUNT_ID?.trim();
  return cid ? { decl: ", $cid: String", arg: "customer_account_id: $cid", vars: { cid } } : { decl: "", arg: "", vars: {} };
}

const customer = () => (process.env.SHIPHERO_CUSTOMER_ACCOUNT_ID ? { customer_account_id: process.env.SHIPHERO_CUSTOMER_ACCOUNT_ID } : {});

/** The warehouse's products (SKU, name, stock), to map each box type to its SKU in the admin. */
export async function shipheroProducts(): Promise<{ sku: string; name: string; onHand: number | null }[]> {
  const c = customerArg();
  const q = `query${c.decl ? `(${c.decl.slice(2)})` : ""} { products${c.arg ? `(${c.arg})` : ""} { data(first: 100) { edges { node { sku name warehouse_products { on_hand } } } } } }`;
  const d = await shipheroGql<{ products: { data: { edges: { node: { sku: string; name: string; warehouse_products?: { on_hand: number }[] } }[] } } }>(q, c.vars);
  return d.products.data.edges.map(({ node: n }) => ({ sku: n.sku, name: n.name, onHand: n.warehouse_products?.reduce((s, w) => s + (w.on_hand ?? 0), 0) ?? null }));
}

/** An order already in ShipHero (retries after a timeout must not create it twice). */
async function findShipheroOrder(orderNumber: string): Promise<string | null> {
  const c = customerArg();
  const q = `query($n: String${c.decl}) { orders(order_number: $n${c.arg ? `, ${c.arg}` : ""}) { data(first: 1) { edges { node { id } } } } }`;
  const d = await shipheroGql<{ orders: { data: { edges: { node: { id: string } }[] } } }>(q, { n: orderNumber, ...c.vars });
  return d.orders.data.edges[0]?.node.id ?? null;
}

const euros = (c: number) => (c / 100).toFixed(2);

/** The order_create input for one of our orders (exported for the tests). */
export function shipheroOrderInput(o: Order, s: Pick<Settings, "shiphero">) {
  const a = o.shippingAddress ?? {};
  const name = (a.name ?? o.customerName ?? "").trim();
  const [first, ...rest] = name.split(/\s+/);
  const country = (a.country ?? o.country ?? "").toUpperCase();
  const address = { first_name: first ?? "", last_name: rest.join(" ") || first || "", address1: a.line1 ?? "", address2: a.line2 ?? "", city: a.city ?? "", state: a.state ?? "", zip: a.postal_code ?? "", country, country_code: country, email: o.email ?? "", phone: o.phone ?? "" };
  const items = shipheroItemsFor(o);
  const missing = items.filter((i) => !s.shiphero.skus[i.key]).map((i) => SHIPHERO_ITEM_LABEL[i.key]);
  if (missing.length) throw new ShipheroError(`No ShipHero SKU for ${missing.join(", ")} (Admin → Settings → ShipHero).`);
  const lineTotal = Math.round(o.totalCents / Math.max(1, items.reduce((n, i) => n + i.qty, 0)));
  const warehouse = process.env.SHIPHERO_WAREHOUSE_ID || s.shiphero.warehouse_id;
  return {
    ...customer(),
    order_number: o.id,
    partner_order_id: o.id,
    shop_name: s.shiphero.shop_name,
    fulfillment_status: "pending",
    order_date: (o.paidAt ?? o.createdAt).toISOString().slice(0, 10),
    total_price: euros(o.totalCents),
    subtotal: euros(o.totalCents),
    total_tax: "0.00",
    total_discounts: "0.00",
    email: o.email ?? "",
    shipping_lines: { title: "Free shipping", price: "0.00", carrier: "UPS", method: "Standard" },
    shipping_address: address,
    billing_address: address,
    line_items: items.map((i, n) => ({
      sku: s.shiphero.skus[i.key]!,
      partner_line_item_id: `${o.id}-${n + 1}`,
      quantity: i.qty,
      price: euros(lineTotal),
      product_name: SHIPHERO_ITEM_LABEL[i.key],
      fulfillment_status: "pending",
      quantity_pending_fulfillment: i.qty,
      ...(warehouse ? { warehouse_id: warehouse } : {}),
    })),
  };
}

/** Creates the order in ShipHero (once: an existing order with our number is reused) and records it as the shipment. */
export async function pushOrderToShiphero(o: Order, s: Pick<Settings, "shiphero">): Promise<{ shipheroId: string; existed: boolean }> {
  const input = shipheroOrderInput(o, s);
  let id = await findShipheroOrder(o.id);
  const existed = !!id;
  if (!id) {
    const m = `mutation($data: CreateOrderInput!) { order_create(data: $data) { request_id order { id order_number } } }`;
    const d = await shipheroGql<{ order_create: { order: { id: string } } }>(m, { data: input });
    id = d.order_create.order.id;
  }
  const values = { provider: "shiphero", carrierName: "ShipHero · Belgium", objects: [id], error: null, updatedAt: new Date() };
  const [prev] = await db.select().from(schema.shipments).where(eq(schema.shipments.orderId, o.id));
  if (prev) await db.update(schema.shipments).set(values).where(eq(schema.shipments.id, prev.id));
  else await db.insert(schema.shipments).values({ orderId: o.id, ...values });
  return { shipheroId: id, existed };
}

// --- webhooks -----------------------------------------------------------------------------------------------------

/** x-shiphero-hmac-sha256 = base64(HMAC-SHA256(secret, raw body)). */
export function validShipheroSignature(raw: string, signature: string | null, secret: string | string[] | undefined = process.env.SHIPHERO_WEBHOOK_SECRET) {
  const secrets = (Array.isArray(secret) ? secret : [secret]).filter((x): x is string => !!x);
  if (!secrets.length || !signature) return false;
  const got = Buffer.from(signature.trim());
  return secrets.some((k) => {
    const want = Buffer.from(createHmac("sha256", k).update(raw, "utf8").digest("base64"));
    return want.length === got.length && timingSafeEqual(want, got);
  });
}

const WEBHOOK_SECRETS_KEY = "shiphero_webhook_secrets";
export const SHIPHERO_WEBHOOKS = ["Shipment Update", "Order Canceled"] as const;

/** Secrets that may sign ShipHero webhooks: SHIPHERO_WEBHOOK_SECRET and those saved by "Connect shipping updates". */
export async function shipheroWebhookSecrets(): Promise<string[]> {
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, WEBHOOK_SECRETS_KEY));
  const saved = (row?.value as string[] | undefined) ?? [];
  return [process.env.SHIPHERO_WEBHOOK_SECRET, ...saved].filter((x): x is string => !!x);
}

/** The registered webhooks of the account (name, url). */
export async function shipheroWebhooks(): Promise<{ name: string; url: string }[]> {
  const c = customerArg();
  const d = await shipheroGql<{ webhooks: { data: { edges: { node: { name: string; url: string } }[] } } }>(
    `query${c.decl ? `(${c.decl.slice(2)})` : ""} { webhooks${c.arg ? `(${c.arg})` : ""} { data(first: 50) { edges { node { name url } } } } }`,
    c.vars,
  );
  return d.webhooks.data.edges.map((e) => e.node);
}

/**
 * Registers "Shipment Update" and "Order Canceled" on <site>/api/webhooks/shiphero (re-creating ours if present) and
 * keeps their shared_signature_secret in the settings table, so nobody has to copy it anywhere.
 */
export async function connectShipheroWebhooks(site: string, shopName: string): Promise<number> {
  const url = `${site.replace(/\/$/, "")}/api/webhooks/shiphero`;
  const cid = process.env.SHIPHERO_CUSTOMER_ACCOUNT_ID;
  const extra = cid ? { customer_account_id: cid } : {};
  const existing = await shipheroWebhooks();
  const secrets: string[] = [];
  for (const name of SHIPHERO_WEBHOOKS) {
    if (existing.some((w) => w.name === name)) {
      await shipheroGql(`mutation($data: DeleteWebhookInput!) { webhook_delete(data: $data) { request_id } }`, { data: { name, shop_name: shopName, ...extra } });
    }
    const d = await shipheroGql<{ webhook_create: { webhook: { shared_signature_secret: string } } }>(
      `mutation($data: CreateWebhookInput!) { webhook_create(data: $data) { webhook { shared_signature_secret } } }`,
      { data: { name, url, shop_name: shopName, ...extra } },
    );
    secrets.push(d.webhook_create.webhook.shared_signature_secret);
  }
  const value = [...new Set(secrets.filter(Boolean))];
  await db.insert(schema.settings).values({ key: WEBHOOK_SECRETS_KEY, value }).onConflictDoUpdate({ target: schema.settings.key, set: { value } });
  return SHIPHERO_WEBHOOKS.length;
}

export type ShipheroShipment = { orderNumber: string; trackingNumber: string | null; trackingUrl: string | null; carrier: string | null; method: string | null; packages: number };

/** The parts of a "Shipment Update" body we use (the packages array has the accurate tracking per package). */
export function parseShipmentUpdate(body: unknown): ShipheroShipment | null {
  const b = body as { fulfillment?: { order_number?: string; partner_order_id?: string; tracking_number?: string; custom_tracking_url?: string; shipping_carrier?: string; shipping_method?: string; total_packages?: number }; packages?: { shipping_label?: { tracking_number?: string; tracking_url?: string; shipping_carrier?: string; shipping_method?: string } }[]; total_packages?: number };
  const f = b?.fulfillment;
  const orderNumber = f?.partner_order_id || f?.order_number;
  if (!orderNumber) return null;
  const label = b.packages?.find((p) => p.shipping_label?.tracking_number)?.shipping_label;
  return {
    orderNumber,
    trackingNumber: label?.tracking_number || f?.tracking_number || null,
    trackingUrl: label?.tracking_url || f?.custom_tracking_url || null,
    carrier: label?.shipping_carrier || f?.shipping_carrier || null,
    method: label?.shipping_method || f?.shipping_method || null,
    packages: b.total_packages ?? f?.total_packages ?? 1,
  };
}

/** UPS tracking page when ShipHero sends no tracking URL. */
export const upsTrackingUrl = (n: string) => `https://www.ups.com/track?tracknum=${encodeURIComponent(n)}`;
