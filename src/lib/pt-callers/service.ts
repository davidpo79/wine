// Portugal callers: every rule for leads, enrichment, opt-out, locking and dialing.
// Admin: import (0-credit search), approve, enrich (credits), check results, assign, classify the number.
// Sales rep: sees only assigned leads (numbers masked), dials one at a time through #4's browser phone, records the
// outcome, can always mark "Não contactar". Opt-out is permanent (hashed phone + Apollo id), re-import never undoes it.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { PtLead } from "@/db/schema";
import type { AdminSession } from "@/lib/auth";
import { placeCall } from "@/lib/human-calls";
import { ApolloHttpError, apolloFor, parsePhonePayload, type ParsedPerson, type SearchPerson } from "./apollo";
import { DIALABLE, ENRICH_TIMEOUT_MINUTES, FINAL_BLOCKED, LOCK_MINUTES, REP_OUTCOMES, RETENTION_DAYS, resultMode, type LeadStatus } from "./flags";
import { CreditRefused, reserve, settleOnce, summary } from "./ledger";
import { blockHash, maskPhone, normalizePtPhone } from "./phone";
import { isBlocked, leadById, leadRefusal, logAccess, releaseAfterCall, type Refusal } from "./rules";

const LEADS = schema.ptLeads;
const REQ = schema.ptEnrichmentRequests;
const ITEM = schema.ptEnrichmentItems;
type Me = Pick<AdminSession, "id" | "email" | "role" | "mustChangePassword">;

function adminOnly(me: Me) {
  if (me.role !== "admin") throw new Error("forbidden: admins only");
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

export async function importLeads(me: Me, o: { page: number }) {
  adminOnly(me);
  const client = apolloFor();
  const { people, totalEntries } = await client.search(o.page);
  const r = await insertSearchResults(me, people, { demo: client.kind === "mock" });
  await logAccess(me.id, null, "import", { page: o.page, source: client.kind, ...r, totalEntries });
  return { source: client.kind, totalEntries, ...r };
}

export async function approveLeads(me: Me, ids: number[]) {
  adminOnly(me);
  if (!ids.length) return { ok: true, count: 0 };
  const r = await db
    .update(LEADS)
    .set({ approvedAt: new Date(), approvedBy: me.id, updatedAt: new Date() })
    .where(and(inArray(LEADS.id, ids), isNull(LEADS.approvedAt), sql`${LEADS.status} not in ('opt_out','blocked')`))
    .returning({ id: LEADS.id });
  for (const x of r) await logAccess(me.id, x.id, "approve");
  return { ok: true, count: r.length };
}

// --- Enrichment (credits) ---------------------------------------------------------------------------------------------

type EnrichResult = { ok: boolean; reason?: string; requestId?: string; testSecret?: string };

export async function enrichLeads(me: Me, ids: number[]): Promise<EnrichResult> {
  adminOnly(me);
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
  const base = (process.env.APOLLO_WEBHOOK_BASE_URL ?? (demo ? "https://demo.invalid" : "")).replace(/\/$/, "");
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
    else await db.update(LEADS).set({ phone: number, phoneType: pick!.type, numberClass: "unknown", status: "new", failReason: null, enrichedAt: new Date(), updatedAt: new Date() }).where(where);
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

/** The number's class (business line or not) and the legal basis, both recorded by an admin before any dial. */
export async function classifyLead(me: Me, id: number, o: { numberClass: string; legalBasis: string }) {
  adminOnly(me);
  const lead = await leadById(id);
  if (!lead) return { ok: false, reason: "Not found." };
  if (await isBlocked(lead)) return { ok: false, reason: "Blocked or opted out: it stays that way." };
  const numberClass = ["business", "personal", "unknown"].includes(o.numberClass) ? o.numberClass : "unknown";
  const legalBasis = o.legalBasis.trim().slice(0, 500) || null;
  const ready = !!lead.phone && numberClass === "business" && !!legalBasis && ["new", "failed"].includes(lead.status);
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
    note: l.note,
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

export async function setOutcome(me: Me, leadId: number, o: { status: string; note?: string; callbackAt?: string }) {
  const l = await leadById(leadId);
  if (!l || !repOwns(me, l)) return { ok: false, reason: "not_found" };
  if (FINAL_BLOCKED.includes(l.status as LeadStatus) || (await isBlocked(l))) return { ok: false, reason: "blocked" };
  if (!REP_OUTCOMES.includes(o.status as LeadStatus)) return { ok: false, reason: "bad_status" };
  if (l.lockedBy && l.lockedBy !== me.id && l.lockUntil && l.lockUntil.getTime() > Date.now()) return { ok: false, reason: "locked_by_other" };
  const cb = o.status === "callback" && o.callbackAt ? new Date(o.callbackAt) : null;
  await db
    .update(LEADS)
    .set({
      status: o.status,
      note: o.note !== undefined ? o.note.slice(0, 280) || null : l.note,
      callbackAt: cb && !Number.isNaN(cb.getTime()) ? cb : null,
      lockedBy: null,
      lockUntil: null,
      statusBeforeCall: null,
      updatedAt: new Date(),
    })
    .where(and(eq(LEADS.id, leadId), sql`${LEADS.status} not in ('opt_out','blocked')`));
  await logAccess(me.id, leadId, "outcome", { status: o.status });
  return { ok: true };
}

export async function predialCheck(me: Me, leadId: number): Promise<{ ok: true } | { ok: false; reason: Refusal | "forbidden_role" }> {
  if (me.role !== "pt_caller") return { ok: false, reason: "forbidden_role" };
  const lead = await leadById(leadId);
  if (!lead) return { ok: false, reason: "not_found" };
  const r = await leadRefusal(lead, me.id);
  return r ? { ok: false, reason: r } : { ok: true };
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

// --- Admin overview -------------------------------------------------------------------------------------------------

export async function creditSummary(me: Me) {
  adminOnly(me);
  return { real: await summary(false), demo: await summary(true) };
}
