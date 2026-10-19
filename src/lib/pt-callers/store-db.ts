// Portugal HR callers: the Postgres store (tables in drizzle/0018_pt_hr_callers.sql),
// the same contract as the in-memory store in store.ts. Raw SQL through the
// app's postgres-js client, because the atomic steps are conditional updates
// and one advisory-locked transaction, which read clearest as SQL.
import type { Sql } from "postgres";
import type { LeadGuard, PtAccessRow, PtBlock, PtCall, PtEnrichRequest, PtLead, PtLedgerRow, PtStore, ReserveRow } from "./store";
import { ACTIVE_CALL_STATUSES } from "./store";

type Cols = Array<[string, string]>;
const LEAD: Cols = [
  ["id", "id"], ["apolloId", "apollo_id"], ["demo", "demo"], ["source", "source"], ["fetchedAt", "fetched_at"], ["batchId", "batch_id"],
  ["firstName", "first_name"], ["lastName", "last_name"], ["lastNameObfuscated", "last_name_obfuscated"], ["title", "title"],
  ["companyName", "company_name"], ["employeeRange", "employee_range"], ["employeeCount", "employee_count"], ["city", "city"],
  ["phoneE164", "phone_e164"], ["emailBusiness", "email_business"], ["status", "status"], ["statusBeforeCall", "status_before_call"],
  ["assignedUid", "assigned_uid"], ["approvedAt", "approved_at"], ["approvedBy", "approved_by"], ["enrichState", "enrich_state"],
  ["enrichId", "enrich_id"], ["failReason", "fail_reason"], ["numberClass", "number_class"], ["legalBasis", "legal_basis"],
  ["eligibilityNote", "eligibility_note"], ["attempts", "attempts"], ["followUpAt", "follow_up_at"], ["lockUid", "lock_uid"],
  ["lockExpiresAt", "lock_expires_at"], ["lastCallAt", "last_call_at"], ["notes", "notes"], ["lastActivityAt", "last_activity_at"],
  ["retentionDays", "retention_days"], ["createdAt", "created_at"], ["updatedAt", "updated_at"],
];
const LEDGER: Cols = [
  ["id", "id"], ["demo", "demo"], ["kind", "kind"], ["day", "day"], ["month", "month"], ["creditsReserved", "credits_reserved"],
  ["creditsSync", "credits_sync"], ["creditsAsync", "credits_async"], ["creditsActual", "credits_actual"], ["status", "status"],
  ["enrichId", "enrich_id"], ["uid", "uid"], ["createdAt", "created_at"], ["updatedAt", "updated_at"],
];
const ENRICH: Cols = [
  ["id", "id"], ["demo", "demo"], ["apolloRequestId", "apollo_request_id"], ["mode", "mode"], ["secretHash", "secret_hash"],
  ["leadIds", "lead_ids"], ["apolloIds", "apollo_ids"], ["ledgerId", "ledger_id"], ["status", "status"], ["creditsSettled", "credits_settled"],
  ["deliveries", "deliveries"], ["createdAt", "created_at"], ["updatedAt", "updated_at"], ["lastDeliveryAt", "last_delivery_at"],
];
const CALL: Cols = [
  ["id", "id"], ["leadId", "lead_id"], ["uid", "uid"], ["status", "status"], ["repCallControlId", "rep_call_control_id"],
  ["customerCallControlId", "customer_call_control_id"], ["refusedReason", "refused_reason"], ["day", "day"],
  ["startedAt", "started_at"], ["answeredAt", "answered_at"], ["endedAt", "ended_at"],
];
const BLOCK: Cols = [["keyHash", "key_hash"], ["kind", "kind"], ["scope", "scope"], ["reason", "reason"], ["createdBy", "created_by"], ["createdAt", "created_at"]];
const NUMERIC = new Set(["fetched_at", "employee_count", "approved_at", "attempts", "follow_up_at", "lock_expires_at", "last_call_at", "last_activity_at",
  "retention_days", "created_at", "updated_at", "credits_reserved", "credits_sync", "credits_async", "credits_actual", "deliveries",
  "last_delivery_at", "started_at", "answered_at", "ended_at"]);
const JSONB = new Set(["lead_ids", "apollo_ids"]);

// JSON is always sent as text and parsed on read: drizzle (src/db/index.ts)
// replaces the postgres-js client's JSON serializers and parsers, so
// sql.json() and automatic parsing cannot be relied on with the app's client.
const asJson = (v: unknown) => JSON.stringify(v ?? null);
const fromJson = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : v);

function toRow(cols: Cols, obj: Record<string, unknown>, _sql: Sql) {
  const out: Record<string, unknown> = {};
  for (const [k, c] of cols) if (Object.prototype.hasOwnProperty.call(obj, k)) out[c] = JSONB.has(c) ? asJson(obj[k]) : obj[k];
  return out;
}
function fromRow<T>(cols: Cols, row: Record<string, unknown> | undefined): T | null {
  if (!row) return null;
  const out: Record<string, unknown> = {};
  for (const [k, c] of cols) {
    let v = row[c];
    if (v !== null && v !== undefined && NUMERIC.has(c)) v = Number(v);
    if (v !== null && v !== undefined && JSONB.has(c)) v = fromJson(v);
    out[k] = v === undefined ? null : v;
  }
  return out as T;
}

export function createDbStore(sql: Sql): PtStore {
  function leadGuard(g?: LeadGuard) {
    let f = sql``;
    if (g?.phoneIsNull) f = sql`${f} and phone_e164 is null`;
    if (g?.statusIn) f = sql`${f} and status = any(${g.statusIn})`;
    if (g?.statusNotIn) f = sql`${f} and not (status = any(${g.statusNotIn}))`;
    return f;
  }
  const totals = async (tx: Sql, day: string, month: string) => {
    const [r] = await tx`select
        coalesce(sum(case when day = ${day} then coalesce(credits_actual, credits_reserved) end), 0) as d,
        coalesce(sum(coalesce(credits_actual, credits_reserved)), 0) as m
      from pt_credit_ledger where demo = false and status <> 'released' and month = ${month}`;
    return { day: Number(r.d), month: Number(r.m) };
  };

  const store: PtStore = {
    backend: "postgres",
    async insertLeadIfAbsent(lead) {
      const rows = await sql`insert into pt_leads ${sql(toRow(LEAD, lead, sql))} on conflict (apollo_id) do nothing returning *`;
      if (rows[0]) return { inserted: true, lead: fromRow<PtLead>(LEAD, rows[0]) };
      const [ex] = await sql`select * from pt_leads where apollo_id = ${lead.apolloId}`;
      return { inserted: false, lead: fromRow<PtLead>(LEAD, ex) };
    },
    async getLead(id) { const [r] = await sql`select * from pt_leads where id = ${id}`; return fromRow<PtLead>(LEAD, r); },
    async findLeads({ demo, assignedUid }) {
      const rows = assignedUid === undefined
        ? await sql`select * from pt_leads where demo = ${demo} order by created_at, id`
        : await sql`select * from pt_leads where demo = ${demo} and assigned_uid = ${assignedUid} order by created_at, id`;
      return rows.map((r) => fromRow<PtLead>(LEAD, r)!);
    },
    async updateLead(id, patch, guard) {
      const row = toRow(LEAD, patch, sql);
      if (!Object.keys(row).length) return store.getLead(id);
      const [r] = await sql`update pt_leads set ${sql(row)} where id = ${id} ${leadGuard(guard)} returning *`;
      return fromRow<PtLead>(LEAD, r);
    },
    async acquireLock(id, uid, now, ttlMs) {
      const r = await sql`update pt_leads set lock_uid = ${uid}, lock_expires_at = ${now + ttlMs}
        where id = ${id} and (lock_uid is null or lock_uid = ${uid} or lock_expires_at <= ${now}) returning id`;
      return r.length === 1;
    },
    async releaseLock(id, uid) {
      const r = uid
        ? await sql`update pt_leads set lock_uid = null, lock_expires_at = null where id = ${id} and lock_uid = ${uid} returning id`
        : await sql`update pt_leads set lock_uid = null, lock_expires_at = null where id = ${id} returning id`;
      return r.length === 1;
    },
    async isBlocked(keyHashes) {
      if (!keyHashes.length) return false;
      const r = await sql`select 1 from pt_blocks where key_hash = any(${keyHashes}) limit 1`;
      return r.length > 0;
    },
    async addBlocks(rows: PtBlock[]) {
      for (const b of rows) await sql`insert into pt_blocks ${sql(toRow(BLOCK, b, sql))} on conflict (key_hash) do nothing`;
    },
    async creditTotals({ day, month }) { return totals(sql, day, month); },
    async reserveCredits(row: ReserveRow) {
      return sql.begin(async (tx) => {
        await tx`select pg_advisory_xact_lock(hashtext('pt_credit_ledger'))`;
        const t = await totals(tx as unknown as Sql, row.day, row.month);
        if (!row.demo) {
          if (t.day + row.creditsReserved > row.dailyCap) return { ok: false, reason: "credit_cap_daily" };
          if (t.month + row.creditsReserved > row.monthlyCap) return { ok: false, reason: "credit_cap_monthly" };
        }
        const { dailyCap: _d, monthlyCap: _m, ...rest } = row;
        await tx`insert into pt_credit_ledger ${sql(toRow(LEDGER, { ...rest, status: "reserved" }, sql))}`;
        return { ok: true };
      }) as Promise<{ ok: boolean; reason?: string }>;
    },
    async getLedger(id) { const [r] = await sql`select * from pt_credit_ledger where id = ${id}`; return fromRow<PtLedgerRow>(LEDGER, r); },
    async updateLedger(id, patch) { const row = toRow(LEDGER, patch, sql); if (Object.keys(row).length) await sql`update pt_credit_ledger set ${sql(row)} where id = ${id}`; },
    async insertEnrichRequest(row) { await sql`insert into pt_enrich_requests ${sql(toRow(ENRICH, row, sql))}`; },
    async getEnrichRequest(id) { const [r] = await sql`select * from pt_enrich_requests where id = ${id}`; return fromRow<PtEnrichRequest>(ENRICH, r); },
    async findEnrichRequests({ demo }) {
      return (await sql`select * from pt_enrich_requests where demo = ${demo} order by created_at desc`).map((r) => fromRow<PtEnrichRequest>(ENRICH, r)!);
    },
    async updateEnrichRequest(id, patch) { const row = toRow(ENRICH, patch, sql); if (Object.keys(row).length) await sql`update pt_enrich_requests set ${sql(row)} where id = ${id}`; },
    async markCreditsSettled(id) {
      return (await sql`update pt_enrich_requests set credits_settled = true where id = ${id} and credits_settled = false returning id`).length === 1;
    },
    async insertCall(row: PtCall) { await sql`insert into pt_calls ${sql(toRow(CALL, row, sql))}`; },
    async getCall(id) { const [r] = await sql`select * from pt_calls where id = ${id}`; return fromRow<PtCall>(CALL, r); },
    async updateCall(id, patch, statusIn) {
      const row = toRow(CALL, patch, sql);
      const [r] = statusIn
        ? await sql`update pt_calls set ${sql(row)} where id = ${id} and status = any(${statusIn}) returning *`
        : await sql`update pt_calls set ${sql(row)} where id = ${id} returning *`;
      return fromRow<PtCall>(CALL, r);
    },
    async findCalls({ leadId, day }) {
      let where = sql`true`;
      if (leadId !== undefined) where = sql`${where} and lead_id = ${leadId}`;
      if (day !== undefined) where = sql`${where} and day = ${day}`;
      return (await sql`select * from pt_calls where ${where} order by started_at`).map((r) => fromRow<PtCall>(CALL, r)!);
    },
    async activeCallForUid(uid) {
      const [r] = await sql`select * from pt_calls where uid = ${uid} and status = any(${ACTIVE_CALL_STATUSES}) limit 1`;
      return fromRow<PtCall>(CALL, r);
    },
    async getSetting<T>(key: string) { const [r] = await sql`select value::text as value from pt_settings where key = ${key}`; return r ? (fromJson(r.value) as T) : null; },
    async setSetting(key, value, by, at) {
      await sql`insert into pt_settings (key, value, updated_by, updated_at) values (${key}, ${asJson(value)}::jsonb, ${by}, ${at})
        on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`;
    },
    async logAccess(row: PtAccessRow) {
      await sql`insert into pt_access_log (uid, action, lead_ids, detail, at) values (${row.uid}, ${row.action}, ${asJson(row.leadIds)}::jsonb, ${asJson(row.detail)}::jsonb, ${row.at})`;
    },
    async _debugLedger() { return (await sql`select * from pt_credit_ledger order by created_at`).map((r) => fromRow<PtLedgerRow>(LEDGER, r)!); },
    async _debugAccessLog() {
      return (await sql`select uid, action, lead_ids, detail, at from pt_access_log order by id`).map((r) => ({ uid: r.uid, action: r.action, leadIds: fromJson(r.lead_ids), detail: fromJson(r.detail), at: Number(r.at) }));
    },
    async _debugBlocks() { return (await sql`select * from pt_blocks`).map((r) => fromRow<PtBlock>(BLOCK, r)!); },
    async _deleteLeadForTests(id) { await sql`delete from pt_leads where id = ${id}`; },
    async _truncateForTests() {
      await sql`truncate pt_leads, pt_blocks, pt_credit_ledger, pt_enrich_requests, pt_calls, pt_access_log, pt_settings`;
    },
  };
  return store;
}

// The Portugal callers' browser phone devices (pt_phone_endpoints).
export function createDbEndpointStore(sql: Sql): import("./telnyx").EndpointStore {
  const map = (r: Record<string, unknown> | undefined) => r ? {
    uid: String(r.uid), sipUsername: String(r.sip_username), credentialId: String(r.credential_id), connectionId: String(r.connection_id),
    active: Boolean(r.active), createdAt: Number(r.created_at), updatedAt: Number(r.updated_at),
  } : null;
  return {
    async get(uid) { const [r] = await sql`select * from pt_phone_endpoints where uid = ${uid}`; return map(r); },
    async claim(row) {
      const ins = await sql`insert into pt_phone_endpoints (uid, sip_username, credential_id, connection_id, active, created_at, updated_at)
        values (${row.uid}, ${row.sipUsername}, ${row.credentialId}, ${row.connectionId}, ${row.active}, ${row.createdAt}, ${row.updatedAt})
        on conflict (uid) do nothing returning *`;
      if (ins[0]) return { claimed: true, endpoint: map(ins[0])! };
      const [ex] = await sql`select * from pt_phone_endpoints where uid = ${row.uid}`;
      return { claimed: false, endpoint: map(ex)! };
    },
  };
}
