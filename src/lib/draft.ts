// In-house checkout ("draft" order): created when /checkout opens, autosaved field by field,
// paid through ifthenpay (MB WAY, card, Apple/Google Pay, Multibanco). The order row is the single source of truth.
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Bundle, Order, OrderAddon, Utm } from "@/db/schema";
import { getCatalog, paidBoxes, salesState, canBuy } from "./catalog";
import { getSettings } from "./settings";
import type { Settings } from "./settings-defaults";
import { checkoutMethods } from "./payments";
import { logOrderEvent, nextOrderId } from "./orders";
import { normalizeCode, promoDiscountCents, promoShippingCents } from "./promo";
import { resumeToken, scheduleRecovery, verifyResumeToken } from "./recovery";
import { normalizePhone } from "./leads";

export const draftToken = resumeToken;

export type Amounts = { subtotal: number; discount: number; shipping: number; total: number; promoCode: string | null };

export function computeAmounts(bundle: Bundle, settings: Settings, promo: string | null | undefined): Amounts {
  const cfg = { code: settings.lead_code, percent: settings.lead_discount_percent, maxQty: settings.lead_code_max_qty, plusCode: settings.lead_plus_code };
  const discount = promoDiscountCents(bundle, cfg, promo);
  const shipping = promoShippingCents(bundle, cfg, promo);
  const promoCode = discount > 0 || shipping !== bundle.shippingCents ? normalizeCode(promo) : null;
  const subtotal = bundle.priceCents - discount;
  return { subtotal, discount, shipping, total: subtotal + shipping, promoCode };
}

export type DraftCtx = { utm: Utm | null; fbp: string | null; fbc: string | null; gaClientId: string | null; ip: string | null; ua: string | null; consentTracking: boolean };

export async function createDraft(input: { bundleKey: string; promo?: string; isGift?: boolean; giftMessage?: string; eventId?: string }, ctx: DraftCtx) {
  const [catalog, settings, sold] = await Promise.all([getCatalog(), getSettings(), paidBoxes()]);
  if (!catalog || !canBuy(salesState(settings, sold))) return { ok: false as const, status: 409, error: "As encomendas estão fechadas de momento." };
  const bundle = catalog.bundles.find((b) => b.key === input.bundleKey && b.active) ?? catalog.bundles.find((b) => b.qty === 2) ?? catalog.bundles[0];
  const a = computeAmounts(bundle, settings, input.promo);
  const id = await nextOrderId();
  const [order] = await db
    .insert(schema.orders)
    .values({
      id,
      status: "pending_payment",
      bundleId: bundle.id,
      bundleKey: bundle.key,
      qtyBoxes: bundle.qty,
      subtotalCents: a.subtotal,
      discountCents: a.discount,
      promoCode: a.promoCode,
      shippingCents: a.shipping,
      totalCents: a.total,
      isGift: !!input.isGift,
      giftMessage: input.isGift ? (input.giftMessage ?? "").slice(0, 200) || null : null,
      consentTracking: ctx.consentTracking,
      utm: ctx.utm,
      fbp: ctx.fbp,
      fbc: ctx.fbc,
      eventId: input.eventId ?? null,
      clientIp: ctx.consentTracking ? ctx.ip : null,
      userAgent: ctx.consentTracking ? ctx.ua : null,
      gaClientId: ctx.gaClientId,
      shippingAddress: { country: "PT" },
    })
    .returning();
  await logOrderEvent(id, "checkout_opened", { bundle_key: bundle.key, total_cents: a.total });
  return { ok: true as const, order };
}

export type DraftPatch = Partial<{
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  address1: string;
  address2: string;
  postalCode: string;
  city: string;
  nif: string;
  isGift: boolean;
  giftMessage: string;
  consentMessages: boolean;
  consentCalls: boolean;
  bundleKey: string;
  promo: string;
  giftCard: boolean; // order bump: printed Christmas card with the message
}>;

export const GIFT_CARD_SKU = "gift-card";

const clip = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, n) : undefined);

/** Autosave: stores whatever was typed (lightly cleaned). Final validation happens in validateForPayment. */
export async function updateDraft(order: Order, patch: DraftPatch) {
  const set: Partial<typeof schema.orders.$inferInsert> = { lastSavedAt: new Date() };
  if (patch.email !== undefined) set.email = clip(patch.email, 160)?.trim().toLowerCase() || null;
  if (patch.phone !== undefined) set.phone = normalizePhone(patch.phone) ?? (clip(patch.phone, 30)?.trim() || null);
  if (patch.firstName !== undefined || patch.lastName !== undefined) {
    const [f0, ...l0] = (order.customerName ?? "").split(" ");
    const first = patch.firstName !== undefined ? clip(patch.firstName, 60)!.trim() : f0;
    const last = patch.lastName !== undefined ? clip(patch.lastName, 80)!.trim() : l0.join(" ");
    set.customerName = [first, last].filter(Boolean).join(" ") || null;
  }
  const addr = { ...(order.shippingAddress ?? {}) };
  let addrChanged = false;
  for (const [k, field, n] of [["address1", "line1", 120], ["address2", "line2", 120], ["postalCode", "postal_code", 10], ["city", "city", 60]] as const) {
    const v = patch[k];
    if (v !== undefined) {
      (addr as Record<string, unknown>)[field] = clip(v, n)?.trim() || null;
      addrChanged = true;
    }
  }
  if (addrChanged || patch.firstName !== undefined || patch.lastName !== undefined) {
    addr.country = "PT";
    (addr as Record<string, unknown>).name = set.customerName ?? order.customerName;
    set.shippingAddress = addr;
    set.billingAddress = { line1: addr.line1, line2: addr.line2, postal_code: addr.postal_code, city: addr.city, country: "PT" };
  }
  if (patch.nif !== undefined) set.nif = (patch.nif ?? "").replace(/\D/g, "").slice(0, 9) || null;
  if (patch.isGift !== undefined) set.isGift = patch.isGift;
  if (patch.giftMessage !== undefined) {
    // Keep the customer's line breaks (at most 4) for the printed card; strip other control characters.
    const m = String(patch.giftMessage).replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").replace(/\n{3,}/g, "\n\n").slice(0, 200);
    const lines = m.split("\n");
    set.giftMessage = (lines.length > 5 ? [...lines.slice(0, 4), lines.slice(4).join(" ")].join("\n") : m).trim() || null;
  }
  if (patch.consentMessages !== undefined) {
    set.consentMessages = patch.consentMessages;
    set.consentMarketing = patch.consentMessages;
  }
  if (patch.consentCalls !== undefined) set.consentCalls = patch.consentCalls;

  // Bundle / promo change: recompute amounts on the server.
  if (patch.bundleKey !== undefined || patch.promo !== undefined) {
    const [catalog, settings] = await Promise.all([getCatalog(), getSettings()]);
    const bundle = catalog?.bundles.find((b) => b.key === (patch.bundleKey ?? order.bundleKey) && b.active);
    if (bundle) {
      const a = computeAmounts(bundle, settings, patch.promo !== undefined ? patch.promo : order.promoCode);
      Object.assign(set, { bundleId: bundle.id, bundleKey: bundle.key, qtyBoxes: bundle.qty, subtotalCents: a.subtotal, discountCents: a.discount, promoCode: a.promoCode, shippingCents: a.shipping, totalCents: a.total });
      // The extra-box offer is priced from the current tier: drop it if the tier changes.
      if (bundle.key !== order.bundleKey) {
        await db.delete(schema.orderAddons).where(and(eq(schema.orderAddons.orderId, order.id), eq(schema.orderAddons.status, "pending"), eq(schema.orderAddons.kind, "boxes")));
      }
    }
  }

  // Order bump: printed card. A pending add-on paid with the order; ticking it also marks the order as a gift.
  if (patch.giftCard !== undefined) {
    await db.delete(schema.orderAddons).where(and(eq(schema.orderAddons.orderId, order.id), eq(schema.orderAddons.status, "pending"), eq(schema.orderAddons.sku, GIFT_CARD_SKU)));
    const settings = await getSettings();
    if (patch.giftCard && settings.gift_card.enabled) {
      await db.insert(schema.orderAddons).values({ orderId: order.id, kind: "card", sku: GIFT_CARD_SKU, label: "Cartão de Natal impresso com mensagem", qty: 1, boxes: 0, amountCents: settings.gift_card.price_cents });
      set.isGift = true;
    }
  }

  const [updated] = await db.update(schema.orders).set(set).where(eq(schema.orders.id, order.id)).returning();

  // Abandoned-checkout follow-up starts once we can reach the person (email + phone).
  const settings = await getSettings();
  if (settings.recovery_enabled && !updated.recoveryScheduledAt && updated.email && updated.phone && /@/.test(updated.email)) {
    await db.update(schema.orders).set({ recoveryScheduledAt: new Date() }).where(eq(schema.orders.id, order.id));
    await scheduleRecovery(order.id, updated.email).catch((e) => console.error("[recovery] schedule", e));
  }
  return updated;
}

export type FieldErrors = Partial<Record<keyof DraftPatch, string>>;

export function validateForPayment(o: Order): FieldErrors {
  const e: FieldErrors = {};
  const a = o.shippingAddress ?? {};
  const [first, ...rest] = (o.customerName ?? "").split(" ");
  if (!o.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email)) e.email = "Indique um email válido.";
  if (!o.phone || !normalizePhone(o.phone)) e.phone = "Indique um telemóvel válido (ex.: 912 345 678 ou +44 7700 900123).";
  if (!first) e.firstName = "Indique o nome.";
  if (!rest.join(" ")) e.lastName = "Indique o apelido.";
  if (!a.line1 || a.line1.length < 4) e.address1 = "Indique a morada.";
  if (!a.postal_code || !/^\d{4}-?\d{3}$/.test(a.postal_code)) e.postalCode = "Código postal no formato 1234-567.";
  else if (/^9/.test(a.postal_code)) e.postalCode = "Entregamos apenas em Portugal Continental.";
  if (!a.city) e.city = "Indique a localidade.";
  if (o.nif && !/^\d{9}$/.test(o.nif)) e.nif = "O NIF tem 9 dígitos.";
  return e;
}

export const PAID_STATUSES = ["paid", "preparing", "shipped", "delivered", "refunded"];

export function publicAmounts(o: Order, addons: OrderAddon[]) {
  const extras = addons.reduce((n, a) => n + a.amountCents, 0);
  return {
    subtotal: o.subtotalCents,
    discount: o.discountCents,
    shipping: o.shippingCents,
    total: o.totalCents + extras,
    promo: o.promoCode,
    addons: addons.map((a) => ({ key: a.kind === "boxes" ? "boxes" : a.sku, label: a.label, amount: a.amountCents })),
  };
}

export function publicDraft(o: Order, addons: OrderAddon[]) {
  const [firstName, ...rest] = (o.customerName ?? "").split(" ");
  const a = o.shippingAddress ?? {};
  return {
    order_id: o.id,
    token: draftToken(o.id),
    methods: checkoutMethods(),
    bundle_key: o.bundleKey,
    amounts: publicAmounts(o, addons),
    fields: {
      email: o.email ?? "",
      phone: o.phone ?? "",
      firstName: firstName ?? "",
      lastName: rest.join(" "),
      address1: a.line1 ?? "",
      address2: a.line2 ?? "",
      postalCode: a.postal_code ?? "",
      city: a.city ?? "",
      nif: o.nif ?? "",
      isGift: o.isGift,
      giftMessage: o.giftMessage ?? "",
      consentMessages: o.consentMessages,
      consentCalls: o.consentCalls,
      giftCard: addons.some((x) => x.sku === GIFT_CARD_SKU),
    },
  };
}

export async function loadDraft(o: string | null, t: string | null) {
  if (!o || !t || verifyResumeToken(t) !== o) return null;
  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, o)).limit(1);
  return order ?? null;
}

