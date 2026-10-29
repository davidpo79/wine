// Newsletter: contacts (imported files, site buyers, leads with marketing consent), campaigns and the sending worker.
// Sending goes through the shop's own Resend account in batches of 100, one row per recipient, so a restart or a
// deploy never sends twice and never loses the rest of a campaign.
import { createHmac, timingSafeEqual } from "node:crypto";
import { unzipSync, strFromU8 } from "fflate";
import { Resend } from "resend";
import { and, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { NewsletterCampaign } from "@/db/schema";
import { SITE } from "../site";
import { shopAddress } from "../inbox";
import { renderNewsletter, slugify, themeOf, type NewsletterContent } from "./templates";

const C = schema.newsletterContacts;
const S = schema.newsletterSends;
const K = schema.newsletterCampaigns;
const PAID = ["paid", "preparing", "shipped", "delivered"] as const;

export const BATCH = 100; // Resend batch limit
export const PER_TICK = 500; // per worker tick (1 min): a 1 200-contact list goes out in about 3 minutes

export const EMAIL_RX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
export const normEmail = (e: unknown) => String(e ?? "").trim().toLowerCase();
const cleanName = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);

export function newsletterFrom() {
  return process.env.NEWSLETTER_FROM || process.env.EMAIL_FROM || "";
}
export const newsletterConfigured = () => !!(process.env.RESEND_API_KEY && newsletterFrom());

// ---- Files ------------------------------------------------------------------------------------------------------

export type ParsedContact = { email: string; firstName: string; lastName: string };

function splitCsvLine(line: string, sep: string) {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') (cur += '"'), i++;
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) out.push(cur), (cur = "");
    else cur += ch;
  }
  out.push(cur);
  return out;
}

const colIndex = (ref: string) => [...ref.replace(/\d+/g, "")].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
const xmlText = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");

/** The first sheet of an .xlsx as rows of strings (shared strings, inline strings and numbers). */
export function xlsxRows(bytes: Uint8Array): string[][] {
  const files = unzipSync(bytes, { filter: (f) => f.name === "xl/sharedStrings.xml" || /^xl\/worksheets\/sheet\d+\.xml$/.test(f.name) });
  const shared = files["xl/sharedStrings.xml"] ? [...strFromU8(files["xl/sharedStrings.xml"]).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => xmlText(m[1])) : [];
  const sheetName = Object.keys(files)
    .filter((n) => n.startsWith("xl/worksheets/"))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))[0];
  if (!sheetName) return [];
  const xml = strFromU8(files[sheetName]);
  const rows: string[][] = [];
  for (const r of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const c of r[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const ref = attrs.match(/r="([A-Z]+\d+)"/)?.[1];
      const type = attrs.match(/t="(\w+)"/)?.[1];
      const inner = c[2] ?? "";
      let v = "";
      if (type === "s") v = shared[Number(inner.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? -1)] ?? "";
      else if (type === "inlineStr") v = xmlText(inner.match(/<is>([\s\S]*?)<\/is>/)?.[1] ?? "");
      else v = xmlText(inner.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? "");
      row[ref ? colIndex(ref) : row.length] = v;
    }
    rows.push(Array.from(row, (x) => x ?? ""));
  }
  return rows;
}

export function csvRows(text: string): string[][] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const head = lines[0];
  const sep = [";", ",", "\t"].sort((a, b) => head.split(b).length - head.split(a).length)[0];
  return lines.map((l) => splitCsvLine(l, sep));
}

/**
 * Finds the e-mail and name columns from the header (pt/en/es/fr/de names, or the column whose values look like
 * e-mails). A single "Nome" column is split into first name and the rest.
 */
export function contactsFromRows(rows: string[][]): { contacts: ParsedContact[]; invalid: number; duplicates: number } {
  if (!rows.length) return { contacts: [], invalid: 0, duplicates: 0 };
  const head = rows[0].map((h) => h.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim());
  const find = (...names: RegExp[]) => head.findIndex((h) => names.some((n) => n.test(h)));
  let iEmail = find(/^e-?mail/, /correo/, /email address/);
  const headerRow = iEmail >= 0;
  if (!headerRow) iEmail = rows[0].findIndex((v) => EMAIL_RX.test(normEmail(v)));
  const iFirst = headerRow ? find(/^(first|primeiro) ?name$/, /^primeiro nome$/, /^first$/, /^vorname$/, /^prenom$/, /^nombre$/) : -1;
  const iLast = headerRow ? find(/^(last|ultimo) ?name$/, /^apelido$/, /^sobrenome$/, /^surname$/, /^nachname$/, /^nom de famille$/, /^apellidos?$/) : -1;
  const iFull = headerRow ? find(/^nome( completo)?$/, /^name$/, /^full ?name$/, /^nom$/, /^cliente$/, /^customer$/) : -1;
  const data = headerRow ? rows.slice(1) : rows;
  const seen = new Set<string>();
  const contacts: ParsedContact[] = [];
  let invalid = 0;
  let duplicates = 0;
  for (const r of data) {
    const email = normEmail(r[iEmail]);
    if (!email) continue;
    if (!EMAIL_RX.test(email) || email.includes("..")) {
      invalid++;
      continue;
    }
    if (seen.has(email)) {
      duplicates++;
      continue;
    }
    seen.add(email);
    let first = iFirst >= 0 ? cleanName(r[iFirst]) : "";
    let last = iLast >= 0 ? cleanName(r[iLast]) : "";
    if (!first && iFull >= 0) {
      const parts = cleanName(r[iFull]).split(" ");
      first = parts[0] ?? "";
      if (!last) last = parts.slice(1).join(" ");
    }
    contacts.push({ email, firstName: cap(first), lastName: last.replace(/\b\p{L}/gu, (m) => m.toUpperCase()) });
  }
  return { contacts, invalid, duplicates };
}

export function parseContactsFile(name: string, bytes: Uint8Array) {
  const rows = /\.xlsx$/i.test(name) ? xlsxRows(bytes) : csvRows(new TextDecoder().decode(bytes));
  return contactsFromRows(rows);
}

// ---- Contacts ---------------------------------------------------------------------------------------------------

export const cleanTag = (t: string) => slugify(t).slice(0, 40);

/** Adds or updates contacts. People who unsubscribed (or bounced) are never subscribed again by an import. */
export async function upsertContacts(list: ParsedContact[], tag: string, source: string) {
  let added = 0;
  let updated = 0;
  for (let i = 0; i < list.length; i += 500) {
    const chunk = list.slice(i, i + 500);
    const rows = await db
      .insert(C)
      .values(chunk.map((c) => ({ email: c.email, firstName: c.firstName || null, lastName: c.lastName || null, tags: tag ? [tag] : [], source })))
      .onConflictDoUpdate({
        target: C.email,
        set: {
          firstName: sql`coalesce(${C.firstName}, excluded.first_name)`,
          lastName: sql`coalesce(${C.lastName}, excluded.last_name)`,
          tags: sql`(select coalesce(jsonb_agg(distinct t), '[]'::jsonb) from jsonb_array_elements_text(${C.tags} || excluded.tags) t)`,
        },
      })
      .returning({ id: C.id, created: sql<boolean>`(xmax = 0)` });
    for (const r of rows) r.created ? added++ : updated++;
  }
  return { added, updated };
}

/** Site buyers (paid orders) and leads who agreed to marketing e-mails; leads who unsubscribed are unsubscribed here too. */
export async function syncFromShop() {
  const buyers = await db
    .selectDistinctOn([sql`lower(${schema.orders.email})`], { email: sql<string>`lower(${schema.orders.email})`, name: schema.orders.customerName })
    .from(schema.orders)
    .where(and(inArray(schema.orders.status, [...PAID]), isNotNull(schema.orders.email)));
  const b = contactsFromRows([["email", "nome"], ...buyers.map((r) => [r.email, r.name ?? ""])]).contacts;
  const leads = await db.select({ email: schema.leads.email, name: schema.leads.name, consent: schema.leads.consentMarketing, unsub: schema.leads.unsubscribedAt }).from(schema.leads);
  const l = contactsFromRows([["email", "nome"], ...leads.filter((x) => x.consent && !x.unsub).map((x) => [x.email, x.name])]).contacts;
  const r1 = await upsertContacts(b, "clientes-site", "site_orders");
  const r2 = await upsertContacts(l, "leads", "leads");
  const gone = leads.filter((x) => x.unsub).map((x) => x.email.toLowerCase());
  if (gone.length) await db.update(C).set({ status: "unsubscribed", statusAt: new Date() }).where(and(inArray(C.email, gone), eq(C.status, "subscribed")));
  return { buyers: b.length, leads: l.length, added: r1.added + r2.added };
}

export async function contactStats() {
  const rows = await db.select({ status: C.status, tags: C.tags }).from(C);
  const tags = new Map<string, number>();
  let subscribed = 0;
  for (const r of rows) {
    if (r.status !== "subscribed") continue;
    subscribed++;
    for (const t of r.tags ?? []) tags.set(t, (tags.get(t) ?? 0) + 1);
  }
  return { total: rows.length, subscribed, unsubscribed: rows.filter((r) => r.status === "unsubscribed").length, bounced: rows.filter((r) => r.status === "bounced" || r.status === "complained").length, tags: [...tags.entries()].sort((a, b) => b[1] - a[1]) };
}

// ---- Audience ---------------------------------------------------------------------------------------------------

export type Audience = { tags: string[]; excludeBuyersSince: string | null };

/** Subscribed contacts with any of the tags (none = everyone), minus anyone who bought on the site since the date. */
export async function audienceOf(a: Audience) {
  const rows = await db.select({ id: C.id, email: C.email, firstName: C.firstName, tags: C.tags }).from(C).where(eq(C.status, "subscribed"));
  let list = a.tags.length ? rows.filter((r) => (r.tags ?? []).some((t) => a.tags.includes(t))) : rows;
  if (a.excludeBuyersSince && /^\d{4}-\d{2}-\d{2}$/.test(a.excludeBuyersSince)) {
    const since = new Date(`${a.excludeBuyersSince}T00:00:00Z`);
    const bought = await db
      .select({ email: sql<string>`lower(${schema.orders.email})` })
      .from(schema.orders)
      .where(and(inArray(schema.orders.status, [...PAID]), gte(schema.orders.createdAt, since)));
    const set = new Set(bought.map((x) => x.email));
    list = list.filter((r) => !set.has(r.email));
  }
  return list;
}

// ---- Unsubscribe ------------------------------------------------------------------------------------------------

const unsubSig = (id: number) => createHmac("sha256", process.env.SESSION_SECRET ?? "dev").update(`nl-unsub:${id}`).digest("base64url").slice(0, 24);
export const unsubscribeUrl = (contactId: number) => `${SITE.url}/api/newsletter/unsubscribe?c=${contactId}&t=${unsubSig(contactId)}`;
export function verifyUnsubscribe(c: string | null, t: string | null) {
  const id = Number(c);
  if (!Number.isInteger(id) || id <= 0 || !t) return null;
  const want = Buffer.from(unsubSig(id));
  const got = Buffer.from(t);
  return want.length === got.length && timingSafeEqual(want, got) ? id : null;
}
export async function unsubscribe(contactId: number) {
  await db.update(C).set({ status: "unsubscribed", statusAt: new Date() }).where(and(eq(C.id, contactId), eq(C.status, "subscribed")));
  // Queued sends of running campaigns are dropped too.
  await db.update(S).set({ status: "skipped", error: "unsubscribed" }).where(and(eq(S.contactId, contactId), eq(S.status, "queued")));
}

// ---- Campaigns --------------------------------------------------------------------------------------------------

export function contentOf(c: Pick<NewsletterCampaign, "template" | "content">): NewsletterContent {
  return { ...themeOf(c.template).defaults, ...(c.content as Partial<NewsletterContent>) };
}

export function renderFor(c: Pick<NewsletterCampaign, "template" | "content" | "name">, contact: { id: number; firstName: string | null }) {
  return renderNewsletter(c.template, contentOf(c), { firstName: contact.firstName, unsubscribeUrl: unsubscribeUrl(contact.id), campaignSlug: slugify(c.name) });
}

/** Problems that must be fixed before a campaign can go out (empty subject, missing button link, etc.). */
export function campaignProblems(c: NewsletterContent) {
  const p: string[] = [];
  if (!c.subject.trim()) p.push("The subject is empty.");
  if (!c.headline.trim()) p.push("The headline is empty.");
  if (c.ctaLabel.trim() && !/^https:\/\//.test(c.ctaUrl.trim())) p.push("The button needs a link starting with https://.");
  if (c.imageUrl.trim() && !/^https:\/\//.test(c.imageUrl.trim())) p.push("The main image must be an https:// address.");
  return p;
}

/** Freezes the audience (one send row per contact) and schedules the campaign. Re-queuing never duplicates a person. */
export async function queueCampaign(id: number, when: Date) {
  const [c] = await db.select().from(K).where(eq(K.id, id)).limit(1);
  if (!c) return { ok: false as const, error: "Campaign not found." };
  if (!["draft", "scheduled"].includes(c.status)) return { ok: false as const, error: `This campaign is already ${c.status}.` };
  const problems = campaignProblems(contentOf(c));
  if (problems.length) return { ok: false as const, error: problems.join(" ") };
  const people = await audienceOf(c.audience);
  if (!people.length) return { ok: false as const, error: "Nobody in this audience." };
  await db.delete(S).where(and(eq(S.campaignId, id), eq(S.status, "queued")));
  for (let i = 0; i < people.length; i += 1000) {
    await db
      .insert(S)
      .values(people.slice(i, i + 1000).map((p) => ({ campaignId: id, contactId: p.id, email: p.email })))
      .onConflictDoNothing();
  }
  await db.update(K).set({ status: "scheduled", scheduledAt: when, updatedAt: new Date() }).where(eq(K.id, id));
  return { ok: true as const, count: people.length };
}

export async function cancelCampaign(id: number) {
  await db.update(S).set({ status: "skipped", error: "cancelled" }).where(and(eq(S.campaignId, id), eq(S.status, "queued")));
  const [c] = await db.select({ status: K.status }).from(K).where(eq(K.id, id)).limit(1);
  // A campaign that already sent to some people keeps its stats; one that sent nothing goes back to draft.
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(S).where(and(eq(S.campaignId, id), eq(S.status, "sent")));
  await db.update(K).set({ status: n > 0 ? "cancelled" : "draft", scheduledAt: null, updatedAt: new Date() }).where(eq(K.id, id));
  if (n === 0) await db.delete(S).where(eq(S.campaignId, id));
  return c?.status;
}

export async function campaignStats(id: number) {
  const rows = await db
    .select({ status: S.status, n: sql<number>`count(*)::int`, opened: sql<number>`count(${S.openedAt})::int`, clicked: sql<number>`count(${S.clickedAt})::int` })
    .from(S)
    .where(eq(S.campaignId, id))
    .groupBy(S.status);
  const by = Object.fromEntries(rows.map((r) => [r.status, r.n])) as Record<string, number>;
  const opened = rows.reduce((a, r) => a + r.opened, 0);
  const clicked = rows.reduce((a, r) => a + r.clicked, 0);
  return { total: rows.reduce((a, r) => a + r.n, 0), queued: by.queued ?? 0, sent: by.sent ?? 0, failed: by.failed ?? 0, skipped: by.skipped ?? 0, opened, clicked };
}

// ---- Sending ----------------------------------------------------------------------------------------------------

function message(c: NewsletterCampaign, contact: { id: number; email: string; firstName: string | null }) {
  const { subject, html } = renderFor(c, contact);
  const unsub = unsubscribeUrl(contact.id);
  return {
    from: newsletterFrom(),
    to: contact.email,
    subject,
    html,
    replyTo: shopAddress().replyTo ?? SITE.email,
    // One-click unsubscribe (Gmail and Yahoo bulk-sender rules).
    headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    tags: [{ name: "campaign", value: String(c.id) }],
  };
}

export async function sendTest(c: NewsletterCampaign, to: string) {
  if (!newsletterConfigured()) return { error: "E-mail is not set up (RESEND_API_KEY and NEWSLETTER_FROM or EMAIL_FROM)." };
  const m = message(c, { id: 0, email: to, firstName: to.split("@")[0].split(/[._-]/)[0].replace(/^./, (x) => x.toUpperCase()) });
  const r = await new Resend(process.env.RESEND_API_KEY).emails.send({ ...m, subject: `[Teste] ${m.subject}` });
  return r.error ? { error: r.error.message } : { id: r.data?.id };
}

/** Worker tick: sends what is due, PER_TICK at most. Safe with several processes (rows claimed with SKIP LOCKED). */
export async function processNewsletter() {
  if (!newsletterConfigured()) return 0;
  const due = await db
    .select()
    .from(K)
    .where(and(inArray(K.status, ["scheduled", "sending"]), sql`${K.scheduledAt} <= now()`))
    .orderBy(K.scheduledAt)
    .limit(3);
  const resend = new Resend(process.env.RESEND_API_KEY);
  let sentNow = 0;
  for (const c of due) {
    if (c.status === "scheduled") await db.update(K).set({ status: "sending", startedAt: new Date() }).where(eq(K.id, c.id));
    while (sentNow < PER_TICK) {
      const claimed = await db.execute<{ id: number }>(sql`
        update newsletter_sends set status = 'sending'
        where id in (select id from newsletter_sends where campaign_id = ${c.id} and status = 'queued' order by id limit ${BATCH} for update skip locked)
        returning id`);
      const ids = [...claimed].map((r) => r.id);
      if (!ids.length) break;
      const rows = await db
        .select({ id: S.id, contactId: S.contactId, email: C.email, firstName: C.firstName, contactStatus: C.status })
        .from(S)
        .innerJoin(C, eq(C.id, S.contactId))
        .where(inArray(S.id, ids))
        .orderBy(S.id);
      // Unsubscribed after the campaign was queued: skipped.
      const gone = rows.filter((r) => r.contactStatus !== "subscribed").map((r) => r.id);
      if (gone.length) await db.update(S).set({ status: "skipped", error: "not subscribed" }).where(inArray(S.id, gone));
      const live = rows.filter((r) => r.contactStatus === "subscribed");
      if (!live.length) continue;
      const r = await resend.batch.send(
        live.map((x) => message(c, { id: x.contactId, email: x.email, firstName: x.firstName })),
        { idempotencyKey: `nl-${c.id}-${live[0].id}-${live.length}` },
      );
      if (r.error) {
        // Rate limit: back in the queue for the next tick. Anything else (bad sender, account problem): failed, with
        // a "Retry failed" button in the admin once it is fixed.
        const transient = r.error.statusCode === 429 || r.error.name === "rate_limit_exceeded" || (r.error.statusCode ?? 0) >= 500;
        await db
          .update(S)
          .set({ status: transient ? "queued" : "failed", error: r.error.message.slice(0, 300) })
          .where(inArray(S.id, live.map((x) => x.id)));
        console.error(`[newsletter] campaign ${c.id}: batch failed`, r.error.message);
        break; // rate limit or account problem: the next tick tries the rest
      }
      const got = r.data?.data ?? [];
      const now = new Date();
      for (let i = 0; i < live.length; i++) {
        await db.update(S).set({ status: "sent", resendId: got[i]?.id ?? null, sentAt: now }).where(eq(S.id, live[i].id));
      }
      sentNow += live.length;
      await new Promise((res) => setTimeout(res, 600)); // under Resend's 2 requests per second
    }
    const [{ left }] = await db.select({ left: sql<number>`count(*)::int` }).from(S).where(and(eq(S.campaignId, c.id), inArray(S.status, ["queued", "sending"])));
    if (left === 0) await db.update(K).set({ status: "sent", finishedAt: new Date() }).where(eq(K.id, c.id));
  }
  return sentNow;
}

/** Resend delivery events for newsletter e-mails: opens, clicks, bounces and spam complaints. */
export async function recordEmailEvent(type: string, emailId: string) {
  const [s] = await db.select({ id: S.id, contactId: S.contactId }).from(S).where(eq(S.resendId, emailId)).limit(1);
  if (!s) return false;
  const now = new Date();
  if (type === "email.opened") await db.update(S).set({ openedAt: sql`coalesce(${S.openedAt}, now())` }).where(eq(S.id, s.id));
  else if (type === "email.clicked") await db.update(S).set({ clickedAt: sql`coalesce(${S.clickedAt}, now())`, openedAt: sql`coalesce(${S.openedAt}, now())` }).where(eq(S.id, s.id));
  else if (type === "email.bounced") await db.update(C).set({ status: "bounced", statusAt: now }).where(eq(C.id, s.contactId));
  else if (type === "email.complained") await db.update(C).set({ status: "complained", statusAt: now }).where(eq(C.id, s.contactId));
  return true;
}
