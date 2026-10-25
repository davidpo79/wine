import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Order } from "@/db/schema";

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
};

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
  if (o.consentTracking) {
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
      },
      customData: {
        value,
        currency: "EUR",
        content_ids: ["trilogia-2160"],
        content_type: "product",
        num_items: o.qtyBoxes,
        order_id: o.id,
      },
    });
  } else {
    await logTracking({ eventName: "Purchase", eventId: purchaseEventId(o.id), orderId: o.id, sentTo: "capi", status: "skipped", response: { reason: "no_marketing_consent" } });
  }
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
          items: [{ item_id: "trilogia-2160", item_name: "Trilogia 2160", item_variant: o.bundleKey, price: o.subtotalCents / 100, quantity: 1 }],
        },
      },
    ],
    o.id,
  );
}
