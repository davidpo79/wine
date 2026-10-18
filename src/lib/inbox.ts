// Admin → Inbox: the shop address receives through Resend Receiving; every email sent from the shop is kept too,
// so each customer has one conversation (automatic emails, their replies, our answers).
import { Resend } from "resend";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";

const MAX_HTML = 2_000_000;

export function addrOf(s: string | null | undefined) {
  const m = (s ?? "").match(/<([^>]+)>/);
  return (m ? m[1] : (s ?? "")).trim().toLowerCase();
}

/** The shop address customers write to and the name shown with it (from EMAIL_FROM). */
export function shopAddress() {
  const from = process.env.EMAIL_FROM ?? "";
  return { from, address: addrOf(from), replyTo: process.env.EMAIL_REPLY_TO || addrOf(from) || undefined };
}

export function inboxConfigured() {
  return !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM && process.env.EMAIL_PROVIDER !== "telnyx";
}

async function orderOf(contact: string) {
  const [o] = await db.select({ id: schema.orders.id }).from(schema.orders).where(eq(sql`lower(${schema.orders.email})`, contact)).orderBy(desc(schema.orders.createdAt)).limit(1);
  return o?.id ?? null;
}

/** Keeps a copy of an email sent from the shop (automatic or written in the admin). Never throws. */
export async function logOutbound(m: {
  kind: string;
  to: string;
  subject: string;
  html?: string | null;
  text?: string | null;
  resendId?: string | null;
  orderId?: string | null;
  sentBy?: string | null;
  inReplyTo?: string | null;
  error?: string | null;
}) {
  try {
    const contact = addrOf(m.to);
    await db.insert(schema.inboxMessages).values({
      direction: "out",
      kind: m.kind,
      resendId: m.resendId ?? null,
      inReplyTo: m.inReplyTo ?? null,
      contact,
      fromAddr: shopAddress().from,
      toAddrs: [m.to],
      subject: m.subject,
      html: m.html?.slice(0, MAX_HTML) ?? null,
      text: m.text ?? null,
      orderId: m.orderId ?? (await orderOf(contact)),
      sentBy: m.sentBy ?? null,
      status: m.error ? "error" : "ok",
      error: m.error ?? null,
      readAt: new Date(),
    });
  } catch (e) {
    console.error("[inbox] log outbound failed", e);
  }
}

/** Stores one received email (fetched from the Resend API by id). Returns true when it was new. */
export async function saveReceived(id: string, resend = new Resend(process.env.RESEND_API_KEY)) {
  const [exists] = await db.select({ id: schema.inboxMessages.id }).from(schema.inboxMessages).where(eq(schema.inboxMessages.resendId, id));
  if (exists) return false;
  const r = await resend.emails.receiving.get(id);
  if (r.error || !r.data) throw new Error(r.error?.message ?? "email not found");
  const e = r.data;
  const contact = addrOf(e.reply_to?.[0] ?? e.from);
  const header = (k: string) => Object.entries(e.headers ?? {}).find(([h]) => h.toLowerCase() === k)?.[1] ?? null;
  await db
    .insert(schema.inboxMessages)
    .values({
      direction: "in",
      kind: "received",
      resendId: e.id,
      messageId: e.message_id ?? header("message-id"),
      inReplyTo: header("in-reply-to"),
      contact,
      fromAddr: e.from,
      toAddrs: e.to ?? [],
      cc: e.cc ?? null,
      subject: e.subject ?? "",
      text: e.text,
      html: e.html?.slice(0, MAX_HTML) ?? null,
      attachments: (e.attachments ?? []).map((a) => ({ id: a.id, filename: a.filename, size: a.size, contentType: a.content_type })),
      orderId: await orderOf(contact),
      createdAt: new Date(e.created_at),
    })
    .onConflictDoNothing();
  return true;
}

/** Pulls the latest received emails from Resend (the webhook makes it instant; this catches anything missed). */
export async function syncInbox() {
  if (!inboxConfigured()) return { added: 0, error: null as string | null };
  const resend = new Resend(process.env.RESEND_API_KEY);
  try {
    const list = await resend.emails.receiving.list({ limit: 50 });
    if (list.error) return { added: 0, error: list.error.message };
    const ids = (list.data?.data ?? []).map((e) => e.id);
    if (!ids.length) return { added: 0, error: null };
    const known = new Set((await db.select({ id: schema.inboxMessages.resendId }).from(schema.inboxMessages).where(inArray(schema.inboxMessages.resendId, ids))).map((r) => r.id));
    let added = 0;
    for (const id of ids.filter((i) => !known.has(i))) if (await saveReceived(id, resend)) added += 1;
    return { added, error: null };
  } catch (e) {
    return { added: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

const escHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** A message written in the admin: plain text, sent as simple HTML, threaded under the message it answers. */
export async function sendManual(m: { to: string; subject: string; text: string; sentBy: string; replyTo?: { messageId: string | null; subject: string } | null }) {
  if (!inboxConfigured()) return { error: "Email is not configured (RESEND_API_KEY / EMAIL_FROM)." };
  const shop = shopAddress();
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#1d2a3a">${escHtml(m.text).replace(/\n/g, "<br>")}</div>`;
  const headers: Record<string, string> = {};
  if (m.replyTo?.messageId) {
    headers["In-Reply-To"] = m.replyTo.messageId;
    headers["References"] = m.replyTo.messageId;
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  const r = await resend.emails.send({ from: shop.from, to: m.to, subject: m.subject, html, text: m.text, replyTo: shop.replyTo, headers });
  await logOutbound({ kind: "manual", to: m.to, subject: m.subject, html, text: m.text, resendId: r.data?.id, sentBy: m.sentBy, inReplyTo: m.replyTo?.messageId, error: r.error?.message });
  return r.error ? { error: r.error.message } : { ok: true as const };
}

export type Conversation = { contact: string; subject: string; lastAt: Date; lastDirection: string; lastKind: string; unread: number; messages: number; received: number; orderId: string | null };

/** One row per customer, newest first. view: received = conversations with at least one email from the customer. */
export async function conversations(view: "received" | "all" = "received", limit = 200): Promise<Conversation[]> {
  const rows = (await db.execute(sql`
    select contact,
      (array_agg(subject order by created_at desc))[1] as subject,
      max(created_at) as last_at,
      (array_agg(direction order by created_at desc))[1] as last_direction,
      (array_agg(kind order by created_at desc))[1] as last_kind,
      count(*) filter (where direction = 'in' and read_at is null)::int as unread,
      count(*)::int as messages,
      count(*) filter (where direction = 'in')::int as received,
      (array_agg(order_id order by created_at desc) filter (where order_id is not null))[1] as order_id
    from inbox_messages
    group by contact
    ${view === "received" ? sql`having count(*) filter (where direction = 'in') > 0` : sql``}
    order by max(created_at) desc
    limit ${limit}
  `)) as unknown as Record<string, unknown>[];
  return rows.map((r) => ({
    contact: String(r.contact),
    subject: String(r.subject ?? ""),
    lastAt: new Date(r.last_at as string),
    lastDirection: String(r.last_direction),
    lastKind: String(r.last_kind),
    unread: Number(r.unread),
    messages: Number(r.messages),
    received: Number(r.received),
    orderId: (r.order_id as string) ?? null,
  }));
}

export async function unreadCount() {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.inboxMessages).where(and(eq(schema.inboxMessages.direction, "in"), isNull(schema.inboxMessages.readAt)));
  return r?.n ?? 0;
}

export async function conversation(contact: string) {
  return db.select().from(schema.inboxMessages).where(eq(schema.inboxMessages.contact, contact)).orderBy(schema.inboxMessages.createdAt, schema.inboxMessages.id);
}

export async function markRead(contact: string) {
  await db.update(schema.inboxMessages).set({ readAt: new Date() }).where(and(eq(schema.inboxMessages.contact, contact), eq(schema.inboxMessages.direction, "in"), isNull(schema.inboxMessages.readAt)));
}
