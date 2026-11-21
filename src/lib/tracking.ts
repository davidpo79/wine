import { createHash } from "node:crypto";
import { and, eq, gte, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Order } from "@/db/schema";
import { isBotUa } from "./bots";
import { contentIdFor, contentNameFor } from "./black-friday";

export const GRAPH_VERSION = "v21.0";

export type Consent = { statistics: boolean; marketing: boolean };
export const CONSENT_COOKIE = "wp_consent";

/** No choice yet counts as marketing allowed (Meta Pixel and CAPI run from the first visit, per David 25/10);
 * an explicit "Rejeitar" or unticked Marketing turns them off. Statistics still waits for consent. */
export function parseConsent(raw: string | undefined | null): Consent {
  if (!raw) return { statistics: false, marketing: true };
  try {
    const v = JSON.parse(decodeURIComponent(raw));
    return { statistics: v.s === 1, marketing: v.m === 1 };
  } catch {
    return { statistics: false, marketing: false };
  }
}

export function sha256(v: string) {
  return createHash("sha256").update(v).digest("hex");
}

/** Normalization per Meta CAPI customer information parameters. */
export const norm = {
  email: (v?: string | null) => (v ? v.trim().toLowerCase() : null),
  phone: (v?: string | null) => {
    if (!v) return null;
    let d = v.replace(/\D/g, "").replace(/^00/, "");
    if (d.length === 9) d = "351" + d; // Portuguese numbers without country code
    return d || null;
  },
  name: (v?: string | null) => (v ? v.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "") : null),
  city: (v?: string | null) => (v ? v.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "") : null),
  zip: (v?: string | null) => (v ? v.trim().toLowerCase().replace(/\s/g, "") : null),
  country: (v?: string | null) => (v ? v.trim().toLowerCase().slice(0, 2) : null),
};

function hashed(v: string | null) {
  return v ? [sha256(v)] : undefined;
}

export type UserData = {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  city?: string | null;
  zip?: string | null;
  country?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  /** First-party visitor id (cookie wp_xid), the same value the Pixel gets as external_id. */
  externalId?: string | null;
};

/** First-party visitor id cookie, set by the browser once marketing is allowed (lib/track-client.ts). */
export const XID_COOKIE = "wp_xid";
const XID_RE = /^x_[A-Za-z0-9]{12,40}$/;
export const validXid = (v?: string | null) => (v && XID_RE.test(v) ? v : null);
export const validFbp = (v?: string | null) => (v && /^fb\.\d\.\d{10,14}\.\d{5,25}$/.test(v) ? v : null);
export const validFbc = (v?: string | null) => (v && /^fb\.\d\.\d{10,14}\.[A-Za-z0-9_-]{10,500}$/.test(v) ? v : null);
/** _fbc built from the fbclid in the page URL, for a first page view whose cookie isn't written yet. */
export function fbcFromUrl(url?: string | null) {
  try {
    const id = url ? new URL(url).searchParams.get("fbclid") : null;
    return id && /^[A-Za-z0-9_-]{10,500}$/.test(id) ? `fb.1.${Date.now()}.${id}` : null;
  } catch {
    return null;
  }
}

export function buildUserData(u: UserData) {
  const out: Record<string, unknown> = {
    em: hashed(norm.email(u.email)),
    ph: hashed(norm.phone(u.phone)),
    fn: hashed(norm.name(u.firstName)),
    ln: hashed(norm.name(u.lastName)),
    ct: hashed(norm.city(u.city)),
    zp: hashed(norm.zip(u.zip)),
    country: hashed(norm.country(u.country)),
    client_ip_address: u.ip || undefined,
    client_user_agent: u.userAgent || undefined,
    fbp: u.fbp || undefined,
    fbc: u.fbc || undefined,
    external_id: hashed(validXid(u.externalId)),
  };
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out;
}

async function logTracking(row: typeof schema.trackingEvents.$inferInsert) {
  try {
    await db.insert(schema.trackingEvents).values(row);
  } catch (e) {
    console.error("[tracking] log failed", e);
  }
}

export type CapiEvent = {
  eventName: string;
  eventId: string;
  sourceUrl: string;
  user: UserData;
  customData?: Record<string, unknown>;
  orderId?: string | null;
  eventTime?: number;
};

export async function sendCapi(ev: CapiEvent) {
  const pixel = process.env.META_PIXEL_ID;
  const token = process.env.META_CAPI_ACCESS_TOKEN;
  if (!pixel || !token) {
    await logTracking({ eventName: ev.eventName, eventId: ev.eventId, orderId: ev.orderId ?? null, sentTo: "capi", status: "skipped", response: { reason: "not_configured" } });
    return;
  }
  // Ad-review browsers and crawlers would teach Meta that our buyers are data centres.
  if (isBotUa(ev.user.userAgent)) {
    await logTracking({ eventName: ev.eventName, eventId: ev.eventId, orderId: ev.orderId ?? null, sentTo: "capi", status: "skipped", response: { reason: "bot" } });
    return;
  }
  const body: Record<string, unknown> = {
    data: [
      {
        event_name: ev.eventName,
        event_time: ev.eventTime ?? Math.floor(Date.now() / 1000),
        event_id: ev.eventId,
        action_source: "website",
        event_source_url: ev.sourceUrl,
        user_data: buildUserData(ev.user),
        custom_data: ev.customData,
      },
    ],
  };
  if (process.env.META_TEST_EVENT_CODE) body.test_event_code = process.env.META_TEST_EVENT_CODE;
  try {
    const r = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${pixel}/events?access_token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    const json = await r.json().catch(() => ({}));
    await logTracking({ eventName: ev.eventName, eventId: ev.eventId, orderId: ev.orderId ?? null, sentTo: "capi", status: r.ok ? "ok" : "error", response: json });
  } catch (e) {
    await logTracking({ eventName: ev.eventName, eventId: ev.eventId, orderId: ev.orderId ?? null, sentTo: "capi", status: "error", response: { error: String(e) } });
  }
}

export async function sendGa4(clientId: string | null, events: { name: string; params: Record<string, unknown> }[], orderId?: string) {
  const mid = process.env.GA4_MEASUREMENT_ID;
  const secret = process.env.GA4_API_SECRET;
  const name = events[0]?.name ?? "unknown";
  if (!mid || !secret || !clientId) {
    await logTracking({ eventName: name, eventId: orderId ?? null, orderId: orderId ?? null, sentTo: "ga4", status: "skipped", response: { reason: !clientId ? "no_client_id" : "not_configured" } });
    return;
  }
  try {
    const r = await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${mid}&api_secret=${encodeURIComponent(secret)}`, {
      method: "POST",
      body: JSON.stringify({ client_id: clientId, events }),
      signal: AbortSignal.timeout(8000),
    });
    await logTracking({ eventName: name, eventId: orderId ?? null, orderId: orderId ?? null, sentTo: "ga4", status: r.ok ? "ok" : "error", response: { status: r.status } });
  } catch (e) {
    await logTracking({ eventName: name, eventId: orderId ?? null, orderId: orderId ?? null, sentTo: "ga4", status: "error", response: { error: String(e) } });
  }
}

/** Anonymous funnel counter (no identifiers), used for the admin funnel regardless of consent. */
export async function logFunnel(eventName: string, eventId: string | null, orderId?: string | null, visit?: { sessionId?: string | null; source?: string | null }) {
  await logTracking({ eventName, eventId, orderId: orderId ?? null, sessionId: visit?.sessionId ?? null, source: visit?.source ?? null, sentTo: "internal", status: "ok", response: null });
}

/** _ga cookie "GA1.1.123.456" -> "123.456" */
export function gaClientIdFromCookie(v?: string | null) {
  if (!v) return null;
  const parts = v.split(".");
  return parts.length >= 4 ? `${parts[2]}.${parts[3]}` : null;
}


/** Purchase to Meta CAPI. */
async function purchaseCapi(o: Order, value: number, eventTime?: number) {
  // Every paid order goes to Meta, also when the buyer refused marketing cookies (David, 21/11/2026: Meta brings all
  // the traffic, so it must see every sale). Without consent the order holds no IP, user agent, fbp or fbc, so the
  // event carries only the order's own customer data.
  const [first, ...rest] = (o.customerName ?? "").trim().split(/\s+/);
  await sendCapi({
    eventName: "Purchase",
    eventId: purchaseEventId(o.id),
    sourceUrl: `${process.env.SITE_URL ?? ""}/obrigado`,
    orderId: o.id,
    user: {
      email: o.email,
      phone: o.phone,
      firstName: first,
      lastName: rest.join(" "),
      city: o.shippingAddress?.city,
      zip: o.shippingAddress?.postal_code,
      country: o.shippingAddress?.country ?? "PT",
      ip: o.clientIp,
      userAgent: o.userAgent,
      fbp: o.fbp,
      fbc: o.fbc,
      externalId: o.externalId,
    },
    eventTime,
    customData: {
      value,
      currency: "EUR",
      content_ids: [contentIdFor(o.bundleKey)],
      content_type: "product",
      num_items: o.qtyBoxes,
      order_id: o.id,
    },
  });
}

/** One-off at boot: paid orders of the last 6 days whose Purchase was skipped for lack of cookie consent (before
 * 21/11/2026) are sent now with their payment time; Meta accepts events up to 7 days old and dedupes on event_id. */
export async function backfillSkippedPurchases() {
  const since = new Date(Date.now() - 6 * 24 * 3600_000);
  const skipped = await db
    .select({ orderId: schema.trackingEvents.orderId })
    .from(schema.trackingEvents)
    .where(and(eq(schema.trackingEvents.eventName, "Purchase"), eq(schema.trackingEvents.sentTo, "capi"), eq(schema.trackingEvents.status, "skipped"), gte(schema.trackingEvents.createdAt, since)));
  let sent = 0;
  for (const id of new Set(skipped.map((r) => r.orderId).filter((x): x is string => !!x))) {
    const done = await db
      .select({ id: schema.trackingEvents.id })
      .from(schema.trackingEvents)
      .where(and(eq(schema.trackingEvents.orderId, id), eq(schema.trackingEvents.eventName, "Purchase"), eq(schema.trackingEvents.sentTo, "capi"), eq(schema.trackingEvents.status, "ok")))
      .limit(1);
    if (done.length) continue;
    const [o] = await db.select().from(schema.orders).where(eq(schema.orders.id, id)).limit(1);
    if (!o?.paidAt || o.paidAt < since) continue;
    await purchaseCapi(o, o.totalCents / 100, Math.floor(o.paidAt.getTime() / 1000));
    sent++;
  }
  console.log(`[tracking] purchase backfill: ${sent} sent`);
}

export function purchaseEventId(orderId: string) {
  return `purchase_${orderId}`;
}

/** Fires server-side Purchase (CAPI + GA4) exactly once per order. Caller must ensure money is confirmed. */
/** valueCents: everything paid in this order (bundle + add-ons accepted before payment). */
export async function reportPurchase(o: Order, valueCents = o.totalCents) {
  // Claim the report atomically so retries and concurrent webhooks never double-count.
  const claimed = await db
    .update(schema.orders)
    .set({ purchaseReportedAt: new Date() })
    .where(and(eq(schema.orders.id, o.id), isNull(schema.orders.purchaseReportedAt)))
    .returning({ id: schema.orders.id });
  if (claimed.length === 0) return;

  const value = valueCents / 100;
  await logFunnel("Purchase", purchaseEventId(o.id), o.id);
  await purchaseCapi(o, value);
  await sendGa4(
    o.gaClientId,
    [
      {
        name: "purchase",
        params: {
          transaction_id: o.id,
          value,
          currency: "EUR",
          shipping: o.shippingCents / 100,
          items: [{ item_id: contentIdFor(o.bundleKey), item_name: contentNameFor(o.bundleKey), item_variant: o.bundleKey, price: o.subtotalCents / 100, quantity: 1 }],
        },
      },
    ],
    o.id,
  );
}
