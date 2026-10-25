// Admin → Funnel: step-by-step funnel, breakdowns, checkout field drop-off, landing engagement and single visits,
// all from the anonymous visit journey (journey_events).
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { BOT_SOURCE } from "./bots";
import { db, schema } from "@/db";
import { PAID_STATUSES } from "./stats";
import { IN_APP_NOISE_PATTERN } from "./journey";

export type JourneyFilter = { since: Date | null; source?: string; device?: string; country?: string; adsOnly?: boolean };

export type SessionRow = {
  sessionId: string;
  firstAt: Date;
  lastAt: Date;
  source: string;
  device: string;
  browser: string;
  country: string;
  locale: string;
  pages: number;
  events: number;
  maxScroll: number;
  activeMs: number;
  sawOffers: boolean;
  clickedBuy: boolean;
  checkout: boolean;
  started: boolean;
  contact: boolean;
  address: boolean;
  payClick: boolean;
  paymentStart: boolean;
  paymentError: boolean;
  orderId: string | null;
  purchased: boolean;
  lastField: string | null;
  rage: number;
  jsErrors: number;
};

const CONTACT_FIELDS = ["email", "tel"];
const ADDRESS_FIELDS = ["address-line1", "postal-code", "city"];

export const FUNNEL_STEPS = [
  { key: "visit", label: "Visited", hint: "Opened any page" },
  { key: "sawOffers", label: "Saw the offers", hint: "Scrolled to the bundles (1, 2 or 4 boxes)" },
  { key: "clickedBuy", label: "Clicked to buy", hint: "Clicked “Encomendar” on the landing page" },
  { key: "checkout", label: "Checkout opened", hint: "Checkout page loaded" },
  { key: "started", label: "Started the form", hint: "Clicked into the first checkout field" },
  { key: "contact", label: "Contact filled", hint: "Email or mobile filled in" },
  { key: "address", label: "Address filled", hint: "Address, postal code or city filled in" },
  { key: "payClick", label: "Clicked “Pagar”", hint: "Submitted the checkout form" },
  { key: "paymentStart", label: "Payment started", hint: "MB WAY sent, Multibanco reference, card or redirect started" },
  { key: "purchased", label: "Purchased", hint: "Order paid" },
] as const;
export type StepKey = (typeof FUNNEL_STEPS)[number]["key"];

const list = (xs: string[]) => sql.join(xs.map((x) => sql`${x}`), sql`, `);

/** One row per visit (browser tab) in the period, with the furthest steps it reached. */
export async function journeySessions(f: JourneyFilter): Promise<SessionRow[]> {
  const since = f.since ?? new Date(0);
  const rows = (await db.execute(sql`
    with s as (
      select
        session_id,
        min(created_at) as first_at,
        max(created_at) as last_at,
        (array_agg(source order by id) filter (where source is not null))[1] as source,
        (array_agg(device order by id))[1] as device,
        (array_agg(browser order by id))[1] as browser,
        (array_agg(country order by id) filter (where country is not null))[1] as country,
        (array_agg(locale order by id) filter (where locale is not null))[1] as locale,
        count(*) filter (where name = 'page_view')::int as pages,
        count(*)::int as events,
        coalesce(max((props->>'pct')::int) filter (where name = 'scroll'), 0) as max_scroll,
        coalesce(sum((props->>'active')::int) filter (where name = 'page_leave'), 0)::bigint as active_ms,
        bool_or(name = 'section' and props->>'id' = 'escolher') as saw_offers,
        bool_or(name = 'click' and props->>'label' = 'checkout_cta') as clicked_buy,
        bool_or(name = 'checkout_view') as checkout,
        bool_or(name = 'field_focus' and path like '%checkout%') as started,
        bool_or(name = 'field_done' and props->>'field' in (${list(CONTACT_FIELDS)}) and props->>'filled' = 'true') as contact,
        bool_or(name = 'field_done' and props->>'field' in (${list(ADDRESS_FIELDS)}) and props->>'filled' = 'true') as address,
        bool_or(name = 'pay_click') as pay_click,
        bool_or(name = 'payment_start') as payment_start,
        bool_or(name = 'payment_error') as payment_error,
        max(order_id) as order_id,
        (array_agg(props->>'field' order by id desc) filter (where name in ('field_focus', 'field_done') and path like '%checkout%'))[1] as last_field,
        count(*) filter (where name = 'rage_click')::int as rage,
        count(*) filter (where name = 'js_error' and coalesce(props->>'msg', '') !~* ${IN_APP_NOISE_PATTERN})::int as js_errors
      from journey_events
      where created_at >= ${since.toISOString()}::timestamptz
      group by session_id
    )
    select s.*, coalesce(o.status::text in (${list([...PAID_STATUSES])}), false) as purchased
    from s left join orders o on o.id = s.order_id
    order by s.first_at desc
  `)) as unknown as Record<string, unknown>[];

  const out = rows.map(
    (r): SessionRow => ({
      sessionId: String(r.session_id),
      firstAt: new Date(r.first_at as string),
      lastAt: new Date(r.last_at as string),
      source: (r.source as string) ?? "Unknown",
      device: (r.device as string) ?? "Unknown",
      browser: (r.browser as string) ?? "Other",
      country: (r.country as string) ?? "??",
      locale: (r.locale as string) ?? "pt",
      pages: Number(r.pages),
      events: Number(r.events),
      maxScroll: Number(r.max_scroll),
      activeMs: Number(r.active_ms),
      sawOffers: !!r.saw_offers,
      clickedBuy: !!r.clicked_buy,
      checkout: !!r.checkout,
      started: !!r.started,
      contact: !!r.contact,
      address: !!r.address,
      payClick: !!r.pay_click,
      paymentStart: !!r.payment_start,
      paymentError: !!r.payment_error,
      orderId: (r.order_id as string) ?? null,
      purchased: !!r.purchased,
      lastField: (r.last_field as string) ?? null,
      rage: Number(r.rage),
      jsErrors: Number(r.js_errors),
    }),
  );
  return out.filter(
    (s) =>
      // Bots and tests only when asked for by name (Admin → Funnel → source "Bots & tests").
      (s.source !== BOT_SOURCE || f.source === BOT_SOURCE) &&
      (!f.adsOnly || s.source.endsWith(" ads")) &&
      (!f.source || s.source === f.source) &&
      (!f.device || s.device === f.device) &&
      (!f.country || s.country === f.country),
  );
}

/** A later step implies the earlier ones (a visit resumed from a recovery link may skip the landing page). */
export function reached(s: SessionRow, key: StepKey): boolean {
  const order: StepKey[] = FUNNEL_STEPS.map((x) => x.key);
  const own: Record<StepKey, boolean> = {
    visit: true,
    sawOffers: s.sawOffers,
    clickedBuy: s.clickedBuy,
    checkout: s.checkout,
    started: s.started,
    contact: s.contact,
    address: s.address,
    payClick: s.payClick,
    paymentStart: s.paymentStart,
    purchased: s.purchased,
  };
  const i = order.indexOf(key);
  return order.slice(i).some((k) => own[k]);
}

export function funnelOf(sessions: SessionRow[]) {
  return FUNNEL_STEPS.map((st) => ({ ...st, count: sessions.filter((s) => reached(s, st.key)).length }));
}

/** Sessions, checkouts, purchases and conversion by a dimension (source, device, browser, country, language). */
export function breakdown(sessions: SessionRow[], dim: "source" | "device" | "browser" | "country" | "locale") {
  const m = new Map<string, { key: string; sessions: number; sawOffers: number; checkout: number; payClick: number; purchased: number }>();
  for (const s of sessions) {
    const k = s[dim];
    const r = m.get(k) ?? m.set(k, { key: k, sessions: 0, sawOffers: 0, checkout: 0, payClick: 0, purchased: 0 }).get(k)!;
    r.sessions += 1;
    if (reached(s, "sawOffers")) r.sawOffers += 1;
    if (reached(s, "checkout")) r.checkout += 1;
    if (reached(s, "payClick")) r.payClick += 1;
    if (s.purchased) r.purchased += 1;
  }
  return [...m.values()].sort((a, b) => b.sessions - a.sessions);
}

/** Checkout fields: how many visits focused, completed and got an error on each, and where abandoned visits stopped. */
export async function fieldStats(sessions: SessionRow[], since: Date | null) {
  const ids = sessions.filter((s) => s.checkout).map((s) => s.sessionId);
  const abandonedAt = new Map<string, number>();
  for (const s of sessions) if (s.checkout && !s.purchased && s.lastField) abandonedAt.set(s.lastField, (abandonedAt.get(s.lastField) ?? 0) + 1);
  if (!ids.length) return [];
  const rows = await db
    .select({
      field: sql<string>`${schema.journeyEvents.props}->>'field'`,
      name: schema.journeyEvents.name,
      n: sql<number>`count(distinct ${schema.journeyEvents.sessionId})::int`,
      filled: sql<number>`count(distinct ${schema.journeyEvents.sessionId}) filter (where ${schema.journeyEvents.props}->>'filled' = 'true')::int`,
    })
    .from(schema.journeyEvents)
    .where(
      and(
        inArray(schema.journeyEvents.sessionId, ids.slice(0, 20000)),
        inArray(schema.journeyEvents.name, ["field_focus", "field_done", "field_error"]),
        sql`${schema.journeyEvents.path} like '%checkout%'`,
        ...(since ? [gte(schema.journeyEvents.createdAt, since)] : []),
      ),
    )
    .groupBy(sql`${schema.journeyEvents.props}->>'field'`, schema.journeyEvents.name);
  const m = new Map<string, { field: string; focused: number; filled: number; errors: number; abandoned: number }>();
  const row = (f: string) => m.get(f) ?? m.set(f, { field: f, focused: 0, filled: 0, errors: 0, abandoned: abandonedAt.get(f) ?? 0 }).get(f)!;
  for (const r of rows) {
    if (!r.field) continue;
    if (r.name === "field_focus") row(r.field).focused = r.n;
    if (r.name === "field_done") row(r.field).filled = r.filled;
    if (r.name === "field_error") row(r.field).errors = r.n;
  }
  return [...m.values()].sort((a, b) => b.focused - a.focused);
}

/** Top validation messages, payment errors, clicks, rage clicks and JS errors in the period. */
export async function topEvents(sessions: SessionRow[], since: Date | null) {
  const ids = sessions.map((s) => s.sessionId).slice(0, 50000);
  if (!ids.length) return { clicks: [], rage: [], errors: [], payment: [], js: [], jsNoise: [], sections: [] };
  const by = async (name: string, key: ReturnType<typeof sql>, limit = 15, extra?: ReturnType<typeof sql>) =>
    (await db
      .select({ key: sql<string>`${key}`, n: sql<number>`count(*)::int`, sessions: sql<number>`count(distinct ${schema.journeyEvents.sessionId})::int` })
      .from(schema.journeyEvents)
      .where(and(eq(schema.journeyEvents.name, name), inArray(schema.journeyEvents.sessionId, ids), ...(since ? [gte(schema.journeyEvents.createdAt, since)] : []), ...(extra ? [extra] : [])))
      .groupBy(sql`1`)
      .orderBy(desc(sql`3`))
      .limit(limit)) as { key: string; n: number; sessions: number }[];
  const p = schema.journeyEvents.props;
  const msg = sql`coalesce(${p}->>'msg', '')`;
  const [clicks, rage, errors, payment, js, jsNoise, sections] = await Promise.all([
    by("click", sql`coalesce(${schema.journeyEvents.path}, '') || ' · ' || coalesce(${p}->>'label', '')`, 20),
    by("rage_click", sql`coalesce(${schema.journeyEvents.path}, '') || ' · ' || coalesce(${p}->>'label', '')`),
    by("field_error", sql`coalesce(${p}->>'field', '') || ' · ' || coalesce(${p}->>'msg', '')`),
    by("payment_error", sql`coalesce(${p}->>'stage', '') || ' · ' || coalesce(${p}->>'method', '') || ' · ' || coalesce(nullif(${p}->>'code', ''), ${p}->>'msg', '')`),
    by("js_error", sql`coalesce(${p}->>'msg', '') || ' ' || coalesce(${p}->>'at', '')`, 15, sql`${msg} !~* ${IN_APP_NOISE_PATTERN}`),
    by("js_error", sql`coalesce(${p}->>'msg', '') || ' ' || coalesce(${p}->>'at', '')`, 5, sql`${msg} ~* ${IN_APP_NOISE_PATTERN}`),
    by("section", sql`${p}->>'id'`, 20),
  ]);
  return { clicks, rage, errors, payment, js, jsNoise, sections };
}

/** Every event of one visit, merged with its order's server-side events (payments, status changes, upsells). */
export async function sessionTimeline(sid: string) {
  const events = await db.select().from(schema.journeyEvents).where(eq(schema.journeyEvents.sessionId, sid)).orderBy(asc(schema.journeyEvents.createdAt), asc(schema.journeyEvents.id)).limit(3000);
  const orderId = events.find((e) => e.orderId)?.orderId ?? null;
  const [orderEvents, order] = orderId
    ? await Promise.all([
        db.select().from(schema.orderEvents).where(eq(schema.orderEvents.orderId, orderId)).orderBy(asc(schema.orderEvents.createdAt)),
        db.select({ id: schema.orders.id, status: schema.orders.status, totalCents: schema.orders.totalCents }).from(schema.orders).where(eq(schema.orders.id, orderId)).then((r) => r[0] ?? null),
      ])
    : [[], null];
  return { events, orderId, order, orderEvents };
}

/** Visits of an order (an order can be resumed in another tab, e.g. from a recovery link). */
export async function sessionsOfOrder(orderId: string) {
  const rows = await db.selectDistinct({ sid: schema.journeyEvents.sessionId }).from(schema.journeyEvents).where(eq(schema.journeyEvents.orderId, orderId));
  return rows.map((r) => r.sid);
}
