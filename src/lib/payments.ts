// Payment attempts and their outcome (ifthenpay). Fulfilment only happens here, from a server-side signal:
// the anti-phishing-checked callback, the MB WAY status endpoint, the HMAC-signed card return, or reconciliation.
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Order, OrderAddon, Payment } from "@/db/schema";
import { logOrderEvent, setStatus } from "./orders";
import { sendAdminAlert, sendConfirmation, sendPending, sendPaymentIssueAlert } from "./email";
import { reportPurchase } from "./tracking";
import * as ifp from "./ifthenpay";
import { normalizePtMobile } from "./leads";
import { SITE } from "./site";

export const PAID = ["paid", "preparing", "shipped", "delivered"];

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
  const [p] = await db.select().from(schema.payments).where(eq(schema.payments.orderId, orderId)).orderBy(desc(schema.payments.id)).limit(1);
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
  | { ok: true; kind: "redirect"; url: string }
  | { ok: false; error: string; status: number };

/** Starts a payment attempt for the full amount due. One pending attempt per order at a time. */
export async function startPayment(order: Order, method: ifp.PayMethod, opts: { phone?: string; token: string }): Promise<StartResult> {
  if (!ifp.availableMethods().includes(method)) return { ok: false, status: 400, error: "Método de pagamento indisponível." };
  const amount = await dueCents(order);
  // Close older pending attempts (a Multibanco reference stays payable: it is only superseded in our records).
  await db.update(schema.payments).set({ status: "superseded" }).where(and(eq(schema.payments.orderId, order.id), eq(schema.payments.status, "pending"), inArray(schema.payments.method, ["mbway", "card", "wallet"])));
  const ref = await newRef(order.id);
  const q = `o=${encodeURIComponent(order.id)}&t=${encodeURIComponent(opts.token)}`;
  const description = `Wine Portugal ${order.id}`;
  try {
    if (method === "mbway") {
      const phone = normalizePtMobile(opts.phone ?? order.phone ?? "");
      if (!phone) return { ok: false, status: 422, error: "Indique o número de telemóvel associado ao MB WAY." };
      const r = await ifp.mbwayCreate({ ref, amountCents: amount, phone, email: order.email, description });
      if (!r.ok || !r.requestId) {
        await logOrderEvent(order.id, "payment_error", { method, status: r.status, message: r.message });
        return { ok: false, status: 402, error: r.status === "122" ? "O pagamento MB WAY foi recusado. Confirme o número ou escolha outro método." : "Não foi possível enviar o pedido MB WAY. Tente novamente." };
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
        return { ok: false, status: 502, error: "O pagamento com cartão está indisponível de momento. Escolha outro método." };
      }
      await db.insert(schema.payments).values({ orderId: order.id, method, ref, requestId: r.requestId, amountCents: amount, redirectUrl: r.paymentUrl });
      await logOrderEvent(order.id, "payment_started", { method, ref, amount_cents: amount });
      return { ok: true, kind: "redirect", url: r.paymentUrl };
    }
    const r = await ifp.walletLink({ ref, amountCents: amount, description, successUrl: `${back}&r=ok`, errorUrl: `${back}&r=erro`, cancelUrl: `${back}&r=cancelado` });
    if (!r.ok || !r.redirectUrl) return { ok: false, status: 502, error: "Apple Pay / Google Pay indisponível de momento. Escolha outro método." };
    await db.insert(schema.payments).values({ orderId: order.id, method, ref, amountCents: amount, redirectUrl: r.redirectUrl });
    await logOrderEvent(order.id, "payment_started", { method, ref, amount_cents: amount });
    return { ok: true, kind: "redirect", url: r.redirectUrl };
  } catch (e) {
    console.error("[pay] start", method, e instanceof Error ? e.message : e);
    await logOrderEvent(order.id, "payment_error", { method, message: (e instanceof Error ? e.message : String(e)).slice(0, 300) });
    return { ok: false, status: 502, error: "O pagamento está temporariamente indisponível. Os seus dados ficam guardados; tente novamente dentro de momentos." };
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
  const wallet = p.paidMethod === "APPLE" ? "card:apple_pay" : p.paidMethod === "GOOGLE" ? "card:google_pay" : null;
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
  await sendAdminAlert(paid, addons).catch(() => {});
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
  const [p] = await db.select().from(schema.payments).where(and(eq(schema.payments.orderId, order.id), eq(schema.payments.status, "paid"))).orderBy(desc(schema.payments.paidAt)).limit(1);
  if (!p) return { ok: false, error: "No paid payment found for this order." };
  if (mode === "api") {
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
