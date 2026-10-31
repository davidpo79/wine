// Portugal callers: every rule for leads, enrichment, opt-out, locking and dialing.
// Admin: import (0-credit search), approve, enrich (credits), check results, assign, classify the number.
// Sales rep: sees only assigned leads (numbers masked), dials one at a time through #4's browser phone, records the
// outcome, can always mark "Não contactar". Opt-out is permanent (hashed phone + Apollo id), re-import never undoes it.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { PtLead } from "@/db/schema";
import type { AdminSession } from "@/lib/auth";
import { placeCall } from "@/lib/human-calls";
import { ApolloHttpError, apolloFor, parsePhonePayload, type MatchedPerson, type ParsedPerson, type SearchPerson } from "./apollo";
import { sendOfferEmail } from "../email";
import { businessLineRequired, DIALABLE, pilotTestNumber, ENRICH_TIMEOUT_MINUTES, FINAL_BLOCKED, legalBasisRequired, LOCK_MINUTES, prepareNeeded, REP_OUTCOMES, RETENTION_DAYS, resultMode, type LeadStatus } from "./flags";
import { CreditRefused, reserve, settleOnce, summary } from "./ledger";
import { blockHash, maskPhone, normalizePtPhone } from "./phone";
import { outboundEnv } from "../outbound-settings";
import { isBlocked, leadById, leadRefusal, logAccess, releaseAfterCall, type Refusal } from "./rules";

const LEADS = schema.ptLeads;
const REQ = schema.ptEnrichmentRequests;
const ITEM = schema.ptEnrichmentItems;
type Me = Pick<AdminSession, "id" | "email" | "role" | "mustChangePassword">;

function adminOnly(me: Me) {
  if (me.role !== "admin") throw new Error("forbidden: admins only");
}

/**
 * A sales rep works her own leads from start to finish (phones, preparation, e-mail, calls): she may act only on
 * leads assigned to her, an admin on any lead. Returns a refusal when one of the ids is not hers.
 */
async function ownLeadsOnly(me: Me, ids: number[]): Promise<{ ok: false; reason: string } | null> {
  if (me.role === "admin") return null;
  if (me.role !== "pt_caller") throw new Error("forbidden");
  const unique = [...new Set(ids)];
  if (!unique.length) return null;
  const mine = await db.select({ id: LEADS.id }).from(LEADS).where(and(inArray(LEADS.id, unique), eq(LEADS.assignedTo, me.id)));
  return mine.length === unique.length ? null : { ok: false, reason: "You can only work on leads assigned to you." };
}
const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const retention = () => new Date(Date.now() + RETENTION_DAYS * 86400_000);

// --- Import (0-credit search) -----------------------------------------------------------------------------------------

export async function insertSearchResults(me: Me, people: SearchPerson[], o: { demo: boolean }) {
  adminOnly(me);
  let inserted = 0;
  let duplicates = 0;
  let blocked = 0;
  const seen = new Set<string>();
  for (const p of people) {
    if (!p?.id || seen.has(p.id)) continue;
    seen.add(p.id);
    // A blocked person is never stored again, whatever the source says.
    const [b] = await db.select({ id: schema.ptBlocks.id }).from(schema.ptBlocks).where(eq(schema.ptBlocks.valueHash, blockHash("apollo_id", p.id))).limit(1);
    if (b) {
      blocked++;
      continue;
    }
    const r = await db
      .insert(LEADS)
      .values({
        apolloPersonId: p.id,
        firstName: p.first_name ?? null,
        lastName: p.last_name ?? null,
        lastNameMasked: p.last_name_obfuscated ?? null,
        title: p.title ?? null,
        company: p.organization?.name ?? null,
        companyApolloId: p.organization?.id ?? null,
        companySize: typeof p.organization?.estimated_num_employees === "number" ? p.organization.estimated_num_employees : null,
        location: [p.city, p.state].filter(Boolean).join(", ") || null,
        source: o.demo ? "demo" : "apollo",
        demo: o.demo,
        retentionUntil: retention(),
      })
      .onConflictDoNothing({ target: LEADS.apolloPersonId })
      .returning({ id: LEADS.id });
    if (r.length) inserted++;
    else duplicates++; // existing leads are never touched by a re-import (status, blocks, phone stay as they are)
  }
  return { inserted, duplicates, blocked };
}

/** A lead typed in by an admin (a contact found elsewhere, or a test number): approved, never a demo, same gates. */
export async function addManualLead(
  me: Me,
  o: { firstName: string; lastName?: string; title?: string; company?: string; phone: string; email?: string },
): Promise<{ ok: boolean; reason?: string; id?: number }> {
  adminOnly(me);
  const firstName = o.firstName.trim().slice(0, 80);
  if (!firstName) return { ok: false, reason: "Enter a first name." };
  const phone = normalizePtPhone(o.phone) ?? pilotTestNumber(o.phone);
  if (!phone) return { ok: false, reason: "Enter a Portuguese phone number (+351 and 9 digits). Numbers abroad only as pilot test numbers." };
  const email = (o.email ?? "").trim().toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, reason: "That e-mail address does not look right." };
  const [b] = await db.select({ id: schema.ptBlocks.id }).from(schema.ptBlocks).where(eq(schema.ptBlocks.valueHash, blockHash("phone", phone))).limit(1);
  if (b) return { ok: false, reason: "This number asked not to be contacted." };
  const [dup] = await db.select({ id: LEADS.id }).from(LEADS).where(eq(LEADS.phone, phone)).limit(1);
  if (dup) return { ok: false, reason: `This number is already lead ${dup.id}.` };
  const [l] = await db
    .insert(LEADS)
    .values({
      apolloPersonId: `manual-${randomBytes(8).toString("hex")}`,
      firstName,
      lastName: o.lastName?.trim().slice(0, 80) || null,
      title: o.title?.trim().slice(0, 120) || null,
      company: o.company?.trim().slice(0, 160) || null,
      phone,
      phoneType: phone.startsWith("+3519") ? "mobile" : "other",
      email: email || null,
      status: prepareNeeded() ? "new" : "ready",
      source: "manual",
      demo: false,
      approvedAt: new Date(),
      approvedBy: me.id,
      retentionUntil: retention(),
    })
    .returning({ id: LEADS.id });
  await logAccess(me.id, l.id, "manual_add");
  return { ok: true, id: l.id };
}

/** Free dialing from the admin screen: the lead with this number, or a new hand-added one, so the call keeps every
 *  rule (opt-out, hours, pilot list, cap, lock) and lands in the call history. */
export async function leadForNumber(me: Me, raw: string): Promise<{ ok: boolean; reason?: string; id?: number; name?: string }> {
  adminOnly(me);
  const phone = normalizePtPhone(raw) ?? pilotTestNumber(raw);
  if (!phone) return { ok: false, reason: "Enter a Portuguese phone number (+351 and 9 digits). Numbers abroad only as pilot test numbers." };
  const [existing] = await db.select().from(LEADS).where(eq(LEADS.phone, phone)).limit(1);
  if (existing) {
    if (await isBlocked(existing)) return { ok: false, reason: "This number asked not to be contacted." };
    return { ok: true, id: existing.id, name: [existing.firstName, existing.lastName].filter(Boolean).join(" ") || phone };
  }
  const r = await addManualLead(me, { firstName: phone, phone });
  return r.ok ? { ok: true, id: r.id, name: phone } : r;
}

export async function importLeads(me: Me, o: { page: number }) {
  adminOnly(me);
  const client = apolloFor();
  const { people, totalEntries } = await client.search(o.page);
  const r = await insertSearchResults(me, people, { demo: client.kind === "mock" });
  await logAccess(me.id, null, "import", { page: o.page, source: client.kind, ...r, totalEntries });
  return { source: client.kind, totalEntries, ...r };
}

export async function approveLeads(me: Me, ids: number[]) {
  const notMine = await ownLeadsOnly(me, ids);
  if (notMine) return notMine;
  if (!ids.length) return { ok: true, count: 0 };
  const r = await db
    .update(LEADS)
    .set({ approvedAt: new Date(), approvedBy: me.id, updatedAt: new Date() })
    .where(and(inArray(LEADS.id, ids), isNull(LEADS.approvedAt), sql`${LEADS.status} not in ('opt_out','blocked')`))
    .returning({ id: LEADS.id });
  for (const x of r) await logAccess(me.id, x.id, "approve");
  return { ok: true, count: r.length };
}

/** Most leads one "Approve & get phones" click takes; Apollo looks up 10 per request, so it sends batches of 10. */
export const APPROVE_ENRICH_MAX = 50;

/**
 * One click on the admin screen: approve the chosen leads, then look up their phones (credits), 10 per Apollo
 * request. A batch that is refused (credit cap, a lead already enriched...) stops the rest: those leads stay approved
 * and can be sent again; the batches already sent go on as usual.
 */
export async function approveAndEnrich(me: Me, ids: number[]): Promise<EnrichResult & { sent?: number; batches?: number }> {
  const notMine = await ownLeadsOnly(me, ids);
  if (notMine) return notMine;
  const unique = [...new Set(ids)];
  // Checked before approving, so a refused selection leaves nothing half done.
  if (!unique.length || unique.length > APPROVE_ENRICH_MAX) return { ok: false, reason: `Choose 1 to ${APPROVE_ENRICH_MAX} leads per enrichment.` };
  await approveLeads(me, unique);
  let sent = 0;
  let first: EnrichResult | null = null;
  for (let i = 0; i < unique.length; i += 10) {
    const r = await enrichLeads(me, unique.slice(i, i + 10));
    first ??= r;
    if (!r.ok) {
      if (!sent) return r;
      return { ok: true, sent, batches: Math.ceil(sent / 10), reason: `${sent} sent; the other ${unique.length - sent} were not: ${r.reason}`, requestId: first.requestId };
    }
    sent += Math.min(10, unique.length - i);
  }
  return { ...first!, sent, batches: Math.ceil(sent / 10) };
}

// --- Enrichment (credits) ---------------------------------------------------------------------------------------------

type EnrichResult = { ok: boolean; reason?: string; requestId?: string; testSecret?: string };

export async function enrichLeads(me: Me, ids: number[]): Promise<EnrichResult> {
  const notMine = await ownLeadsOnly(me, ids);
  if (notMine) return notMine;
  const unique = [...new Set(ids)];
  if (!unique.length || unique.length > 10) return { ok: false, reason: "Choose 1 to 10 leads per enrichment." };
  const leads = await db.select().from(LEADS).where(inArray(LEADS.id, unique));
  if (leads.length !== unique.length) return { ok: false, reason: "Some leads were not found." };
  for (const l of leads) {
    if (!l.approvedAt) return { ok: false, reason: `Lead ${l.id} is not approved.` };
    if (await isBlocked(l)) return { ok: false, reason: `Lead ${l.id} is blocked.` };
    if (l.phone || l.enrichedAt) return { ok: false, reason: `Lead ${l.id} is already enriched: no second reveal.` };
  }
  // Never a blind retry: a lead with an open (or unknown) request is not sent again until that one is resolved.
  const open = await db.select({ leadId: ITEM.leadId }).from(ITEM).where(and(inArray(ITEM.leadId, unique), eq(ITEM.state, "pending")));
  if (open.length) return { ok: false, reason: `Leads ${[...new Set(open.map((o) => o.leadId))].join(", ")} have a pending enrichment: check its result first.` };

  const mode = resultMode();
  const client = apolloFor();
  const demo = client.kind === "mock";
  // The mock never calls the webhook (demo results are played from the admin screen), so demo needs no URL.
  const base = (outboundEnv().APOLLO_WEBHOOK_BASE_URL ?? (demo ? "https://demo.invalid" : "")).replace(/\/$/, "");
  if (mode === "webhook" && !/^https:\/\/[^/]/.test(base)) return { ok: false, reason: "APOLLO_WEBHOOK_BASE_URL (https) is not set. Polling is used only if chosen explicitly (PT_CALLERS_APOLLO_RESULT_MODE=poll)." };

  const requestId = `er_${randomBytes(8).toString("hex")}`;
  const secret = randomBytes(32).toString("hex");
  try {
    await reserve({ key: requestId, credits: 9 * leads.length, demo, by: me.id, note: `${leads.length} people, 1 + 8 (mobile) each` });
  } catch (e) {
    return { ok: false, reason: e instanceof CreditRefused ? e.message : "The credit ledger could not be read, so no credits are spent." };
  }
  await db.transaction(async (tx) => {
    await tx.insert(REQ).values({ id: requestId, mode, secretHash: mode === "webhook" ? sha(secret) : null, status: "sending", demo, createdBy: me.id });
    await tx.insert(ITEM).values(leads.map((l) => ({ requestId, leadId: l.id, apolloPersonId: l.apolloPersonId })));
    await tx.update(LEADS).set({ status: "enrichment_pending", failReason: null, updatedAt: new Date() }).where(inArray(LEADS.id, unique));
  });
  for (const l of leads) await logAccess(me.id, l.id, "enrich", { requestId, demo });

  const webhookUrl = mode === "webhook" ? `${base}/api/apollo/webhook/${requestId}/${secret}` : undefined;
  try {
    const r = await client.enrich(
      leads.map((l) => l.apolloPersonId),
      webhookUrl ? { webhookUrl } : { pollOnly: true },
    );
    // Results may already have arrived (out of order): only move "sending" forward.
    await db.update(REQ).set({ apolloRequestId: r.requestId, syncCredits: r.creditsConsumed }).where(eq(REQ.id, requestId));
    await storeMatches(r.matches);
    await db.update(REQ).set({ status: "pending" }).where(and(eq(REQ.id, requestId), eq(REQ.status, "sending")));
  } catch (e) {
    if (e instanceof ApolloHttpError && e.status >= 400 && e.status < 500) {
      // Refused before any work: nothing charged, the leads can be sent again.
      await db.update(REQ).set({ status: "failed", error: e.message, completedAt: new Date() }).where(eq(REQ.id, requestId));
      await db.update(ITEM).set({ state: "failed", resolvedAt: new Date() }).where(and(eq(ITEM.requestId, requestId), eq(ITEM.state, "pending")));
      await db.update(LEADS).set({ status: "new", failReason: "enrichment_rejected" }).where(and(inArray(LEADS.id, unique), eq(LEADS.status, "enrichment_pending")));
      await settleOnce(requestId, "0", `rejected: HTTP ${e.status}`);
      return { ok: false, reason: e.message };
    }
    // Timeout / network / 5xx: the outcome is unknown. Apollo may have charged and may still deliver, so the leads stay
    // "enrichment pending" (not "no number"), the credits stay reserved, and nothing is retried automatically.
    await db.update(REQ).set({ status: "timeout", error: e instanceof Error ? e.message : String(e) }).where(eq(REQ.id, requestId));
    return { ok: true, requestId, reason: "Apollo did not confirm in time. The result may still arrive; check it before doing anything else.", ...(demo ? { testSecret: secret } : {}) };
  }
  return { ok: true, requestId, ...(demo ? { testSecret: secret } : {}) };
}

/** Applies one result payload (webhook or poll). Idempotent per person; partial and out-of-order results are fine. */
async function applyResult(requestId: string, people: ParsedPerson[]) {
  for (const p of people) {
    const [item] = await db.select().from(ITEM).where(and(eq(ITEM.requestId, requestId), eq(ITEM.apolloPersonId, p.apolloPersonId), eq(ITEM.state, "pending"))).limit(1);
    if (!item) continue; // duplicate, or a person this request never asked for
    const pick = p.phones.find((x) => normalizePtPhone(x.number) && x.type === "mobile") ?? p.phones.find((x) => normalizePtPhone(x.number)) ?? p.phones[0];
    const number = pick ? (normalizePtPhone(pick.number) ?? pick.number) : null;
    const blocked = number ? (await db.select({ id: schema.ptBlocks.id }).from(schema.ptBlocks).where(eq(schema.ptBlocks.valueHash, blockHash("phone", number))).limit(1)).length > 0 : false;
    const state = !number ? "no_phone" : blocked ? "blocked" : pick!.type === "mobile" ? "phone_mobile" : "phone";
    const claimed = await db.update(ITEM).set({ state, resolvedAt: new Date() }).where(and(eq(ITEM.id, item.id), eq(ITEM.state, "pending"))).returning({ id: ITEM.id });
    if (!claimed.length) continue;
    const where = and(eq(LEADS.id, item.leadId), sql`${LEADS.status} not in ('opt_out','blocked')`);
    if (!number) await db.update(LEADS).set({ status: "failed", failReason: "no_number", enrichedAt: new Date(), updatedAt: new Date() }).where(where);
    else if (blocked) await db.update(LEADS).set({ status: "blocked", failReason: "number_opted_out", enrichedAt: new Date(), updatedAt: new Date() }).where(where);
    else await db.update(LEADS).set({ phone: number, phoneType: pick!.type, numberClass: "unknown", status: prepareNeeded() ? "new" : "ready", failReason: null, enrichedAt: new Date(), updatedAt: new Date() }).where(where);
  }
  // Complete when nothing is pending: settle the ledger once with Apollo's figure (sync credits + 8 per mobile).
  const [left] = await db.select({ n: sql<number>`count(*)::int` }).from(ITEM).where(and(eq(ITEM.requestId, requestId), eq(ITEM.state, "pending")));
  if ((left?.n ?? 1) > 0) return;
  const done = await db
    .update(REQ)
    .set({ status: "complete", completedAt: new Date() })
    .where(and(eq(REQ.id, requestId), inArray(REQ.status, ["sending", "pending", "timeout"])))
    .returning();
  if (!done.length) return;
  const items = await db.select().from(ITEM).where(eq(ITEM.requestId, requestId));
  const mobiles = items.filter((i) => i.state === "phone_mobile").length;
  const matched = items.filter((i) => i.state !== "no_phone" && i.state !== "failed").length;
  const base = done[0].syncCredits !== null && done[0].syncCredits !== undefined ? Number(done[0].syncCredits) : matched;
  await settleOnce(requestId, String(base + 8 * mobiles), `sync ${done[0].syncCredits ?? "n/a"} + 8 x ${mobiles} mobile`);
}

/** Apollo documents no webhook signature: the URL carries a 256-bit secret, compared in constant time. */
export async function handleApolloWebhook(requestId: string, secret: string, raw: string): Promise<{ status: number }> {
  const [r] = await db.select().from(REQ).where(eq(REQ.id, requestId)).limit(1);
  if (!r?.secretHash) return { status: 404 };
  const a = Buffer.from(sha(secret));
  const b = Buffer.from(r.secretHash);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { status: 404 };
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return { status: 400 };
  }
  // The request_id inside the payload, read as text, must match what Apollo gave us (when we already have it).
  const payloadId = /"request_id"\s*:\s*(?:"([^"]*)"|(-?\d+))/.exec(raw);
  const pid = payloadId ? (payloadId[1] ?? payloadId[2]) : null;
  if (pid && r.apolloRequestId && pid !== r.apolloRequestId) return { status: 409 };
  await applyResult(requestId, parsePhonePayload(body));
  return { status: 200 };
}

/** Admin "Check result": free read of Apollo's stored result (never a new reveal). */
export async function pollEnrichment(me: Me, requestId: string) {
  adminOnly(me);
  const [r] = await db.select().from(REQ).where(eq(REQ.id, requestId)).limit(1);
  if (!r) return { ok: false, reason: "Not found." };
  if (!r.apolloRequestId) return { ok: false, reason: "Apollo never confirmed this request (no request_id). Check Apollo's usage page before closing it." };
  const res = await apolloFor().poll(r.apolloRequestId);
  if (res.status === "ready") await applyResult(requestId, parsePhonePayload(res.body));
  return { ok: true, status: res.status };
}

/** Demo only: plays a fictional Apollo result for a demo request (flags off). */
export async function simulateDemoResult(me: Me, requestId: string) {
  adminOnly(me);
  const [r] = await db.select().from(REQ).where(eq(REQ.id, requestId)).limit(1);
  if (!r?.demo) return { ok: false, reason: "Only demo requests can be simulated." };
  const items = await db.select().from(ITEM).where(and(eq(ITEM.requestId, requestId), eq(ITEM.state, "pending")));
  await applyResult(
    requestId,
    items.map((i, n) => ({ apolloPersonId: i.apolloPersonId, phones: n % 4 === 3 ? [] : [{ number: `+3519120${String(10 + ((i.leadId * 7 + n) % 90)).padStart(4, "0")}`, type: n % 2 ? "work_direct" : "mobile" }] })),
  );
  return { ok: true };
}

/** Requests with no answer for 30 minutes: "timeout" (unknown). Their leads stay pending; nothing is retried. */
export async function sweepTimeouts() {
  await db
    .update(REQ)
    .set({ status: "timeout" })
    .where(and(inArray(REQ.status, ["sending", "pending"]), lt(REQ.sentAt, new Date(Date.now() - ENRICH_TIMEOUT_MINUTES * 60_000))));
}

/**
 * Admin closes a timed-out request after checking Apollo's own usage page, entering the credits Apollo actually
 * charged. Only then are its leads free to be enriched again (a deliberate, logged decision, not an automatic retry).
 */
export async function closeTimedOut(me: Me, requestId: string, creditsCharged: string) {
  adminOnly(me);
  if (!/^\d+(\.\d+)?$/.test(creditsCharged.trim())) return { ok: false, reason: "Enter the credits Apollo shows as charged (a number, 0 if none)." };
  const [r] = await db.update(REQ).set({ status: "closed", completedAt: new Date() }).where(and(eq(REQ.id, requestId), eq(REQ.status, "timeout"))).returning();
  if (!r) return { ok: false, reason: "Only a timed-out request can be closed." };
  const items = await db.update(ITEM).set({ state: "closed_unknown", resolvedAt: new Date() }).where(and(eq(ITEM.requestId, requestId), eq(ITEM.state, "pending"))).returning();
  if (items.length) await db.update(LEADS).set({ status: "new", failReason: "enrichment_unknown" }).where(and(inArray(LEADS.id, items.map((i) => i.leadId)), eq(LEADS.status, "enrichment_pending")));
  await settleOnce(requestId, creditsCharged.trim(), `closed by ${me.email} after checking Apollo usage`);
  await logAccess(me.id, null, "enrich_closed", { requestId, creditsCharged });
  return { ok: true };
}

// --- Admin: assign and classify ---------------------------------------------------------------------------------------

export async function assignLeads(me: Me, ids: number[], repId: number | null) {
  adminOnly(me);
  if (repId !== null) {
    const [u] = await db.select().from(schema.adminUsers).where(eq(schema.adminUsers.id, repId)).limit(1);
    if (!u || u.role !== "pt_caller" || u.disabledAt) return { ok: false, reason: "Assign only to an active Sales rep (Portugal callers)." };
  }
  const r = await db
    .update(LEADS)
    .set({ assignedTo: repId, updatedAt: new Date() })
    .where(and(inArray(LEADS.id, ids), sql`${LEADS.status} not in ('opt_out','blocked')`))
    .returning({ id: LEADS.id });
  for (const x of r) await logAccess(me.id, x.id, "assign", { repId });
  return { ok: true, count: r.length };
}

/** Most leads a rep can take in one click. */
export const CLAIM_MAX = 25;

/**
 * A sales rep takes the next free leads (not assigned, not blocked), leads with a phone first. FOR UPDATE SKIP LOCKED
 * makes simultaneous clicks by several reps take different rows, so two reps never get the same lead.
 */
export async function claimLeads(me: Me, n: number) {
  if (me.role !== "pt_caller") throw new Error("forbidden: sales reps only");
  const want = Math.max(1, Math.min(CLAIM_MAX, Math.floor(n) || 1));
  const rows = await db.execute<{ id: number }>(sql`
    update pt_leads set assigned_to = ${me.id}, updated_at = now()
    where id in (
      select id from pt_leads
      where assigned_to is null and status not in ('opt_out', 'blocked')
      order by (phone is null), id
      limit ${want}
      for update skip locked
    ) and assigned_to is null
    returning id`);
  const ids = [...rows].map((r) => r.id);
  for (const id of ids) await logAccess(me.id, id, "claim");
  return { ok: true, count: ids.length };
}

/** Admin: splits leads evenly between the active sales reps (round robin), the chosen ones or every unassigned lead. */
export async function distributeLeads(me: Me, ids: number[]) {
  adminOnly(me);
  const reps = await db
    .select({ id: schema.adminUsers.id })
    .from(schema.adminUsers)
    .where(and(eq(schema.adminUsers.role, "pt_caller"), isNull(schema.adminUsers.disabledAt)))
    .orderBy(schema.adminUsers.id);
  if (!reps.length) return { ok: false, reason: "No active sales rep. Add one in Team first." };
  const pool = await db
    .select({ id: LEADS.id })
    .from(LEADS)
    // Only leads nobody has: a rep keeps the leads she already works on (use Assign to move one on purpose).
    .where(and(isNull(LEADS.assignedTo), ...(ids.length ? [inArray(LEADS.id, ids)] : []), sql`${LEADS.status} not in ('opt_out','blocked','calling')`))
    .orderBy(sql`${LEADS.phone} is null`, LEADS.id);
  if (!pool.length) return { ok: false, reason: ids.length ? "All the chosen leads already have a sales rep. Use Assign to move a lead on purpose." : "No leads to distribute." };
  const per: Record<number, number[]> = {};
  pool.forEach((l, i) => (per[reps[i % reps.length].id] ??= []).push(l.id));
  for (const [repId, list] of Object.entries(per)) {
    await db.update(LEADS).set({ assignedTo: Number(repId), updatedAt: new Date() }).where(inArray(LEADS.id, list));
    for (const id of list) await logAccess(me.id, id, "assign", { repId: Number(repId), distributed: true });
  }
  return { ok: true, count: pool.length, reps: reps.length };
}

/** The number's class (business line or not) and the legal basis, both recorded by an admin before any dial. */
export async function classifyLead(me: Me, id: number, o: { numberClass: string; legalBasis: string }) {
  const notMine = await ownLeadsOnly(me, [id]);
  if (notMine) return notMine;
  const lead = await leadById(id);
  if (!lead) return { ok: false, reason: "Not found." };
  if (await isBlocked(lead)) return { ok: false, reason: "Blocked or opted out: it stays that way." };
  const numberClass = ["business", "personal", "unknown"].includes(o.numberClass) ? o.numberClass : "unknown";
  const legalBasis = o.legalBasis.trim().slice(0, 500) || null;
  const ready = !!lead.phone && (numberClass === "business" || !businessLineRequired()) && (!!legalBasis || !legalBasisRequired()) && ["new", "failed"].includes(lead.status);
  await db
    .update(LEADS)
    .set({ numberClass, legalBasis, ...(ready ? { status: "ready" } : {}), updatedAt: new Date() })
    .where(and(eq(LEADS.id, id), sql`${LEADS.status} not in ('opt_out','blocked')`));
  await logAccess(me.id, id, "classify", { numberClass, hasLegalBasis: !!legalBasis });
  return { ok: true };
}

// --- Sales rep ------------------------------------------------------------------------------------------------------

export type RepLead = {
  id: number;
  name: string;
  title: string | null;
  company: string | null;
  companySize: number | null;
  location: string | null;
  phone: string;
  phoneType: string | null;
  status: string;
  lastAttemptAt: string | null;
  callbackAt: string | null;
  note: string | null;
  source: string;
  fetchedAt: string;
  demo: boolean;
};

/** Only leads assigned to this rep; the number stays masked. Every listing is logged per lead. */
export async function listForRep(me: Me): Promise<RepLead[]> {
  if (me.role !== "pt_caller") throw new Error("forbidden: sales reps only");
  const rows = await db.select().from(LEADS).where(eq(LEADS.assignedTo, me.id)).orderBy(LEADS.id).limit(500);
  if (rows.length) await db.insert(schema.ptAccessLog).values(rows.map((l) => ({ adminId: me.id, leadId: l.id, action: "view" })));
  return rows.map((l) => ({
    id: l.id,
    name: [l.firstName, l.lastName].filter(Boolean).join(" ") || "—",
    title: l.title,
    company: l.company,
    companySize: l.companySize,
    location: l.location,
    phone: maskPhone(l.phone),
    phoneType: l.phoneType,
    status: l.status,
    lastAttemptAt: l.lastAttemptAt?.toISOString() ?? null,
    callbackAt: l.callbackAt?.toISOString() ?? null,
    note: l.noteBy === me.id ? l.note : null, // another rep's (or the admin's) note stays private
    source: l.source === "demo" ? "Demonstração (fictício)" : "Apollo.io",
    fetchedAt: l.fetchedAt.toISOString(),
    demo: l.demo,
  }));
}

const repOwns = (me: Me, l: PtLead) => me.role === "admin" || (me.role === "pt_caller" && l.assignedTo === me.id);

/** "Não contactar": immediate and permanent (hashed phone + Apollo id), from a rep (own lead) or an admin. */
export async function optOut(me: Me, leadId: number) {
  const l = await leadById(leadId);
  if (!l || !repOwns(me, l)) return { ok: false, reason: "not_found" };
  const blocks = [{ kind: "apollo_id", valueHash: blockHash("apollo_id", l.apolloPersonId) }, ...(l.phone ? [{ kind: "phone", valueHash: blockHash("phone", l.phone) }] : [])];
  await db
    .insert(schema.ptBlocks)
    .values(blocks.map((b) => ({ ...b, reason: "opt_out", createdBy: me.id })))
    .onConflictDoNothing();
  await db.update(LEADS).set({ status: "opt_out", lockedBy: null, lockUntil: null, statusBeforeCall: null, callbackAt: null, updatedAt: new Date() }).where(eq(LEADS.id, leadId));
  await logAccess(me.id, leadId, "opt_out");
  return { ok: true };
}

/**
 * The caller's outcome, from the list or from the dialer. With a callId it is also that call's summary (outcome +
 * note) in the lead's call history. "voicemail" is a summary outcome; the lead itself goes to "no answer".
 */
export async function setOutcome(me: Me, leadId: number, o: { status: string; note?: string; callbackAt?: string; callId?: string }) {
  const l = await leadById(leadId);
  if (!l || !repOwns(me, l)) return { ok: false, reason: "not_found" };
  if (FINAL_BLOCKED.includes(l.status as LeadStatus) || (await isBlocked(l))) return { ok: false, reason: "blocked" };
  const summaryOutcome = o.status;
  if (o.status === "voicemail") o = { ...o, status: "no_answer" };
  if (!REP_OUTCOMES.includes(o.status as LeadStatus)) return { ok: false, reason: "bad_status" };
  if (l.lockedBy && l.lockedBy !== me.id && l.lockUntil && l.lockUntil.getTime() > Date.now()) return { ok: false, reason: "locked_by_other" };
  const cb = o.status === "callback" && o.callbackAt ? new Date(o.callbackAt) : null;
  await db
    .update(LEADS)
    .set({
      status: o.status,
      note: o.note !== undefined ? o.note.slice(0, 280) || null : l.note,
      noteBy: o.note !== undefined ? me.id : l.noteBy,
      callbackAt: cb && !Number.isNaN(cb.getTime()) ? cb : null,
      lockedBy: null,
      lockUntil: null,
      statusBeforeCall: null,
      updatedAt: new Date(),
    })
    .where(and(eq(LEADS.id, leadId), sql`${LEADS.status} not in ('opt_out','blocked')`));
  if (o.callId) {
    await db
      .update(schema.ptCalls)
      .set({ outcome: summaryOutcome, note: o.note?.trim().slice(0, 1000) || null, summarizedAt: new Date() })
      .where(and(eq(schema.ptCalls.humanCallId, o.callId), eq(schema.ptCalls.leadId, leadId), ...(me.role === "admin" ? [] : [eq(schema.ptCalls.repId, me.id)])));
  }
  await logAccess(me.id, leadId, "outcome", { status: summaryOutcome, callId: o.callId ?? null });
  return { ok: true };
}

export type CallSummary = { at: string; by: string | null; outcome: string | null; note: string | null; talkedSecs: number | null; result: string | null };

/** The lead's call history for the dialer and the lists: newest first, summaries included. */
export async function callHistory(me: Me, leadId: number): Promise<{ ok: boolean; reason?: string; calls?: CallSummary[] }> {
  const l = await leadById(leadId);
  if (!l || !repOwns(me, l)) return { ok: false, reason: "not_found" };
  const H = schema.humanCalls;
  const rows = await db
    .select({ at: schema.ptCalls.createdAt, by: schema.adminUsers.email, outcome: schema.ptCalls.outcome, note: schema.ptCalls.note, bridgedAt: H.bridgedAt, durationMs: H.durationMs, status: H.status, answeredBy: H.answeredBy })
    .from(schema.ptCalls)
    .leftJoin(H, eq(H.id, schema.ptCalls.humanCallId))
    .leftJoin(schema.adminUsers, eq(schema.adminUsers.id, schema.ptCalls.repId))
    // A sales rep sees only her own calls on the lead (a lead moved to her keeps the previous rep's notes private).
    .where(and(eq(schema.ptCalls.leadId, leadId), ...(me.role === "admin" ? [] : [eq(schema.ptCalls.repId, me.id)])))
    .orderBy(sql`${schema.ptCalls.createdAt} desc`)
    .limit(30);
  await logAccess(me.id, leadId, "view", { history: true });
  return {
    ok: true,
    calls: rows.map((r) => ({
      at: r.at.toISOString(),
      by: r.by,
      outcome: r.outcome,
      note: r.note,
      talkedSecs: r.bridgedAt && r.durationMs != null && r.answeredBy !== "machine" ? Math.round(r.durationMs / 1000) : null,
      result: r.status,
    })),
  };
}

export async function predialCheck(me: Me, leadId: number): Promise<{ ok: true } | { ok: false; reason: Refusal | "forbidden_role" }> {
  if (me.role !== "pt_caller" && me.role !== "admin") return { ok: false, reason: "forbidden_role" };
  if (me.role === "admin") await adminTakeLead(me, leadId);
  const lead = await leadById(leadId);
  if (!lead) return { ok: false, reason: "not_found" };
  const r = await leadRefusal(lead, me.id);
  return r ? { ok: false, reason: r } : { ok: true };
}

/**
 * An admin calling from the admin screen: an unassigned lead becomes theirs (a lead given to a sales rep stays the
 * rep's), and a lead with a phone that needs no "Prepare" step moves from "new" to "ready". Every other rule still holds.
 */
async function adminTakeLead(me: Me, leadId: number) {
  const took = await db
    .update(LEADS)
    .set({ assignedTo: me.id, updatedAt: new Date() })
    .where(and(eq(LEADS.id, leadId), isNull(LEADS.assignedTo), sql`${LEADS.status} not in ('opt_out','blocked')`))
    .returning({ id: LEADS.id });
  if (took.length) await logAccess(me.id, leadId, "assign", { repId: me.id, self: true });
  if (!prepareNeeded())
    await db
      .update(LEADS)
      .set({ status: "ready", updatedAt: new Date() })
      .where(and(eq(LEADS.id, leadId), eq(LEADS.status, "new"), sql`${LEADS.phone} is not null`));
}

/** Click-to-call: recheck everything, take the lock, then ring the rep's browser through #4 (the lead comes after). */
export async function dial(me: Me, leadId: number): Promise<{ ok: boolean; reason?: string; callId?: string; status?: string; dialError?: string }> {
  const check = await predialCheck(me, leadId);
  if (!check.ok) {
    await logAccess(me.id, leadId, "dial_refused", { reason: check.reason }).catch(() => {});
    return { ok: false, reason: check.reason };
  }
  // One rep per lead: the lock is taken atomically, together with the status change.
  const [locked] = await db
    .update(LEADS)
    .set({
      lockedBy: me.id,
      lockUntil: new Date(Date.now() + LOCK_MINUTES * 60_000),
      statusBeforeCall: sql`case when ${LEADS.status} = 'calling' then ${LEADS.statusBeforeCall} else ${LEADS.status} end`,
      status: "calling",
      attempts: sql`${LEADS.attempts} + 1`,
      lastAttemptAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(LEADS.id, leadId),
        eq(LEADS.assignedTo, me.id),
        or(inArray(LEADS.status, DIALABLE), and(eq(LEADS.status, "calling"), lt(LEADS.lockUntil, new Date()))),
        // Nobody holds a live lock, not even this rep (no second call on the same lead from a double click).
        or(isNull(LEADS.lockedBy), lt(LEADS.lockUntil, new Date())),
      ),
    )
    .returning();
  if (!locked) return { ok: false, reason: "locked_by_other" };
  await logAccess(me.id, leadId, "dial");
  let r;
  try {
    r = await placeCall(me as AdminSession, {
      to: locked.phone!,
      onCreated: async (callId) => {
        await db.insert(schema.ptCalls).values({ humanCallId: callId, leadId, repId: me.id });
      },
    });
  } catch {
    await releaseAfterCall(leadId, me.id);
    return { ok: false, reason: "call_failed" };
  }
  if (r.status === 409) {
    await releaseAfterCall(leadId, me.id);
    return { ok: false, reason: "busy" };
  }
  if (r.status !== 200 || r.body.dialed === false) {
    await releaseAfterCall(leadId, me.id);
    return { ok: false, reason: "call_failed", callId: r.body.callId as string | undefined, dialError: r.body.dialError as string | undefined };
  }
  return { ok: true, callId: r.body.callId as string, status: r.body.status as string };
}

// --- Surname, work email and the offer e-mail ------------------------------------------------------------------------

/** Fills the full surname and the work email from Apollo's match answer. Never overwrites a value with nothing. */
async function storeMatches(matches: MatchedPerson[]) {
  for (const m of matches) {
    const set: Partial<typeof LEADS.$inferInsert> = {};
    if (m.lastName) set.lastName = m.lastName;
    if (m.email) set.email = m.email;
    if (m.linkedinUrl) set.linkedinUrl = m.linkedinUrl;
    if (Object.keys(set).length) await db.update(LEADS).set({ ...set, updatedAt: new Date() }).where(eq(LEADS.apolloPersonId, m.apolloPersonId));
  }
}

/** Surname, work email and LinkedIn for leads enriched before these were stored: details only, 1 credit per person, no phone. */
export async function fetchDetails(me: Me, ids: number[]): Promise<{ ok: boolean; reason?: string; found?: number }> {
  const notMine = await ownLeadsOnly(me, ids);
  if (notMine) return notMine;
  const unique = [...new Set(ids)];
  if (!unique.length || unique.length > 10) return { ok: false, reason: "Choose 1 to 10 leads." };
  const leads = await db.select().from(LEADS).where(inArray(LEADS.id, unique));
  if (leads.length !== unique.length) return { ok: false, reason: "Some leads were not found." };
  for (const l of leads) {
    if (!l.approvedAt) return { ok: false, reason: `Lead ${l.id} is not approved.` };
    if (await isBlocked(l)) return { ok: false, reason: `Lead ${l.id} is blocked.` };
  }
  const client = apolloFor();
  const demo = client.kind === "mock";
  const key = `details-${randomBytes(12).toString("hex")}`;
  try {
    await reserve({ key, credits: leads.length, demo, by: me.id, note: `${leads.length} people, surname and work email` });
  } catch (e) {
    if (e instanceof CreditRefused) return { ok: false, reason: e.message };
    throw e;
  }
  try {
    const r = await client.details(leads.map((l) => l.apolloPersonId));
    await storeMatches(r.matches);
    await settleOnce(key, r.creditsConsumed ?? String(r.matches.length), "details");
    for (const l of leads) await logAccess(me.id, l.id, "details", { demo });
    return { ok: true, found: r.matches.filter((m) => m.email || m.lastName).length };
  } catch (e) {
    // Refused (4xx) = nothing charged; anything else = unknown, so the reservation is settled at the full amount.
    const refused = e instanceof ApolloHttpError && e.status >= 400 && e.status < 500;
    await settleOnce(key, refused ? "0" : String(leads.length), refused ? `rejected: HTTP ${(e as ApolloHttpError).status}` : "unknown outcome");
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** The B2B Christmas catalogue attached to offer e-mails (compressed for e-mail, about 2.4 MB). */
const B2B_CATALOG = { file: "catalogo-b2b-natal-2026.pdf" };

/** One offer e-mail to one lead's work address, written (and editable) on the admin screen. */
export async function sendOffer(me: Me, id: number, o: { subject: string; body: string; attachCatalog?: boolean }): Promise<{ ok: boolean; reason?: string }> {
  const notMine = await ownLeadsOnly(me, [id]);
  if (notMine) return notMine;
  const lead = await leadById(id);
  if (!lead) return { ok: false, reason: "Not found." };
  if (lead.demo) return { ok: false, reason: "Demo lead: no e-mail is sent." };
  if (await isBlocked(lead)) return { ok: false, reason: "This person asked not to be contacted." };
  if (!lead.email) return { ok: false, reason: "No work e-mail for this lead yet." };
  const subject = o.subject.trim().slice(0, 200);
  const body = o.body.trim().slice(0, 5000);
  if (!subject || !body) return { ok: false, reason: "Write a subject and a message." };
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1d1d1d">${esc(body)
    .split(/\n{2,}/)
    .map((para) => `<p>${para.replace(/\n/g, "<br>").replace(/(https:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')}</p>`)
    .join("")}</div>`;
  let attachments: { filename: string; content: Buffer }[] = [];
  if (o.attachCatalog) {
    const content = await readFile(path.join(process.cwd(), "assets", B2B_CATALOG.file)).catch(() => null);
    if (!content) return { ok: false, reason: "The B2B catalogue file is missing on the server. Untick it or ask for it to be uploaded." };
    attachments = [{ filename: B2B_CATALOG.file, content }];
  }
  const r = await sendOfferEmail(lead.email, subject, html, attachments);
  if ("skipped" in r && r.skipped) return { ok: false, reason: "E-mail is not set up on this shop (EMAIL_FROM and a provider key)." };
  const err = "error" in r ? r.error : undefined;
  if (err) return { ok: false, reason: `The e-mail was not sent: ${typeof err === "string" ? err : (err as { message?: string }).message ?? "error"}` };
  await db.update(LEADS).set({ emailedAt: new Date(), updatedAt: new Date() }).where(eq(LEADS.id, id));
  await logAccess(me.id, id, "email", { subjectLength: subject.length, catalog: attachments.length > 0 });
  return { ok: true };
}

// --- Demo clean-up ----------------------------------------------------------------------------------------------------

/** Deletes everything the demo mode created (leads, demo enrichment requests and their credit rows). Real Apollo data is
 *  never touched: only rows flagged demo = true, plus the rows that point at a demo lead. */
/**
 * Deletes leads for good (with their call history and enrichment items). Admin only; a lead on a live call is
 * skipped. "Do not contact" blocks are kept (they are stored by hash, not on the lead), so a deleted opt-out is
 * never imported or dialled again. The audit log keeps its rows, detached from the lead, plus one "delete_leads" row.
 */
export async function deleteLeads(me: Me, ids: number[]) {
  adminOnly(me);
  if (!ids.length) return { ok: false, reason: "Nothing selected." };
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: LEADS.id })
      .from(LEADS)
      .where(and(inArray(LEADS.id, ids), sql`not (${LEADS.status} = 'calling' and ${LEADS.lockUntil} > now())`));
    const del = rows.map((r) => r.id);
    if (!del.length) return { ok: false, reason: "Nothing deleted: those leads are on a call right now." };
    await tx.update(schema.ptAccessLog).set({ leadId: null }).where(inArray(schema.ptAccessLog.leadId, del));
    await tx.delete(schema.ptCalls).where(inArray(schema.ptCalls.leadId, del));
    await tx.delete(ITEM).where(inArray(ITEM.leadId, del));
    await tx.delete(LEADS).where(inArray(LEADS.id, del));
    await tx.insert(schema.ptAccessLog).values({ adminId: me.id, leadId: null, action: "delete_leads", detail: { ids: del, count: del.length } });
    return { ok: true, count: del.length, skipped: ids.length - del.length };
  });
}

export async function purgeDemo(me: Me) {
  adminOnly(me);
  return db.transaction(async (tx) => {
    const leads = (await tx.select({ id: LEADS.id }).from(LEADS).where(eq(LEADS.demo, true))).map((r) => r.id);
    const reqs = (await tx.select({ id: REQ.id }).from(REQ).where(eq(REQ.demo, true))).map((r) => r.id);
    if (leads.length) {
      await tx.delete(schema.ptAccessLog).where(inArray(schema.ptAccessLog.leadId, leads));
      await tx.delete(schema.ptCalls).where(inArray(schema.ptCalls.leadId, leads));
      await tx.delete(ITEM).where(inArray(ITEM.leadId, leads));
    }
    if (reqs.length) await tx.delete(ITEM).where(inArray(ITEM.requestId, reqs));
    const ledger = await tx.delete(schema.ptCreditLedger).where(eq(schema.ptCreditLedger.demo, true)).returning({ id: schema.ptCreditLedger.id });
    if (reqs.length) await tx.delete(REQ).where(inArray(REQ.id, reqs));
    if (leads.length) await tx.delete(LEADS).where(inArray(LEADS.id, leads));
    await tx.insert(schema.ptAccessLog).values({ adminId: me.id, leadId: null, action: "purge_demo", detail: { leads: leads.length, requests: reqs.length, ledger: ledger.length } });
    return { ok: true, leads: leads.length, requests: reqs.length };
  });
}

// --- Admin overview -------------------------------------------------------------------------------------------------

export async function creditSummary(me: Me) {
  adminOnly(me);
  return { real: await summary(false), demo: await summary(true) };
}
