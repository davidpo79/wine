// Portugal HR callers: the service end to end, with a fake live Apollo client,
// a fake telephony dialer and a fake national do-not-call source. Runs on the
// in-memory store always, and again on Postgres when DATABASE_URL is set.
import { describe, test, afterEach } from "node:test";
import assert from "node:assert/strict";
process.env.SESSION_SECRET = "x".repeat(40);

const { createService } = await import("../src/lib/pt-callers/service");
const { createMemoryStore } = await import("../src/lib/pt-callers/store");
const { createMockApolloClient } = await import("../src/lib/pt-callers/apollo");
const { readFlags } = await import("../src/lib/pt-callers/flags");
type Store = import("../src/lib/pt-callers/store").PtStore & { _close?: () => Promise<void> };
type Ctx = { uid: string; role: string };

// Monday 19/10/2026 11:00 in Lisbon.
const T0 = Date.UTC(2026, 9, 19, 10, 0, 0);
const DIAL_ENV = {
  PT_CALLERS_ENABLED: "true", PT_CALLERS_LEGAL_APPROVED: "true", APOLLO_API_KEY: "test-key-not-real",
  APOLLO_WEBHOOK_BASE_URL: "https://crm.example.test",
  PT_CALLERS_CALLING_HOURS: "mon-fri 09:00-18:00", PT_CALLERS_DAILY_CALL_CAP: "50",
  PT_CALLERS_PILOT_NUMBERS: "+351912345670,+351912345671,+351912345672",
};
const ADMIN: Ctx = { uid: "u_admin", role: "admin" };
const REP_A: Ctx = { uid: "u_rep_a", role: "pt_caller" };
const REP_B: Ctx = { uid: "u_rep_b", role: "pt_caller" };
const FULFIL: Ctx = { uid: "u_ful", role: "fulfilment" };

const person = (n: number) => ({ apolloId: "ap_" + n, firstName: "Ana" + n, lastNameObfuscated: "S***", title: "Diretora de Recursos Humanos", companyName: "Empresa " + n });

function fakeLive(store: Store) {
  const f = {
    calls: [] as Array<{ op: string; args?: any; requestId?: string; ledger?: any[] }>,
    people: [person(1), person(2), person(3)],
    bulk: null as null | ((a: any) => any),
    poll: null as null | ((id: string) => any),
    async searchPeople(args: any) { f.calls.push({ op: "search", args, ledger: await store._debugLedger() }); return { people: f.people.slice(), totalEntries: f.people.length }; },
    async bulkMatch(args: any) {
      f.calls.push({ op: "bulk", args, ledger: await store._debugLedger() });
      if (f.bulk) return f.bulk(args);
      return { requestId: "9007199254740993123", creditsConsumed: args.personIds.length, matches: args.personIds.map((id: string) => ({ apolloId: id, firstName: "Ana", lastName: "Silva", title: "HR Manager", city: "Lisboa", country: "Portugal", email: "ana@empresa.pt", companyName: "Empresa", companyCountry: "Portugal", employeeCount: 120 })) };
    },
    async pollResult(requestId: string) { f.calls.push({ op: "poll", requestId }); return f.poll ? f.poll(requestId) : { state: "pending", retryAfterSeconds: 10 }; },
  };
  return f;
}

function fakeDialer() {
  const d = {
    started: [] as string[], customers: [] as Array<{ callId: string; to: string; linkTo: string }>, hungUp: [] as string[], tokens: 0, n: 0,
    async startRepLeg({ callId }: { callId: string }) { d.started.push(callId); return { callControlId: "cc_rep_" + ++d.n }; },
    async dialCustomer({ callId, to, linkTo }: { callId: string; to: string; linkTo: string }) { d.customers.push({ callId, to, linkTo }); return { callControlId: "cc_cust_" + ++d.n }; },
    async hangup(cc: string) { d.hungUp.push(cc); },
    async mintToken() { d.tokens++; return { token: "tok", expiresInSecs: 600 }; },
  };
  return d;
}

const webhookPayload = (entries: Array<[string, string[], string?]>, credits = 8) =>
  JSON.stringify({ status: "success", credits_consumed: credits, people: entries.map(([id, phones, status]) => ({ id, status: status ?? "success", phone_numbers: phones.map((p) => ({ sanitized_number: p, type_cd: "mobile", status_cd: "valid_number" })) })) });

const STORES: Array<[string, () => Promise<Store>]> = [["memory", async () => createMemoryStore() as Store]];
if (process.env.DATABASE_URL) {
  STORES.push(["postgres", async () => {
    const postgres = (await import("postgres")).default;
    const { createDbStore } = await import("../src/lib/pt-callers/store-db");
    const sql = postgres(process.env.DATABASE_URL!, { max: 4, onnotice: () => {} });
    // Wrapped exactly as src/db/index.ts wraps the app's client: drizzle changes
    // the client's JSON handling, and the store must work with that client.
    const { drizzle } = await import("drizzle-orm/postgres-js");
    drizzle({ client: sql });
    const s = createDbStore(sql) as Store;
    await s._truncateForTests();
    s._close = () => sql.end();
    return s;
  }]);
}

for (const [storeName, makeStore] of STORES) {
  describe(`Portugal HR callers service on the ${storeName} store`, { concurrency: false }, () => {
    type H = {
      store: Store; env: Record<string, string | undefined>; clock: { t: number }; live: ReturnType<typeof fakeLive>;
      dialer: ReturnType<typeof fakeDialer>; dnc: { result: any; checked: string[]; check(p: string): Promise<any> }; svc: ReturnType<typeof createService>;
    };
    let h: H | null = null;
    async function harness(envOverrides: Record<string, string> = {}, opts: { noLive?: boolean } = {}): Promise<H> {
      const store = await makeStore();
      const env: Record<string, string | undefined> = { ...envOverrides };
      const clock = { t: T0 };
      const live = fakeLive(store);
      const dialer = fakeDialer();
      const dnc = { result: { status: "clear" } as any, checked: [] as string[], async check(p: string) { dnc.checked.push(p); if (dnc.result instanceof Error) throw dnc.result; return dnc.result; } };
      let seq = 0;
      const svc = createService({
        store, liveApollo: opts.noLive ? null : (live as any), mockApollo: createMockApolloClient(),
        dialer, dnc, readFlags: () => readFlags(env), now: () => clock.t,
        newId: (p) => `${p}_${++seq}`, newSecret: () => "s3cret" + seq + "x".repeat(32),
        isAdmin: (role) => role === "admin",
        repDirectory: async () => [REP_A, REP_B].map((r) => ({ uid: r.uid, name: r.uid, role: r.role, active: true })),
        blockPepper: "test-pepper",
      });
      const made: H = { store, env, clock, live, dialer, dnc, svc };
      h = made;
      return made;
    }
    afterEach(async () => { if (h?.store._close) await h.store._close(); h = null; });

    // Import, approve, enrich, deliver phones, record eligibility, assign.
    async function readyLeads(hh: H, { count = 2, phones, assignTo = REP_A as Ctx | null, eligible = true }: { count?: number; phones?: Array<string | null>; assignTo?: Ctx | null; eligible?: boolean } = {}) {
      hh.live.people = Array.from({ length: count }, (_, i) => person(i + 1));
      await hh.svc.adminImport(ADMIN, { page: 1 });
      const leads = (await hh.svc.adminList(ADMIN)).leads;
      const ids = leads.map((l) => l.id);
      await hh.svc.adminApprove(ADMIN, { leadIds: ids });
      await hh.svc.adminEnrich(ADMIN, { leadIds: ids });
      const req = (await hh.svc.adminOverview(ADMIN)).enrichRequests[0];
      const p = phones ?? leads.map((_, i) => "+35191234567" + i);
      await hh.svc.applyEnrichmentResult(req.id, JSON.parse(webhookPayload(leads.map((l, i) => [l.apolloId, p[i] ? [p[i] as string] : []]))), "webhook");
      if (eligible) for (const id of ids) await hh.svc.adminSetEligibility(ADMIN, { leadId: id, numberClass: "corporate", legalBasis: "Interesse legítimo (parecer jurídico de teste)" });
      if (assignTo) await hh.svc.adminAssign(ADMIN, { leadIds: ids, repUid: assignTo.uid });
      return { ids, req };
    }
    const bulks = (hh: H) => hh.live.calls.filter((c) => c.op === "bulk");

    describe("flag gating (the legal gate)", () => {
      test("flags off: import is demo data only, the live client is never called", async () => {
        const hh = await harness({ APOLLO_API_KEY: "k" });
        const out = await hh.svc.adminImport(ADMIN, { page: 1 });
        assert.equal(out.mode, "demo");
        assert.equal(hh.live.calls.length, 0);
        const leads = (await hh.svc.adminList(ADMIN)).leads;
        assert.equal(leads.length, 25);
        assert.ok(leads.every((l) => l.demo && l.source === "demo"));
      });

      test("flags off: demo enrichment never reaches the live client", async () => {
        const hh = await harness({ PT_CALLERS_ENABLED: "true" });
        await hh.svc.adminImport(ADMIN, { page: 1 });
        const ids = (await hh.svc.adminList(ADMIN)).leads.slice(0, 3).map((l) => l.id);
        await hh.svc.adminApprove(ADMIN, { leadIds: ids });
        await hh.svc.adminEnrich(ADMIN, { leadIds: ids });
        assert.equal(hh.live.calls.length, 0);
      });

      test("legal flag off: no dial and no phone token, even with calling enabled", async () => {
        const hh = await harness({ PT_CALLERS_ENABLED: "true" });
        assert.equal((await hh.svc.preDialCheck(REP_A, { leadId: "x" })).reason, "legal_not_approved");
        await assert.rejects(hh.svc.phoneToken(REP_A), { code: "legal_not_approved" });
        assert.equal(hh.dialer.tokens, 0);
      });

      test("calling flag off: refused first", async () => {
        const hh = await harness({ PT_CALLERS_LEGAL_APPROVED: "true" });
        assert.equal((await hh.svc.preDialCheck(REP_A, { leadId: "x" })).reason, "pt_callers_disabled");
        await assert.rejects(hh.svc.startCall(REP_A, { leadId: "x" }), { code: "pt_callers_disabled" });
        assert.equal(hh.dialer.started.length, 0);
      });

      test("live with no API key refuses rather than falling back to demo", async () => {
        const hh = await harness({ PT_CALLERS_ENABLED: "true", PT_CALLERS_LEGAL_APPROVED: "true" }, { noLive: true });
        await assert.rejects(hh.svc.adminImport(ADMIN, { page: 1 }), { code: "apollo_not_configured" });
      });

      test("demo rows and live rows are never shown together", async () => {
        const hh = await harness({});
        await hh.svc.adminImport(ADMIN, { page: 1 });
        Object.assign(hh.env, DIAL_ENV);
        assert.equal((await hh.svc.adminList(ADMIN)).leads.length, 0);
        await hh.svc.adminImport(ADMIN, { page: 1 });
        assert.equal((await hh.svc.adminList(ADMIN)).leads.length, 3);
        delete hh.env.PT_CALLERS_ENABLED;
        assert.equal((await hh.svc.adminList(ADMIN)).leads.length, 25);
      });

      test("config: demo banner and the viewer, decided by the server", async () => {
        const hh = await harness({});
        const c = await hh.svc.config(REP_A);
        assert.deepEqual([c.mode, c.viewer], ["demo", "rep"]);
        assert.equal((await hh.svc.config(ADMIN)).viewer, "admin");
        await assert.rejects(hh.svc.config(FULFIL), { status: 403 });
      });
    });

    describe("role isolation inside the module", () => {
      test("reps and fulfilment are refused every admin operation", async () => {
        const hh = await harness(DIAL_ENV);
        for (const who of [REP_A, FULFIL]) {
          for (const op of ["adminOverview", "adminList", "adminImport", "adminApprove", "adminEnrich", "adminAssign", "adminPoll", "adminReleaseTimeout", "adminSetEligibility", "adminSetCaps"] as const) {
            await assert.rejects((hh.svc as any)[op](who, { leadIds: [], page: 1, leadId: "x" }), { status: 403 }, `${who.role} ${op}`);
          }
        }
        assert.equal(hh.live.calls.length, 0);
      });

      test("only the pt_caller role works leads", async () => {
        const hh = await harness(DIAL_ENV);
        await assert.rejects(hh.svc.repList(FULFIL), { status: 403 });
        await assert.rejects(hh.svc.repList(ADMIN), { status: 403 });
      });

      test("a rep sees only their assigned leads, number masked, no raw phone field", async () => {
        const hh = await harness(DIAL_ENV);
        const { ids } = await readyLeads(hh, { count: 3, assignTo: null });
        await hh.svc.adminAssign(ADMIN, { leadIds: [ids[0], ids[1]], repUid: REP_A.uid });
        await hh.svc.adminAssign(ADMIN, { leadIds: [ids[2]], repUid: REP_B.uid });
        const a = (await hh.svc.repList(REP_A)).leads;
        assert.deepEqual(a.map((l) => l.id).sort(), [ids[0], ids[1]].sort());
        assert.ok(a.every((l) => l.phone && l.phone.includes("•")));
        assert.ok(a.every((l) => !("phoneE164" in l) && !("apolloId" in l)));
        await assert.rejects(hh.svc.lock(REP_A, { leadId: ids[2] }), { status: 404 });
        await assert.rejects(hh.svc.callHistory(REP_A, { leadId: ids[2] }), { status: 404 });
      });

      test("assignment only targets the pt_caller role", async () => {
        const hh = await harness(DIAL_ENV);
        const { ids } = await readyLeads(hh, { count: 1, assignTo: null });
        await assert.rejects(hh.svc.adminAssign(ADMIN, { leadIds: ids, repUid: FULFIL.uid }), { code: "not_a_pt_caller" });
      });

      test("every view and call lands in the access log; retention and source are on every lead", async () => {
        const hh = await harness(DIAL_ENV);
        const { ids } = await readyLeads(hh, { count: 1 });
        await hh.svc.repList(REP_A);
        await hh.svc.startCall(REP_A, { leadId: ids[0] });
        const log = await hh.store._debugAccessLog();
        assert.ok(log.some((r) => r.uid === REP_A.uid && r.action === "view_list" && r.leadIds.includes(ids[0])));
        assert.ok(log.some((r) => r.uid === REP_A.uid && r.action === "call_start" && r.leadIds.includes(ids[0])));
        assert.ok(log.some((r) => r.uid === ADMIN.uid && r.action === "admin_view_list"));
        const lead = (await hh.svc.adminList(ADMIN)).leads[0];
        assert.equal(lead.retentionDays, 90);
        assert.equal(lead.retainUntil, lead.lastActivityAt + 90 * 86400000);
        assert.equal(lead.source, "apollo");
        assert.ok(lead.fetchedAt > 0);
      });
    });

    describe("credits: ledger before every call, hard caps, fail closed", () => {
      async function imported(hh: H, n: number) {
        hh.live.people = Array.from({ length: n }, (_, i) => person(i + 1));
        await hh.svc.adminImport(ADMIN, { page: 1 });
        const ids = (await hh.svc.adminList(ADMIN)).leads.map((l) => l.id);
        await hh.svc.adminApprove(ADMIN, { leadIds: ids });
        return ids;
      }

      test("the reservation exists BEFORE the Apollo call (9 per person)", async () => {
        const hh = await harness(DIAL_ENV);
        const ids = await imported(hh, 2);
        await hh.svc.adminEnrich(ADMIN, { leadIds: ids });
        assert.ok(hh.live.calls.find((c) => c.op === "search")!.ledger!.some((r) => r.kind === "search" && r.status === "reserved"));
        const row = bulks(hh)[0].ledger!.find((r) => r.kind === "enrich");
        assert.equal(Number(row.creditsReserved), 18);
      });

      test("over the daily cap: refused, Apollo never called", async () => {
        const hh = await harness({ ...DIAL_ENV, APOLLO_DAILY_CREDIT_CAP: "17" });
        const ids = await imported(hh, 2);
        await assert.rejects(hh.svc.adminEnrich(ADMIN, { leadIds: ids }), { code: "credit_cap_daily" });
        assert.equal(bulks(hh).length, 0);
      });

      test("over the monthly cap, counting earlier days", async () => {
        const hh = await harness({ ...DIAL_ENV, APOLLO_MONTHLY_CREDIT_CAP: "20" });
        const ids = await imported(hh, 3);
        await hh.svc.adminEnrich(ADMIN, { leadIds: [ids[0], ids[1]] });
        hh.clock.t += 2 * 86400000;
        await assert.rejects(hh.svc.adminEnrich(ADMIN, { leadIds: [ids[2]] }), { code: "credit_cap_monthly" });
        assert.equal(bulks(hh).length, 1);
      });

      test("an Admin cap can only be LOWER than the env cap, and it binds", async () => {
        const hh = await harness(DIAL_ENV);
        await assert.rejects(hh.svc.adminSetCaps(ADMIN, { dailyCredits: 301 }), { code: "cap_above_env" });
        await hh.svc.adminSetCaps(ADMIN, { dailyCredits: 9 });
        const ids = await imported(hh, 2);
        await assert.rejects(hh.svc.adminEnrich(ADMIN, { leadIds: ids }), { code: "credit_cap_daily" });
        await hh.svc.adminEnrich(ADMIN, { leadIds: [ids[0]] });
        assert.equal(bulks(hh).length, 1);
        assert.equal((await hh.svc.adminOverview(ADMIN)).credits.dailyCap, 9);
      });

      test("ledger unreadable: fail closed for search and enrichment", async () => {
        const hh = await harness(DIAL_ENV);
        const ids = await imported(hh, 1);
        hh.store.reserveCredits = async () => { throw new Error("db down"); };
        const before = hh.live.calls.length;
        await assert.rejects(hh.svc.adminImport(ADMIN, { page: 1 }), { code: "credit_ledger_unavailable" });
        await assert.rejects(hh.svc.adminEnrich(ADMIN, { leadIds: ids }), { code: "credit_ledger_unavailable" });
        assert.equal(hh.live.calls.length, before);
      });

      test("a malformed cap refuses every live Apollo call", async () => {
        const hh = await harness({ ...DIAL_ENV, APOLLO_DAILY_CREDIT_CAP: "lots" });
        await assert.rejects(hh.svc.adminImport(ADMIN, { page: 1 }), { code: "credit_cap_invalid" });
        assert.equal(hh.live.calls.length, 0);
      });

      test("chunks of at most 10, each reserved first; webhook URL and never poll_only by default", async () => {
        const hh = await harness(DIAL_ENV);
        const ids = await imported(hh, 12);
        hh.live.bulk = (a) => ({ requestId: String(10n ** 18n + BigInt(a.personIds.length)), creditsConsumed: 0, matches: [] });
        await hh.svc.adminEnrich(ADMIN, { leadIds: ids });
        assert.deepEqual(bulks(hh).map((b) => b.args.personIds.length), [10, 2]);
        for (const b of bulks(hh)) {
          assert.ok(!b.args.pollOnly);
          assert.match(b.args.webhookUrl, /^https:\/\/crm\.example\.test\/api\/pt-callers\/apollo-webhook\/[A-Za-z0-9_]+\/[A-Za-z0-9_-]{32,}$/);
        }
      });

      test("webhook delivery without an https base refuses enrichment instead of quietly polling", async () => {
        const env = { ...DIAL_ENV } as Record<string, string>;
        delete env.APOLLO_WEBHOOK_BASE_URL;
        const hh = await harness(env);
        const ids = await imported(hh, 1);
        await assert.rejects(hh.svc.adminEnrich(ADMIN, { leadIds: ids }), { code: "apollo_webhook_not_configured" });
        assert.equal(bulks(hh).length, 0);
        hh.env.APOLLO_ENRICH_DELIVERY = "poll";
        await hh.svc.adminEnrich(ADMIN, { leadIds: ids });
        assert.equal(bulks(hh)[0].args.pollOnly, true);
        assert.ok(!bulks(hh)[0].args.webhookUrl);
      });

      test("overview: credits used today and remaining, from the ledger", async () => {
        const hh = await harness(DIAL_ENV);
        await readyLeads(hh, { count: 2 });
        const o = await hh.svc.adminOverview(ADMIN);
        assert.equal(o.credits.source, "ledger");
        assert.equal(o.credits.usedToday, 2 + 8, "settled: 2 sync + 8 from the webhook");
        assert.equal(o.credits.usedToday! + o.credits.remainingToday!, 300);
      });

      test("enrichment needs Admin approval; import never enriches", async () => {
        const hh = await harness(DIAL_ENV);
        hh.live.people = [person(1)];
        await hh.svc.adminImport(ADMIN, { page: 1 });
        assert.equal(bulks(hh).length, 0);
        const ids = (await hh.svc.adminList(ADMIN)).leads.map((l) => l.id);
        const out = await hh.svc.adminEnrich(ADMIN, { leadIds: ids });
        assert.deepEqual(out.skipped.map((s) => s.reason), ["not_approved"]);
        assert.equal(bulks(hh).length, 0);
      });
    });

    describe("asynchronous enrichment results", () => {
      test("request_id stored exactly as the string Apollo returned", async () => {
        const hh = await harness(DIAL_ENV);
        const { req } = await readyLeads(hh, { count: 1 });
        assert.equal(req.apolloRequestId, "9007199254740993123");
      });

      test("a duplicate webhook merges once: same state, credits counted once", async () => {
        const hh = await harness(DIAL_ENV);
        const { ids, req } = await readyLeads(hh, { count: 1 });
        const before = (await hh.svc.adminOverview(ADMIN)).credits.usedToday;
        const lead = (await hh.svc.adminList(ADMIN)).leads[0];
        const again = await hh.svc.applyEnrichmentResult(req.id, JSON.parse(webhookPayload([[lead.apolloId, ["+351912345670"]]])), "webhook");
        assert.equal(again.duplicate, true);
        assert.equal((await hh.svc.adminOverview(ADMIN)).credits.usedToday, before);
        const after = (await hh.svc.adminList(ADMIN)).leads.find((l) => l.id === ids[0])!;
        assert.deepEqual([after.status, after.phone], ["ready", "+351912345670"]);
      });

      test("a partial result resolves who arrived; the rest stay pending", async () => {
        const hh = await harness(DIAL_ENV);
        hh.live.people = [person(1), person(2)];
        await hh.svc.adminImport(ADMIN, { page: 1 });
        const leads = (await hh.svc.adminList(ADMIN)).leads;
        await hh.svc.adminApprove(ADMIN, { leadIds: leads.map((l) => l.id) });
        await hh.svc.adminEnrich(ADMIN, { leadIds: leads.map((l) => l.id) });
        const req = (await hh.svc.adminOverview(ADMIN)).enrichRequests[0];
        const r = await hh.svc.applyEnrichmentResult(req.id, JSON.parse(webhookPayload([[leads[0].apolloId, ["+351912345670"]]])), "webhook");
        assert.equal(r.requestStatus, "partial");
        const after = (await hh.svc.adminList(ADMIN)).leads;
        assert.equal(after.find((l) => l.id === leads[0].id)!.status, "ready");
        assert.equal(after.find((l) => l.id === leads[1].id)!.status, "enrichment_pending");
      });

      test("out of order: a later empty or failed delivery never erases a phone", async () => {
        const hh = await harness(DIAL_ENV);
        const { req } = await readyLeads(hh, { count: 1 });
        const lead = (await hh.svc.adminList(ADMIN)).leads[0];
        await hh.svc.applyEnrichmentResult(req.id, JSON.parse(webhookPayload([[lead.apolloId, [], "failed"]], 0)), "poll");
        await hh.svc.applyEnrichmentResult(req.id, JSON.parse(webhookPayload([[lead.apolloId, []]], 0)), "webhook");
        const after = (await hh.svc.adminList(ADMIN)).leads[0];
        assert.deepEqual([after.phone, after.status], ["+351912345670", "ready"]);
      });

      test("a definitive empty answer is no-phone; a foreign number is refused", async () => {
        const hh = await harness(DIAL_ENV);
        const { ids } = await readyLeads(hh, { count: 2, phones: [null, "+34912345678"], eligible: false });
        const leads = (await hh.svc.adminList(ADMIN)).leads;
        const a = leads.find((l) => l.id === ids[0])!; const b = leads.find((l) => l.id === ids[1])!;
        assert.deepEqual([a.status, a.enrichState], ["failed", "no_phone"]);
        assert.deepEqual([b.status, b.enrichState, b.phone], ["failed", "phone_not_pt", null]);
      });

      test("a timeout is NOT 'no number': pending, reservation still counted", async () => {
        const hh = await harness(DIAL_ENV);
        hh.live.people = [person(1)];
        await hh.svc.adminImport(ADMIN, { page: 1 });
        const ids = (await hh.svc.adminList(ADMIN)).leads.map((l) => l.id);
        await hh.svc.adminApprove(ADMIN, { leadIds: ids });
        hh.live.bulk = () => { throw Object.assign(new Error("timed out"), { kind: "timeout", outcomeUnknown: true }); };
        const out = await hh.svc.adminEnrich(ADMIN, { leadIds: ids });
        assert.equal(out.outcomeUnknown, 1);
        const lead = (await hh.svc.adminList(ADMIN)).leads[0];
        assert.deepEqual([lead.status, lead.enrichState, lead.phone], ["enrichment_pending", "timeout", null]);
        assert.equal((await hh.svc.adminOverview(ADMIN)).credits.usedToday, 9);
      });

      test("no blind retry: pending and timed-out leads are never re-revealed without an Admin's confirmation", async () => {
        const hh = await harness(DIAL_ENV);
        hh.live.people = [person(1), person(2)];
        await hh.svc.adminImport(ADMIN, { page: 1 });
        const ids = (await hh.svc.adminList(ADMIN)).leads.map((l) => l.id);
        await hh.svc.adminApprove(ADMIN, { leadIds: ids });
        hh.live.bulk = () => { throw Object.assign(new Error("timed out"), { kind: "timeout", outcomeUnknown: true }); };
        await hh.svc.adminEnrich(ADMIN, { leadIds: [ids[0]] });
        hh.live.bulk = null;
        await hh.svc.adminEnrich(ADMIN, { leadIds: [ids[1]] });
        const again = await hh.svc.adminEnrich(ADMIN, { leadIds: ids });
        assert.deepEqual(again.skipped.map((s) => s.reason).sort(), ["already_pending", "outcome_unknown"]);
        assert.equal(bulks(hh).length, 2);
        await assert.rejects(hh.svc.adminReleaseTimeout(ADMIN, { leadIds: [ids[0]] }), { code: "confirm_checked_apollo_required" });
        await hh.svc.adminReleaseTimeout(ADMIN, { leadIds: [ids[0]], confirmCheckedApollo: true });
        await hh.svc.adminEnrich(ADMIN, { leadIds: [ids[0]] });
        assert.equal(bulks(hh).length, 3);
      });

      test("an Apollo 4xx releases the reservation and fails the lead", async () => {
        const hh = await harness(DIAL_ENV);
        hh.live.people = [person(1)];
        await hh.svc.adminImport(ADMIN, { page: 1 });
        const ids = (await hh.svc.adminList(ADMIN)).leads.map((l) => l.id);
        await hh.svc.adminApprove(ADMIN, { leadIds: ids });
        hh.live.bulk = () => { throw Object.assign(new Error("bad"), { kind: "http", status: 422, outcomeUnknown: false }); };
        await hh.svc.adminEnrich(ADMIN, { leadIds: ids });
        const lead = (await hh.svc.adminList(ADMIN)).leads[0];
        assert.deepEqual([lead.status, lead.enrichState], ["failed", "rejected"]);
        assert.equal((await hh.svc.adminOverview(ADMIN)).credits.usedToday, 0);
      });

      test("poll: pending changes nothing; ready applies", async () => {
        const hh = await harness({ ...DIAL_ENV, APOLLO_ENRICH_DELIVERY: "poll" });
        hh.live.people = [person(1)];
        await hh.svc.adminImport(ADMIN, { page: 1 });
        const lead0 = (await hh.svc.adminList(ADMIN)).leads[0];
        await hh.svc.adminApprove(ADMIN, { leadIds: [lead0.id] });
        await hh.svc.adminEnrich(ADMIN, { leadIds: [lead0.id] });
        const req = (await hh.svc.adminOverview(ADMIN)).enrichRequests[0];
        assert.equal((await hh.svc.adminPoll(ADMIN, { enrichId: req.id })).state, "pending");
        assert.equal(hh.live.calls.find((c) => c.op === "poll")!.requestId, "9007199254740993123");
        hh.live.poll = () => ({ state: "ready", result: { creditsConsumed: 8, people: [{ apolloId: lead0.apolloId, status: "success", phones: [{ e164: "+351912345678", type: "mobile" }] }] } });
        assert.equal((await hh.svc.adminPoll(ADMIN, { enrichId: req.id })).state, "ready");
        assert.equal((await hh.svc.adminList(ADMIN)).leads[0].status, "ready");
      });

      test("the webhook needs its per-request secret; only the secret's hash is stored", async () => {
        const hh = await harness(DIAL_ENV);
        hh.live.people = [person(1)];
        await hh.svc.adminImport(ADMIN, { page: 1 });
        const lead0 = (await hh.svc.adminList(ADMIN)).leads[0];
        await hh.svc.adminApprove(ADMIN, { leadIds: [lead0.id] });
        await hh.svc.adminEnrich(ADMIN, { leadIds: [lead0.id] });
        const [, enrichId, secret] = bulks(hh)[0].args.webhookUrl.match(/apollo-webhook\/([^/]+)\/([^/]+)$/);
        const body = webhookPayload([[lead0.apolloId, ["+351912345678"]]]);
        for (const [id, s] of [[enrichId, secret.slice(0, -1) + "Z"], [enrichId, ""], ["per_999", secret]]) {
          await assert.rejects(hh.svc.receiveApolloWebhook(id, s, body), { status: 404 });
        }
        assert.equal((await hh.svc.adminList(ADMIN)).leads[0].status, "enrichment_pending");
        await hh.svc.receiveApolloWebhook(enrichId, secret, body);
        assert.equal((await hh.svc.adminList(ADMIN)).leads[0].status, "ready");
        assert.ok(!JSON.stringify(await hh.store.getEnrichRequest(enrichId)).includes(secret));
      });
    });

    describe("opt-out is immediate and permanent", () => {
      test("opt-out works in demo mode too, and blocks by Apollo id at once", async () => {
        const hh = await harness({});
        await hh.svc.adminImport(ADMIN, { page: 1 });
        const lead = (await hh.svc.adminList(ADMIN)).leads[0];
        await hh.svc.adminAssign(ADMIN, { leadIds: [lead.id], repUid: REP_A.uid });
        await hh.svc.optOut(REP_A, { leadId: lead.id });
        assert.equal((await hh.svc.adminList(ADMIN)).leads.find((l) => l.id === lead.id)!.status, "opt_out");
      });

      test("the block list keeps only a protected hash, never the phone or the Apollo id", async () => {
        const hh = await harness(DIAL_ENV);
        const { ids } = await readyLeads(hh, { count: 1 });
        const lead = (await hh.svc.adminList(ADMIN)).leads[0];
        await hh.svc.optOut(REP_A, { leadId: ids[0] });
        const blocks = JSON.stringify(await hh.store._debugBlocks());
        assert.ok(!blocks.includes("912345670") && !blocks.includes(lead.apolloId));
        assert.match(blocks, /[0-9a-f]{64}/);
        assert.match(blocks, /pt_callers_marketing/);
      });

      test("changing the block-list key never silently forgets opt-outs: everything refuses instead", async () => {
        const hh = await harness(DIAL_ENV);
        const { ids } = await readyLeads(hh, { count: 2 });
        await hh.svc.optOut(REP_A, { leadId: ids[0] });
        const other = createService({
          store: hh.store, liveApollo: hh.live as any, mockApollo: createMockApolloClient(), dialer: hh.dialer, dnc: hh.dnc,
          readFlags: () => readFlags(hh.env), now: () => hh.clock.t, newId: (p) => `${p}_x${Math.random().toString(36).slice(2)}`, newSecret: () => "y".repeat(40),
          isAdmin: (r) => r === "admin", repDirectory: async () => [], blockPepper: "a-different-pepper",
        });
        assert.equal((await other.preDialCheck(REP_A, { leadId: ids[1] })).reason, "block_key_changed");
        await assert.rejects(other.adminImport(ADMIN, { page: 1 }), { code: "block_key_changed" });
        await assert.rejects(other.adminEnrich(ADMIN, { leadIds: ids }), { code: "block_key_changed" });
      });

      test("re-import, re-enrichment, outcomes and approval never un-block", async () => {
        const hh = await harness(DIAL_ENV);
        const { ids, req } = await readyLeads(hh, { count: 1 });
        const lead = (await hh.svc.adminList(ADMIN)).leads[0];
        await hh.svc.optOut(REP_A, { leadId: ids[0] });
        await hh.svc.adminImport(ADMIN, { page: 1 });
        await hh.svc.applyEnrichmentResult(req.id, JSON.parse(webhookPayload([[lead.apolloId, ["+351912345670"]]])), "webhook");
        assert.deepEqual((await hh.svc.adminEnrich(ADMIN, { leadIds: ids })).skipped.map((s) => s.reason), ["blocked"]);
        await assert.rejects(hh.svc.setOutcome(REP_A, { leadId: ids[0], status: "callback" }), { code: "lead_blocked" });
        await hh.svc.adminApprove(ADMIN, { leadIds: ids });
        assert.equal((await hh.svc.adminList(ADMIN)).leads[0].status, "opt_out");
        assert.equal((await hh.svc.preDialCheck(REP_A, { leadId: ids[0] })).ok, false);
      });

      test("another lead later enriched with an opted-out phone arrives blocked", async () => {
        const hh = await harness(DIAL_ENV);
        const { ids } = await readyLeads(hh, { count: 1 });
        await hh.svc.optOut(REP_A, { leadId: ids[0] });
        hh.live.people = [person(50)];
        await hh.svc.adminImport(ADMIN, { page: 1 });
        const fresh = (await hh.svc.adminList(ADMIN)).leads.find((l) => l.apolloId === "ap_50")!;
        await hh.svc.adminApprove(ADMIN, { leadIds: [fresh.id] });
        await hh.svc.adminEnrich(ADMIN, { leadIds: [fresh.id] });
        const req = (await hh.svc.adminOverview(ADMIN)).enrichRequests.find((r) => r.leadIds.includes(fresh.id))!;
        await hh.svc.applyEnrichmentResult(req.id, JSON.parse(webhookPayload([["ap_50", ["+351 912 345 670"]]])), "webhook");
        assert.equal((await hh.svc.adminList(ADMIN)).leads.find((l) => l.id === fresh.id)!.status, "blocked");
      });

      test("an opted-out Apollo id is never re-imported as a new lead", async () => {
        const hh = await harness(DIAL_ENV);
        await readyLeads(hh, { count: 1 });
        const lead = (await hh.svc.adminList(ADMIN)).leads[0];
        await hh.svc.optOut(ADMIN, { leadId: lead.id });
        // A fresh store row for the same Apollo id would need the old row gone; the
        // block list alone must stop it.
        await hh.store._deleteLeadForTests(lead.id);
        const out = await hh.svc.adminImport(ADMIN, { page: 1 });
        assert.deepEqual([out.inserted, out.skippedBlocked], [0, 1]);
      });

      test("an Admin opt-out while another rep holds the lead stops that rep's dial", async () => {
        const hh = await harness(DIAL_ENV);
        const { ids } = await readyLeads(hh, { count: 1 });
        await hh.svc.lock(REP_A, { leadId: ids[0] });
        await hh.svc.optOut(ADMIN, { leadId: ids[0] });
        await assert.rejects(hh.svc.startCall(REP_A, { leadId: ids[0] }), { code: "lead_not_dialable" });
        assert.equal(hh.dialer.started.length, 0);
      });
    });

    describe("one rep per lead", () => {
      test("a held lock refuses the other rep until it expires", async () => {
        const hh = await harness(DIAL_ENV);
        const { ids } = await readyLeads(hh, { count: 1 });
        await hh.svc.lock(REP_A, { leadId: ids[0] });
        await hh.svc.adminAssign(ADMIN, { leadIds: ids, repUid: REP_B.uid });
        assert.equal((await hh.svc.preDialCheck(REP_B, { leadId: ids[0] })).reason, "lead_locked");
        await assert.rejects(hh.svc.lock(REP_B, { leadId: ids[0] }), { code: "lead_locked" });
        hh.clock.t += 16 * 60 * 1000;
        await hh.svc.lock(REP_B, { leadId: ids[0] });
      });

      test("two concurrent lock attempts: exactly one wins", async () => {
        const hh = await harness(DIAL_ENV);
        const { ids } = await readyLeads(hh, { count: 1 });
        const got = await Promise.all([hh.store.acquireLock(ids[0], REP_A.uid, hh.clock.t, 60000), hh.store.acquireLock(ids[0], REP_B.uid, hh.clock.t, 60000)]);
        assert.equal(got.filter(Boolean).length, 1);
      });

      test("the lock is released when the call ends", async () => {
        const hh = await harness(DIAL_ENV);
        const { ids } = await readyLeads(hh, { count: 1 });
        const { callId } = await hh.svc.startCall(REP_A, { leadId: ids[0] });
        await hh.svc.onCallEvent({ callId, leg: "rep", type: "hangup", callControlId: "cc_rep_1" });
        await hh.svc.adminAssign(ADMIN, { leadIds: ids, repUid: REP_B.uid });
        await hh.svc.lock(REP_B, { leadId: ids[0] });
      });
    });

    describe("the server re-checks before every dial", () => {
      test("happy path: rep leg first, the lead only after the rep answers", async () => {
        const hh = await harness(DIAL_ENV);
        const { ids } = await readyLeads(hh, { count: 1 });
        const { callId } = await hh.svc.startCall(REP_A, { leadId: ids[0] });
        assert.deepEqual(hh.dialer.started, [callId]);
        assert.equal(hh.dialer.customers.length, 0);
        assert.equal((await hh.svc.repList(REP_A)).leads[0].status, "calling");
        await hh.svc.onCallEvent({ callId, leg: "rep", type: "answered", callControlId: "cc_rep_1" });
        assert.deepEqual(hh.dialer.customers, [{ callId, to: "+351912345670", linkTo: "cc_rep_1" }]);
        assert.equal(hh.dnc.checked.length, 2);
      });

      test("duplicate Telnyx events never duplicate a call", async () => {
        const hh = await harness(DIAL_ENV);
        const { ids } = await readyLeads(hh, { count: 1 });
        const { callId } = await hh.svc.startCall(REP_A, { leadId: ids[0] });
        const ev = { callId, leg: "rep" as const, type: "answered" as const, callControlId: "cc_rep_1" };
        await Promise.all([hh.svc.onCallEvent(ev), hh.svc.onCallEvent(ev)]);
        await hh.svc.onCallEvent(ev);
        assert.equal(hh.dialer.customers.length, 1);
        const hang = { callId, leg: "customer" as const, type: "hangup" as const, callControlId: "cc_cust_2" };
        await hh.svc.onCallEvent(hang); await hh.svc.onCallEvent(hang);
        assert.equal((await hh.svc.callState(REP_A, { callId })).status, "no_answer");
      });

      const CASES: Array<[string, null | ((hh: H, id: string) => Promise<void>), string]> = [
        ["not assigned to this rep", async (hh, id) => { await hh.svc.adminAssign(ADMIN, { leadIds: [id], repUid: REP_B.uid }); }, "not_found"],
        ["opted out", async (hh, id) => { await hh.svc.optOut(REP_A, { leadId: id }); }, "lead_not_dialable"],
        ["wrong number", async (hh, id) => { await hh.svc.setOutcome(REP_A, { leadId: id, status: "wrong_number" }); }, "lead_not_dialable"],
        ["number not classified as corporate", async (hh, id) => { await hh.svc.adminSetEligibility(ADMIN, { leadId: id, numberClass: "unknown", legalBasis: "x" }); }, "eligibility_not_recorded"],
        ["no legal basis recorded", async (hh, id) => { await hh.svc.adminSetEligibility(ADMIN, { leadId: id, numberClass: "corporate", legalBasis: "" }); }, "eligibility_not_recorded"],
        ["not a pilot number while in pilot", async (hh) => { hh.env.PT_CALLERS_PILOT_NUMBERS = "+351219999999"; }, "not_pilot_number"],
        ["calling hours not set", async (hh) => { delete hh.env.PT_CALLERS_CALLING_HOURS; }, "calling_hours_not_set"],
        ["outside calling hours", async (hh) => { hh.clock.t = Date.UTC(2026, 9, 19, 19, 0); }, "outside_calling_hours"],
        ["national do-not-call listed", async (hh) => { hh.dnc.result = { status: "listed" }; }, "dnc_listed"],
        ["do-not-call source unavailable", async (hh) => { hh.dnc.result = { status: "unavailable" }; }, "dnc_unavailable"],
        ["do-not-call source throws", async (hh) => { hh.dnc.result = new Error("down"); }, "dnc_unavailable"],
        ["rep's daily call budget used up", async (hh) => { hh.env.PT_CALLERS_REP_DAILY_CALL_CAP = "0"; }, "budget_exhausted"],
        ["no overall spending cap set", async (hh) => { delete hh.env.PT_CALLERS_DAILY_CALL_CAP; }, "spend_cap_not_set"],
        ["role is not pt_caller", null, "role_not_allowed"],
      ];
      for (const [name, arrange, reason] of CASES) {
        test(`refused: ${name}`, async () => {
          const hh = await harness({ ...DIAL_ENV });
          const { ids } = await readyLeads(hh, { count: 1 });
          if (arrange) await arrange(hh, ids[0]);
          const who = reason === "role_not_allowed" ? FULFIL : REP_A;
          assert.deepEqual(await hh.svc.preDialCheck(who, { leadId: ids[0] }).then((p) => [p.ok, p.reason]), [false, reason]);
          await assert.rejects(hh.svc.startCall(who, { leadId: ids[0] }), { code: reason });
          assert.equal(hh.dialer.started.length, 0);
        });
      }

      test("refused: a stored number that is not +351", async () => {
        const hh = await harness(DIAL_ENV);
        const { ids } = await readyLeads(hh, { count: 1 });
        await hh.store.updateLead(ids[0], { phoneE164: "+14155550100" });
        assert.equal((await hh.svc.preDialCheck(REP_A, { leadId: ids[0] })).reason, "phone_not_pt_e164");
      });

      test("refused: demo leads are never dialled, whatever the flags", async () => {
        const hh = await harness({});
        await hh.svc.adminImport(ADMIN, { page: 1 });
        const lead = (await hh.svc.adminList(ADMIN)).leads[0];
        await hh.svc.adminAssign(ADMIN, { leadIds: [lead.id], repUid: REP_A.uid });
        Object.assign(hh.env, DIAL_ENV);
        assert.equal((await hh.svc.preDialCheck(REP_A, { leadId: lead.id })).reason, "not_found");
      });

      test("the per-lead attempt limit and the overall daily spending cap bind", async () => {
        const hh = await harness({ ...DIAL_ENV, PT_CALLERS_MAX_ATTEMPTS_PER_LEAD: "1", PT_CALLERS_DAILY_CALL_CAP: "1" });
        const { ids } = await readyLeads(hh, { count: 2 });
        const { callId } = await hh.svc.startCall(REP_A, { leadId: ids[0] });
        await hh.svc.onCallEvent({ callId, leg: "rep", type: "hangup", callControlId: "cc_rep_1" });
        assert.equal((await hh.svc.preDialCheck(REP_A, { leadId: ids[0] })).reason, "max_attempts_reached");
        assert.equal((await hh.svc.preDialCheck(REP_A, { leadId: ids[1] })).reason, "spend_cap_reached");
      });

      test("pilot off: any eligible +351 number may be dialled", async () => {
        const hh = await harness({ ...DIAL_ENV, PT_CALLERS_PILOT_ONLY: "false", PT_CALLERS_PILOT_NUMBERS: "" });
        const { ids } = await readyLeads(hh, { count: 1 });
        assert.equal((await hh.svc.preDialCheck(REP_A, { leadId: ids[0] })).ok, true);
      });

      test("an opt-out between the rep answering and the lead's leg stops the dial", async () => {
        const hh = await harness(DIAL_ENV);
        const { ids } = await readyLeads(hh, { count: 1 });
        const { callId } = await hh.svc.startCall(REP_A, { leadId: ids[0] });
        await hh.svc.optOut(REP_A, { leadId: ids[0] });
        await hh.svc.onCallEvent({ callId, leg: "rep", type: "answered", callControlId: "cc_rep_1" });
        assert.equal(hh.dialer.customers.length, 0);
        assert.ok(hh.dialer.hungUp.includes("cc_rep_1"));
        assert.equal((await hh.svc.callState(REP_A, { callId })).status, "refused");
      });

      test("calling hours ending between start and answer stops the dial", async () => {
        const hh = await harness(DIAL_ENV);
        const { ids } = await readyLeads(hh, { count: 1 });
        const { callId } = await hh.svc.startCall(REP_A, { leadId: ids[0] });
        hh.clock.t = Date.UTC(2026, 9, 19, 17, 0);
        await hh.svc.onCallEvent({ callId, leg: "rep", type: "answered", callControlId: "cc_rep_1" });
        assert.equal(hh.dialer.customers.length, 0);
      });

      test("a rep cannot read or end another rep's call; one call at a time", async () => {
        const hh = await harness(DIAL_ENV);
        const { ids } = await readyLeads(hh, { count: 2 });
        const { callId } = await hh.svc.startCall(REP_A, { leadId: ids[0] });
        await assert.rejects(hh.svc.callState(REP_B, { callId }), { status: 404 });
        await assert.rejects(hh.svc.endCall(REP_B, { callId }), { status: 404 });
        await assert.rejects(hh.svc.startCall(REP_A, { leadId: ids[1] }), { code: "rep_busy" });
      });
    });

    describe("rep side panel", () => {
      test("outcome with a follow-up date, short notes, and the lead's call history", async () => {
        const hh = await harness(DIAL_ENV);
        const { ids } = await readyLeads(hh, { count: 1 });
        const { callId } = await hh.svc.startCall(REP_A, { leadId: ids[0] });
        await hh.svc.onCallEvent({ callId, leg: "rep", type: "hangup", callControlId: "cc_rep_1" });
        const when = T0 + 2 * 86400000;
        await hh.svc.setOutcome(REP_A, { leadId: ids[0], status: "callback", note: "x".repeat(900), followUpAt: when });
        const lead = (await hh.svc.repList(REP_A)).leads[0];
        assert.deepEqual([lead.status, lead.followUpAt, lead.notes!.length], ["callback", when, 500]);
        const hist = await hh.svc.callHistory(REP_A, { leadId: ids[0] });
        assert.deepEqual(hist.calls.map((c) => [c.callId, c.status]), [[callId, "ended"]]);
        assert.equal(hist.source, "apollo");
        assert.ok(hist.fetchedAt > 0);
      });

      test("overview measures calls and connected minutes today", async () => {
        const hh = await harness(DIAL_ENV);
        const { ids } = await readyLeads(hh, { count: 1 });
        const { callId } = await hh.svc.startCall(REP_A, { leadId: ids[0] });
        await hh.svc.onCallEvent({ callId, leg: "rep", type: "answered", callControlId: "cc_rep_1" });
        await hh.svc.onCallEvent({ callId, leg: "customer", type: "answered", callControlId: "cc_cust_2" });
        hh.clock.t += 3 * 60000;
        await hh.svc.onCallEvent({ callId, leg: "customer", type: "hangup", callControlId: "cc_cust_2" });
        const o = await hh.svc.adminOverview(ADMIN);
        assert.equal(o.calls.today, 1);
        assert.equal(o.calls.connectedMinutesToday, 3);
        assert.equal(o.calls.dailyCap, 50);
      });
    });
  });
}
