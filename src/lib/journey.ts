import { z } from "zod";
import { and, eq, isNotNull, lt } from "drizzle-orm";
import { db, schema } from "@/db";

// Anonymous visit journey (Admin → Funnel). The browser batches events to /api/j; the server adds device, browser and
// IP country (the IP itself is never stored). Props hold field names, sections and button labels, never typed values.

export const JOURNEY_EVENTS = [
  "page_view",
  "page_leave",
  "scroll", // depth milestone: 25 / 50 / 75 / 100
  "section", // a landing section came into view
  "click", // button or link (label, no personal data)
  "rage_click", // 3+ clicks on the same element within a second
  "bundle_select",
  "lang_switch",
  "exit_popup_shown",
  "exit_popup_submit",
  "checkout_view",
  "field_focus", // first focus of a checkout field
  "field_done", // field left filled in
  "field_error", // validation error shown on a field
  "country_change",
  "method_select",
  "bump_toggle",
  "promo_apply",
  "pay_click",
  "pay_invalid",
  "offer_shown", // one-time offer before payment
  "offer_accept",
  "offer_decline",
  "payment_start",
  "payment_error",
  "mbway_wait",
  "mbway_result",
  "upsell_view", // one-time offer after payment
  "upsell_accept",
  "upsell_decline",
  "thankyou_view",
  "js_error",
] as const;
export type JourneyEvent = (typeof JOURNEY_EVENTS)[number];

const Id = z.string().regex(/^[A-Za-z0-9_.-]{6,64}$/);
const Prop = z.union([z.string().max(200), z.number(), z.boolean(), z.null(), z.array(z.string().max(60)).max(20)]);

export const JourneyBatch = z.object({
  sid: Id,
  src: z.string().max(60).optional(),
  pid: Id.optional(),
  path: z.string().max(200).optional(),
  locale: z.string().max(5).optional(),
  at: z.number().int().min(0).max(86_400_000).optional(), // page time when the batch was sent, to date each event
  events: z
    .array(
      z.object({
        n: z.enum(JOURNEY_EVENTS),
        ms: z.number().int().min(0).max(86_400_000).optional(),
        p: z.record(z.string().max(30), Prop).optional(),
        o: z.string().max(40).optional(),
      }),
    )
    .min(1)
    .max(60),
});
export type JourneyBatch = z.infer<typeof JourneyBatch>;

// JavaScript errors thrown by the Facebook / Instagram in-app browsers' own injected bridge (Android WebView), or by
// cross-origin scripts with no details. Not the site's code and invisible to the visitor, so Admin → Funnel lists
// them apart instead of counting them as visits with problems. Kept as a SQL regex too (case-insensitive).
export const IN_APP_NOISE_PATTERN = "Java object is gone|Error invoking postMessage|webkit\\.messageHandlers|^Script error\\.?$";
const IN_APP_NOISE = new RegExp(IN_APP_NOISE_PATTERN, "i");

export function isInAppNoise(msg: unknown): boolean {
  return typeof msg === "string" && IN_APP_NOISE.test(msg.trim());
}

/** Device class and browser family from the user agent (only these two values are kept). */
export function deviceOf(ua: string | null | undefined): { device: string; browser: string } {
  const s = ua ?? "";
  const device = /iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(s) ? "tablet" : /Mobi|iPhone|iPod|Android|IEMobile|Opera Mini/i.test(s) ? "mobile" : "desktop";
  const browser = /FBAN|FBAV|FB_IAB/.test(s)
    ? "Facebook app"
    : /Instagram/.test(s)
      ? "Instagram app"
      : /Edg\//.test(s)
        ? "Edge"
        : /SamsungBrowser/.test(s)
          ? "Samsung"
          : /OPR\/|Opera/.test(s)
            ? "Opera"
            : /Firefox|FxiOS/.test(s)
              ? "Firefox"
              : /Chrome|CriOS/.test(s)
                ? "Chrome"
                : /Safari/.test(s)
                  ? "Safari"
                  : "Other";
  return { device, browser };
}

/** Drops anything that looks like an email or phone number, in case a label ever carries one. */
export function cleanProps(p: Record<string, unknown> | undefined) {
  if (!p) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) {
    if (typeof v === "string" && (/@/.test(v) || /\d[\d\s]{7,}/.test(v))) continue;
    out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

export async function saveJourney(b: JourneyBatch, ctx: { ua: string | null; country: string | null }) {
  const { device, browser } = deviceOf(ctx.ua);
  const path = b.path?.split("?")[0] ?? null;
  const now = Date.now();
  // Events are sent in batches: date each one by how long before the send it happened (at most 1 hour back).
  const when = (ms?: number) => new Date(now - (b.at != null && ms != null ? Math.min(3_600_000, Math.max(0, b.at - ms)) : 0));
  await db.insert(schema.journeyEvents).values(
    b.events.map((e) => ({
      sessionId: b.sid,
      pageId: b.pid ?? null,
      name: e.n,
      path,
      props: cleanProps(e.p),
      ms: e.ms ?? null,
      source: b.src ?? null,
      device,
      browser,
      country: ctx.country,
      locale: b.locale ?? null,
      orderId: e.o ?? null,
      createdAt: when(e.ms),
    })),
  );
}

/** Order of a visit: the order its checkout opened (tracking_events keeps the visit id with the order). */
export async function orderOfSession(sid: string) {
  const [r] = await db
    .select({ orderId: schema.trackingEvents.orderId })
    .from(schema.trackingEvents)
    .where(and(eq(schema.trackingEvents.sessionId, sid), eq(schema.trackingEvents.eventName, "CheckoutOpened"), isNotNull(schema.trackingEvents.orderId)))
    .limit(1);
  return r?.orderId ?? null;
}

export const JOURNEY_RETENTION_DAYS = 90;

export async function pruneJourney(now = new Date()) {
  const before = new Date(now.getTime() - JOURNEY_RETENTION_DAYS * 86_400_000);
  await db.delete(schema.journeyEvents).where(lt(schema.journeyEvents.createdAt, before));
}
