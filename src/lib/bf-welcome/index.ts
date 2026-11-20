// Black Friday welcome sequence (David, 20/11/2026). Who: everyone who gives an email with marketing consent (the
// leads table: the Black Friday signup box and the exit popup), plus, while the backfill switch is on, people who
// signed up in the last 10 days. What: one email a day in their language, from signup until the Black Friday cutoff:
// a welcome with their market's offer, then content and offer emails, and "last day" on the cutoff day.
// Every row is re-checked before sending: unsubscribed, bounced, already bought this Black Friday or offer over
// means it is skipped. One row per person per day (unique email+day): a restart or a second worker never sends twice.
import { and, eq, gte, inArray, isNull, like, lte, notInArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSettings } from "../settings";
import { getCatalog } from "../catalog";
import { SITE } from "../site";
import { unsubscribeUrl } from "../leads";
import { zonedDate, zonedToUtc } from "../time";
import { dayMonthFor, moneyFor, moneyShortFor } from "../i18n";
import { fmt } from "../i18n/rich";
import { BF_OFFERS, bfHref, isBfLocale, type BfOffer } from "../black-friday";
import { sendMarketingEmail } from "../email";
import { KINDS, MIDDLE, WELCOME_COPY, WELCOME_LOCALES, type Kind, type WelcomeLocale } from "./copy";

const T = schema.bfWelcomeEmails;
const PAID = ["paid", "preparing", "shipped", "delivered"] as const;
const SEND_HOUR = "10:00";
const BACKFILL_DAYS = 10;
/** Without the backfill switch, only people who signed up after the sequence went live. */
const LAUNCHED_AT = new Date("2026-11-20T19:00:00Z");
const MAX_EMAILS = 8; // welcome + 6 middle + last day

export const isWelcomeLocale = (l: unknown): l is WelcomeLocale => typeof l === "string" && (WELCOME_LOCALES as string[]).includes(l);

/** The subscriber's time zone, by language (the market the page sells to). */
const TZ: Record<WelcomeLocale, string> = { es: "Europe/Madrid", de: "Europe/Berlin", nl: "Europe/Amsterdam", fr: "Europe/Brussels", pt: "Europe/Lisbon", ru: "Europe/Berlin" };

/** The offer each language is sold, and its page: Poço do Canto (the best seller), the Cheda box for the Russian page. */
export function offerFor(locale: WelcomeLocale): { offer: BfOffer; path: string; image: string } {
  if (locale === "ru") return { offer: BF_OFFERS.douro6, path: bfHref("ru", BF_OFFERS.douro6), image: "/email/bf/cheda-hero.jpg" };
  const offer = locale === "es" || locale === "pt" ? BF_OFFERS.poco : BF_OFFERS.pocoeu;
  // The Portuguese Poço do Canto page is /pt/black-friday/poco-do-canto (added with the Portugal campaign).
  const path = isBfLocale(locale) ? bfHref(locale, offer) : `/${locale}/black-friday/${offer.path}`;
  return { offer, path, image: "/email/bf/poco-row.jpg" };
}

const productNameOf = (offer: BfOffer, locale: WelcomeLocale) =>
  ((offer.productName as Partial<Record<string, string>>)[locale] ?? Object.values(offer.productName)[0] ?? "").replace(/^Black Friday · /, "");

const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** The send times: now, then every day at 10:00 local until the cutoff (the last one is the cutoff day). */
export function scheduleFor(locale: WelcomeLocale, cutoffIso: string, now = new Date()): { day: number; kind: Kind; at: Date }[] {
  const cutoff = new Date(cutoffIso);
  if (!(now < cutoff)) return [];
  const tz = TZ[locale];
  const today = zonedDate(now, tz);
  const later: Date[] = [];
  for (let k = 1; k <= 30; k++) {
    const at = zonedToUtc(addDays(today, k), SEND_HOUR, tz);
    if (at >= cutoff) break;
    later.push(at);
  }
  const dates = [now, ...later.slice(-(MAX_EMAILS - 1))];
  const n = dates.length;
  const kinds: Kind[] = n === 1 ? ["welcome"] : ["welcome", ...MIDDLE.slice(0, n - 2), "last_chance"];
  return dates.map((at, i) => ({ day: i, kind: kinds[i], at }));
}

const boughtThisBlackFriday = async (email: string) =>
  (
    await db
      .select({ id: schema.orders.id })
      .from(schema.orders)
      .where(and(sql`lower(${schema.orders.email}) = ${email}`, inArray(schema.orders.status, [...PAID]), like(schema.orders.bundleKey, "bf%")))
      .limit(1)
  ).length > 0;

/** Puts one person on the sequence (no-op when already on it, after the cutoff or when switched off). */
export async function enrollWelcome(email0: string, name: string | null, locale: WelcomeLocale, now = new Date()) {
  const email = email0.trim().toLowerCase();
  const settings = await getSettings();
  if (!settings.bf_welcome_enabled) return 0;
  const [already] = await db.select({ id: T.id }).from(T).where(eq(T.email, email)).limit(1);
  if (already || (await boughtThisBlackFriday(email))) return 0;
  const plan = scheduleFor(locale, settings.black_friday.cutoff_at, now);
  if (!plan.length) return 0;
  const rows = await db
    .insert(T)
    .values(plan.map((p) => ({ email, name: name?.trim() || null, locale, day: p.day, kind: p.kind, scheduledAt: p.at })))
    .onConflictDoNothing()
    .returning({ id: T.id });
  return rows.length;
}

/** Leads with marketing consent who are not on the sequence yet (new signups, and the last 10 days with backfill). */
async function enrollFromLeads(backfill: boolean) {
  const since = backfill ? new Date(Date.now() - BACKFILL_DAYS * 86_400_000) : LAUNCHED_AT;
  const L = schema.leads;
  const leads = await db
    .select({ email: L.email, name: L.name, locale: L.locale })
    .from(L)
    .where(
      and(
        eq(L.consentMarketing, true),
        isNull(L.unsubscribedAt),
        gte(L.createdAt, since),
        inArray(L.locale, WELCOME_LOCALES),
        sql`not exists (select 1 from ${T} where ${T.email} = lower(${L.email}))`,
      ),
    )
    .limit(200);
  let n = 0;
  for (const l of leads) if (isWelcomeLocale(l.locale)) n += (await enrollWelcome(l.email, l.name, l.locale)) > 0 ? 1 : 0;
  return n;
}

// ---- Rendering ---------------------------------------------------------------------------------------------------

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
const strong = (s: string) => s.replace(/<b>/g, '<strong style="color:#111">').replace(/<\/b>/g, "</strong>");

export type WelcomeVars = {
  name: string | null;
  product: string;
  price: string;
  regular: string | null;
  perBottle: string;
  two: string;
  date: string;
  stats: { orders: number; multi: number; gift: number } | null;
  palhete: boolean;
  link: string;
  image: string;
  unsubscribe: string;
};

const IMAGE: Record<Kind, "product" | "gift" | "douro"> = {
  welcome: "product",
  gifting: "gift",
  producer: "douro",
  offer2: "product",
  pairing: "gift",
  gift_guide: "gift",
  storage: "douro",
  last_chance: "product",
};

/** Subject, preheader and HTML of one email. Pure: the values are looked up by the caller (and the preview). */
export function renderWelcome(locale: WelcomeLocale, kind: Kind, day: number, v: WelcomeVars) {
  const c = WELCOME_COPY[locale];
  const m = c.mails[kind];
  const vars: Record<string, string> = {
    name: esc(v.name ?? ""),
    product: esc(v.product),
    price: v.price,
    regular: v.regular ?? v.price,
    perBottle: v.perBottle,
    two: v.two,
    date: v.date,
    palhete: v.palhete ? c.palhete : "",
    stats: v.stats ? fmt(c.stats, { orders: String(v.stats.orders), multi: String(v.stats.multi), gift: String(v.stats.gift) }) : "",
  };
  const subject = fmt(m.subject, vars);
  const pre = fmt(m.pre, vars);
  const utm = `utm_source=email&utm_medium=welcome&utm_campaign=bf_welcome&utm_content=day${day}_${kind}`;
  const href = `${v.link}${v.link.includes("?") ? "&" : "?"}${utm}`;
  const imgKey = IMAGE[kind];
  const img = imgKey === "product" ? v.image : imgKey === "gift" ? "/email/bf/gift.jpg" : "/email/bf/story-douro.jpg";
  const paragraphs = m.p
    .map((p) => fmt(p, vars).trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 14px">${strong(p)}</p>`)
    .join("\n");
  const greeting = v.name ? fmt(c.hello, { name: esc(v.name.split(/\s+/)[0]) }) : c.helloAnon;
  const nb = (s: string) => `<span style="white-space:nowrap">${s}</span>`;
  const offerLine = v.regular ? fmt(c.offerLine, { price: nb(v.price), regular: `<s style="color:#888;white-space:nowrap">${v.regular}</s>` }) : nb(v.price);
  const btn = (label: string) =>
    `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px auto 4px"><tr><td style="background:#e3161b;border-radius:6px"><a href="${esc(href)}" style="display:inline-block;padding:14px 26px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none">${esc(label)}</a></td></tr></table>`;
  const offerBox = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 6px;border:2px solid #e3161b;border-radius:10px"><tr><td style="padding:18px;text-align:center;font-family:Arial,Helvetica,sans-serif">
${imgKey === "product" ? "" : `<img src="${SITE.url}${v.image}" width="480" alt="${esc(v.product)}" style="display:block;width:100%;max-width:480px;height:auto;margin:0 auto 12px;border-radius:6px">`}
<div style="font-size:14px;font-weight:bold;color:#111">${esc(v.product)}</div>
<div style="margin-top:6px;font-size:24px;font-weight:bold;color:#e3161b">${offerLine}</div>
<div style="margin-top:4px;font-size:13px;color:#444">${esc(fmt(c.offerSub, { perBottle: v.perBottle, date: v.date }))}</div>
${btn(kind === "last_chance" ? c.ctaLast : c.cta)}
</td></tr></table>`;
  const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(subject)}</title></head>
<body style="margin:0;background:#f1efec">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(pre)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1efec"><tr><td align="center" style="padding:20px 10px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:10px;overflow:hidden">
<tr><td style="background:#0b0b0c;padding:18px 24px;text-align:center"><img src="${SITE.url}/email/bf/logo-light.png" width="120" alt="Wine Portugal" style="display:inline-block;height:auto;border:0"></td></tr>
<tr><td style="background:#e3161b;padding:7px 12px;text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:bold;letter-spacing:1px;color:#ffffff">BLACK FRIDAY · ${esc(v.date)}</td></tr>
<tr><td><img src="${SITE.url}${img}" width="560" alt="" style="display:block;width:100%;max-width:560px;height:auto;border:0"></td></tr>
<tr><td style="padding:24px 26px 8px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55;color:#222">
<h1 style="margin:0 0 14px;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.2;color:#111">${esc(fmt(m.title, vars))}</h1>
<p style="margin:0 0 14px">${greeting}</p>
${paragraphs}
${offerBox}
</td></tr>
<tr><td style="padding:18px 26px 22px;background:#0b0b0c;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#b9b9b9">
<p style="margin:0 0 8px">${esc(fmt(c.why, { date: v.date }))} <a href="${esc(v.unsubscribe)}" style="color:#ffffff;text-decoration:underline">${esc(c.unsub)}</a></p>
<p style="margin:0 0 8px">${esc(SITE.legalName)} · ${esc(SITE.address)}</p>
<p style="margin:0">${esc(c.adult)}</p>
</td></tr>
</table></td></tr></table></body></html>`;
  return { subject, pre, html };
}

/** The shop's own Black Friday numbers for the gifting email (only with enough orders to mean something). */
async function shopStats(): Promise<WelcomeVars["stats"]> {
  const [r] = await db
    .select({
      n: sql<number>`count(*)::int`,
      multi: sql<number>`count(*) filter (where ${schema.orders.qtyBoxes} >= 2)::int`,
      gift: sql<number>`count(*) filter (where ${schema.orders.isGift})::int`,
    })
    .from(schema.orders)
    .where(and(inArray(schema.orders.status, [...PAID]), like(schema.orders.bundleKey, "bf%")));
  if (!r || r.n < 20) return null;
  return { orders: r.n, multi: Math.round((100 * r.multi) / r.n), gift: Math.round((100 * r.gift) / r.n) };
}

/** Everything an email needs about the offer, from the catalog (prices) and settings (date). */
export async function varsFor(locale: WelcomeLocale, email: string, name: string | null, stats: WelcomeVars["stats"]): Promise<WelcomeVars | null> {
  const settings = await getSettings();
  const { offer, path, image } = offerFor(locale);
  const cat = await getCatalog(offer.slug);
  const b1 = cat?.bundles.find((b) => b.qty === 1);
  const b2 = cat?.bundles.find((b) => b.qty === 2);
  if (!b1) return null;
  const money = moneyFor(locale);
  const short = moneyShortFor(locale);
  return {
    name,
    product: productNameOf(offer, locale),
    price: short(b1.priceCents),
    regular: b1.compareAtCents && b1.compareAtCents > b1.priceCents ? short(b1.compareAtCents) : null,
    perBottle: money(Math.round(b1.priceCents / offer.bottlesPerBox)),
    two: short(b2?.priceCents ?? b1.priceCents * 2),
    date: dayMonthFor(locale, settings.black_friday.cutoff_at).replace(/\.$/, ""),
    stats,
    palhete: offer.id === "poco" || offer.id === "pocoeu",
    link: `${SITE.url}${path}`,
    image,
    unsubscribe: unsubscribeUrl(SITE.url, email),
  };
}

// ---- Worker -------------------------------------------------------------------------------------------------------

/** Enrolls new signups, then sends what is due. Called every minute by the worker (instrumentation-node.ts). */
export async function processBfWelcome(limit = 40) {
  const settings = await getSettings();
  if (!settings.bf_welcome_enabled) return 0;
  await enrollFromLeads(settings.bf_welcome_backfill);
  const claimed = await db.execute<{ id: number }>(sql`
    update bf_welcome_emails set status = 'running'
    where id in (select id from bf_welcome_emails where status = 'pending' and scheduled_at <= now() order by scheduled_at limit ${limit} for update skip locked)
    returning id`);
  const ids = [...claimed].map((r) => r.id);
  if (!ids.length) return 0;
  const rows = await db.select().from(T).where(inArray(T.id, ids));
  const cutoff = new Date(settings.black_friday.cutoff_at);
  let stats: WelcomeVars["stats"] | undefined;
  for (const row of rows) {
    const done = (status: string, result: Record<string, unknown>) =>
      db.update(T).set({ status, result, ...(status === "sent" ? { sentAt: new Date() } : {}) }).where(eq(T.id, row.id));
    try {
      const reason = await skipReason(row, cutoff);
      if (reason) {
        await done("skipped", { reason });
        // Bought or unsubscribed: nothing else for this person.
        if (reason === "bought" || reason === "unsubscribed") {
          await db.update(T).set({ status: "skipped", result: { reason } }).where(and(eq(T.email, row.email), eq(T.status, "pending")));
        }
        continue;
      }
      const locale = isWelcomeLocale(row.locale) ? row.locale : "es";
      const kind = (KINDS as readonly string[]).includes(row.kind) ? (row.kind as Kind) : "welcome";
      if (kind === "gifting" && stats === undefined) stats = await shopStats();
      const v = await varsFor(locale, row.email, row.name, stats ?? null);
      if (!v) {
        await done("skipped", { reason: "offer_unavailable" });
        continue;
      }
      const { subject, html } = renderWelcome(locale, kind, row.day, v);
      const r = (await sendMarketingEmail(row.email, subject, html, `bf_welcome_${kind}`)) as { skipped?: boolean; error?: unknown; id?: string; data?: { id?: string } } | undefined;
      const err = r && "error" in r && r.error ? (typeof r.error === "string" ? r.error : JSON.stringify(r.error)) : null;
      if (r?.skipped) await done("failed", { reason: "email_not_configured" });
      else if (err) await done("failed", { error: err.slice(0, 300) });
      else await done("sent", { id: r?.id ?? r?.data?.id ?? null, subject });
    } catch (e) {
      await done("failed", { error: String(e).slice(0, 300) });
    }
  }
  return rows.length;
}

async function skipReason(row: typeof T.$inferSelect, cutoff: Date): Promise<string | null> {
  if (new Date() >= cutoff) return "offer_ended";
  // A server that was down does not send yesterday's email today, unless it is the welcome (sent late is fine).
  if (row.day > 0 && Date.now() - row.scheduledAt.getTime() > 20 * 3600_000) return "stale";
  const [lead] = await db.select({ consent: schema.leads.consentMarketing, unsub: schema.leads.unsubscribedAt }).from(schema.leads).where(sql`lower(${schema.leads.email}) = ${row.email}`).limit(1);
  if (lead && (!lead.consent || lead.unsub)) return "unsubscribed";
  const [contact] = await db
    .select({ status: schema.newsletterContacts.status })
    .from(schema.newsletterContacts)
    .where(and(eq(schema.newsletterContacts.email, row.email), notInArray(schema.newsletterContacts.status, ["subscribed"])))
    .limit(1);
  if (contact) return contact.status === "unsubscribed" ? "unsubscribed" : `contact_${contact.status}`;
  if (await boughtThisBlackFriday(row.email)) return "bought";
  return null;
}

/** Admin: counts by status and the latest rows. */
export async function welcomeOverview(limit = 40) {
  const counts = await db.select({ status: T.status, n: sql<number>`count(*)::int` }).from(T).groupBy(T.status);
  const people = await db.select({ n: sql<number>`count(distinct ${T.email})::int` }).from(T);
  const recent = await db
    .select()
    .from(T)
    .where(lte(T.scheduledAt, new Date(Date.now() + 2 * 86_400_000)))
    .orderBy(sql`${T.scheduledAt} desc`)
    .limit(limit);
  return { counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) as Record<string, number>, people: people[0]?.n ?? 0, recent };
}
