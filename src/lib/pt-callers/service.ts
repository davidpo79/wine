// Portugal HR callers: every rule of the module, behind injected
// dependencies, so the routes are thin and the rules are tested without HTTP,
// a database or a provider.
//
// WHO MAY DO WHAT (spec section 5: one screen, two roles)
//   Admin: import a batch, approve records, enrich approved records, check
//     results, record each number's eligibility (corporate line, legal basis),
//     assign leads to reps, see and LOWER the usage caps. No export.
//   Rep (role `pt_caller` only): their assigned leads with the number masked,
//     one lock, click to call one lead at a time, an outcome with a follow-up
//     date and short notes, the lead's call history, and opt-out (always).
//   Anyone else: 403.
//
// THE LEGAL GATE (section 8). Unless BOTH flags are on, demo mode: the mock
// Apollo client, demo rows only, no real dial. Demo and live rows are never
// shown together, and a demo row is never dialled.
//
// CREDITS (sections 2 and 7). A ledger row is written BEFORE every Apollo call,
// in the same atomic step that compares the day's and month's totals with the
// caps (the lower of the env cap and the Admin's cap). Over the cap, a
// malformed cap or an unreadable ledger refuses the call. An enrichment
// reserves the worst case (1 + 8 for a mobile, per person) and is settled once
// to Apollo's reported figure. Unknown outcomes (timeouts) stay counted.
//
// NO BLIND RETRY. A pending or timed-out reveal is never re-sent until an Admin
// has polled, or confirmed they checked Apollo's usage and released it.
//
// OPT-OUT (section 9, Article 21) is immediate and permanent: a protected hash
// of the phone and of the Apollo id goes on the block list, which nothing
// deletes. Re-import skips it, a re-enrichment that returns a blocked phone
// marks the lead blocked, and no outcome or approval moves a lead out.
//
// BEFORE EVERY DIAL (section 6) the server re-reads everything: role, both
// flags, the lead and its assignment, its status, the block list, a +351
// number, the pilot list, the recorded eligibility (corporate line and legal
// basis), approved calling hours, the per-lead attempt limit, the national
// do-not-call list, the lock, the rep's daily budget, the overall daily
// spending cap, and one call at a time. The do-not-call list, the flags, the
// status, the block list and the hours are checked again when the rep's own
// leg answers, before the lead's phone rings.

import { createHmac, createHash, timingSafeEqual } from "node:crypto";
import { normalizePtPhone, isDialablePtE164, maskPhone } from "./phone";
import { normalizeEnrichmentResult, type ApolloClient, type EnrichmentResult } from "./apollo";
import { withinCallingHours } from "./hours";
import type { PtFlags } from "./flags";
import { TERMINAL_CALL_STATUSES, ledgerAmount, type PtCall, type PtEnrichRequest, type PtLead, type PtStore } from "./store";

export const PT_CALLER_ROLE = "pt_caller";
export const STATUSES = ["new", "ready", "calling", "no_answer", "callback", "interested", "not_interested", "wrong_number", "opt_out", "blocked", "enrichment_pending", "failed"] as const;
const REP_OUTCOMES = ["no_answer", "callback", "interested", "not_interested", "wrong_number"];
const FROZEN = ["opt_out", "blocked"];
const DIALABLE_STATUSES = ["ready", "no_answer", "callback", "interested"];
const SETTLED_ENRICH = ["done", "no_phone", "phone_not_pt", "out_of_target"];
export const CREDITS_PER_PERSON = 9;
export const LOCK_TTL_MS = 15 * 60 * 1000;
const DAY_MS = 86400000;
const RETENTION_DAYS = 90;
const NOTE_MAX = 500;
const BLOCK_SCOPE = "pt_callers_marketing";
const SETTINGS_KEY = "caps";
const BLOCK_KEY_SETTING = "block_key_fingerprint";

const REASON_STATUS: Record<string, number> = { role_not_allowed: 403, pt_callers_disabled: 403, legal_not_approved: 403, not_found: 404 };

export class ServiceError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.name = "ServiceError";
    this.status = status;
    this.code = code;
  }
}

export type Ctx = { uid: string; role: string };
export type Dialer = {
  startRepLeg(a: { callId: string; uid: string; lead: PtLead }): Promise<{ callControlId: string | null }>;
  dialCustomer(a: { callId: string; to: string; linkTo: string }): Promise<{ callControlId: string | null }>;
  hangup(callControlId: string): Promise<void>;
  mintToken(uid: string): Promise<{ token: string; expiresInSecs: number | null }>;
};
export type Dnc = { check(phoneE164: string): Promise<{ status: "clear" | "listed" | "unavailable"; source?: string }> };
type AdminCaps = { dailyCredits?: number; monthlyCredits?: number; dailyCalls?: number };

export type ServiceDeps = {
  store: PtStore;
  liveApollo: ApolloClient | null;
  mockApollo: ApolloClient;
  dialer: Dialer;
  dnc: Dnc;
  readFlags: () => PtFlags;
  now: () => number;
  newId: (prefix: string) => string;
  newSecret: () => string;
  isAdmin: (role: string) => boolean;
  repDirectory?: () => Promise<Array<{ uid: string; name: string; role: string; active: boolean }>>;
  /** Keys the block-list hashes. Without it a fixed, documented salt is used. */
  blockPepper?: string;
  log?: (msg: string) => void;
};

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
function sameHash(a: string, b: string | null) {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(String(b ?? ""), "hex");
  return x.length === 32 && y.length === 32 && timingSafeEqual(x, y);
}
const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);
const monthKey = (t: number) => new Date(t).toISOString().slice(0, 7);
function employeeRangeFor(n: number | null) {
  if (typeof n !== "number") return null;
  if (n >= 51 && n <= 100) return "51-100";
  if (n >= 101 && n <= 500) return "101-500";
  return String(n);
}
function chunk<T>(a: T[], n: number) { const o: T[][] = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; }

export function createService(deps: ServiceDeps) {
  const { store, mockApollo, dialer, dnc, readFlags, now, newId, newSecret, isAdmin } = deps;
  let liveApollo = deps.liveApollo;
  let repDirectory = deps.repDirectory ?? (async () => []);
  const log = deps.log ?? (() => {});
  const pepper = deps.blockPepper || "pt-callers-block-v1";

  const blockKey = (kind: "phone" | "apollo_id", value: string) => createHmac("sha256", pepper).update(`${kind}:${value}`).digest("hex");
  const keysFor = (l: { phoneE164?: string | null; apolloId?: string | null }) => [
    ...(l.phoneE164 ? [blockKey("phone", l.phoneE164)] : []),
    ...(l.apolloId ? [blockKey("apollo_id", l.apolloId)] : []),
  ];
  // The block list holds keyed hashes, so a changed key would silently stop
  // matching every earlier opt-out. The key's fingerprint is recorded on first
  // use; if it ever differs, imports, enrichments and dials all refuse.
  const fingerprint = sha256(`fingerprint:${pepper}`);
  async function requireBlockKey() {
    const stored = await store.getSetting<string>(BLOCK_KEY_SETTING);
    if (stored === null) { await store.setSetting(BLOCK_KEY_SETTING, fingerprint, "system", now()); return; }
    if (stored !== fingerprint) throw new ServiceError(503, "block_key_changed", "The block-list key changed: restore PT_CALLERS_BLOCK_PEPPER before any import, enrichment or call");
  }

  async function block(l: { phoneE164?: string | null; apolloId?: string | null }, reason: string, by: string) {
    await requireBlockKey().catch(() => {}); // an opt-out is always recorded, whatever the key
    const t = now();
    const rows = [];
    if (l.apolloId) rows.push({ kind: "apollo_id" as const, keyHash: blockKey("apollo_id", l.apolloId), scope: BLOCK_SCOPE, reason, createdBy: by, createdAt: t });
    if (l.phoneE164) rows.push({ kind: "phone" as const, keyHash: blockKey("phone", l.phoneE164), scope: BLOCK_SCOPE, reason, createdBy: by, createdAt: t });
    await store.addBlocks(rows);
  }

  function requireAdmin(ctx: Ctx | null) { if (!ctx || !isAdmin(ctx.role)) throw new ServiceError(403, "forbidden"); }
  function requireRep(ctx: Ctx | null) { if (!ctx || ctx.role !== PT_CALLER_ROLE || !ctx.uid) throw new ServiceError(403, "forbidden"); }
  function apolloFor(f: PtFlags) {
    if (!f.live) return mockApollo;
    if (!liveApollo) throw new ServiceError(503, "apollo_not_configured", "APOLLO_API_KEY is not set");
    return liveApollo;
  }
  async function audit(uid: string, action: string, leadIds: string[], detail: Record<string, unknown> = {}) {
    try { await store.logAccess({ uid, action, leadIds, detail, at: now() }); } catch { log(`access log write failed: ${action}`); }
  }

  // The Admin may only LOWER a cap below the env value, never raise it.
  async function adminCaps(): Promise<AdminCaps> { return (await store.getSetting<AdminCaps>(SETTINGS_KEY)) ?? {}; }
  async function effective(f: PtFlags) {
    const a = await adminCaps();
    const lower = (env: number, admin?: number) => (typeof admin === "number" ? Math.min(env, admin) : env);
    return {
      dailyCredits: lower(f.caps.daily, a.dailyCredits),
      monthlyCredits: lower(f.caps.monthly, a.monthlyCredits),
      dailyCalls: lower(f.globalDailyCallCap, a.dailyCalls),
    };
  }

  const retainUntil = (l: PtLead) => l.lastActivityAt + l.retentionDays * DAY_MS;
  const adminView = (l: PtLead) => ({
    id: l.id, apolloId: l.apolloId, demo: l.demo, source: l.source, fetchedAt: l.fetchedAt,
    firstName: l.firstName, lastName: l.lastName ?? l.lastNameObfuscated, title: l.title, companyName: l.companyName,
    employeeRange: l.employeeRange, city: l.city, phone: l.phoneE164, emailBusiness: l.emailBusiness,
    status: l.status, enrichState: l.enrichState, failReason: l.failReason, approvedAt: l.approvedAt,
    numberClass: l.numberClass, legalBasis: l.legalBasis, eligibilityNote: l.eligibilityNote, attempts: l.attempts,
    assignedUid: l.assignedUid, lastCallAt: l.lastCallAt, followUpAt: l.followUpAt, notes: l.notes,
    lockUid: l.lockUid, lockExpiresAt: l.lockExpiresAt,
    lastActivityAt: l.lastActivityAt, retentionDays: l.retentionDays, retainUntil: retainUntil(l),
  });
  const repView = (l: PtLead, uid: string) => {
    const locked = Boolean(l.lockUid && (l.lockExpiresAt ?? 0) > now());
    return {
      id: l.id, demo: l.demo, source: l.source, fetchedAt: l.fetchedAt,
      firstName: l.firstName, lastName: l.lastName ?? l.lastNameObfuscated, title: l.title, companyName: l.companyName,
      employeeRange: l.employeeRange, city: l.city, phone: maskPhone(l.phoneE164), emailBusiness: l.emailBusiness,
      status: l.status, assignedUid: l.assignedUid, lastCallAt: l.lastCallAt, followUpAt: l.followUpAt, notes: l.notes,
      lockedByMe: locked && l.lockUid === uid, lockedByOther: locked && l.lockUid !== uid,
    };
  };

  async function reserve(f: PtFlags, o: { kind: string; credits: number; demo: boolean; enrichId?: string; uid: string }) {
    if (!o.demo && !f.caps.valid) throw new ServiceError(503, "credit_cap_invalid", "A credit cap env var is malformed: no Apollo call is made until it is fixed");
    const t = now();
    const id = newId("led");
    let r: { ok: boolean; reason?: string };
    try {
      const caps = await effective(f);
      r = await store.reserveCredits({
        id, demo: o.demo, kind: o.kind, day: dayKey(t), month: monthKey(t), creditsReserved: o.credits,
        enrichId: o.enrichId ?? null, uid: o.uid, createdAt: t, updatedAt: t, dailyCap: caps.dailyCredits, monthlyCap: caps.monthlyCredits,
      });
    } catch {
      throw new ServiceError(503, "credit_ledger_unavailable", "The credit ledger could not be read: no Apollo call is made");
    }
    if (!r.ok) throw new ServiceError(429, r.reason ?? "credit_cap_daily", "Apollo credit cap reached");
    return id;
  }

  // ------------------------------------------------------------------ config
  async function config(ctx: Ctx) {
    if (!ctx || (ctx.role !== PT_CALLER_ROLE && !isAdmin(ctx.role))) throw new ServiceError(403, "forbidden");
    const f = readFlags();
    return { ok: true, mode: f.live ? "live" : "demo", enabled: f.enabled, legalApproved: f.legalApproved, live: f.live,
      viewer: isAdmin(ctx.role) ? "admin" : "rep", statuses: [...STATUSES], repOutcomes: REP_OUTCOMES.slice() };
  }

  // ------------------------------------------------------------------ admin
  async function adminOverview(ctx: Ctx) {
    requireAdmin(ctx);
    const f = readFlags();
    const demo = !f.live;
    const t = now();
    const caps = await effective(f);
    let credits: { source: "ledger"; known: boolean; dailyCap: number; monthlyCap: number; envDailyCap: number; envMonthlyCap: number; capsValid: boolean; usedToday?: number; remainingToday?: number; usedMonth?: number; remainingMonth?: number };
    try {
      const totals = await store.creditTotals({ day: dayKey(t), month: monthKey(t) });
      credits = { source: "ledger", known: true, dailyCap: caps.dailyCredits, monthlyCap: caps.monthlyCredits, envDailyCap: f.caps.daily, envMonthlyCap: f.caps.monthly, capsValid: f.caps.valid,
        usedToday: totals.day, remainingToday: Math.max(0, caps.dailyCredits - totals.day), usedMonth: totals.month, remainingMonth: Math.max(0, caps.monthlyCredits - totals.month) };
    } catch {
      credits = { source: "ledger", known: false, dailyCap: caps.dailyCredits, monthlyCap: caps.monthlyCredits, envDailyCap: f.caps.daily, envMonthlyCap: f.caps.monthly, capsValid: f.caps.valid };
    }
    const callsToday = (await store.findCalls({ day: dayKey(t) })).filter((c) => c.status !== "refused");
    const connectedMs = callsToday.reduce((s, c) => s + (c.answeredAt && c.endedAt ? c.endedAt - c.answeredAt : 0), 0);
    const leads = await store.findLeads({ demo });
    const counts: Record<string, number> = {};
    for (const s of STATUSES) counts[s] = 0;
    for (const l of leads) counts[l.status] = (counts[l.status] ?? 0) + 1;
    const requests = await store.findEnrichRequests({ demo });
    return {
      ok: true, mode: demo ? "demo" : "live",
      flags: { enabled: f.enabled, legalApproved: f.legalApproved, live: f.live, pilotOnly: f.pilotOnly, pilotNumbers: f.pilotNumbers.length, callingHoursSet: Boolean(f.callingHours) },
      apollo: { configured: Boolean(liveApollo), enrichDelivery: demo ? "poll" : f.enrichDelivery, configError: f.configError },
      credits,
      calls: { today: callsToday.length, connectedMinutesToday: Math.round(connectedMs / 60000), dailyCap: caps.dailyCalls, envDailyCap: f.globalDailyCallCap, repDailyCap: f.repDailyCallCap, maxAttemptsPerLead: f.maxAttemptsPerLead },
      counts,
      enrichRequests: requests.map((r) => ({ id: r.id, apolloRequestId: r.apolloRequestId, mode: r.mode, status: r.status, leadIds: r.leadIds, deliveries: r.deliveries, createdAt: r.createdAt, lastDeliveryAt: r.lastDeliveryAt })),
    };
  }

  async function adminSetCaps(ctx: Ctx, input: AdminCaps) {
    requireAdmin(ctx);
    const f = readFlags();
    const next: AdminCaps = { ...(await adminCaps()) };
    const check = (v: unknown, envMax: number, key: keyof AdminCaps) => {
      if (v === undefined) return;
      if (v === null) { delete next[key]; return; }
      if (!Number.isSafeInteger(v) || (v as number) < 0) throw new ServiceError(400, "cap_invalid");
      if ((v as number) > envMax) throw new ServiceError(400, "cap_above_env", "An Admin cap can only be lower than the server's cap");
      next[key] = v as number;
    };
    check(input.dailyCredits, f.caps.daily, "dailyCredits");
    check(input.monthlyCredits, f.caps.monthly, "monthlyCredits");
    check(input.dailyCalls, f.globalDailyCallCap, "dailyCalls");
    await store.setSetting(SETTINGS_KEY, next, ctx.uid, now());
    await audit(ctx.uid, "admin_set_caps", [], next as Record<string, unknown>);
    return { ok: true, caps: next };
  }

  async function adminList(ctx: Ctx) {
    requireAdmin(ctx);
    const demo = !readFlags().live;
    const leads = await store.findLeads({ demo });
    await audit(ctx.uid, "admin_view_list", leads.map((l) => l.id));
    return { ok: true, mode: demo ? "demo" : "live", leads: leads.map(adminView) };
  }

  async function adminImport(ctx: Ctx, { page = 1 }: { page?: number } = {}) {
    requireAdmin(ctx);
    const f = readFlags();
    const demo = !f.live;
    const client = apolloFor(f);
    await requireBlockKey();
    const ledgerId = await reserve(f, { kind: "search", credits: 0, demo, uid: ctx.uid });
    let res;
    try {
      res = await client.searchPeople({ page: Number.isInteger(page) ? page : 1 });
    } catch {
      await store.updateLedger(ledgerId, { status: "released", updatedAt: now() }).catch(() => {});
      throw new ServiceError(502, "apollo_search_failed");
    }
    await store.updateLedger(ledgerId, { status: "settled", creditsActual: 0, updatedAt: now() }).catch(() => {});
    const t = now();
    const batchId = newId("batch");
    let inserted = 0, duplicates = 0, skippedBlocked = 0;
    for (const p of res.people) {
      if (await store.isBlocked(keysFor({ apolloId: p.apolloId }))) { skippedBlocked++; continue; }
      const r = await store.insertLeadIfAbsent({
        id: newId("ptl"), apolloId: p.apolloId, demo, source: demo ? "demo" : "apollo", fetchedAt: t, batchId,
        firstName: p.firstName, lastName: null, lastNameObfuscated: p.lastNameObfuscated, title: p.title, companyName: p.companyName,
        employeeRange: "51-500", employeeCount: null, city: null, phoneE164: null, emailBusiness: null, status: "new", statusBeforeCall: null,
        assignedUid: null, approvedAt: null, approvedBy: null, enrichState: "none", enrichId: null, failReason: null,
        numberClass: "unknown", legalBasis: null, eligibilityNote: null, attempts: 0, followUpAt: null,
        lockUid: null, lockExpiresAt: null, lastCallAt: null, notes: null, lastActivityAt: t, retentionDays: RETENTION_DAYS, createdAt: t, updatedAt: t,
      });
      if (r.inserted) inserted++; else duplicates++;
    }
    await audit(ctx.uid, "admin_import", [], { batchId, inserted, duplicates, skippedBlocked, demo });
    return { ok: true, mode: demo ? "demo" : "live", batchId, inserted, duplicates, skippedBlocked };
  }

  async function adminLead(id: unknown, demo: boolean) {
    const l = await store.getLead(String(id ?? ""));
    return l && l.demo === demo ? l : null;
  }

  async function adminApprove(ctx: Ctx, { leadIds = [] }: { leadIds?: string[] } = {}) {
    requireAdmin(ctx);
    const demo = !readFlags().live;
    const t = now();
    const approved: string[] = [], skipped: Array<{ id: string; reason: string }> = [];
    for (const id of leadIds) {
      const l = await adminLead(id, demo);
      if (!l) { skipped.push({ id, reason: "not_found" }); continue; }
      if (FROZEN.includes(l.status) || (await store.isBlocked(keysFor(l)))) { skipped.push({ id, reason: "blocked" }); continue; }
      if (l.approvedAt) { skipped.push({ id, reason: "already_approved" }); continue; }
      await store.updateLead(l.id, { approvedAt: t, approvedBy: ctx.uid, updatedAt: t });
      approved.push(l.id);
    }
    await audit(ctx.uid, "admin_approve", approved);
    return { ok: true, approved, skipped };
  }

  async function adminEnrich(ctx: Ctx, { leadIds = [] }: { leadIds?: string[] } = {}) {
    requireAdmin(ctx);
    const f = readFlags();
    const demo = !f.live;
    const client = apolloFor(f);
    const mode: "webhook" | "poll" = demo ? "poll" : f.enrichDelivery;
    await requireBlockKey();
    if (!demo && f.configError) throw new ServiceError(503, f.configError, "Apollo result delivery is not configured");
    const eligible: PtLead[] = [], skipped: Array<{ id: string; reason: string }> = [];
    for (const id of leadIds) {
      const l = await adminLead(id, demo);
      if (!l) { skipped.push({ id, reason: "not_found" }); continue; }
      if (FROZEN.includes(l.status) || (await store.isBlocked(keysFor(l)))) { skipped.push({ id, reason: "blocked" }); continue; }
      if (!l.approvedAt) { skipped.push({ id, reason: "not_approved" }); continue; }
      if (l.enrichState === "pending") { skipped.push({ id, reason: "already_pending" }); continue; }
      if (l.enrichState === "timeout" || l.enrichState === "lost") { skipped.push({ id, reason: "outcome_unknown" }); continue; }
      if (SETTLED_ENRICH.includes(l.enrichState)) { skipped.push({ id, reason: "already_enriched" }); continue; }
      eligible.push(l);
    }
    const requests: string[] = [];
    let sent = 0, outcomeUnknown = 0, rejected = 0;
    const groups = chunk(eligible, 10);
    for (let gi = 0; gi < groups.length; gi++) {
      const group = groups[gi];
      const enrichId = newId("per");
      const secret = mode === "webhook" ? newSecret() : null;
      let ledgerId: string;
      try {
        ledgerId = await reserve(f, { kind: "enrich", credits: CREDITS_PER_PERSON * group.length, demo, enrichId, uid: ctx.uid });
      } catch (e) {
        if (gi === 0) throw e;
        for (const g of groups.slice(gi).flat()) skipped.push({ id: g.id, reason: (e as ServiceError).code });
        break;
      }
      const t = now();
      await store.insertEnrichRequest({
        id: enrichId, demo, apolloRequestId: null, mode, secretHash: secret ? sha256(secret) : null,
        leadIds: group.map((l) => l.id), apolloIds: group.map((l) => l.apolloId), ledgerId, status: "sending",
        creditsSettled: false, deliveries: 0, createdAt: t, updatedAt: t, lastDeliveryAt: null,
      });
      // Pending BEFORE the call: a crash mid-request never causes a re-send.
      for (const l of group) await store.updateLead(l.id, { enrichState: "pending", enrichId, status: FROZEN.includes(l.status) ? l.status : "enrichment_pending", updatedAt: t });
      requests.push(enrichId);
      const webhookUrl = secret ? `${f.webhookBaseUrl}/api/pt-callers/apollo-webhook/${enrichId}/${secret}` : null;
      let res;
      try {
        res = await client.bulkMatch({ personIds: group.map((l) => l.apolloId), webhookUrl, pollOnly: !webhookUrl });
      } catch (e) {
        const unknown = Boolean((e as { outcomeUnknown?: boolean })?.outcomeUnknown);
        for (const l of group) {
          await store.updateLead(l.id, unknown ? { enrichState: "timeout", updatedAt: now() } : { enrichState: "rejected", status: "failed", failReason: "apollo_rejected", updatedAt: now() }, { statusNotIn: FROZEN });
        }
        await store.updateEnrichRequest(enrichId, { status: unknown ? "outcome_unknown" : "rejected", updatedAt: now() });
        if (!unknown) await store.updateLedger(ledgerId, { status: "released", updatedAt: now() });
        if (unknown) outcomeUnknown += group.length; else rejected += group.length;
        continue;
      }
      await store.updateEnrichRequest(enrichId, { apolloRequestId: res.requestId, status: "pending", updatedAt: now() });
      await store.updateLedger(ledgerId, { creditsSync: res.creditsConsumed, updatedAt: now() });
      for (const m of res.matches) {
        const l = group.find((x) => x.apolloId === m.apolloId);
        if (!l) continue;
        const outOfTarget = (m.country && m.country !== "Portugal") || (m.companyCountry && m.companyCountry !== "Portugal")
          || (typeof m.employeeCount === "number" && (m.employeeCount < 51 || m.employeeCount > 500));
        const patch: Partial<PtLead> = {
          firstName: m.firstName ?? l.firstName, lastName: m.lastName, title: m.title ?? l.title, city: m.city,
          emailBusiness: m.email, companyName: m.companyName ?? l.companyName, employeeCount: m.employeeCount,
          employeeRange: employeeRangeFor(m.employeeCount) ?? l.employeeRange, updatedAt: now(),
        };
        if (outOfTarget) Object.assign(patch, { enrichState: "out_of_target", status: "failed", failReason: "out_of_target" });
        await store.updateLead(l.id, patch, outOfTarget ? { statusNotIn: FROZEN } : undefined);
      }
      sent += group.length;
    }
    await audit(ctx.uid, "admin_enrich", eligible.map((l) => l.id), { requests, demo });
    return { ok: true, mode: demo ? "demo" : "live", sent, outcomeUnknown, rejected, skipped, requests };
  }

  // One result (webhook or poll). Idempotent and order-proof: a phone already
  // received is never replaced or erased; credits are settled exactly once.
  async function applyNormalized(req: PtEnrichRequest, result: EnrichmentResult) {
    const t = now();
    let changed = 0;
    for (const p of result.people) {
      const idx = req.apolloIds.indexOf(p.apolloId);
      if (idx < 0) continue;
      const lead = await store.getLead(req.leadIds[idx]);
      if (!lead || lead.phoneE164 || lead.enrichState === "out_of_target") continue;
      const frozen = FROZEN.includes(lead.status);
      const phones = p.phones.slice().sort((a, b) => (a.type === "mobile" ? -1 : 0) - (b.type === "mobile" ? -1 : 0));
      if (!phones.length) {
        const state = p.status === "success" ? "no_phone" : "failed";
        if (lead.enrichState === state || lead.enrichState === "no_phone") continue;
        await store.updateLead(lead.id, { enrichState: state, status: frozen ? lead.status : "failed", failReason: state, updatedAt: t }, { phoneIsNull: true });
        changed++;
        continue;
      }
      const pt = phones.map((n) => normalizePtPhone(n.e164)).find(isDialablePtE164) ?? null;
      if (!pt) {
        if (lead.enrichState === "phone_not_pt") continue;
        await store.updateLead(lead.id, { enrichState: "phone_not_pt", status: frozen ? lead.status : "failed", failReason: "phone_not_pt", updatedAt: t }, { phoneIsNull: true });
        changed++;
        continue;
      }
      const blocked = await store.isBlocked(keysFor({ phoneE164: pt, apolloId: lead.apolloId }));
      const done = await store.updateLead(lead.id, { phoneE164: pt, enrichState: "done", status: frozen ? lead.status : blocked ? "blocked" : "ready", failReason: null, lastActivityAt: t, updatedAt: t }, { phoneIsNull: true });
      if (done && (frozen || blocked)) await block({ phoneE164: pt, apolloId: lead.apolloId }, frozen ? lead.status : "linked_to_blocked", "system");
      if (done) changed++;
    }
    let settledNow = false;
    if (result.creditsConsumed !== null && (await store.markCreditsSettled(req.id))) {
      settledNow = true;
      if (req.ledgerId) {
        const row = await store.getLedger(req.ledgerId);
        const sync = row?.creditsSync != null ? Number(row.creditsSync) : 0;
        await store.updateLedger(req.ledgerId, { creditsAsync: result.creditsConsumed, creditsActual: sync + result.creditsConsumed, status: "settled", updatedAt: t });
      }
    }
    const leads = await Promise.all(req.leadIds.map((id) => store.getLead(id)));
    const open = leads.filter((l) => l && (l.enrichState === "pending" || l.enrichState === "timeout")).length;
    const requestStatus = open ? "partial" : "complete";
    await store.updateEnrichRequest(req.id, { status: requestStatus, deliveries: req.deliveries + 1, lastDeliveryAt: t, updatedAt: t });
    return { ok: true, requestStatus, changed, duplicate: changed === 0 && !settledNow };
  }

  async function applyEnrichmentResult(enrichId: string, payload: unknown, source: "webhook" | "poll") {
    const req = await store.getEnrichRequest(String(enrichId ?? ""));
    if (!req) throw new ServiceError(404, "not_found");
    const out = await applyNormalized(req, normalizeEnrichmentResult(payload));
    log(`enrichment result from ${source}: ${req.id} ${out.requestStatus}${out.duplicate ? " (duplicate)" : ""}`);
    return out;
  }

  // Apollo documents no webhook signature. The URL carries our request id and
  // a 32+ character random secret; only its SHA-256 is stored, compared in
  // constant time.
  async function receiveApolloWebhook(enrichId: string, secret: string, rawText: string) {
    const id = String(enrichId ?? "");
    if (!/^[A-Za-z0-9_]{1,64}$/.test(id) || !secret) throw new ServiceError(404, "not_found");
    const req = await store.getEnrichRequest(id);
    if (!req || req.mode !== "webhook" || !sameHash(sha256(secret), req.secretHash)) throw new ServiceError(404, "not_found");
    let payload: unknown;
    try { payload = JSON.parse(String(rawText ?? "")); } catch { throw new ServiceError(400, "bad_payload"); }
    return applyEnrichmentResult(id, payload, "webhook");
  }

  async function adminPoll(ctx: Ctx, { enrichId }: { enrichId?: string } = {}) {
    requireAdmin(ctx);
    const f = readFlags();
    const demo = !f.live;
    const req = await store.getEnrichRequest(String(enrichId ?? ""));
    if (!req || req.demo !== demo) throw new ServiceError(404, "not_found");
    if (!req.apolloRequestId) throw new ServiceError(409, "no_request_id", "Apollo never returned a request id; check Apollo, then release the leads");
    const client = apolloFor(f);
    let r;
    try { r = await client.pollResult(req.apolloRequestId); } catch { throw new ServiceError(502, "apollo_poll_failed"); }
    if (r.state === "pending") return { ok: true, state: "pending", retryAfterSeconds: r.retryAfterSeconds };
    if (r.state === "gone" || r.state === "failed") {
      const t = now();
      for (const id of req.leadIds) {
        const l = await store.getLead(id);
        if (l && (l.enrichState === "pending" || l.enrichState === "timeout")) {
          await store.updateLead(id, r.state === "failed"
            ? { enrichState: "failed", status: FROZEN.includes(l.status) ? l.status : "failed", failReason: "apollo_failed", updatedAt: t }
            : { enrichState: "lost", updatedAt: t });
        }
      }
      await store.updateEnrichRequest(req.id, { status: r.state === "failed" ? "failed" : "lost", updatedAt: t });
      return { ok: true, state: r.state };
    }
    const out = await applyNormalized(req, r.result);
    return { ok: true, state: "ready", requestStatus: out.requestStatus, changed: out.changed };
  }

  async function adminReleaseTimeout(ctx: Ctx, { leadIds = [], confirmCheckedApollo }: { leadIds?: string[]; confirmCheckedApollo?: boolean } = {}) {
    requireAdmin(ctx);
    if (confirmCheckedApollo !== true) throw new ServiceError(400, "confirm_checked_apollo_required", "Check in Apollo whether the reveal was charged before releasing");
    const demo = !readFlags().live;
    const released: string[] = [];
    for (const id of leadIds) {
      const l = await adminLead(id, demo);
      if (!l || !(l.enrichState === "timeout" || l.enrichState === "lost")) continue;
      await store.updateLead(l.id, { enrichState: "released", enrichId: null, status: FROZEN.includes(l.status) ? l.status : "new", updatedAt: now() });
      released.push(l.id);
    }
    await audit(ctx.uid, "admin_release_timeout", released, { confirmCheckedApollo: true });
    return { ok: true, released };
  }

  // Spec sections 8 and 9: who may be called is a legal question per number.
  // Apollo is not proof of consent, and an HR manager's number is not proof of
  // a corporate line. A lead is dialable only once an Admin records it as a
  // corporate line with the legal basis (per the lawyer's written approval).
  async function adminSetEligibility(ctx: Ctx, { leadId, numberClass, legalBasis, eligibilityNote }: { leadId?: string; numberClass?: string; legalBasis?: string; eligibilityNote?: string } = {}) {
    requireAdmin(ctx);
    const demo = !readFlags().live;
    const l = await adminLead(leadId, demo);
    if (!l) throw new ServiceError(404, "not_found");
    if (!["unknown", "corporate", "personal"].includes(String(numberClass))) throw new ServiceError(400, "invalid_number_class");
    await store.updateLead(l.id, {
      numberClass: numberClass as PtLead["numberClass"],
      legalBasis: String(legalBasis ?? "").trim().slice(0, 300) || null,
      eligibilityNote: String(eligibilityNote ?? "").trim().slice(0, 300) || null,
      updatedAt: now(),
    });
    await audit(ctx.uid, "admin_set_eligibility", [l.id], { numberClass });
    return { ok: true };
  }

  async function adminAssign(ctx: Ctx, { leadIds = [], repUid }: { leadIds?: string[]; repUid?: string | null } = {}) {
    requireAdmin(ctx);
    const demo = !readFlags().live;
    const uid = repUid === null ? null : String(repUid ?? "");
    if (uid !== null) {
      const reps = await repDirectory();
      if (!reps.some((r) => r.uid === uid && r.role === PT_CALLER_ROLE && r.active)) throw new ServiceError(400, "not_a_pt_caller");
    }
    const assigned: string[] = [];
    for (const id of leadIds) {
      const l = await adminLead(id, demo);
      if (!l) continue;
      await store.updateLead(l.id, { assignedUid: uid, updatedAt: now() });
      assigned.push(l.id);
    }
    await audit(ctx.uid, "admin_assign", assigned, { repUid: uid });
    return { ok: true, assigned };
  }

  async function adminReps(ctx: Ctx) {
    requireAdmin(ctx);
    return { ok: true, reps: (await repDirectory()).filter((r) => r.role === PT_CALLER_ROLE && r.active).map((r) => ({ uid: r.uid, name: r.name })) };
  }

  // ------------------------------------------------------------------ rep
  async function repLead(ctx: Ctx, leadId: unknown) {
    requireRep(ctx);
    const demo = !readFlags().live;
    const l = await store.getLead(String(leadId ?? ""));
    if (!l || l.demo !== demo || l.assignedUid !== ctx.uid) throw new ServiceError(404, "not_found");
    return l;
  }

  async function repList(ctx: Ctx) {
    requireRep(ctx);
    const demo = !readFlags().live;
    const leads = await store.findLeads({ demo, assignedUid: ctx.uid });
    await audit(ctx.uid, "view_list", leads.map((l) => l.id));
    return { ok: true, mode: demo ? "demo" : "live", leads: leads.map((l) => repView(l, ctx.uid)) };
  }

  async function lock(ctx: Ctx, { leadId }: { leadId?: string } = {}) {
    const l = await repLead(ctx, leadId);
    const t = now();
    if (!(await store.acquireLock(l.id, ctx.uid, t, LOCK_TTL_MS))) throw new ServiceError(409, "lead_locked");
    return { ok: true, lockExpiresAt: t + LOCK_TTL_MS };
  }

  async function release(ctx: Ctx, { leadId }: { leadId?: string } = {}) {
    const l = await repLead(ctx, leadId);
    await store.releaseLock(l.id, ctx.uid);
    return { ok: true };
  }

  async function setOutcome(ctx: Ctx, { leadId, status, note, followUpAt }: { leadId?: string; status?: string; note?: string; followUpAt?: number | null } = {}) {
    const l = await repLead(ctx, leadId);
    if (FROZEN.includes(l.status)) throw new ServiceError(409, "lead_blocked");
    const t = now();
    const patch: Partial<PtLead> = { lastActivityAt: t, updatedAt: t };
    if (status) {
      if (!REP_OUTCOMES.includes(status)) throw new ServiceError(400, "invalid_status");
      patch.status = status;
    }
    // Short notes only (spec section 9: no personal notes, no profile).
    if (typeof note === "string") patch.notes = note.trim().slice(0, NOTE_MAX) || null;
    if (followUpAt === null) patch.followUpAt = null;
    else if (followUpAt !== undefined) {
      if (!Number.isSafeInteger(followUpAt) || followUpAt < t) throw new ServiceError(400, "invalid_follow_up");
      patch.followUpAt = followUpAt;
    }
    const updated = await store.updateLead(l.id, patch, { statusNotIn: FROZEN });
    if (!updated) throw new ServiceError(409, "lead_blocked");
    if (status === "wrong_number" && l.phoneE164) await block({ phoneE164: l.phoneE164 }, "wrong_number", ctx.uid);
    await audit(ctx.uid, "outcome", [l.id], { status: patch.status ?? null });
    return { ok: true, lead: repView(updated, ctx.uid) };
  }

  // Always available, in demo mode too, to the assigned rep and to Admin.
  async function optOut(ctx: Ctx, { leadId }: { leadId?: string } = {}) {
    let l: PtLead | null;
    if (ctx && isAdmin(ctx.role)) {
      l = await store.getLead(String(leadId ?? ""));
      if (!l) throw new ServiceError(404, "not_found");
    } else {
      l = await repLead(ctx, leadId);
    }
    await block(l, "opt_out", ctx.uid);
    const t = now();
    await store.updateLead(l.id, { status: "opt_out", statusBeforeCall: null, followUpAt: null, lastActivityAt: t, updatedAt: t });
    await store.releaseLock(l.id, null);
    await audit(ctx.uid, "opt_out", [l.id]);
    return { ok: true };
  }

  async function callHistory(ctx: Ctx, { leadId }: { leadId?: string } = {}) {
    const l = ctx && isAdmin(ctx.role) ? await store.getLead(String(leadId ?? "")) : await repLead(ctx, leadId);
    if (!l) throw new ServiceError(404, "not_found");
    const calls = await store.findCalls({ leadId: l.id });
    await audit(ctx.uid, "view_history", [l.id]);
    return { ok: true, source: l.source, fetchedAt: l.fetchedAt, calls: calls.map((c) => ({ callId: c.id, status: c.status, reason: c.refusedReason, startedAt: c.startedAt, answeredAt: c.answeredAt, endedAt: c.endedAt })) };
  }

  async function dialableVerdict(lead: PtLead | null, uid: string, { atAnswer = false } = {}): Promise<string | null> {
    const f = readFlags();
    if (!f.enabled) return "pt_callers_disabled";
    if (!f.legalApproved) return "legal_not_approved";
    if (!lead || lead.demo || lead.assignedUid !== uid) return "not_found";
    try { await requireBlockKey(); } catch { return "block_key_changed"; }
    if (!(DIALABLE_STATUSES.includes(lead.status) || (atAnswer && lead.status === "calling"))) return "lead_not_dialable";
    if (await store.isBlocked(keysFor(lead))) return "blocked";
    if (!isDialablePtE164(lead.phoneE164)) return "phone_not_pt_e164";
    if (f.pilotOnly && !f.pilotNumbers.includes(lead.phoneE164)) return "not_pilot_number";
    if (lead.numberClass !== "corporate" || !lead.legalBasis) return "eligibility_not_recorded";
    if (!f.callingHours) return "calling_hours_not_set";
    if (!withinCallingHours(f.callingHours, now())) return "outside_calling_hours";
    if (!atAnswer && lead.attempts >= f.maxAttemptsPerLead) return "max_attempts_reached";
    let d;
    try { d = await dnc.check(lead.phoneE164); } catch { return "dnc_unavailable"; }
    if (d?.status === "listed") return "dnc_listed";
    if (d?.status !== "clear") return "dnc_unavailable";
    if (lead.lockUid && lead.lockUid !== uid && (lead.lockExpiresAt ?? 0) > now()) return "lead_locked";
    if (!atAnswer) {
      let mine: PtCall[], all: PtCall[];
      try {
        all = (await store.findCalls({ day: dayKey(now()) })).filter((c) => c.status !== "refused");
        mine = all.filter((c) => c.uid === uid);
      } catch { return "budget_unknown"; }
      if (!(mine.length < f.repDailyCallCap)) return "budget_exhausted";
      const caps = await effective(f);
      if (caps.dailyCalls <= 0) return "spend_cap_not_set";
      if (all.length >= caps.dailyCalls) return "spend_cap_reached";
      if (await store.activeCallForUid(uid)) return "rep_busy";
    }
    return null;
  }

  async function preDialCheck(ctx: Ctx, { leadId }: { leadId?: string } = {}) {
    if (!ctx || ctx.role !== PT_CALLER_ROLE || !ctx.uid) return { ok: false as const, reason: "role_not_allowed" };
    const f = readFlags();
    if (!f.enabled) return { ok: false as const, reason: "pt_callers_disabled" };
    if (!f.legalApproved) return { ok: false as const, reason: "legal_not_approved" };
    const lead = await store.getLead(String(leadId ?? ""));
    const reason = await dialableVerdict(lead, ctx.uid);
    return reason ? { ok: false as const, reason } : { ok: true as const, reason: null, lead: lead! };
  }

  const refuse = (reason: string) => new ServiceError(REASON_STATUS[reason] ?? 409, reason);

  async function finishLead(call: { leadId: string; uid: string }) {
    const t = now();
    const lead = await store.getLead(call.leadId);
    if (lead && lead.status === "calling") {
      await store.updateLead(lead.id, { status: lead.statusBeforeCall ?? "ready", statusBeforeCall: null, lastActivityAt: t, updatedAt: t }, { statusIn: ["calling"] });
    }
    await store.releaseLock(call.leadId, call.uid);
  }

  async function startCall(ctx: Ctx, { leadId }: { leadId?: string } = {}) {
    const pre = await preDialCheck(ctx, { leadId });
    if (!pre.ok) throw refuse(pre.reason);
    const lead = pre.lead;
    const t = now();
    if (!(await store.acquireLock(lead.id, ctx.uid, t, LOCK_TTL_MS))) throw refuse("lead_locked");
    const callId = newId("ptc");
    await store.insertCall({ id: callId, leadId: lead.id, uid: ctx.uid, status: "dialing_rep", repCallControlId: null, customerCallControlId: null, refusedReason: null, day: dayKey(t), startedAt: t, answeredAt: null, endedAt: null });
    await store.updateLead(lead.id, { status: "calling", statusBeforeCall: lead.status, attempts: lead.attempts + 1, lastCallAt: t, lastActivityAt: t, updatedAt: t });
    await audit(ctx.uid, "call_start", [lead.id], { callId });
    let leg;
    try {
      leg = await dialer.startRepLeg({ callId, uid: ctx.uid, lead });
    } catch (e) {
      const code = (e as { code?: string })?.code ?? "dial_failed";
      await store.updateCall(callId, { status: "failed", refusedReason: code, endedAt: now() });
      await finishLead({ leadId: lead.id, uid: ctx.uid });
      throw new ServiceError((e as { status?: number })?.status ?? 502, code);
    }
    await store.updateCall(callId, { repCallControlId: leg?.callControlId ?? null });
    return { ok: true, callId, status: "dialing_rep" };
  }

  // Telnyx events update the TECHNICAL call state; the rep records the
  // business outcome. Every transition is conditional on the current state, so
  // a duplicate or concurrent event never dials twice or ends a call twice.
  async function onCallEvent({ callId, leg, type, callControlId }: { callId: string; leg: "rep" | "customer"; type: "answered" | "hangup"; callControlId: string | null }) {
    const call = await store.getCall(String(callId ?? ""));
    if (!call) return { ok: true, ignored: true };
    const t = now();
    if (type === "answered" && leg === "rep") {
      if (call.status !== "dialing_rep") return { ok: true, ignored: true };
      const lead = await store.getLead(call.leadId);
      const reason = await dialableVerdict(lead, call.uid, { atAnswer: true });
      if (reason) {
        const moved = await store.updateCall(call.id, { status: "refused", refusedReason: reason, endedAt: t }, ["dialing_rep"]);
        if (moved) {
          if (callControlId) await dialer.hangup(callControlId).catch(() => {});
          await finishLead(call);
        }
        return { ok: true, refused: reason };
      }
      const moved = await store.updateCall(call.id, { status: "dialing_customer", repCallControlId: callControlId }, ["dialing_rep"]);
      if (!moved) return { ok: true, ignored: true };
      try {
        const cust = await dialer.dialCustomer({ callId: call.id, to: lead!.phoneE164!, linkTo: callControlId! });
        await store.updateCall(call.id, { customerCallControlId: cust?.callControlId ?? null });
      } catch (e) {
        await store.updateCall(call.id, { status: "failed", refusedReason: (e as { code?: string })?.code ?? "dial_failed", endedAt: now() });
        if (callControlId) await dialer.hangup(callControlId).catch(() => {});
        await finishLead(call);
      }
      return { ok: true };
    }
    if (type === "answered" && leg === "customer") {
      await store.updateCall(call.id, { status: "connected", answeredAt: t }, ["dialing_customer"]);
      return { ok: true };
    }
    if (type === "hangup") {
      if (TERMINAL_CALL_STATUSES.includes(call.status)) return { ok: true, ignored: true };
      const status = call.status === "connected" ? "completed" : leg === "customer" && call.status === "dialing_customer" ? "no_answer" : "ended";
      const moved = await store.updateCall(call.id, { status, endedAt: t }, [call.status]);
      if (!moved) return { ok: true, ignored: true };
      const other = leg === "rep" ? moved.customerCallControlId : moved.repCallControlId;
      if (other) await dialer.hangup(other).catch(() => {});
      await finishLead(call);
      return { ok: true };
    }
    return { ok: true, ignored: true };
  }

  async function ownCall(ctx: Ctx, callId: unknown) {
    requireRep(ctx);
    const c = await store.getCall(String(callId ?? ""));
    if (!c || c.uid !== ctx.uid) throw new ServiceError(404, "not_found");
    return c;
  }

  async function callState(ctx: Ctx, { callId }: { callId?: string } = {}) {
    const c = await ownCall(ctx, callId);
    return { ok: true, callId: c.id, leadId: c.leadId, status: c.status, reason: c.refusedReason, startedAt: c.startedAt, endedAt: c.endedAt };
  }

  async function endCall(ctx: Ctx, { callId }: { callId?: string } = {}) {
    const c = await ownCall(ctx, callId);
    if (!TERMINAL_CALL_STATUSES.includes(c.status)) {
      const moved = await store.updateCall(c.id, { status: "ended", endedAt: now() }, [c.status]);
      if (moved) {
        for (const cc of [c.customerCallControlId, c.repCallControlId]) if (cc) await dialer.hangup(cc).catch(() => {});
        await finishLead(c);
      }
    }
    return { ok: true };
  }

  async function phoneToken(ctx: Ctx) {
    requireRep(ctx);
    const f = readFlags();
    if (!f.enabled) throw refuse("pt_callers_disabled");
    if (!f.legalApproved) throw refuse("legal_not_approved");
    try {
      const m = await dialer.mintToken(ctx.uid);
      await audit(ctx.uid, "phone_token", []);
      return { ok: true, token: m.token, expiresInSecs: m.expiresInSecs };
    } catch (e) {
      throw new ServiceError((e as { status?: number })?.status ?? 503, (e as { code?: string })?.code ?? "phone_unavailable");
    }
  }

  return {
    config, adminOverview, adminSetCaps, adminList, adminImport, adminApprove, adminEnrich, adminPoll, adminReleaseTimeout,
    adminSetEligibility, adminAssign, adminReps, applyEnrichmentResult, receiveApolloWebhook,
    repList, lock, release, setOutcome, optOut, callHistory, preDialCheck, startCall, onCallEvent, callState, endCall, phoneToken,
    setRepDirectory(fn: NonNullable<ServiceDeps["repDirectory"]>) { repDirectory = fn; },
    setLiveApollo(c: ApolloClient | null) { liveApollo = c; },
  };
}

export type PtService = ReturnType<typeof createService>;
export { ledgerAmount };
