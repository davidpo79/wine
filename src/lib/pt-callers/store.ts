// Portugal HR callers: the storage contract, and its in-memory implementation
// (demo mode with no database, and the fast test lane). The Postgres
// implementation is store-db.ts; tests run the same cases against both.
//
// SEPARATE TABLES, ALWAYS: everything lives in pt_* tables. Nothing here
// touches orders, leads, customers or any other table of this app, and
// nothing else reads these.
//
// Atomic where it matters: the credit reservation (totals + caps + insert in
// one step), the per-lead lock (one conditional update), the one-time credit
// settlement of an enrichment request, and call-state transitions.

export type PtLead = {
  id: string; apolloId: string; demo: boolean; source: string; fetchedAt: number; batchId: string | null;
  firstName: string | null; lastName: string | null; lastNameObfuscated: string | null; title: string | null;
  companyName: string | null; employeeRange: string | null; employeeCount: number | null; city: string | null;
  phoneE164: string | null; emailBusiness: string | null; status: string; statusBeforeCall: string | null;
  assignedUid: string | null; approvedAt: number | null; approvedBy: string | null;
  enrichState: string; enrichId: string | null; failReason: string | null;
  numberClass: "unknown" | "corporate" | "personal"; legalBasis: string | null; eligibilityNote: string | null;
  attempts: number; followUpAt: number | null;
  lockUid: string | null; lockExpiresAt: number | null; lastCallAt: number | null; notes: string | null;
  lastActivityAt: number; retentionDays: number; createdAt: number; updatedAt: number;
};
export type PtBlock = { kind: "phone" | "apollo_id"; keyHash: string; scope: string; reason: string | null; createdBy: string | null; createdAt: number };
export type PtLedgerRow = {
  id: string; demo: boolean; kind: string; day: string; month: string; creditsReserved: number;
  creditsSync: number | null; creditsAsync: number | null; creditsActual: number | null; status: "reserved" | "settled" | "released";
  enrichId: string | null; uid: string | null; createdAt: number; updatedAt: number;
};
export type PtEnrichRequest = {
  id: string; demo: boolean; apolloRequestId: string | null; mode: "webhook" | "poll"; secretHash: string | null;
  leadIds: string[]; apolloIds: string[]; ledgerId: string | null; status: string; creditsSettled: boolean;
  deliveries: number; createdAt: number; updatedAt: number; lastDeliveryAt: number | null;
};
export type PtCall = {
  id: string; leadId: string; uid: string; status: string; repCallControlId: string | null; customerCallControlId: string | null;
  refusedReason: string | null; day: string; startedAt: number; answeredAt: number | null; endedAt: number | null;
};
export type PtAccessRow = { uid: string; action: string; leadIds: string[]; detail: Record<string, unknown>; at: number };
export type LeadGuard = { phoneIsNull?: boolean; statusIn?: string[]; statusNotIn?: string[] };
export type ReserveRow = Omit<PtLedgerRow, "status" | "creditsSync" | "creditsAsync" | "creditsActual"> & { dailyCap: number; monthlyCap: number };

export const ACTIVE_CALL_STATUSES = ["dialing_rep", "dialing_customer", "connected"];
export const TERMINAL_CALL_STATUSES = ["completed", "no_answer", "ended", "refused", "failed"];

export interface PtStore {
  backend: "memory" | "postgres";
  insertLeadIfAbsent(lead: PtLead): Promise<{ inserted: boolean; lead: PtLead | null }>;
  getLead(id: string): Promise<PtLead | null>;
  findLeads(q: { demo: boolean; assignedUid?: string }): Promise<PtLead[]>;
  updateLead(id: string, patch: Partial<PtLead>, guard?: LeadGuard): Promise<PtLead | null>;
  acquireLock(id: string, uid: string, now: number, ttlMs: number): Promise<boolean>;
  releaseLock(id: string, uid: string | null): Promise<boolean>;
  isBlocked(keyHashes: string[]): Promise<boolean>;
  addBlocks(rows: PtBlock[]): Promise<void>;
  creditTotals(q: { day: string; month: string }): Promise<{ day: number; month: number }>;
  reserveCredits(row: ReserveRow): Promise<{ ok: boolean; reason?: string }>;
  getLedger(id: string): Promise<PtLedgerRow | null>;
  updateLedger(id: string, patch: Partial<PtLedgerRow>): Promise<void>;
  insertEnrichRequest(row: PtEnrichRequest): Promise<void>;
  getEnrichRequest(id: string): Promise<PtEnrichRequest | null>;
  findEnrichRequests(q: { demo: boolean }): Promise<PtEnrichRequest[]>;
  updateEnrichRequest(id: string, patch: Partial<PtEnrichRequest>): Promise<void>;
  markCreditsSettled(id: string): Promise<boolean>;
  insertCall(row: PtCall): Promise<void>;
  getCall(id: string): Promise<PtCall | null>;
  /** Applies the patch only while the call's status is one of `statusIn`. */
  updateCall(id: string, patch: Partial<PtCall>, statusIn?: string[]): Promise<PtCall | null>;
  findCalls(q: { leadId?: string; day?: string }): Promise<PtCall[]>;
  activeCallForUid(uid: string): Promise<PtCall | null>;
  getSetting<T>(key: string): Promise<T | null>;
  setSetting(key: string, value: unknown, by: string, at: number): Promise<void>;
  logAccess(row: PtAccessRow): Promise<void>;
  _debugLedger(): Promise<PtLedgerRow[]>;
  _debugAccessLog(): Promise<PtAccessRow[]>;
  _debugBlocks(): Promise<PtBlock[]>;
  _deleteLeadForTests(id: string): Promise<void>;
  _truncateForTests(): Promise<void>;
}

const copy = <T>(v: T): T => (v === undefined || v === null ? v : JSON.parse(JSON.stringify(v)));
export const ledgerAmount = (r: PtLedgerRow) => (r.status === "released" ? 0 : Number(r.creditsActual ?? r.creditsReserved) || 0);

function guardHolds(l: PtLead, g?: LeadGuard) {
  if (!g) return true;
  if (g.phoneIsNull && l.phoneE164) return false;
  if (g.statusIn && !g.statusIn.includes(l.status)) return false;
  if (g.statusNotIn && g.statusNotIn.includes(l.status)) return false;
  return true;
}

export function createMemoryStore(): PtStore {
  const leads = new Map<string, PtLead>();
  const blocks = new Map<string, PtBlock>();
  const ledger = new Map<string, PtLedgerRow>();
  const enrich = new Map<string, PtEnrichRequest>();
  const calls = new Map<string, PtCall>();
  const settings = new Map<string, unknown>();
  const access: PtAccessRow[] = [];
  const store: PtStore = {
    backend: "memory",
    async insertLeadIfAbsent(lead) {
      for (const l of leads.values()) if (l.apolloId === lead.apolloId) return { inserted: false, lead: copy(l) };
      leads.set(lead.id, copy(lead));
      return { inserted: true, lead: copy(lead) };
    },
    async getLead(id) { return copy(leads.get(id)) ?? null; },
    async findLeads({ demo, assignedUid }) {
      return [...leads.values()]
        .filter((l) => l.demo === demo && (assignedUid === undefined || l.assignedUid === assignedUid))
        .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1))
        .map(copy);
    },
    async updateLead(id, patch, guard) {
      const l = leads.get(id);
      if (!l || !guardHolds(l, guard)) return null;
      Object.assign(l, copy(patch));
      return copy(l);
    },
    async acquireLock(id, uid, now, ttlMs) {
      const l = leads.get(id);
      if (!l) return false;
      if (l.lockUid && l.lockUid !== uid && (l.lockExpiresAt ?? 0) > now) return false;
      l.lockUid = uid;
      l.lockExpiresAt = now + ttlMs;
      return true;
    },
    async releaseLock(id, uid) {
      const l = leads.get(id);
      if (!l || (uid && l.lockUid !== uid)) return false;
      l.lockUid = null;
      l.lockExpiresAt = null;
      return true;
    },
    async isBlocked(keyHashes) { return keyHashes.some((k) => blocks.has(k)); },
    async addBlocks(rows) { for (const r of rows) if (!blocks.has(r.keyHash)) blocks.set(r.keyHash, copy(r)); },
    async creditTotals({ day, month }) {
      let d = 0;
      let m = 0;
      for (const r of ledger.values()) {
        if (r.demo) continue;
        if (r.month === month) m += ledgerAmount(r);
        if (r.day === day) d += ledgerAmount(r);
      }
      return { day: d, month: m };
    },
    async reserveCredits(row) {
      // No await between the read and the write: atomic in one JS turn.
      let d = 0;
      let m = 0;
      for (const r of ledger.values()) {
        if (r.demo) continue;
        if (r.month === row.month) m += ledgerAmount(r);
        if (r.day === row.day) d += ledgerAmount(r);
      }
      if (!row.demo) {
        if (d + row.creditsReserved > row.dailyCap) return { ok: false, reason: "credit_cap_daily" };
        if (m + row.creditsReserved > row.monthlyCap) return { ok: false, reason: "credit_cap_monthly" };
      }
      const { dailyCap: _d, monthlyCap: _m, ...rest } = row;
      ledger.set(row.id, { ...rest, status: "reserved", creditsSync: null, creditsAsync: null, creditsActual: null });
      return { ok: true };
    },
    async getLedger(id) { return copy(ledger.get(id)) ?? null; },
    async updateLedger(id, patch) { const r = ledger.get(id); if (r) Object.assign(r, copy(patch)); },
    async insertEnrichRequest(row) { enrich.set(row.id, copy(row)); },
    async getEnrichRequest(id) { return copy(enrich.get(id)) ?? null; },
    async findEnrichRequests({ demo }) { return [...enrich.values()].filter((r) => r.demo === demo).sort((a, b) => b.createdAt - a.createdAt).map(copy); },
    async updateEnrichRequest(id, patch) { const r = enrich.get(id); if (r) Object.assign(r, copy(patch)); },
    async markCreditsSettled(id) { const r = enrich.get(id); if (!r || r.creditsSettled) return false; r.creditsSettled = true; return true; },
    async insertCall(row) { calls.set(row.id, copy(row)); },
    async getCall(id) { return copy(calls.get(id)) ?? null; },
    async updateCall(id, patch, statusIn) {
      const c = calls.get(id);
      if (!c || (statusIn && !statusIn.includes(c.status))) return null;
      Object.assign(c, copy(patch));
      return copy(c);
    },
    async findCalls({ leadId, day }) {
      return [...calls.values()].filter((c) => (leadId === undefined || c.leadId === leadId) && (day === undefined || c.day === day)).sort((a, b) => a.startedAt - b.startedAt).map(copy);
    },
    async activeCallForUid(uid) { for (const c of calls.values()) if (c.uid === uid && ACTIVE_CALL_STATUSES.includes(c.status)) return copy(c); return null; },
    async getSetting<T>(key: string) { return (copy(settings.get(key)) as T) ?? null; },
    async setSetting(key, value) { settings.set(key, copy(value)); },
    async logAccess(row) { access.push(copy(row)); },
    async _debugLedger() { return [...ledger.values()].map(copy); },
    async _debugAccessLog() { return access.map(copy); },
    async _debugBlocks() { return [...blocks.values()].map(copy); },
    async _deleteLeadForTests(id) { leads.delete(id); },
    async _truncateForTests() { leads.clear(); blocks.clear(); ledger.clear(); enrich.clear(); calls.clear(); settings.clear(); access.length = 0; },
  };
  return store;
}
