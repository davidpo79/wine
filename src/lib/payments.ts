// Payment attempts and their outcome (ifthenpay). Fulfilment only happens here, from a server-side signal:
// the anti-phishing-checked callback, the MB WAY status endpoint, the HMAC-signed card return, or reconciliation.
import { and, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import type Stripe from "stripe";
import { db, schema } from "@/db";
import type { Order, OrderAddon, Payment } from "@/db/schema";
import { logOrderEvent, setStatus } from "./orders";
import { sendAddonConfirmation, sendAdminAlert, sendConfirmation, sendPending, sendPaymentIssueAlert } from "./email";
import { logFunnel, reportPurchase, sendCapi } from "./tracking";
import { getStripe, stripeConfigured } from "./stripe";
import { getSettings } from "./settings";
import { snapshotCosts } from "./profit";
import * as ifp from "./ifthenpay";
import { normalizePtMobile } from "./leads";
import { SITE } from "./site";
import { getDict } from "./i18n";
import { isCountry, isLocale, MARKETS, type Country } from "./markets";

const countryOf = (o: Pick<Order, "country">): Country => (isCountry(o.country) ? o.country : "PT");
const errorsOf = (o: Pick<Order, "locale">) => getDict(isLocale(o.locale) ? o.locale : "pt").checkout.errors;

export const PAID = ["paid", "preparing", "shipped", "delivered"];

/**
 * Methods shown at checkout for a delivery country. Portugal: MB WAY and Multibanco (ifthenpay) + cards.
 * Elsewhere: Stripe only (card, Apple/Google Pay, plus iDEAL or Bancontact where the market has it).
 */
export function checkoutMethods(country: Country = "PT"): ifp.PayMethod[] {
  if (country !== "PT") return stripeConfigured() ? ["card"] : [];
  const ifm = ifp.availableMethods();
  const out: ifp.PayMethod[] = [];
  if (ifm.includes("mbway")) out.push("mbway");
  if (stripeConfigured() || ifm.includes("card")) out.push("card");
  if (!stripeConfigured() && ifm.includes("wallet")) out.push("wallet");
  if (ifm.includes("multibanco")) out.push("multibanco");
  return out;
}

/** Stripe method types for a market. Redirect methods (iDEAL, Bancontact) cannot save a card for the one-click offer. */
export function stripeTypes(country: Country): string[] {
  return ["card", ...MARKETS[country].stripeRedirectMethods];
}
export function stripeSavesCard(country: Country): boolean {
  return MARKETS[country].stripeRedirectMethods.length === 0;
}

/** Post-purchase one-click offer is possible for card buyers (saved card at Stripe) and MB WAY buyers (new push). */
export function upsellMode(order: Order): "card" | "mbway" | null {
  if (!PAID.includes(order.status)) return null;
  if (order.stripePaymentMethodId && order.stripeCustomerId && stripeConfigured()) return "card";
  if (order.paymentMethodType === "mb_way" && order.phone && ifp.availableMethods().includes("mbway")) return "mbway";
  return null;
}

/** Where the buyer goes once the order is paid: the one-time offer when it can be paid in one step, else thank-you. */
export async function afterPaidUrl(order: Order, token: string) {
  const q = `o=${encodeURIComponent(order.id)}&t=${encodeURIComponent(token)}`;
  const settings = await getSettings();
  return settings.upsell_enabled && upsellMode(order) ? `${SITE.url}/oferta?${q}` : `${SITE.url}/obrigado?${q}`;
}

/** Add-ons in the cart (status pending until the order is paid, then paid). */
export async function orderAddons(orderId: string, statuses = ["pending", "paid"]) {
  return db.select().from(schema.orderAddons).where(and(eq(schema.orderAddons.orderId, orderId), inArray(schema.orderAddons.status, statuses)));
}

/** Amount to charge: bundle total + add-ons accepted before payment. */
export async function dueCents(order: Order, addons?: OrderAddon[]) {
  const list = addons ?? (await orderAddons(order.id, order.status === "pending_payment" || order.status === "payment_failed" || order.status === "cancelled" ? ["pending"] : ["paid"]));
  return order.totalCents + list.reduce((n, a) => n + a.amountCents, 0);
}

export async function latestPayment(orderId: string) {
  const [p] = await db.select().from(schema.payments).where(and(eq(schema.payments.orderId, orderId), isNull(schema.payments.addonId))).orderBy(desc(schema.payments.id)).limit(1);
  return p ?? null;
}

async function newRef(orderId: string) {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.payments).where(eq(schema.payments.orderId, orderId));
  const ref = `${orderId}-${n + 1}`;
  return ref.length <= 15 ? ref : `${orderId.replace(/\D/g, "").slice(-8)}-${n + 1}`.slice(-15);
}

const MB_EXPIRY_DAYS = () => Math.max(0, Math.min(31, Number(process.env.IFTHENPAY_MB_EXPIRY_DAYS ?? 3) || 3));

export type StartResult =
  | { ok: true; kind: "mbway"; paymentId: number; expiresAt: string }
  | { ok: true; kind: "stripe"; clientSecret: string }
  | { ok: true; kind: "redirect"; url: string }
  | { ok: false; error: string; status: number };

/** Starts a payment attempt for the full amount due. One pending attempt per order at a time. */
export async function startPayment(order: Order, method: ifp.PayMethod, opts: { phone?: string; token: string }): Promise<StartResult> {
  const t = errorsOf(order);
  const country = countryOf(order);
  if (!checkoutMethods(country).includes(method)) return { ok: false, status: 400, error: t.methodUnavailable };
  const amount = await dueCents(order);
  // Close older pending attempts (a Multibanco reference stays payable: it is only superseded in our records).
  await db.update(schema.payments).set({ status: "superseded" }).where(and(eq(schema.payments.orderId, order.id), eq(schema.payments.status, "pending"), isNull(schema.payments.addonId), inArray(schema.payments.method, ["mbway", "card", "wallet"])));
  const ref = await newRef(order.id);
  const q = `o=${encodeURIComponent(order.id)}&t=${encodeURIComponent(opts.token)}`;
  const description = `Wine Portugal ${order.id}`;
  try {
    if (method === "card" && stripeConfigured()) {
      // Stripe PaymentIntent (card, Apple Pay, Google Pay). The card is saved for this customer so the
      // post-purchase offer can be accepted with one click.
      const stripe = getStripe();
      let customer = order.stripeCustomerId;
      if (!customer) {
        const c = await stripe.customers.create({ email: order.email ?? undefined, name: order.customerName ?? undefined, phone: order.phone ?? undefined, metadata: { order_id: order.id } }, { idempotencyKey: `cust_${order.id}` });
        customer = c.id;
        await db.update(schema.orders).set({ stripeCustomerId: customer }).where(eq(schema.orders.id, order.id));
      }
      const a = order.shippingAddress ?? {};
      const pi = await stripe.paymentIntents.create(
        {
          amount,
          currency: "eur",
          customer,
          allowed_payment_method_types: stripeTypes(country),
          ...(stripeSavesCard(country) ? { setup_future_usage: "on_session" as const } : {}),
          receipt_email: order.email ?? undefined,
          description,
          shipping: order.customerName && a.line1 ? { name: order.customerName, phone: order.phone ?? undefined, address: { line1: a.line1, line2: a.line2 ?? undefined, postal_code: a.postal_code ?? undefined, city: a.city ?? undefined, country } } : undefined,
          metadata: { kind: "order", order_id: order.id, ref },
        },
        { idempotencyKey: `pi_${ref}` },
      );
      await db.insert(schema.payments).values({ orderId: order.id, provider: "stripe", method: "card", ref, requestId: pi.id, amountCents: amount });
      await logOrderEvent(order.id, "payment_started", { method: "card", provider: "stripe", ref, amount_cents: amount });
      return { ok: true, kind: "stripe", clientSecret: pi.client_secret! };
    }
    if (method === "mbway") {
      const phone = normalizePtMobile(opts.phone ?? order.phone ?? "");
      if (!phone) return { ok: false, status: 422, error: t.mbwayPhone };
      const r = await ifp.mbwayCreate({ ref, amountCents: amount, phone, email: order.email, description });
      if (!r.ok || !r.requestId) {
        await logOrderEvent(order.id, "payment_error", { method, status: r.status, message: r.message });
        return { ok: false, status: 402, error: r.status === "122" ? t.mbwayDeclined : t.mbwaySendFailed };
      }
      const expiresAt = new Date(Date.now() + 4 * 60_000);
      const [p] = await db.insert(schema.payments).values({ orderId: order.id, method, ref, requestId: r.requestId, amountCents: amount, phone, expiresAt }).returning();
      await logOrderEvent(order.id, "payment_started", { method, ref, amount_cents: amount });
      return { ok: true, kind: "mbway", paymentId: p.id, expiresAt: expiresAt.toISOString() };
    }
    if (method === "multibanco") {
      const r = await ifp.multibancoCreate({ ref, amountCents: amount, expiryDays: MB_EXPIRY_DAYS(), description, name: order.customerName, email: order.email, phone: order.phone });
      if (!r.ok) {
        await logOrderEvent(order.id, "payment_error", { method, message: r.message });
        return { ok: false, status: 502, error: "Não foi possível gerar a referência Multibanco. Tente novamente." };
      }
      const [p] = await db.insert(schema.payments).values({ orderId: order.id, method, ref, requestId: r.requestId, amountCents: amount, entity: r.entity, reference: r.reference, expiresAt: r.expiresAt }).returning();
      await multibancoIssued(order, p);
      return { ok: true, kind: "redirect", url: `${SITE.url}/obrigado?${q}` };
    }
    const back = `${SITE.url}/pagamento/retorno?${q}`;
    if (method === "card") {
      const r = await ifp.cardInit({ ref, amountCents: amount, successUrl: `${back}&r=ok`, errorUrl: `${back}&r=erro`, cancelUrl: `${back}&r=cancelado` });
      if (!r.ok || !r.paymentUrl) {
        await logOrderEvent(order.id, "payment_error", { method, message: r.message });
        return { ok: false, status: 502, error: t.cardUnavailable };
      }
      await db.insert(schema.payments).values({ orderId: order.id, method, ref, requestId: r.requestId, amountCents: amount, redirectUrl: r.paymentUrl });
      await logOrderEvent(order.id, "payment_started", { method, ref, amount_cents: amount });
      return { ok: true, kind: "redirect", url: r.paymentUrl };
    }
    const r = await ifp.walletLink({ ref, amountCents: amount, description, successUrl: `${back}&r=ok`, errorUrl: `${back}&r=erro`, cancelUrl: `${back}&r=cancelado` });
    if (!r.ok || !r.redirectUrl) return { ok: false, status: 502, error: t.walletUnavailable };
    await db.insert(schema.payments).values({ orderId: order.id, method, ref, amountCents: amount, redirectUrl: r.redirectUrl });
    await logOrderEvent(order.id, "payment_started", { method, ref, amount_cents: amount });
    return { ok: true, kind: "redirect", url: r.redirectUrl };
  } catch (e) {
    console.error("[pay] start", method, e instanceof Error ? e.message : e);
    await logOrderEvent(order.id, "payment_error", { method, message: (e instanceof Error ? e.message : String(e)).slice(0, 300) });
    return { ok: false, status: 502, error: t.tempUnavailable };
  }
}

export async function multibancoIssued(order: Order, p: Payment) {
  await logOrderEvent(order.id, "mb_reference_issued", { entity: p.entity, reference: p.reference, amount_cents: p.amountCents, expires_at: p.expiresAt?.toISOString() });
  await sendPending(order, { entity: p.entity, reference: p.reference, amountCents: p.amountCents, expiresAt: p.expiresAt }).catch((e) => console.error("[email] pending", e));
}

/**
 * Marks a payment attempt as paid (idempotent; compare-and-set on its status) and the order with it.
 * `amountCents` is what ifthenpay says was paid; a mismatch never fulfils the order.
 */
export async function confirmPayment(p: Payment, info: { amountCents: number | null; paidMethod?: string | null; source: string }) {
  if (info.amountCents != null && info.amountCents !== p.amountCents) {
    await logOrderEvent(p.orderId, "amount_mismatch", { ref: p.ref, expected: p.amountCents, got: info.amountCents, source: info.source });
    await sendPaymentIssueAlert(p.orderId, `Valor recebido (${(info.amountCents / 100).toFixed(2)} €) diferente do esperado (${(p.amountCents / 100).toFixed(2)} €) no pagamento ${p.ref}. A encomenda NÃO foi confirmada.`).catch(() => {});
    return { ok: false as const, reason: "amount_mismatch" };
  }
  const [claimed] = await db
    .update(schema.payments)
    .set({ status: "paid", paidAt: new Date(), paidMethod: info.paidMethod ?? null })
    .where(and(eq(schema.payments.id, p.id), inArray(schema.payments.status, ["pending", "superseded", "expired", "failed"])))
    .returning();
  if (!claimed) return { ok: true as const, duplicate: true };
  if (claimed.addonId) {
    await markAddonPaid(claimed.addonId, claimed);
    return { ok: true as const };
  }
  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, p.orderId)).limit(1);
  if (!order) return { ok: false as const, reason: "no_order" };
  if (PAID.includes(order.status) || order.status === "refunded") {
    // Money arrived twice for the same order (e.g. MB WAY and then the Multibanco reference): refund by hand.
    await logOrderEvent(order.id, "duplicate_payment", { ref: p.ref, method: p.method, amount_cents: p.amountCents, source: info.source });
    await sendPaymentIssueAlert(order.id, `Pagamento em duplicado: ${p.ref} (${p.method}, ${(p.amountCents / 100).toFixed(2)} €). A encomenda já estava paga. Devolva este valor.`).catch(() => {});
    return { ok: true as const, duplicate: true };
  }
  await markOrderPaid(order, claimed, info.source);
  return { ok: true as const };
}

const METHOD_LABEL: Record<string, string> = { mbway: "mb_way", multibanco: "multibanco", card: "card", wallet: "wallet" };

export async function markOrderPaid(order: Order, p: Payment, source: string) {
  if (!["pending_payment", "payment_failed", "cancelled"].includes(order.status)) return;
  const wallet = p.paidMethod === "APPLE" ? "card:apple_pay" : p.paidMethod === "GOOGLE" ? "card:google_pay" : p.paidMethod === "LINK" ? "card:link" : null;
  const paid = await setStatus(order, "paid", { paymentMethodType: wallet ?? METHOD_LABEL[p.method] ?? p.method }, { source, ref: p.ref, amount_cents: p.amountCents });
  if (!paid) return;
  const pendingAddons = await orderAddons(order.id, ["pending"]);
  if (pendingAddons.length) {
    await db.update(schema.orderAddons).set({ status: "paid", paidAt: new Date() }).where(and(eq(schema.orderAddons.orderId, order.id), eq(schema.orderAddons.status, "pending")));
    await logOrderEvent(order.id, "upsell_paid", { addons: pendingAddons.map((a) => ({ id: a.id, sku: a.sku, amount_cents: a.amountCents })) });
  }
  const addons = pendingAddons.map((a) => ({ ...a, status: "paid" }));
  await sendConfirmation(paid, addons).catch((e) => console.error("[email] confirmation", e));
  await db.update(schema.orders).set({ ebookKeyIssuedAt: new Date() }).where(eq(schema.orders.id, paid.id));
  await reportPurchase(paid, p.amountCents);
  await snapshotCosts(paid.id, await getSettings()).catch((e) => console.error("[profit] snapshot", e));
  await sendAdminAlert(paid, addons).catch(() => {});
}

/** Post-purchase add-on paid (its own charge): confirmation, its own Purchase event, cost snapshot. */
export async function markAddonPaid(addonId: number, p: Payment) {
  const [addon] = await db
    .update(schema.orderAddons)
    .set({ status: "paid", paidAt: new Date(), stripePaymentIntentId: p.provider === "stripe" ? p.requestId : null })
    .where(and(eq(schema.orderAddons.id, addonId), inArray(schema.orderAddons.status, ["pending", "failed"])))
    .returning();
  if (!addon) return;
  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, addon.orderId)).limit(1);
  await logOrderEvent(addon.orderId, "upsell_paid", { addon_id: addon.id, label: addon.label, amount_cents: addon.amountCents, ref: p.ref, method: p.method });
  if (!order) return;
  await snapshotCosts(order.id, await getSettings()).catch(() => {});
  await sendAddonConfirmation(order, addon).catch(() => {});
  await sendAdminAlert(order, [addon]).catch(() => {});
  const eventId = `purchase_addon_${addon.id}`;
  await logFunnel("Purchase", eventId, order.id);
  if (order.consentTracking) {
    const [first, ...rest] = (order.customerName ?? "").split(" ");
    await sendCapi({
      eventName: "Purchase",
      eventId,
      sourceUrl: `${SITE.url}/oferta`,
      orderId: order.id,
      user: { email: order.email, phone: order.phone, firstName: first, lastName: rest.join(" "), city: order.shippingAddress?.city, zip: order.shippingAddress?.postal_code, country: countryOf(order), ip: order.clientIp, userAgent: order.userAgent, fbp: order.fbp, fbc: order.fbc },
      customData: { value: addon.amountCents / 100, currency: "EUR", content_ids: [addon.sku], content_type: "product", num_items: addon.qty, order_id: `${order.id}-A${addon.id}` },
    }).catch(() => {});
  }
}

/** Applies a Stripe PaymentIntent outcome (webhook or browser return). Saves the card for the one-click offer. */
export async function applyStripePi(pi: Stripe.PaymentIntent, source: string) {
  const [p] = await db.select().from(schema.payments).where(and(eq(schema.payments.provider, "stripe"), eq(schema.payments.requestId, pi.id))).limit(1);
  if (!p) return null;
  if (pi.status === "succeeded") {
    let wallet: string | null = null;
    try {
      const full = await getStripe().paymentIntents.retrieve(pi.id, { expand: ["latest_charge"] });
      const ch = full.latest_charge as Stripe.Charge | null;
      const w = ch?.payment_method_details?.card?.wallet?.type;
      wallet = w === "apple_pay" ? "APPLE" : w === "google_pay" ? "GOOGLE" : w === "link" ? "LINK" : null;
      const pm = typeof full.payment_method === "string" ? full.payment_method : full.payment_method?.id;
      const customer = typeof full.customer === "string" ? full.customer : full.customer?.id;
      // Only a card (incl. Apple/Google Pay) can be charged again in one click; iDEAL/Bancontact cannot.
      const isCard = ch?.payment_method_details?.type === "card";
      if (!p.addonId && customer) await db.update(schema.orders).set({ stripePaymentMethodId: isCard && pm ? pm : null, stripeCustomerId: customer, stripePaymentIntentId: pi.id }).where(eq(schema.orders.id, p.orderId));
    } catch (e) {
      console.error("[stripe] retrieve", e instanceof Error ? e.message : e);
    }
    await confirmPayment(p, { amountCents: pi.amount_received || pi.amount, paidMethod: wallet ?? "CARD", source });
    return "paid";
  }
  if (pi.status === "canceled" || (pi.status === "requires_payment_method" && pi.last_payment_error)) {
    await logOrderEvent(p.orderId, "payment_failed", { provider: "stripe", ref: p.ref, code: pi.last_payment_error?.code ?? pi.status });
    if (p.addonId) await db.update(schema.orderAddons).set({ status: "failed" }).where(and(eq(schema.orderAddons.id, p.addonId), eq(schema.orderAddons.status, "pending")));
  }
  return pi.status;
}

/** One-time offer accepted after payment: one click with the saved card, or a new MB WAY push to the same phone. */
export async function startAddonPayment(order: Order, addon: OrderAddon, returnUrl: string) {
  const mode = upsellMode(order);
  const ref = await newRef(order.id);
  const description = `Wine Portugal ${order.id} · ${addon.label}`.slice(0, 100);
  if (mode === "card") {
    const pi = await getStripe().paymentIntents.create(
      {
        amount: addon.amountCents,
        currency: "eur",
        customer: order.stripeCustomerId!,
        payment_method: order.stripePaymentMethodId!,
        allowed_payment_method_types: ["card"],
        confirm: true,
        return_url: returnUrl,
        receipt_email: order.email ?? undefined,
        description,
        metadata: { kind: "addon", order_id: order.id, addon_id: String(addon.id), ref },
      },
      { idempotencyKey: `addon_${addon.id}` },
    );
    const [p] = await db.insert(schema.payments).values({ orderId: order.id, provider: "stripe", method: "card", ref, requestId: pi.id, amountCents: addon.amountCents, addonId: addon.id }).returning();
    if (pi.status === "succeeded") await applyStripePi(pi, "upsell_one_click");
    return { kind: "card" as const, status: pi.status, clientSecret: pi.client_secret, paymentId: p.id };
  }
  if (mode === "mbway") {
    const r = await ifp.mbwayCreate({ ref, amountCents: addon.amountCents, phone: order.phone!, email: order.email, description });
    if (!r.ok || !r.requestId) throw new Error(`MB WAY ${r.status} ${r.message}`);
    const expiresAt = new Date(Date.now() + 4 * 60_000);
    const [p] = await db.insert(schema.payments).values({ orderId: order.id, method: "mbway", ref, requestId: r.requestId, amountCents: addon.amountCents, phone: order.phone, expiresAt, addonId: addon.id }).returning();
    return { kind: "mbway" as const, status: "pending", paymentId: p.id, expiresAt: expiresAt.toISOString() };
  }
  throw new Error("no_one_click_method");
}

/** MB WAY: asks ifthenpay for the status (at most every 3 s per attempt) and applies it. */
export async function refreshMbway(p: Payment) {
  if (p.method !== "mbway" || p.status !== "pending" || !p.requestId) return p.status;
  if (p.lastCheckedAt && Date.now() - p.lastCheckedAt.getTime() < 3000) return p.status;
  const [claimed] = await db
    .update(schema.payments)
    .set({ lastCheckedAt: new Date() })
    .where(and(eq(schema.payments.id, p.id), p.lastCheckedAt ? eq(schema.payments.lastCheckedAt, p.lastCheckedAt) : sql`${schema.payments.lastCheckedAt} is null`))
    .returning();
  if (!claimed) return p.status;
  try {
    const s = await ifp.mbwayStatus(p.requestId);
    if (s.state === "paid") {
      await confirmPayment(p, { amountCents: null, paidMethod: "MBWAY", source: "mbway_status" });
      return "paid";
    }
    if (s.state !== "pending") {
      await db.update(schema.payments).set({ status: s.state === "expired" ? "expired" : "failed" }).where(and(eq(schema.payments.id, p.id), eq(schema.payments.status, "pending")));
      await logOrderEvent(p.orderId, "payment_failed", { method: "mbway", ref: p.ref, state: s.state });
      return s.state;
    }
    // ifthenpay gives 4 minutes; allow a margin before calling it expired on our side.
    if (p.expiresAt && Date.now() > p.expiresAt.getTime() + 60_000) {
      await db.update(schema.payments).set({ status: "expired" }).where(and(eq(schema.payments.id, p.id), eq(schema.payments.status, "pending")));
      return "expired";
    }
  } catch (e) {
    console.error("[pay] mbway status", e instanceof Error ? e.message : e);
  }
  return "pending";
}

/** Worker job: expire stale attempts and reconcile those whose callback may have been lost. */
export async function paymentHousekeeping() {
  const now = new Date();
  await db.update(schema.payments).set({ status: "expired" }).where(and(eq(schema.payments.status, "pending"), eq(schema.payments.method, "mbway"), lt(schema.payments.createdAt, new Date(now.getTime() - 10 * 60_000))));
  // Multibanco: keep 2 extra days of grace for bank processing before calling it expired.
  await db.update(schema.payments).set({ status: "expired" }).where(and(eq(schema.payments.status, "pending"), eq(schema.payments.method, "multibanco"), lt(schema.payments.expiresAt, new Date(now.getTime() - 2 * 86400_000))));
  await db.update(schema.payments).set({ status: "expired" }).where(and(inArray(schema.payments.status, ["pending", "superseded"]), inArray(schema.payments.method, ["card", "wallet"]), lt(schema.payments.createdAt, new Date(now.getTime() - 2 * 86400_000))));
  if (!process.env.IFTHENPAY_BACKOFFICE_KEY) return;
  // Reconcile: open attempts from the last 7 days, each checked at most every 30 minutes.
  const open = await db
    .select()
    .from(schema.payments)
    .where(
      and(
        inArray(schema.payments.status, ["pending", "superseded"]),
        eq(schema.payments.provider, "ifthenpay"),
        sql`${schema.payments.createdAt} > now() - interval '7 days'`,
        sql`(${schema.payments.lastCheckedAt} is null or ${schema.payments.lastCheckedAt} < now() - interval '30 minutes')`,
      ),
    )
    .limit(50);
  for (const p of open) {
    await db.update(schema.payments).set({ lastCheckedAt: new Date() }).where(eq(schema.payments.id, p.id));
    try {
      const list = await ifp.findPayments({ orderId: p.ref });
      const hit = list?.find((x) => x.orderId === p.ref || (p.requestId && x.requestId === p.requestId));
      if (hit) await confirmPayment(p, { amountCents: ifp.parseAmountCents(String(hit.amount ?? "")), paidMethod: null, source: "reconciliation" });
    } catch (e) {
      console.error("[pay] reconcile", p.ref, e instanceof Error ? e.message : e);
    }
  }
}

/** Admin refund: API for MB WAY / card / wallets; Multibanco is refunded by bank transfer and only recorded here. */
export async function refundOrder(order: Order, mode: "api" | "manual") {
  const [p] = await db.select().from(schema.payments).where(and(eq(schema.payments.orderId, order.id), eq(schema.payments.status, "paid"), isNull(schema.payments.addonId))).orderBy(desc(schema.payments.paidAt)).limit(1);
  if (!p) return { ok: false, error: "No paid payment found for this order." };
  if (mode === "api" && p.provider === "stripe") {
    try {
      await getStripe().refunds.create({ payment_intent: p.requestId! }, { idempotencyKey: `refund_${p.id}` });
    } catch (e) {
      return { ok: false, error: `Stripe refused the refund: ${e instanceof Error ? e.message : e}` };
    }
    // Paid post-purchase add-ons are separate charges: refund them too.
    const extra = await db.select().from(schema.payments).where(and(eq(schema.payments.orderId, order.id), eq(schema.payments.status, "paid"), eq(schema.payments.provider, "stripe")));
    for (const x of extra.filter((x) => x.addonId)) await getStripe().refunds.create({ payment_intent: x.requestId! }, { idempotencyKey: `refund_${x.id}` }).catch(() => {});
  } else if (mode === "api") {
    if (p.method === "multibanco") return { ok: false, error: "Multibanco cannot be refunded by API. Refund by bank transfer, then use 'Mark refunded (manual)'." };
    if (!p.requestId) return { ok: false, error: "This payment has no ifthenpay requestId; refund it in the ifthenpay backoffice." };
    const r = await ifp.refund(p.requestId, p.amountCents - p.refundedCents);
    await logOrderEvent(order.id, "refund_attempt", { ref: p.ref, code: r.code, message: r.message });
    if (!r.ok) return { ok: false, error: r.code === "-1" ? "ifthenpay: insufficient balance for the refund right now (only payments since 20:00 yesterday are available). Try later or refund manually." : `ifthenpay refused the refund (${r.code} ${r.message}).` };
  }
  await db.update(schema.payments).set({ status: "refunded", refundedCents: p.amountCents }).where(eq(schema.payments.id, p.id));
  await setStatus(order, "refunded", {}, { ref: p.ref, mode });
  return { ok: true };
}
