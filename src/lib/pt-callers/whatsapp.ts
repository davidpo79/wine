// WhatsApp with sales prospects (Portugal HR leads). The rules Meta sets, enforced here, not in the screen:
// - the first message is the approved template, and only to someone who asked for WhatsApp (the rep confirms it);
// - free text only within 24 h of the person's last message;
// - "PARAR"/"STOP" ends it: nothing more is sent to that number.
// A rep sees and writes only on her own leads; an admin sees every thread.
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { AdminSession } from "@/lib/auth";
import { prospectWhatsappMissing, sendWhatsapp, WINDOW_MS } from "../whatsapp";
import { ptFlags } from "./flags";
import { maskPhone, normalizePtPhone } from "./phone";
import { logAccess } from "./rules";

type Me = Pick<AdminSession, "id" | "email" | "role">;
const W = schema.waMessages;
const L = schema.ptLeads;

const STOP_RE = /^\s*(parar|stop|pare|cancelar|sair|unsubscribe)\s*[.!]?\s*$/i;
export const isStop = (text: string) => STOP_RE.test(text);

/** "soraya.torrens@x.pt" -> "Soraya": how the rep signs the first message. */
export const repFirstName = (email: string) => {
  const n = email.split("@")[0].split(/[._-]/)[0];
  return n ? n[0].toUpperCase() + n.slice(1).toLowerCase() : "Wine Portugal";
};

async function ownLead(me: Me, leadId: number) {
  const [l] = await db.select().from(L).where(eq(L.id, leadId)).limit(1);
  if (!l) return null;
  if (me.role === "admin" || (me.role === "pt_caller" && l.assignedTo === me.id)) return l;
  return null;
}

/** Where a thread stands: may we send the template, free text, nothing? */
export function threadState(msgs: { direction: string; kind: string; createdAt: Date }[], now = Date.now()) {
  const lastIn = [...msgs].reverse().find((m) => m.direction === "in");
  const stopped = msgs.some((m) => m.direction === "in" && m.kind === "stop");
  const windowOpen = !!lastIn && now - lastIn.createdAt.getTime() < WINDOW_MS;
  return { stopped, windowOpen, windowEndsAt: lastIn ? new Date(lastIn.createdAt.getTime() + WINDOW_MS) : null, templateSent: msgs.some((m) => m.direction === "out" && m.kind === "template") };
}

/** One row per lead with WhatsApp messages (the rep's own leads only), newest first. */
export async function waThreads(me: Me) {
  const rows = (await db.execute(sql`
    select w.pt_lead_id as lead_id, l.first_name, l.last_name, l.company,
      (array_agg(w.body order by w.created_at desc))[1] as last_body,
      (array_agg(w.direction order by w.created_at desc))[1] as last_direction,
      max(w.created_at) as last_at,
      count(*) filter (where w.direction = 'in' and w.read_at is null)::int as unread
    from wa_messages w join pt_leads l on l.id = w.pt_lead_id
    where ${me.role === "admin" ? sql`true` : sql`l.assigned_to = ${me.id}`}
    group by w.pt_lead_id, l.first_name, l.last_name, l.company
    order by max(w.created_at) desc
    limit 300
  `)) as unknown as Record<string, unknown>[];
  return [...rows].map((r) => ({
    leadId: Number(r.lead_id),
    name: [r.first_name, r.last_name].filter(Boolean).join(" ") || "—",
    company: (r.company as string) ?? null,
    lastBody: String(r.last_body ?? ""),
    lastDirection: String(r.last_direction),
    lastAt: new Date(r.last_at as string),
    unread: Number(r.unread),
  }));
}

/** Messages from numbers that match no lead (admins only). */
export async function waUnmatched(me: Me) {
  if (me.role !== "admin") return [];
  return db.select().from(W).where(isNull(W.ptLeadId)).orderBy(desc(W.createdAt)).limit(50);
}

export async function waUnread(me: Me) {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(W)
    .innerJoin(L, eq(L.id, W.ptLeadId))
    .where(and(eq(W.direction, "in"), isNull(W.readAt), me.role === "admin" ? sql`true` : eq(L.assignedTo, me.id)));
  return r?.n ?? 0;
}

/** One lead's thread, marked read. null when the lead is not the rep's. */
export async function waThread(me: Me, leadId: number) {
  const l = await ownLead(me, leadId);
  if (!l) return null;
  const msgs = await db.select().from(W).where(eq(W.ptLeadId, leadId)).orderBy(W.createdAt, W.id);
  await db.update(W).set({ readAt: new Date() }).where(and(eq(W.ptLeadId, leadId), eq(W.direction, "in"), isNull(W.readAt)));
  await logAccess(me.id, leadId, "wa_view");
  return {
    lead: {
      id: l.id,
      name: [l.firstName, l.lastName].filter(Boolean).join(" ") || "—",
      firstName: l.firstName,
      company: l.company,
      phone: me.role === "admin" ? l.phone : maskPhone(l.phone),
      status: l.status,
      demo: l.demo,
    },
    messages: msgs.map((m) => ({ id: m.id, direction: m.direction, kind: m.kind, body: m.body, status: m.status, error: m.error, sentBy: m.sentBy, createdAt: m.createdAt })),
    ...threadState(msgs),
  };
}

export type WaSend = { mode: "template"; optIn: boolean } | { mode: "text"; text: string };

/** Sends on a lead's thread, after every rule above. Logged whether it went or not. */
export async function waSend(me: Me, leadId: number, m: WaSend): Promise<{ ok: true } | { ok: false; reason: string }> {
  const l = await ownLead(me, leadId);
  if (!l) return { ok: false, reason: "You can only write to your own leads." };
  if (!l.phone) return { ok: false, reason: "This lead has no phone number yet." };
  if (["opt_out", "blocked"].includes(l.status)) return { ok: false, reason: "This person asked not to be contacted." };
  if (l.demo || !ptFlags().live) return { ok: false, reason: "Demo mode: nothing is sent on WhatsApp." };
  const missing = prospectWhatsappMissing();
  if (missing.length) return { ok: false, reason: `WhatsApp is not set up yet (missing: ${missing.join(", ")}). Ask the admin.` };
  const msgs = await db.select().from(W).where(eq(W.phone, l.phone)).orderBy(W.createdAt);
  const st = threadState(msgs);
  if (st.stopped) return { ok: false, reason: "This person answered PARAR: no more WhatsApp messages." };
  let body: string;
  let r: Awaited<ReturnType<typeof sendWhatsapp>>;
  if (m.mode === "template") {
    if (!m.optIn) return { ok: false, reason: "Tick that the person asked to receive WhatsApp first." };
    const params = [l.firstName || "", repFirstName(me.email)];
    body = `Olá ${params[0]}, fala ${params[1]}, da Wine Portugal. Como combinámos ao telefone, deixo-lhe aqui o nosso contacto para os presentes de Natal da sua equipa. Responda a esta mensagem quando quiser e envio-lhe a proposta. Para não receber mais mensagens, responda PARAR.`;
    r = await sendWhatsapp(l.phone, { kind: "template", params });
  } else {
    const text = m.text.trim();
    if (!text) return { ok: false, reason: "Write a message first." };
    if (text.length > 4000) return { ok: false, reason: "Message too long (4000 characters at most)." };
    if (!st.windowOpen) return { ok: false, reason: "Free text only within 24 hours of the person's last reply. Send the template, or wait for them to answer." };
    body = text;
    r = await sendWhatsapp(l.phone, { kind: "text", text });
  }
  await db.insert(W).values({ direction: "out", phone: l.phone, ptLeadId: l.id, kind: m.mode, body, providerId: r.ok ? r.id : null, sentBy: me.email, status: r.ok ? "ok" : "error", error: r.ok ? null : r.error, readAt: new Date() });
  await logAccess(me.id, l.id, m.mode === "template" ? "wa_template" : "wa_text", m.mode === "template" ? { optIn: true } : undefined);
  return r.ok ? { ok: true } : { ok: false, reason: `Not sent: ${r.error}` };
}

const str = (v: unknown) => (typeof v === "string" ? v : null);

/**
 * Reads an inbound WhatsApp webhook: Telnyx (data.event_type + data.payload; "from" as a string or { phone_number })
 * or Meta (entry[].changes[].value.messages[]). Returns the messages found and any delivery-status updates.
 */
export function parseWaWebhook(body: unknown) {
  const out: { from: string; text: string; id: string | null; media: boolean }[] = [];
  const statuses: { id: string; status: string }[] = [];
  const b = (body ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const d = b.data;
  if (d && typeof d === "object") {
    const p = d.payload ?? {};
    const type = String(d.event_type ?? "");
    if (type === "message.received" || (p.direction === "inbound" && !type.startsWith("message.finalized"))) {
      const from = str(p.from) ?? str(p.from?.phone_number) ?? str(p.from?.wa_id);
      const text = str(p.text) ?? str(p.text?.body) ?? str(p.body?.text) ?? str(p.whatsapp_message?.text?.body) ?? str(p.message?.text?.body) ?? "";
      const media = !text && (Array.isArray(p.media) ? p.media.length > 0 : !!(p.whatsapp_message?.type && p.whatsapp_message.type !== "text"));
      if (from) out.push({ from, text, id: str(p.id) ?? str(d.id), media });
    } else if (type.startsWith("message.") && str(p.id)) {
      const s = str(p.to?.[0]?.status) ?? str(p.status) ?? type.slice("message.".length);
      if (s) statuses.push({ id: p.id, status: s });
    }
  }
  for (const e of Array.isArray(b.entry) ? b.entry : []) {
    for (const c of Array.isArray(e?.changes) ? e.changes : []) {
      const v = c?.value ?? {};
      for (const m of Array.isArray(v.messages) ? v.messages : []) {
        const from = str(m.from);
        if (from) out.push({ from: from.startsWith("+") ? from : `+${from}`, text: str(m.text?.body) ?? str(m.button?.text) ?? "", id: str(m.id), media: m.type !== "text" && m.type !== "button" });
      }
      for (const s of Array.isArray(v.statuses) ? v.statuses : []) if (str(s.id) && str(s.status)) statuses.push({ id: s.id, status: s.status });
    }
  }
  return { messages: out, statuses };
}

const e164 = (raw: string) => {
  const digits = raw.replace(/[^\d+]/g, "");
  return normalizePtPhone(digits) ?? (digits.startsWith("+") ? digits : `+${digits}`);
};

/** Stores what came in (once per provider id) on the lead with that number, and applies delivery statuses. */
export async function receiveWa(body: unknown) {
  const { messages, statuses } = parseWaWebhook(body);
  let stored = 0;
  for (const m of messages) {
    const phone = e164(m.from);
    const [lead] = await db.select({ id: L.id }).from(L).where(eq(L.phone, phone)).orderBy(desc(L.id)).limit(1);
    const kind = isStop(m.text) ? "stop" : m.media ? "media" : "text";
    const ins = await db
      .insert(W)
      .values({ direction: "in", phone, ptLeadId: lead?.id ?? null, kind, body: m.text || (m.media ? "(photo, audio or file: open WhatsApp to see it)" : ""), providerId: m.id, raw: body as object })
      .onConflictDoNothing()
      .returning({ id: W.id });
    stored += ins.length;
  }
  const ids = statuses.map((s) => s.id);
  if (ids.length) {
    const ours = await db.select({ id: W.id, providerId: W.providerId }).from(W).where(and(inArray(W.providerId, ids), eq(W.direction, "out")));
    for (const o of ours) {
      const s = statuses.find((x) => x.id === o.providerId)!.status;
      const failed = /fail|undeliver|reject/i.test(s);
      await db.update(W).set({ status: failed ? "error" : s, ...(failed ? { error: `WhatsApp: ${s}` } : {}) }).where(eq(W.id, o.id));
    }
  }
  return { stored, statuses: statuses.length };
}
