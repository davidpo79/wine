// In-house checkout ("draft" order): created when /checkout opens, autosaved field by field,
// paid through ifthenpay (MB WAY, card, Apple/Google Pay, Multibanco). The order row is the single source of truth.
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Bundle, Order, OrderAddon, Utm } from "@/db/schema";
import { catalogForBundle, paidBoxes, salesState, canBuy } from "./catalog";
import { bfOpen, bottlesPerBox, isBfBundle } from "./black-friday";
import { getSettings } from "./settings";
import type { Settings } from "./settings-defaults";
import { checkoutMethods } from "./payments";
import { logOrderEvent, nextOrderId } from "./orders";
import { normalizeCode, promoDiscountCents, promoShippingCents } from "./promo";
import { resumeToken, scheduleRecovery, verifyResumeToken } from "./recovery";
import { normalizePhone } from "./leads";
import { getDict } from "./i18n";
import { isCountry, isLocale, MARKETS, normalizePhoneFor, normalizePostal, postalValid, type Country, type Locale } from "./markets";
import { fmt } from "./i18n/rich";

const orderCountry = (o: Pick<Order, "country">): Country => (isCountry(o.country) ? o.country : "PT");
const orderLocale = (o: Pick<Order, "locale">): Locale => (isLocale(o.locale) ? o.locale : "pt");

export const draftToken = resumeToken;

export type Amounts = { subtotal: number; discount: number; shipping: number; total: number; promoCode: string | null };

export function computeAmounts(bundle: Bundle, settings: Settings, promo: string | null | undefined): Amounts {
  // Black Friday prices are final: the Christmas codes (exit popup, lead emails) do not apply to them.
  if (isBfBundle(bundle.key)) return { subtotal: bundle.priceCents, discount: 0, shipping: bundle.shippingCents, total: bundle.priceCents + bundle.shippingCents, promoCode: null };
  const cfg = { code: settings.lead_code, percent: settings.lead_discount_percent, maxQty: settings.lead_code_max_qty, plusCode: settings.lead_plus_code };
  const discount = promoDiscountCents(bundle, cfg, promo);
  const shipping = promoShippingCents(bundle, cfg, promo);
  const promoCode = discount > 0 || shipping !== bundle.shippingCents ? normalizeCode(promo) : null;
  const subtotal = bundle.priceCents - discount;
  return { subtotal, discount, shipping, total: subtotal + shipping, promoCode };
}

export type DraftCtx = { utm: Utm | null; fbp: string | null; fbc: string | null; gaClientId: string | null; ip: string | null; ua: string | null; consentTracking: boolean };

export async function createDraft(input: { bundleKey: string; promo?: string; isGift?: boolean; giftMessage?: string; eventId?: string; locale?: Locale; country?: Country }, ctx: DraftCtx) {
  const bf = isBfBundle(input.bundleKey);
  const [catalog, settings, sold] = await Promise.all([catalogForBundle(input.bundleKey), getSettings(), paidBoxes()]);
  const locale = input.locale ?? "pt";
  const country = input.country ?? "PT";
  const cutoff = settings.markets?.[country]?.cutoff_at ?? settings.cutoff_at;
  // Black Friday has its own switch and cutoff (Settings → Black Friday), not the Christmas ones.
  const open = bf ? bfOpen(settings.black_friday) : canBuy(salesState({ ...settings, cutoff_at: cutoff }, sold));
  if (!catalog || !catalog.bundles.length || !open) return { ok: false as const, status: 409, error: getDict(locale).checkout.errors.salesClosed };
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
      shippingAddress: { country },
      country,
      locale,
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
  country: Country; // delivery country (only open markets are accepted at payment)
}>;

export const GIFT_CARD_SKU = "gift-card";

const clip = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, n) : undefined);

/**
 * Whether the abandoned-checkout follow-ups start for this order: once we can reach the person (email + phone), in any
 * language the site speaks (email, SMS and WhatsApp follow the order's language; each step keeps its own rules: the
 * AI call only for pt and ru orders on +351 numbers, WhatsApp only in an approved template language).
 */
export function shouldScheduleRecovery(settings: Pick<Settings, "recovery_enabled">, o: Pick<Order, "locale" | "recoveryScheduledAt" | "email" | "phone">) {
  return !!(settings.recovery_enabled && isLocale(o.locale) && !o.recoveryScheduledAt && o.email && o.phone && /@/.test(o.email));
}

/** Autosave: stores whatever was typed (lightly cleaned). Final validation happens in validateForPayment. */
export async function updateDraft(order: Order, patch: DraftPatch) {
  const set: Partial<typeof schema.orders.$inferInsert> = { lastSavedAt: new Date() };
  if (patch.country !== undefined && isCountry(patch.country)) set.country = patch.country;
  const country = (set.country as Country | undefined) ?? orderCountry(order);
  if (patch.email !== undefined) set.email = clip(patch.email, 160)?.trim().toLowerCase() || null;
  if (patch.phone !== undefined) set.phone = (country === "PT" ? normalizePhone(patch.phone) : normalizePhoneFor(patch.phone, country)) ?? (clip(patch.phone, 30)?.trim() || null);
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
      const clean = clip(v, n)?.trim() || null;
      (addr as Record<string, unknown>)[field] = field === "postal_code" && clean ? normalizePostal(clean, country) : clean;
      addrChanged = true;
    }
  }
  if (addrChanged || set.country || patch.firstName !== undefined || patch.lastName !== undefined) {
    addr.country = country;
    (addr as Record<string, unknown>).name = set.customerName ?? order.customerName;
    set.shippingAddress = addr;
    set.billingAddress = { line1: addr.line1, line2: addr.line2, postal_code: addr.postal_code, city: addr.city, country };
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
    // Only within the order's product: a Trilogia order cannot become a Black Friday one, and the other way round.
    const [catalog, settings] = await Promise.all([catalogForBundle(order.bundleKey), getSettings()]);
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
    // Printed in Portugal: not offered for parcels from the Belgian warehouse.
    if (patch.giftCard && settings.gift_card.enabled && MARKETS[country].warehouse === "douro") {
      await db.insert(schema.orderAddons).values({ orderId: order.id, kind: "card", sku: GIFT_CARD_SKU, label: "Cartão de Natal impresso com mensagem", qty: 1, boxes: 0, amountCents: settings.gift_card.price_cents });
      set.isGift = true;
    }
  }

  const [updated] = await db.update(schema.orders).set(set).where(eq(schema.orders.id, order.id)).returning();

  // Abandoned-checkout follow-up starts once we can reach the person (email + phone).
  const settings = await getSettings();
  if (shouldScheduleRecovery(settings, updated) && updated.email) {
    await db.update(schema.orders).set({ recoveryScheduledAt: new Date() }).where(eq(schema.orders.id, order.id));
    await scheduleRecovery(order.id, updated.email).catch((e) => console.error("[recovery] schedule", e));
  }
  return updated;
}

export type FieldErrors = Partial<Record<keyof DraftPatch, string>>;

/** Final check before payment, in the customer's language. `open`: countries taking orders (default: Portugal). */
export function validateForPayment(o: Order, open: Country[] = ["PT"]): FieldErrors {
  const e: FieldErrors = {};
  const t = getDict(orderLocale(o)).checkout.errors;
  const country = orderCountry(o);
  const a = o.shippingAddress ?? {};
  const [first, ...rest] = (o.customerName ?? "").split(" ");
  if (!open.includes(country)) e.country = t.country;
  if (!o.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email)) e.email = t.email;
  if (!o.phone || !(country === "PT" ? normalizePhone(o.phone) : normalizePhoneFor(o.phone, country))) e.phone = t.phone;
  if (!first) e.firstName = t.firstName;
  if (!rest.join(" ")) e.lastName = t.lastName;
  if (!a.line1 || a.line1.length < 4) e.address1 = t.address1;
  const pv = postalValid(a.postal_code ?? "", country);
  if (pv === "format") e.postalCode = fmt(t.postalFormat, { example: MARKETS[country].postalExample });
  else if (pv === "excluded") e.postalCode = t.postalExcluded;
  if (!a.city) e.city = t.city;
  if (country === "PT" && o.nif && !/^\d{9}$/.test(o.nif)) e.nif = t.nif;
  return e;
}

export const PAID_STATUSES = ["paid", "preparing", "shipped", "delivered", "refunded"];

function boxesLabel(o: Order, n: number) {
  const t = getDict(orderLocale(o)).upsell;
  return fmt(t.boxesLabel, { what: n === 1 ? t.whatOne : fmt(t.whatMany, { n }), bottles: n * bottlesPerBox(o.bundleKey) });
}

export function publicAmounts(o: Order, addons: OrderAddon[]) {
  const extras = addons.reduce((n, a) => n + a.amountCents, 0);
  return {
    subtotal: o.subtotalCents,
    discount: o.discountCents,
    shipping: o.shippingCents,
    total: o.totalCents + extras,
    promo: o.promoCode,
    // Box add-ons are labelled in the customer's language (the stored label is Portuguese, for the team).
    addons: addons.map((a) => ({ key: a.kind === "boxes" ? "boxes" : a.sku, label: a.kind === "boxes" ? boxesLabel(o, a.boxes) : a.label, amount: a.amountCents })),
  };
}

export function publicDraft(o: Order, addons: OrderAddon[]) {
  const [firstName, ...rest] = (o.customerName ?? "").split(" ");
  const a = o.shippingAddress ?? {};
  return {
    order_id: o.id,
    token: draftToken(o.id),
    methods: checkoutMethods(orderCountry(o)),
    country: orderCountry(o),
    locale: orderLocale(o),
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
      country: orderCountry(o),
    },
  };
}

export async function loadDraft(o: string | null, t: string | null) {
  if (!o || !t || verifyResumeToken(t) !== o) return null;
  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.id, o)).limit(1);
  return order ?? null;
}

