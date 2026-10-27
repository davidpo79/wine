// Portugal callers (Apollo HR leads + sales-rep calling). Written before the implementation.
// Pure tests always run. The service / ledger / middleware tests need a Postgres with all migrations applied:
//   TEST_DATABASE_URL=postgres://... npm test        (HUMAN_CALLS_DB_URL is accepted too)
// Apollo and Telnyx are in-process fakes: nothing here can reach a real provider.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createServer, type Server } from "node:http";
import { once } from "node:events";

const DB_URL = process.env.TEST_DATABASE_URL ?? process.env.HUMAN_CALLS_DB_URL;
if (DB_URL) process.env.DATABASE_URL = DB_URL;
process.env.SESSION_SECRET ??= "s".repeat(40);
for (const k of ["PT_CALLERS_ENABLED", "PT_CALLERS_LEGAL_APPROVED", "APOLLO_API_KEY", "APOLLO_DAILY_CREDIT_CAP", "APOLLO_MONTHLY_CREDIT_CAP"]) delete process.env[k];

const flags = await import("../src/lib/pt-callers/flags");
const phone = await import("../src/lib/pt-callers/phone");
const access = await import("../src/lib/pt-callers/access");
const apollo = await import("../src/lib/pt-callers/apollo");
const strings = await import("../src/lib/pt-callers/strings-pt");
const { roleOf, sessionFor } = await import("../src/lib/auth");

// --- Flags ------------------------------------------------------------------------------------------------------------

test("flags: on only when exactly 'true'; either off = demo (no real Apollo, no dial)", () => {
  assert.equal(flags.ptFlags({}).live, false);
  assert.equal(flags.ptFlags({ PT_CALLERS_ENABLED: "true" }).live, false);
  assert.equal(flags.ptFlags({ PT_CALLERS_ENABLED: "true", PT_CALLERS_LEGAL_APPROVED: "TRUE" }).live, false);
  assert.equal(flags.ptFlags({ PT_CALLERS_ENABLED: "1", PT_CALLERS_LEGAL_APPROVED: "true" }).live, false);
  assert.equal(flags.ptFlags({ PT_CALLERS_ENABLED: "true", PT_CALLERS_LEGAL_APPROVED: "true" }).live, true);
});

test("credit caps: unset = no cap; a number = cap; malformed = 0 (spends nothing)", () => {
  assert.deepEqual(flags.creditCaps({}), { daily: null, monthly: null });
  assert.deepEqual(flags.creditCaps({ APOLLO_DAILY_CREDIT_CAP: "300", APOLLO_MONTHLY_CREDIT_CAP: "4000" }), { daily: 300, monthly: 4000 });
  assert.deepEqual(flags.creditCaps({ APOLLO_DAILY_CREDIT_CAP: "lots" }), { daily: 0, monthly: null });
  assert.deepEqual(flags.creditCaps({ APOLLO_MONTHLY_CREDIT_CAP: "" }), { daily: null, monthly: null });
});

test("do-not-call requirement: on unless exactly 'false'", () => {
  assert.equal(flags.dncRequired({}), true);
  assert.equal(flags.dncRequired({ PT_CALLERS_DNC_REQUIRED: "true" }), true);
  assert.equal(flags.dncRequired({ PT_CALLERS_DNC_REQUIRED: "no" }), true);
  assert.equal(flags.dncRequired({ PT_CALLERS_DNC_REQUIRED: "false" }), false);
});

test("legal-basis requirement: on unless exactly 'false'", () => {
  assert.equal(flags.legalBasisRequired({}), true);
  assert.equal(flags.legalBasisRequired({ PT_CALLERS_LEGAL_BASIS_REQUIRED: "0" }), true);
  assert.equal(flags.legalBasisRequired({ PT_CALLERS_LEGAL_BASIS_REQUIRED: "false" }), false);
});

test("business-line check: on unless exactly 'false'; the Prepare step is needed while either check is on", () => {
  assert.equal(flags.businessLineRequired({}), true);
  assert.equal(flags.businessLineRequired({ PT_CALLERS_BUSINESS_LINE_REQUIRED: "false" }), false);
  assert.equal(flags.prepareNeeded({}), true);
  assert.equal(flags.prepareNeeded({ PT_CALLERS_BUSINESS_LINE_REQUIRED: "false" }), true); // legal basis still on
  assert.equal(flags.prepareNeeded({ PT_CALLERS_BUSINESS_LINE_REQUIRED: "false", PT_CALLERS_LEGAL_BASIS_REQUIRED: "false" }), false);
});

test("voicemail setting: manual unless exactly 'hangup'", () => {
  assert.equal(flags.voicemailMode({}), "manual");
  assert.equal(flags.voicemailMode({ PT_CALLERS_VOICEMAIL: "HANGUP" }), "manual");
  assert.equal(flags.voicemailMode({ PT_CALLERS_VOICEMAIL: "hangup" }), "hangup");
});

test("numbers abroad: only as pilot test numbers, only while the pilot runs", () => {
  const env = { PT_CALLERS_PILOT_NUMBERS: "+351910000000, +972508544475" };
  assert.equal(flags.pilotTestNumber("+972 50-854-4475", env), "+972508544475");
  assert.equal(flags.pilotTestNumber("00972508544475", env), "+972508544475");
  assert.equal(flags.pilotTestNumber("+972501111111", env), null); // not in the list
  assert.equal(flags.pilotTestNumber("+972508544475", { ...env, PT_CALLERS_PILOT_COMPLETE: "true" }), null);
  assert.equal(flags.pilotTestNumber("junk", env), null);
});

test("apollo matches: full surname, work email and LinkedIn kept (LinkedIn profile URLs only); locked or malformed e-mails dropped; details never reveal a phone", () => {
  const raw = JSON.stringify({ matches: [
    { id: "p1", last_name: "Silva", email: "Ana.Silva@Empresa.pt", linkedin_url: "http://www.linkedin.com/in/ana-silva-123" },
    { id: "p2", last_name: "", email: "email_not_unlocked@domain.com", linkedin_url: "javascript:alert(1)" },
    { id: "p3", email: "not-an-email", linkedin_url: "https://evil.example/in/x" },
    { last_name: "NoId" },
  ] });
  assert.deepEqual(apollo.parseMatches(raw), [
    { apolloPersonId: "p1", lastName: "Silva", email: "ana.silva@empresa.pt", linkedinUrl: "https://www.linkedin.com/in/ana-silva-123" },
    { apolloPersonId: "p2", lastName: null, email: null, linkedinUrl: null },
    { apolloPersonId: "p3", lastName: null, email: null, linkedinUrl: null },
  ]);
  assert.deepEqual(apollo.parseMatches("not json"), []);
  const d = apollo.detailsBody(["a", "b"]);
  assert.equal(d.reveal_phone_number, false);
  assert.equal(d.reveal_personal_emails, false);
  assert.equal("webhook_url" in d, false);
  assert.throws(() => apollo.detailsBody([]));
});

test("call hours: unset refuses; weekdays only inside the Lisbon window", () => {
  assert.equal(flags.inCallHours({}, new Date("2026-10-20T10:00:00Z")), false);
  const env = { PT_CALLERS_CALL_HOURS: "09:30-18:00" };
  assert.equal(flags.inCallHours(env, new Date("2026-10-20T10:00:00Z")), true); // Tue 11:00 Lisbon (WEST)
  assert.equal(flags.inCallHours(env, new Date("2026-10-20T07:00:00Z")), false); // 08:00 Lisbon
  assert.equal(flags.inCallHours(env, new Date("2026-10-24T10:00:00Z")), false); // Saturday
  assert.equal(flags.inCallHours({ PT_CALLERS_CALL_HOURS: "nonsense" }, new Date("2026-10-20T10:00:00Z")), false);
});

// --- Phone ------------------------------------------------------------------------------------------------------------

test("phone: +351 normalization, dialable check, masking, hashed block keys", () => {
  assert.equal(phone.normalizePtPhone("912 345 678"), "+351912345678");
  assert.equal(phone.normalizePtPhone("00351 21 123 4567"), "+351211234567");
  assert.equal(phone.normalizePtPhone("+351912345678"), "+351912345678");
  assert.equal(phone.normalizePtPhone("+34612345678"), null);
  assert.equal(phone.normalizePtPhone("12345"), null);
  assert.equal(phone.isDialablePt("+351912345678"), true);
  assert.equal(phone.isDialablePt("+351812345678"), false);
  assert.equal(phone.maskPhone("+351912345678"), "+351 9•• ••• •78");
  assert.equal(phone.blockHash("phone", "912 345 678"), phone.blockHash("phone", "+351912345678"));
  assert.notEqual(phone.blockHash("phone", "+351912345678"), phone.blockHash("apollo_id", "+351912345678"));
  assert.match(phone.blockHash("apollo_id", "abc"), /^[0-9a-f]{64}$/);
});

// --- Role allow-list --------------------------------------------------------------------------------------------------

test("roles: unknown role gets no access (no silent fallback to admin)", () => {
  assert.equal(roleOf("admin"), "admin");
  assert.equal(roleOf("fulfilment"), "fulfilment");
  assert.equal(roleOf("pt_caller"), "pt_caller");
  assert.equal(roleOf("superuser"), null);
  assert.equal(roleOf(null), null);
});

test("sessions: a sales rep is not a session anywhere unless the caller opts in", () => {
  const u = (role: string) => ({ id: 1, email: "x@y.z", role, mustChangePassword: false, disabledAt: null, sessionVersion: 3 });
  assert.equal(sessionFor(u("pt_caller"), 3), null);
  assert.equal(sessionFor(u("pt_caller"), 3, { allowPtCaller: true })?.role, "pt_caller");
  assert.equal(sessionFor(u("admin"), 3)?.role, "admin");
  assert.equal(sessionFor(u("fulfilment"), 3)?.role, "fulfilment");
  assert.equal(sessionFor(u("root"), 3, { allowPtCaller: true }), null);
  assert.equal(sessionFor(u("admin"), 2), null); // old session version
  assert.equal(sessionFor({ ...u("admin"), disabledAt: new Date() }, 3), null);
});

/** Every URL the app serves, from the file system (route groups dropped, dynamic segments filled). */
function appPaths(dir = join(process.cwd(), "src/app"), prefix = ""): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      const seg = name.startsWith("(") ? "" : name.startsWith("[[...") ? "" : name.startsWith("[...") ? "/x/y" : name.startsWith("[") ? "/x" : `/${name}`;
      out.push(...appPaths(p, prefix + seg));
    } else if (/^(page|route)\.tsx?$/.test(name)) out.push(prefix || "/");
  }
  return [...new Set(out)];
}

test("allow-list: a sales rep gets 403 on every admin and API path except their own screen, phone and login", () => {
  const paths = appPaths().filter((p) => p.startsWith("/admin") || p.startsWith("/api"));
  assert.ok(paths.length > 30, `found only ${paths.length} paths`);
  const allowed = new Set<string>();
  for (const p of paths) for (const m of ["GET", "POST"]) if (access.ptCallerAllowed(m, p)) allowed.add(`${m} ${p}`);
  assert.deepEqual([...allowed].sort(), [
    "GET /admin/inbox",
    "GET /admin/inbox-attachment",
    "GET /admin/inbox/new",
    "GET /admin/inbox/x",
    "GET /admin/login",
    "GET /admin/password",
    "GET /admin/pt-callers",
    "GET /admin/pt-callers/mine",
    "POST /admin/calls/dtmf",
    "POST /admin/calls/state",
    "POST /admin/calls/webrtc-token",
    "POST /admin/inbox",
    "POST /admin/inbox/new",
    "POST /admin/inbox/x",
    "POST /admin/login",
    "POST /admin/password",
    "POST /admin/pt-callers",
    "POST /admin/pt-callers/api/rep/dial",
    "POST /admin/pt-callers/api/rep/history",
    "POST /admin/pt-callers/api/rep/opt-out",
    "POST /admin/pt-callers/api/rep/outcome",
    "POST /admin/pt-callers/mine",
  ]);
  // Her own leads' work actions ([action] route): allowed by name, POST only; the service checks she owns each lead.
  for (const a of ["approve", "approve-enrich", "claim", "classify", "details", "email", "enrich", "opt-out"]) {
    assert.equal(access.ptCallerAllowed("POST", `/admin/pt-callers/api/admin/${a}`), true, a);
    assert.equal(access.ptCallerAllowed("GET", `/admin/pt-callers/api/admin/${a}`), false, a);
  }
  // Prefix tricks are refused.
  for (const p of ["/admin/pt-callers-x", "/admin/pt-callers/api/admin/import", "/admin/pt-callers/api/admin/delete", "/admin/pt-callers/api/admin/assign", "/admin/pt-callers/api/admin/distribute", "/admin/pt-callers/api/admin/dial-number", "/admin/inbox/a@b.pt/x", "/admin/inboxes", "/admin/pt-callers/api/rep/../admin/import", "/admin/calls/start", "/admin/orders", "/api/apollo/webhook/a/b", "/admin/calls/recording"]) {
    assert.equal(access.ptCallerAllowed("POST", p), false, p);
    assert.equal(access.ptCallerAllowed("GET", p), false, p);
  }
});

test("server actions and routes: only the listed files let a sales rep in", () => {
  // Server actions can be posted to any page path, so the middleware alone is not enough: every action goes through
  // requireAdmin/getAdmin, which deny a pt_caller unless the call opts in. Only these places may opt in.
  const files: string[] = [];
  const walk = (d: string) => readdirSync(d).forEach((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : /\.tsx?$/.test(n) && files.push(join(d, n))));
  walk(join(process.cwd(), "src"));
  const optIn = files.filter((f) => /allowPtCaller:\s*true/.test(readFileSync(f, "utf8"))).map((f) => f.slice(process.cwd().length + 1)).sort();
  assert.deepEqual(optIn, [
    "src/app/admin/(app)/inbox/[contact]/page.tsx",
    "src/app/admin/(app)/inbox/new/page.tsx",
    "src/app/admin/(app)/inbox/page.tsx",
    "src/app/admin/(app)/layout.tsx",
    "src/app/admin/(app)/pt-callers/mine/page.tsx",
    "src/app/admin/(app)/pt-callers/page.tsx",
    "src/app/admin/calls/guard.ts",
    "src/app/admin/inbox-actions.ts",
    "src/app/admin/inbox-attachment/route.ts",
    "src/app/admin/pt-callers/api/guard.ts",
    "src/lib/auth.ts",
  ]);
  // The calls guard only lets reps reach the token, state and keypad endpoints, never /start or /recording.
  for (const r of ["start", "recording"]) assert.doesNotMatch(readFileSync(join(process.cwd(), `src/app/admin/calls/${r}/route.ts`), "utf8"), /allowPtCaller|rep: true/);
});

// --- Apollo request shapes --------------------------------------------------------------------------------------------

test("apollo search: exact documented filters, 0-credit endpoint", () => {
  const b = apollo.searchBody(2);
  assert.equal(apollo.SEARCH_PATH, "/api/v1/mixed_people/api_search");
  assert.deepEqual(b.person_locations, ["Portugal"]);
  assert.deepEqual(b.organization_locations, ["Portugal"]);
  assert.deepEqual(b.organization_num_employees_ranges, ["51,100", "101,500"]);
  assert.deepEqual(b.person_titles, ["HR Manager", "Human Resources Manager", "Head of HR", "HR Director", "Responsável de Recursos Humanos", "Diretor de Recursos Humanos", "Diretora de Recursos Humanos"]);
  assert.deepEqual(b.person_seniorities, ["manager", "head", "director"]);
  assert.equal(b.include_similar_titles, false);
  assert.equal(b.per_page, 25);
  assert.equal(b.page, 2);
});

test("apollo enrichment: phone on, personal emails off, waterfall off, webhook XOR poll_only, max 10", () => {
  const w = apollo.enrichBody(["a", "b"], { webhookUrl: "https://wine.test/api/apollo/webhook/er_1/s3cret" });
  assert.equal(apollo.ENRICH_PATH, "/api/v1/people/bulk_match");
  assert.deepEqual(w.details, [{ id: "a" }, { id: "b" }]);
  assert.equal(w.reveal_phone_number, true);
  assert.equal(w.reveal_personal_emails, false);
  assert.equal(w.run_waterfall_phone, false);
  assert.equal(w.run_waterfall_email, false);
  assert.equal(w.webhook_url, "https://wine.test/api/apollo/webhook/er_1/s3cret");
  assert.equal("poll_only" in w, false);
  const p = apollo.enrichBody(["a"], { pollOnly: true });
  assert.equal(p.poll_only, true);
  assert.equal("webhook_url" in p, false);
  assert.throws(() => apollo.enrichBody(["a"], { pollOnly: true, webhookUrl: "https://x" }));
  assert.throws(() => apollo.enrichBody(["a"], {}));
  assert.throws(() => apollo.enrichBody(Array.from({ length: 11 }, (_, i) => String(i)), { pollOnly: true }));
});

test("apollo request_id: read from the raw body as a string (64-bit, may be negative)", () => {
  assert.equal(apollo.requestIdFromRaw('{"request_id": 9223372036854775807, "x": 1}'), "9223372036854775807");
  assert.equal(apollo.requestIdFromRaw('{"request_id":-4611686018427387905}'), "-4611686018427387905");
  assert.equal(apollo.requestIdFromRaw('{"request_id":"123"}'), "123");
  assert.equal(apollo.requestIdFromRaw('{"other":1}'), null);
  // JSON.parse would have lost it:
  assert.notEqual(String(JSON.parse('{"r":9223372036854775807}').r), "9223372036854775807");
});

test("apollo phone payload: people[].phone_numbers[] parsed; Portuguese numbers normalized", () => {
  const r = apollo.parsePhonePayload({
    request_id: 5,
    people: [
      { id: "p1", phone_numbers: [{ raw_number: "+351 912 345 678", sanitized_number: "+351912345678", type_cd: "mobile", status_cd: "valid_number" }] },
      { id: "p2", phone_numbers: [] },
    ],
  });
  assert.deepEqual(r, [
    { apolloPersonId: "p1", phones: [{ number: "+351912345678", type: "mobile" }] },
    { apolloPersonId: "p2", phones: [] },
  ]);
  assert.deepEqual(apollo.parsePhonePayload({ nothing: true }), []);
});

test("apollo client: the API key goes only in the x-api-key header; a timeout is an ApolloTimeout, not 'no number'", async () => {
  const seen: { url: string; headers: Record<string, string>; body: string }[] = [];
  const client = apollo.createApolloClient({
    apiKey: "KEY",
    fetch: async (url, init) => {
      seen.push({ url: String(url), headers: init?.headers as Record<string, string>, body: String(init?.body) });
      return new Response('{"request_id": 9223372036854775807, "credits_consumed": 1.5, "matches": []}', { status: 200 });
    },
  });
  const r = await client.enrich(["p1"], { pollOnly: true });
  assert.equal(r.requestId, "9223372036854775807");
  assert.equal(r.creditsConsumed, "1.5");
  assert.equal(seen[0].url, "https://api.apollo.io/api/v1/people/bulk_match");
  assert.equal(seen[0].headers["x-api-key"], "KEY");
  assert.doesNotMatch(seen[0].url + seen[0].body, /KEY/);
  const slow = apollo.createApolloClient({ apiKey: "KEY", timeoutMs: 20, fetch: (_u, init) => new Promise((_r, rej) => init?.signal?.addEventListener("abort", () => rej(new DOMException("timeout", "TimeoutError")))) });
  await assert.rejects(slow.enrich(["p1"], { pollOnly: true }), (e: unknown) => e instanceof apollo.ApolloTimeout);
});

test("apollo selection: mock unless both flags are on AND a key is set", () => {
  assert.equal(apollo.apolloFor({}).kind, "mock");
  assert.equal(apollo.apolloFor({ PT_CALLERS_ENABLED: "true", PT_CALLERS_LEGAL_APPROVED: "true" }).kind, "mock");
  assert.equal(apollo.apolloFor({ APOLLO_API_KEY: "k" }).kind, "mock");
  assert.equal(apollo.apolloFor({ PT_CALLERS_ENABLED: "true", PT_CALLERS_LEGAL_APPROVED: "true", APOLLO_API_KEY: "k" }).kind, "apollo");
});

// --- pt-PT ------------------------------------------------------------------------------------------------------------

test("pt-PT strings: European Portuguese, no Brazilian forms, opt-out wording and Article 21 line in the script", () => {
  const all = JSON.stringify(strings.PT).toLowerCase();
  for (const br of ["celular", "tela", "contato", "você", "usuário", "registro", "equipe", "ônibus", "time de", "cadastro", "deletar", "salvar", "arquivo"]) {
    assert.ok(!all.includes(br), `Brazilian form found: ${br}`);
  }
  for (const pt of ["telemóvel", "ecrã", "contacto", "utilizador", "registo", "equipa"]) assert.ok(all.includes(pt), `missing pt-PT form: ${pt}`);
  for (const s of flags.STATUSES) assert.ok(strings.PT.status[s], `no label for ${s}`);
  assert.match(strings.PT.script.join(" "), /opor|oposição/i);
  assert.match(strings.PT.optOut, /Não contactar/);
});

// --- Database: ledger, enrichment, opt-out, lock, pre-dial, middleware ------------------------------------------------

const dbTest = (name: string, fn: () => Promise<void>) => test(name, { skip: !DB_URL && "TEST_DATABASE_URL not set" }, fn);
const D = DB_URL ? await import("../src/db") : null;
const svc = DB_URL ? await import("../src/lib/pt-callers/service") : null;
const ledger = DB_URL ? await import("../src/lib/pt-callers/ledger") : null;
const dnc = await import("../src/lib/pt-callers/dnc");
type Me = { id: number; email: string; role: "admin" | "pt_caller"; mustChangePassword: boolean };
const admin: Me = { id: 0, email: "", role: "admin", mustChangePassword: false };
/** The refusal reason of a service result (results without one read as "undefined"). */
const why = (r: object) => String((r as { reason?: unknown }).reason);
const rep: Me = { id: 0, email: "", role: "pt_caller", mustChangePassword: false };
const rep2: Me = { id: 0, email: "", role: "pt_caller", mustChangePassword: false };
const RUN = Date.now().toString(36);
let telnyx: Server;
const telnyxCalls: { path: string; body: Record<string, unknown> }[] = [];
const LIVE = { PT_CALLERS_ENABLED: "true", PT_CALLERS_LEGAL_APPROVED: "true", PT_CALLERS_CALL_HOURS: "00:00-24:00", PT_CALLERS_CALL_DAYS: "1-7", PT_CALLERS_DAILY_CALL_CAP: "100000", PT_CALLERS_PILOT_COMPLETE: "true", PT_CALLERS_PILOT_NUMBERS: undefined as string | undefined };
const setEnv = (e: Record<string, string | undefined>) => {
  for (const [k, v] of Object.entries(e)) if (v === undefined) delete process.env[k];
  else process.env[k] = v;
};
const offEnv = Object.fromEntries(Object.keys(LIVE).map((k) => [k, undefined]));

before(async () => {
  if (!D) return;
  telnyx = createServer(async (req, res) => {
    let raw = "";
    for await (const c of req) raw += c;
    const path = (req.url ?? "").replace(/^\/v2/, "");
    const body = raw ? JSON.parse(raw) : {};
    telnyxCalls.push({ path, body });
    res.writeHead(200, { "Content-Type": "application/json" });
    if (path === "/calls") return res.end(JSON.stringify({ data: { call_control_id: `cc-${body.command_id}`, call_session_id: "s" } }));
    res.end(JSON.stringify({ data: { result: "ok" } }));
  }).listen(0);
  await once(telnyx, "listening");
  setEnv({
    TELNYX_API_BASE: `http://127.0.0.1:${(telnyx.address() as { port: number }).port}/v2`,
    TELNYX_API_KEY: "KEY_test",
    TELNYX_WEBRTC_CONNECTION_ID: "cred-conn",
    TELNYX_CONNECTION_ID: "cc-app",
    TELNYX_FROM_NUMBER: "+351210000000",
    SITE_URL: "https://wine.test",
    TELNYX_PUBLIC_KEY: "dGVzdA==",
    APOLLO_WEBHOOK_BASE_URL: "https://wine.test",
  });
  const mk = async (me: Me, role: string) => {
    const [u] = await D.db.insert(D.schema.adminUsers).values({ email: `${role}-${RUN}-${Math.random()}@wine.test`, passwordHash: "x", role }).returning();
    Object.assign(me, { id: u.id, email: u.email });
    // A phone device for the rep (normally created by /admin/calls/webrtc-token).
    await D.db.insert(D.schema.humanCallRepEndpoints).values({ adminId: u.id, sipUsername: `sip${RUN}${u.id}`, credentialId: `cred${RUN}${u.id}`, connectionId: "cred-conn" });
  };
  await mk(admin, "admin");
  await mk(rep, "pt_caller");
  await mk(rep2, "pt_caller");
});

after(async () => {
  if (!D) return;
  telnyx.close();
  await D.sql.end();
});

const leadRow = async (id: number) => (await D!.sql`select * from pt_leads where id = ${id}`)[0];
/** A dialable lead in the pilot list, assigned to `who`. */
async function readyLead(who: Me, n: number) {
  const [l] = await D!.db
    .insert(D!.schema.ptLeads)
    .values({ apolloPersonId: `ready-${RUN}-${n}-${Math.random()}`, firstName: "Ana", lastName: "Teste", title: "HR Manager", company: "Empresa", phone: `+3519${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`, phoneType: "work_direct", numberClass: "business", legalBasis: "test basis", status: "ready", assignedTo: who.id, approvedAt: new Date(), retentionUntil: new Date(Date.now() + 90 * 86400_000) })
    .returning();
  return l;
}

dbTest("ledger: reserve before, settle exactly once; unset caps = no cap; caps enforced; unreadable ledger refuses", async () => {
  setEnv({ APOLLO_DAILY_CREDIT_CAP: undefined, APOLLO_MONTHLY_CREDIT_CAP: undefined });
  const k1 = `t-${RUN}-1`;
  await ledger!.reserve({ key: k1, credits: 100000, demo: true, by: admin.id }); // no cap: any size passes
  assert.equal(await ledger!.settleOnce(k1, "9"), true);
  assert.equal(await ledger!.settleOnce(k1, "18"), false); // a retry cannot settle (or charge) twice
  await assert.rejects(ledger!.reserve({ key: k1, credits: 9, demo: true, by: admin.id })); // same request key twice
  const s1 = await ledger!.summary(true);
  setEnv({ APOLLO_DAILY_CREDIT_CAP: String(s1.today + 10) });
  await ledger!.reserve({ key: `t-${RUN}-2`, credits: 9, demo: true, by: admin.id });
  await assert.rejects(ledger!.reserve({ key: `t-${RUN}-3`, credits: 9, demo: true, by: admin.id }), /cap/i);
  setEnv({ APOLLO_DAILY_CREDIT_CAP: undefined, APOLLO_MONTHLY_CREDIT_CAP: "0" });
  await assert.rejects(ledger!.reserve({ key: `t-${RUN}-4`, credits: 1, demo: true, by: admin.id }), /cap/i);
  setEnv({ APOLLO_MONTHLY_CREDIT_CAP: undefined });
  const s = await ledger!.summary(true);
  assert.equal(s.caps.daily, null);
  assert.equal(s.remaining.daily, null);
  // Unreadable ledger: refuse (fail closed).
  await assert.rejects(ledger!.reserve({ key: `t-${RUN}-5`, credits: 1, demo: true, by: admin.id }, { readTotals: async () => Promise.reject(new Error("db down")) }), /ledger/i);
});

dbTest("flags off: import uses the mock (demo rows), dial is refused with a reason, no Telnyx request", async () => {
  setEnv(offEnv);
  const r = await svc!.importLeads(admin, { page: 1 });
  assert.equal(r.source, "mock");
  assert.ok(r.inserted + r.duplicates > 0);
  const [l] = await D!.sql`select * from pt_leads where demo = true limit 1`;
  assert.ok(l);
  const before = telnyxCalls.length;
  const lead = await readyLead(rep, 1);
  const d = await svc!.dial(rep, lead.id);
  assert.equal(d.ok, false);
  assert.equal(d.reason, "flags_off");
  assert.equal(telnyxCalls.length, before);
  // Re-import: dedupe by Apollo person id.
  const again = await svc!.importLeads(admin, { page: 1 });
  assert.equal(again.inserted, 0);
});

dbTest("roles: only admins import and assign; a rep approves and enriches only her own leads, sees only them, numbers masked", async () => {
  await assert.rejects(svc!.importLeads(rep as never, { page: 1 }), /forbidden/);
  assert.match(why(await svc!.approveLeads(rep, [1])), /assigned to you/);
  assert.match(why(await svc!.enrichLeads(rep, [1])), /assigned to you/);
  await assert.rejects(svc!.assignLeads(rep as never, [1], rep.id), /forbidden/);
  const mine = await readyLead(rep, 2);
  const theirs = await readyLead(rep2, 3);
  const list = await svc!.listForRep(rep);
  assert.ok(list.some((l) => l.id === mine.id));
  assert.ok(!list.some((l) => l.id === theirs.id));
  const row = list.find((l) => l.id === mine.id)!;
  assert.equal(row.phone, phone.maskPhone(mine.phone));
  assert.match(row.phone, /•/);
  assert.equal("legalBasis" in row, false);
  assert.ok((await D!.sql`select 1 from pt_access_log where lead_id = ${mine.id} and admin_id = ${rep.id} and action = 'view'`).length > 0);
  // A rep can't act on someone else's lead.
  assert.equal((await svc!.optOut(rep, theirs.id)).ok, false);
  assert.equal((await svc!.setOutcome(rep, theirs.id, { status: "interested" })).ok, false);
});

async function enrichOne(mode: "webhook" | "poll") {
  setEnv({ ...offEnv, PT_CALLERS_APOLLO_RESULT_MODE: mode === "poll" ? "poll" : undefined });
  const [p] = await D!.db.insert(D!.schema.ptLeads).values({ apolloPersonId: `enr-${RUN}-${Math.random()}`, firstName: "Rita", title: "Head of HR", company: "X", status: "new", demo: true, retentionUntil: new Date(Date.now() + 90 * 86400_000) }).returning();
  await svc!.approveLeads(admin, [p.id]);
  const r = await svc!.enrichLeads(admin, [p.id]);
  return { lead: p, r };
}

dbTest("enrichment: duplicate webhook and out-of-order results merge once; ledger settled once", async () => {
  const { lead, r } = await enrichOne("webhook");
  assert.equal(r.ok, true);
  assert.equal((await leadRow(lead.id)).status, "enrichment_pending");
  const reqRow = (await D!.sql`select * from pt_enrichment_requests where id = ${r.requestId!}`)[0];
  assert.equal(typeof reqRow.apollo_request_id, "string");
  assert.equal(reqRow.mode, "webhook");
  const payload = JSON.stringify({ request_id: reqRow.apollo_request_id, people: [{ id: lead.apolloPersonId, phone_numbers: [{ sanitized_number: "+351912000009", type_cd: "mobile" }] }] });
  // Wrong secret: refused, nothing applied.
  assert.equal((await svc!.handleApolloWebhook(r.requestId!, "wrong", payload)).status, 404);
  assert.equal((await leadRow(lead.id)).status, "enrichment_pending");
  const ok1 = await svc!.handleApolloWebhook(r.requestId!, r.testSecret!, payload);
  const ok2 = await svc!.handleApolloWebhook(r.requestId!, r.testSecret!, payload); // duplicate
  assert.equal(ok1.status, 200);
  assert.equal(ok2.status, 200);
  const l = await leadRow(lead.id);
  assert.equal(l.phone, "+351912000009");
  assert.equal(l.status, "new"); // needs an admin to classify the number before it can be dialed
  const led = (await D!.sql`select * from pt_credit_ledger where request_key = ${r.requestId!}`)[0];
  assert.equal(led.status, "settled");
  assert.equal(led.reserved, 9);
  assert.equal(led.settled, "9");
});

dbTest("enrichment: partial result keeps the rest pending; no blind retry while pending; timeout is not 'no number'", async () => {
  setEnv(offEnv);
  const mk = async () => (await D!.db.insert(D!.schema.ptLeads).values({ apolloPersonId: `part-${RUN}-${Math.random()}`, firstName: "P", status: "new", demo: true, retentionUntil: new Date(Date.now() + 90 * 86400_000) }).returning())[0];
  const a = await mk();
  const b = await mk();
  await svc!.approveLeads(admin, [a.id, b.id]);
  const r = await svc!.enrichLeads(admin, [a.id, b.id]);
  await svc!.handleApolloWebhook(r.requestId!, r.testSecret!, JSON.stringify({ people: [{ id: a.apolloPersonId, phone_numbers: [] }] }));
  assert.equal((await leadRow(a.id)).status, "failed"); // a real answer with no number
  assert.equal((await leadRow(a.id)).fail_reason, "no_number");
  assert.equal((await leadRow(b.id)).status, "enrichment_pending");
  assert.equal((await D!.sql`select status from pt_enrichment_requests where id = ${r.requestId!}`)[0].status, "pending");
  // No blind retry: enriching b again is refused while its first request is open.
  const again = await svc!.enrichLeads(admin, [b.id]);
  assert.equal(again.ok, false);
  assert.match(String(again.reason), /pending/);
  // Mark the request timed out: b stays pending (not "no number"), still not re-enrichable.
  await D!.sql`update pt_enrichment_requests set sent_at = now() - interval '2 hours' where id = ${r.requestId!}`;
  await svc!.sweepTimeouts();
  assert.equal((await D!.sql`select status from pt_enrichment_requests where id = ${r.requestId!}`)[0].status, "timeout");
  assert.equal((await leadRow(b.id)).status, "enrichment_pending");
  assert.notEqual((await leadRow(b.id)).fail_reason, "no_number");
  assert.equal((await svc!.enrichLeads(admin, [b.id])).ok, false);
  // A late result after the timeout still lands, once.
  await svc!.handleApolloWebhook(r.requestId!, r.testSecret!, JSON.stringify({ people: [{ id: b.apolloPersonId, phone_numbers: [{ sanitized_number: "+351912000008", type_cd: "work_direct" }] }] }));
  assert.equal((await leadRow(b.id)).phone, "+351912000008");
  // Already enriched: a second enrichment is refused (no re-reveal, no second charge).
  assert.equal((await svc!.enrichLeads(admin, [b.id])).ok, false);
});

dbTest("opt-out: immediate, permanent; re-import and re-enrichment never un-block", async () => {
  setEnv(offEnv);
  const lead = await readyLead(rep, 4);
  assert.equal((await svc!.optOut(rep, lead.id)).ok, true);
  assert.equal((await leadRow(lead.id)).status, "opt_out");
  // Outcome / admin re-classify cannot bring it back.
  assert.equal((await svc!.setOutcome(rep, lead.id, { status: "interested" })).ok, false);
  assert.equal((await svc!.classifyLead(admin, lead.id, { numberClass: "business", legalBasis: "x" })).ok, false);
  // The same person re-imported under the same Apollo id: skipped.
  const blockedImport = await svc!.insertSearchResults(admin, [{ id: lead.apolloPersonId, first_name: "Ana", title: "HR Manager", organization: { name: "Empresa" } }], { demo: true });
  assert.equal(blockedImport.blocked, 1);
  // Another lead later enriched to the opted-out number: blocked on arrival.
  const { lead: other, r } = await enrichOne("webhook");
  await svc!.handleApolloWebhook(r.requestId!, r.testSecret!, JSON.stringify({ people: [{ id: other.apolloPersonId, phone_numbers: [{ sanitized_number: lead.phone, type_cd: "mobile" }] }] }));
  assert.equal((await leadRow(other.id)).status, "blocked");
  assert.equal((await D!.sql`select count(*)::int as n from pt_blocks where value_hash = ${phone.blockHash("phone", lead.phone!)}`)[0].n, 1);
});

dbTest("pre-dial recheck: every gate refuses on its own; DNC 'unavailable' refuses", async () => {
  const lead = await readyLead(rep, 5);
  const ok = { dnc: async () => ({ status: "clear" as const }) };
  setEnv(LIVE);
  dnc.setDncAdapter(ok.dnc);
  assert.deepEqual(await svc!.predialCheck(rep, lead.id), { ok: true });
  const expect = async (reason: string, mutate: () => Promise<unknown> | void, undo: () => Promise<unknown> | void) => {
    await mutate();
    const r = await svc!.predialCheck(rep, lead.id);
    await undo();
    assert.deepEqual(r, { ok: false, reason }, reason);
  };
  await expect("flags_off", () => setEnv({ PT_CALLERS_LEGAL_APPROVED: "false" }), () => setEnv(LIVE));
  await expect("not_assigned", () => D!.sql`update pt_leads set assigned_to = ${rep2.id} where id = ${lead.id}`, () => D!.sql`update pt_leads set assigned_to = ${rep.id} where id = ${lead.id}`);
  await expect("blocked", () => D!.sql`insert into pt_blocks (kind, value_hash, reason) values ('phone', ${phone.blockHash("phone", lead.phone!)}, 'admin_block')`, () => D!.sql`delete from pt_blocks where value_hash = ${phone.blockHash("phone", lead.phone!)}`);
  await expect("dnc_unavailable", () => dnc.setDncAdapter(null), () => dnc.setDncAdapter(ok.dnc));
  // Requirement switched off in Settings: no source is fine, but a number a connected source lists is still refused.
  setEnv({ PT_CALLERS_DNC_REQUIRED: "false" });
  dnc.setDncAdapter(null);
  assert.deepEqual(await svc!.predialCheck(rep, lead.id), { ok: true });
  dnc.setDncAdapter(async () => ({ status: "listed" }));
  assert.deepEqual(await svc!.predialCheck(rep, lead.id), { ok: false, reason: "dnc_listed" });
  setEnv({ PT_CALLERS_DNC_REQUIRED: undefined });
  dnc.setDncAdapter(ok.dnc);
  await expect("dnc_listed", () => dnc.setDncAdapter(async () => ({ status: "listed" })), () => dnc.setDncAdapter(ok.dnc));
  await expect("not_pt_number", () => D!.sql`update pt_leads set phone = '+34612345678' where id = ${lead.id}`, () => D!.sql`update pt_leads set phone = ${lead.phone!} where id = ${lead.id}`);
  await expect("no_legal_basis", () => D!.sql`update pt_leads set legal_basis = null where id = ${lead.id}`, () => D!.sql`update pt_leads set legal_basis = 'test basis' where id = ${lead.id}`);
  // Requirement switched off in Settings: no legal basis is fine.
  await D!.sql`update pt_leads set legal_basis = null where id = ${lead.id}`;
  setEnv({ PT_CALLERS_LEGAL_BASIS_REQUIRED: "false" });
  assert.deepEqual(await svc!.predialCheck(rep, lead.id), { ok: true });
  const [fresh] = await D!.db.insert(D!.schema.ptLeads).values({ apolloPersonId: `nb-${RUN}-${Math.random()}`, firstName: "Nb", phone: "+351912345111", status: "new", retentionUntil: new Date(Date.now() + 90 * 86400_000) }).returning();
  assert.equal((await svc!.classifyLead(admin, fresh.id, { numberClass: "business", legalBasis: "" })).ok, true);
  assert.equal((await leadRow(fresh.id)).status, "ready");
  setEnv({ PT_CALLERS_LEGAL_BASIS_REQUIRED: undefined });
  const [fresh2] = await D!.db.insert(D!.schema.ptLeads).values({ apolloPersonId: `nb2-${RUN}-${Math.random()}`, firstName: "Nb", phone: "+351912345112", status: "new", retentionUntil: new Date(Date.now() + 90 * 86400_000) }).returning();
  await svc!.classifyLead(admin, fresh2.id, { numberClass: "business", legalBasis: "" });
  assert.equal((await leadRow(fresh2.id)).status, "new"); // required (default): not ready without a basis
  await D!.sql`update pt_leads set legal_basis = 'test basis' where id = ${lead.id}`;
  await expect("not_business_number", () => D!.sql`update pt_leads set number_class = 'unknown' where id = ${lead.id}`, () => D!.sql`update pt_leads set number_class = 'business' where id = ${lead.id}`);
  await expect("outside_call_hours", () => setEnv({ PT_CALLERS_CALL_HOURS: undefined }), () => setEnv(LIVE));
  await expect("not_in_pilot_list", () => setEnv({ PT_CALLERS_PILOT_COMPLETE: undefined, PT_CALLERS_PILOT_NUMBERS: "+351910000000" }), () => setEnv(LIVE));
  await expect("not_in_pilot_list", () => setEnv({ PT_CALLERS_PILOT_COMPLETE: undefined }), () => setEnv(LIVE)); // no pilot list = no dial
  await expect("call_cap", () => setEnv({ PT_CALLERS_DAILY_CALL_CAP: undefined }), () => setEnv(LIVE));
  await expect("locked_by_other", () => D!.sql`update pt_leads set locked_by = ${rep2.id}, lock_until = now() + interval '10 minutes' where id = ${lead.id}`, () => D!.sql`update pt_leads set locked_by = null, lock_until = null where id = ${lead.id}`);
  await expect("demo_lead", () => D!.sql`update pt_leads set demo = true where id = ${lead.id}`, () => D!.sql`update pt_leads set demo = false where id = ${lead.id}`);
  assert.deepEqual(await svc!.predialCheck(rep, lead.id), { ok: true });
  dnc.setDncAdapter(null);
});

dbTest("dial: one rep per lead (lock), rep leg first through #4's phone, no AMD, no recording; call end releases", async () => {
  setEnv({ ...LIVE, HUMAN_CALL_RECORDING: "1" });
  dnc.setDncAdapter(async () => ({ status: "clear" }));
  const lead = await readyLead(rep, 6);
  await D!.sql`update pt_leads set assigned_to = ${rep.id} where id = ${lead.id}`;
  const n = telnyxCalls.length;
  const d = await svc!.dial(rep, lead.id);
  assert.equal(d.ok, true, JSON.stringify(d));
  assert.equal((await leadRow(lead.id)).status, "calling");
  assert.equal((await leadRow(lead.id)).locked_by, rep.id);
  // The same lead, a second rep (even if reassigned meanwhile): refused by the lock.
  await D!.sql`update pt_leads set assigned_to = ${rep2.id} where id = ${lead.id}`;
  const d2 = await svc!.dial(rep2, lead.id);
  assert.equal(d2.ok, false);
  await D!.sql`update pt_leads set assigned_to = ${rep.id} where id = ${lead.id}`;
  const rep1Dial = telnyxCalls.slice(n).filter((c) => c.path === "/calls");
  assert.equal(rep1Dial.length, 1);
  assert.match(String(rep1Dial[0].body.to), /^sip:/); // the rep's browser first, never the lead
  const hc = await import("../src/lib/human-calls");
  const callId = d.callId!;
  const repCc = `cc-hc-rep-${callId}`;
  await hc.handleHumanCallEvent({ event_type: "call.answered", payload: { call_control_id: repCc } });
  const cust = telnyxCalls.slice(n).filter((c) => c.path === "/calls" && !String(c.body.to).startsWith("sip:"));
  assert.equal(cust.length, 1);
  assert.equal(cust[0].body.to, lead.phone);
  assert.equal("answering_machine_detection" in cust[0].body, false);
  const custCc = `cc-hc-cust-${callId}`;
  await hc.handleHumanCallEvent({ event_type: "call.bridged", payload: { call_control_id: custCc } });
  assert.equal(telnyxCalls.slice(n).some((c) => c.path.endsWith("/record_start")), false); // never recorded
  await D!.sql`update human_calls set bridged_at = now() - interval '1 minute' where id = ${callId}`;
  await hc.handleHumanCallEvent({ event_type: "call.hangup", payload: { call_control_id: repCc, hangup_cause: "normal_clearing" } });
  const after = await leadRow(lead.id);
  assert.equal(after.locked_by, null);
  assert.equal(after.status, "ready"); // back to what it was; the rep records the business outcome
  assert.equal(after.attempts, 1);
  assert.equal((await svc!.setOutcome(rep, lead.id, { status: "callback", callbackAt: new Date(Date.now() + 86400_000).toISOString(), note: "Ligar amanhã" })).ok, true);
  assert.equal((await leadRow(lead.id)).status, "callback");
  dnc.setDncAdapter(null);
});

dbTest("dialer: call summary + history per lead; voicemail auto-hangup only when the setting says so", async () => {
  setEnv(LIVE);
  dnc.setDncAdapter(async () => ({ status: "clear" }));
  const hc = await import("../src/lib/human-calls");
  const lead = await readyLead(rep, 9);
  const d = await svc!.dial(rep, lead.id);
  assert.equal(d.ok, true, JSON.stringify(d));
  const callId = d.callId!;
  await hc.handleHumanCallEvent({ event_type: "call.answered", payload: { call_control_id: `cc-hc-rep-${callId}` } });
  await hc.handleHumanCallEvent({ event_type: "call.hangup", payload: { call_control_id: `cc-hc-rep-${callId}`, hangup_cause: "normal_clearing" } });
  // Summary written in the dialer: linked to this call, visible in the lead's history; another rep sees nothing.
  assert.equal((await svc!.setOutcome(rep, lead.id, { status: "voicemail", note: "Deixei recado.", callId })).ok, true);
  assert.equal((await leadRow(lead.id)).status, "no_answer");
  const h = await svc!.callHistory(rep, lead.id);
  assert.equal(h.ok, true);
  assert.equal(h.calls![0].outcome, "voicemail");
  assert.equal(h.calls![0].note, "Deixei recado.");
  assert.equal((await svc!.callHistory(rep2, lead.id)).ok, false);
  assert.equal((await svc!.callHistory(admin, lead.id)).ok, true);
  assert.equal((await svc!.setOutcome(rep, lead.id, { status: "made_up" })).ok, false);

  // "hangup" mode: detection is on for the lead's leg, a machine verdict ends both legs and logs a voicemail.
  setEnv({ ...LIVE, PT_CALLERS_VOICEMAIL: "hangup" });
  const lead2 = await readyLead(rep, 10);
  const n = telnyxCalls.length;
  const d2 = await svc!.dial(rep, lead2.id);
  assert.equal(d2.ok, true);
  await hc.handleHumanCallEvent({ event_type: "call.answered", payload: { call_control_id: `cc-hc-rep-${d2.callId}` } });
  const cust = telnyxCalls.slice(n).find((c) => c.path === "/calls" && !String(c.body.to).startsWith("sip:"));
  assert.ok(cust && "answering_machine_detection" in cust.body);
  await hc.handleHumanCallEvent({ event_type: "call.machine.premium.detection.ended", payload: { call_control_id: `cc-hc-cust-${d2.callId}`, result: "machine" } });
  assert.ok(telnyxCalls.slice(n).filter((c) => c.path.endsWith("/hangup")).length >= 1);
  await hc.handleHumanCallEvent({ event_type: "call.hangup", payload: { call_control_id: `cc-hc-rep-${d2.callId}`, hangup_cause: "normal_clearing" } });
  assert.equal((await leadRow(lead2.id)).status, "no_answer");
  assert.equal((await svc!.callHistory(rep, lead2.id)).calls![0].outcome, "voicemail");
  setEnv({ PT_CALLERS_VOICEMAIL: undefined });
  dnc.setDncAdapter(null);
});

dbTest("hand-added leads and free dialing: Portuguese numbers only, no duplicates, opt-outs refused; admins only", async () => {
  setEnv(offEnv);
  await assert.rejects(svc!.addManualLead(rep as never, { firstName: "X", phone: "+351912000000" }), /forbidden/);
  await assert.rejects(svc!.leadForNumber(rep as never, "+351912000000"), /forbidden/);
  const num = `+3519${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
  assert.equal((await svc!.addManualLead(admin, { firstName: "", phone: num })).ok, false);
  assert.equal((await svc!.addManualLead(admin, { firstName: "Ana", phone: "+34612345678" })).ok, false);
  assert.equal((await svc!.addManualLead(admin, { firstName: "Ana", phone: num, email: "nope" })).ok, false);
  const a = await svc!.addManualLead(admin, { firstName: "Ana", lastName: "Costa", phone: num.replace("+351", "") , email: "Ana@Empresa.pt" });
  assert.equal(a.ok, true);
  const row = await leadRow(a.id!);
  assert.equal(row.phone, num);
  assert.equal(row.demo, false);
  assert.equal(row.source, "manual");
  assert.ok(row.approved_at);
  assert.equal(row.email, "ana@empresa.pt");
  assert.equal((await svc!.addManualLead(admin, { firstName: "Ana", phone: num })).ok, false); // duplicate number
  // Free dialing finds the existing lead; a new number becomes a lead; an opted-out number is refused.
  assert.deepEqual(await svc!.leadForNumber(admin, num), { ok: true, id: a.id, name: "Ana Costa" });
  const other = `+3512${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
  const f = await svc!.leadForNumber(admin, other);
  assert.equal(f.ok, true);
  assert.equal((await leadRow(f.id!)).phone, other);
  await svc!.optOut(admin, f.id!);
  assert.equal((await svc!.leadForNumber(admin, other)).ok, false);
  assert.equal((await svc!.addManualLead(admin, { firstName: "Again", phone: other })).ok, false);
});

dbTest("a test number abroad: can be added and dialed only while it is in the pilot list", async () => {
  const il = `+9725${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
  setEnv({ ...LIVE, PT_CALLERS_PILOT_COMPLETE: undefined, PT_CALLERS_PILOT_NUMBERS: il, PT_CALLERS_BUSINESS_LINE_REQUIRED: "false", PT_CALLERS_LEGAL_BASIS_REQUIRED: "false", PT_CALLERS_DNC_REQUIRED: "false" });
  const f = await svc!.leadForNumber(admin, il);
  assert.equal(f.ok, true, JSON.stringify(f));
  assert.deepEqual(await svc!.predialCheck(admin, f.id!), { ok: true });
  setEnv({ PT_CALLERS_PILOT_NUMBERS: "+351910000000" });
  assert.deepEqual(await svc!.predialCheck(admin, f.id!), { ok: false, reason: "not_pt_number" });
  assert.equal((await svc!.leadForNumber(admin, "+972501234567")).ok, false);
  setEnv({ PT_CALLERS_PILOT_NUMBERS: il, PT_CALLERS_PILOT_COMPLETE: "true" });
  assert.deepEqual(await svc!.predialCheck(admin, f.id!), { ok: false, reason: "not_pt_number" });
  setEnv({ ...offEnv, PT_CALLERS_BUSINESS_LINE_REQUIRED: undefined, PT_CALLERS_LEGAL_BASIS_REQUIRED: undefined, PT_CALLERS_DNC_REQUIRED: undefined });
});

dbTest("import keeps Apollo's masked surname until the lookup brings the full one and the LinkedIn profile", async () => {
  const id = `mask-${RUN}-${Math.random()}`;
  await svc!.insertSearchResults(admin, [{ id, first_name: "Mauricio", last_name_obfuscated: "Ma***s", title: "Head of HR", organization: { name: "X" } }], { demo: false });
  const [row] = await D!.sql`select * from pt_leads where apollo_person_id = ${id}`;
  assert.equal(row.last_name, null);
  assert.equal(row.last_name_masked, "Ma***s");
});

dbTest("keypad during a call: own connected call only, digits validated, sent to the other side's leg", async () => {
  setEnv(LIVE);
  dnc.setDncAdapter(async () => ({ status: "clear" }));
  const hc = await import("../src/lib/human-calls");
  const lead = await readyLead(rep, 11);
  const d = await svc!.dial(rep, lead.id);
  assert.equal(d.ok, true);
  const me = rep as never;
  assert.equal((await hc.callDtmf(me, d.callId, "1")).status, 409); // not connected yet
  await hc.handleHumanCallEvent({ event_type: "call.answered", payload: { call_control_id: `cc-hc-rep-${d.callId}` } });
  await hc.handleHumanCallEvent({ event_type: "call.bridged", payload: { call_control_id: `cc-hc-cust-${d.callId}` } });
  assert.equal((await hc.callDtmf(me, d.callId, "1; drop")).status, 400);
  assert.equal((await hc.callDtmf(rep2 as never, d.callId, "1")).status, 404);
  const n = telnyxCalls.length;
  assert.equal((await hc.callDtmf(me, d.callId, "1#")).status, 200);
  const sent = telnyxCalls.slice(n).find((c) => c.path.endsWith("/send_dtmf"));
  assert.ok(sent);
  assert.match(sent!.path, new RegExp(`cc-hc-cust-${d.callId}`));
  assert.equal(sent!.body.digits, "1#");
  await D!.sql`update human_calls set bridged_at = now() - interval '1 minute' where id = ${d.callId!}`;
  await hc.handleHumanCallEvent({ event_type: "call.hangup", payload: { call_control_id: `cc-hc-rep-${d.callId}`, hangup_cause: "normal_clearing" } });
  dnc.setDncAdapter(null);
});

dbTest("lock: a double click or two tabs start one call; an expired lock frees a stuck lead", async () => {
  setEnv(LIVE);
  dnc.setDncAdapter(async () => ({ status: "clear" }));
  const lead = await readyLead(rep, 8);
  const [a, b] = await Promise.all([svc!.dial(rep, lead.id), svc!.dial(rep, lead.id)]);
  assert.equal([a, b].filter((x) => x.ok).length, 1, JSON.stringify([a, b]));
  // The call-end event never arrives: while the lock is live the lead cannot be dialed again...
  const callId = (a.ok ? a : b).callId!;
  await D!.sql`update human_calls set status = 'completed', ended_at = now() where id = ${callId}`; // free the rep's line
  assert.equal((await svc!.dial(rep, lead.id)).ok, false);
  // ...and once the lock has expired it can, from the status it had before the stuck call.
  await D!.sql`update pt_leads set lock_until = now() - interval '1 minute' where id = ${lead.id}`;
  const again = await svc!.dial(rep, lead.id);
  assert.equal(again.ok, true, JSON.stringify(again));
  assert.equal((await leadRow(lead.id)).status_before_call, "ready");
  await D!.sql`update human_calls set status = 'completed', ended_at = now() where id = ${again.callId!}`;
  dnc.setDncAdapter(null);
});

dbTest("opt-out while another rep has the card open stops the customer leg (recheck before the lead's phone rings)", async () => {
  setEnv(LIVE);
  dnc.setDncAdapter(async () => ({ status: "clear" }));
  const lead = await readyLead(rep, 7);
  const d = await svc!.dial(rep, lead.id);
  assert.equal(d.ok, true, JSON.stringify(d));
  // An admin blocks the lead while the rep's browser is still ringing.
  assert.equal((await svc!.optOut(admin, lead.id)).ok, true);
  const n = telnyxCalls.length;
  const hc = await import("../src/lib/human-calls");
  await hc.handleHumanCallEvent({ event_type: "call.answered", payload: { call_control_id: `cc-hc-rep-${d.callId}` } });
  assert.equal(telnyxCalls.slice(n).filter((c) => c.path === "/calls").length, 0); // the lead is never dialed
  assert.ok(telnyxCalls.slice(n).some((c) => c.path.endsWith("/hangup")));
  assert.equal((await D!.sql`select status from human_calls where id = ${d.callId!}`)[0].status, "failed");
  assert.equal((await leadRow(lead.id)).status, "opt_out");
  dnc.setDncAdapter(null);
});

dbTest("middleware: a signed-in sales rep gets 403 on admin pages and APIs, passes on their own routes", async () => {
  const { middleware } = await import("../src/middleware");
  const { makeToken } = await import("../src/lib/session-token");
  const { NextRequest } = await import("next/server");
  const [r] = await D!.sql`select session_version from admin_users where id = ${rep.id}`;
  const cookie = `wp_admin=${makeToken(rep.id, Date.now(), r.session_version)}`;
  const at = (method: string, path: string) => middleware(new NextRequest(`https://wine.test${path}`, { method, headers: { cookie } }));
  for (const p of ["/admin", "/admin/orders", "/admin/settings", "/admin/export/leads", "/admin/calls/start", "/admin/pt-callers/api/admin/import", "/api/checkout"]) {
    assert.equal((await at(p === "/admin/calls/start" ? "POST" : "GET", p)).status, 403, p);
  }
  for (const [m, p] of [["GET", "/admin/pt-callers"], ["POST", "/admin/pt-callers/api/rep/dial"], ["POST", "/admin/calls/webrtc-token"]]) {
    assert.notEqual((await at(m, p)).status, 403, p);
  }
  // An admin's cookie is not touched.
  const [a] = await D!.sql`select session_version from admin_users where id = ${admin.id}`;
  const adminRes = await middleware(new NextRequest("https://wine.test/admin/orders", { headers: { cookie: `wp_admin=${makeToken(admin.id, Date.now(), a.session_version)}` } }));
  assert.notEqual(adminRes.status, 403);
});

dbTest("credit summary: used and remaining shown; unset caps = remaining null (no cap)", async () => {
  setEnv({ APOLLO_DAILY_CREDIT_CAP: undefined, APOLLO_MONTHLY_CREDIT_CAP: undefined });
  const s = await svc!.creditSummary(admin);
  assert.equal(typeof s.real.today, "number");
  assert.equal(s.real.remaining.daily, null);
  setEnv({ APOLLO_MONTHLY_CREDIT_CAP: "500" });
  const s2 = await svc!.creditSummary(admin);
  assert.equal(s2.real.remaining.monthly, 500 - s2.real.month);
  setEnv({ APOLLO_MONTHLY_CREDIT_CAP: undefined });
  await assert.rejects(svc!.creditSummary(rep as never), /forbidden/);
});

dbTest("approve & get phones: one call approves and sends the lookup in batches of 10; more than 50 approves nothing", async () => {
  setEnv({ ...offEnv, PT_CALLERS_APOLLO_RESULT_MODE: undefined });
  const mk = async () => (await D!.db.insert(D!.schema.ptLeads).values({ apolloPersonId: `ae-${RUN}-${Math.random()}`, firstName: "Inês", title: "HR Manager", company: "Y", status: "new", demo: true, retentionUntil: new Date(Date.now() + 90 * 86400_000) }).returning())[0];
  assert.match(why(await svc!.approveAndEnrich(rep, [1])), /assigned to you/);
  const many = await Promise.all(Array.from({ length: 51 }, mk));
  const tooMany = await svc!.approveAndEnrich(admin, many.map((l) => l.id));
  assert.equal(tooMany.ok, false);
  assert.equal((await D!.sql`select 1 from pt_leads where id = any(${many.map((l) => l.id)}) and approved_at is not null`).length, 0);
  // 23 leads: three Apollo requests (10 + 10 + 3), every lead pending.
  const batch = many.slice(0, 23).map((l) => l.id);
  const b = await svc!.approveAndEnrich(admin, batch);
  assert.equal(b.ok, true);
  assert.equal(b.sent, 23);
  assert.equal(b.batches, 3);
  assert.equal((await D!.sql`select distinct request_id from pt_enrichment_items where lead_id = any(${batch})`).length, 3);
  assert.equal((await D!.sql`select 1 from pt_leads where id = any(${batch}) and status = 'enrichment_pending'`).length, 23);
  const one = await mk();
  const r = await svc!.approveAndEnrich(admin, [one.id]);
  assert.equal(r.ok, true);
  const row = await leadRow(one.id);
  assert.ok(row.approved_at);
  assert.equal(row.status, "enrichment_pending");
});

dbTest("business-line check off: phone arrives ready; unknown number class may be dialed", async () => {
  setEnv({ ...offEnv, PT_CALLERS_BUSINESS_LINE_REQUIRED: "false", PT_CALLERS_LEGAL_BASIS_REQUIRED: "false" });
  const { lead, r } = await enrichOne("webhook");
  // The mock's immediate answer carries the full surname and the work e-mail.
  const after = await leadRow(lead.id);
  assert.ok(after.last_name);
  assert.match(after.email, /@exemplo\.invalid$/);
  await svc!.handleApolloWebhook(r.requestId!, r.testSecret!, JSON.stringify({ people: [{ id: lead.apolloPersonId, phone_numbers: [{ sanitized_number: "+351912000077", type_cd: "mobile" }] }] }));
  assert.equal((await leadRow(lead.id)).status, "ready");
  const l = await readyLead(rep, 77);
  await D!.sql`update pt_leads set number_class = 'unknown', legal_basis = null where id = ${l.id}`;
  setEnv({ ...LIVE, PT_CALLERS_BUSINESS_LINE_REQUIRED: "false", PT_CALLERS_LEGAL_BASIS_REQUIRED: "false", PT_CALLERS_DNC_REQUIRED: "false" });
  assert.deepEqual(await svc!.predialCheck(rep, l.id), { ok: true });
  setEnv({ PT_CALLERS_BUSINESS_LINE_REQUIRED: undefined });
  assert.deepEqual(await svc!.predialCheck(rep, l.id), { ok: false, reason: "not_business_number" });
  setEnv({ ...offEnv, PT_CALLERS_LEGAL_BASIS_REQUIRED: undefined, PT_CALLERS_DNC_REQUIRED: undefined });
});

dbTest("admin calls from the admin screen: takes an unassigned lead, never a rep's lead; same gates", async () => {
  setEnv({ ...LIVE, PT_CALLERS_BUSINESS_LINE_REQUIRED: "false", PT_CALLERS_LEGAL_BASIS_REQUIRED: "false", PT_CALLERS_DNC_REQUIRED: "false" });
  const [mine] = await D!.db.insert(D!.schema.ptLeads).values({ apolloPersonId: `adm-${RUN}-${Math.random()}`, firstName: "Rui", phone: `+3519${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`, status: "new", approvedAt: new Date(), retentionUntil: new Date(Date.now() + 90 * 86400_000) }).returning();
  assert.deepEqual(await svc!.predialCheck(admin, mine.id), { ok: true });
  const row = await leadRow(mine.id);
  assert.equal(row.assigned_to, admin.id);
  assert.equal(row.status, "ready");
  const repLead = await readyLead(rep, 78);
  assert.deepEqual(await svc!.predialCheck(admin, repLead.id), { ok: false, reason: "not_assigned" });
  assert.equal((await leadRow(repLead.id)).assigned_to, rep.id);
  // With the business-line check on, the admin's lead waits for "Prepare" like any other.
  setEnv({ PT_CALLERS_BUSINESS_LINE_REQUIRED: undefined });
  const [other] = await D!.db.insert(D!.schema.ptLeads).values({ apolloPersonId: `adm2-${RUN}-${Math.random()}`, firstName: "Rui", phone: "+351912345678", status: "new", approvedAt: new Date(), retentionUntil: new Date(Date.now() + 90 * 86400_000) }).returning();
  assert.deepEqual(await svc!.predialCheck(admin, other.id), { ok: false, reason: "bad_status" });
  setEnv({ ...offEnv, PT_CALLERS_LEGAL_BASIS_REQUIRED: undefined, PT_CALLERS_DNC_REQUIRED: undefined });
});

dbTest("surname & e-mail lookup and the offer e-mail: admins, or a rep on her own lead; blocked, demo and no-address leads refused", async () => {
  setEnv(offEnv);
  assert.match(why(await svc!.fetchDetails(rep, [1])), /assigned to you/);
  assert.match(why(await svc!.sendOffer(rep, 1, { subject: "s", body: "b" })), /assigned to you/);
  const [l] = await D!.db.insert(D!.schema.ptLeads).values({ apolloPersonId: `det-${RUN}-${Math.random()}`, firstName: "Marta", status: "new", demo: true, approvedAt: new Date(), retentionUntil: new Date(Date.now() + 90 * 86400_000) }).returning();
  assert.equal((await svc!.fetchDetails(admin, Array.from({ length: 11 }, () => l.id).map((x, i) => x + i))).ok, false);
  const d = await svc!.fetchDetails(admin, [l.id]);
  assert.equal(d.ok, true);
  const row = await leadRow(l.id);
  assert.ok(row.last_name && row.email);
  assert.equal((await svc!.sendOffer(admin, l.id, { subject: "s", body: "b" })).reason, "Demo lead: no e-mail is sent.");
  await D!.sql`update pt_leads set demo = false where id = ${l.id}`;
  assert.equal((await svc!.sendOffer(admin, l.id, { subject: " ", body: "b" })).ok, false);
  const saved = { from: process.env.EMAIL_FROM };
  delete process.env.EMAIL_FROM;
  const r = await svc!.sendOffer(admin, l.id, { subject: "Proposta", body: "Olá" });
  assert.equal(r.ok, false);
  assert.match(r.reason!, /not set up/);
  if (saved.from) process.env.EMAIL_FROM = saved.from;
  await D!.sql`update pt_leads set email = null where id = ${l.id}`;
  assert.equal((await svc!.sendOffer(admin, l.id, { subject: "s", body: "b" })).ok, false);
  await D!.sql`update pt_leads set status = 'opt_out', email = 'x@y.pt' where id = ${l.id}`;
  assert.match((await svc!.sendOffer(admin, l.id, { subject: "s", body: "b" })).reason!, /not to be contacted/);
  assert.equal((await svc!.fetchDetails(admin, [l.id])).ok, false);
});

// Last on purpose: it removes every demo row, including the ones the tests above created.
dbTest("demo clean-up: removes demo leads, demo lookups and demo credit rows; real leads stay; admins only", async () => {
  await assert.rejects(svc!.purgeDemo(rep as never), /forbidden/);
  const { lead: demoLead, r } = await enrichOne("webhook");
  assert.equal(r.ok, true);
  const [real] = await D!.db.insert(D!.schema.ptLeads).values({ apolloPersonId: `real-${RUN}-${Math.random()}`, firstName: "Joana", title: "HR Manager", company: "Real Lda", status: "new", demo: false, retentionUntil: new Date(Date.now() + 90 * 86400_000) }).returning();
  const out = await svc!.purgeDemo(admin);
  assert.equal(out.ok, true);
  assert.ok(out.leads >= 1 && out.requests >= 1);
  assert.equal((await D!.sql`select 1 from pt_leads where demo = true`).length, 0);
  assert.equal((await D!.sql`select 1 from pt_leads where id = ${demoLead.id}`).length, 0);
  assert.equal((await D!.sql`select 1 from pt_enrichment_requests where demo = true`).length, 0);
  assert.equal((await D!.sql`select 1 from pt_credit_ledger where demo = true`).length, 0);
  assert.equal((await D!.sql`select 1 from pt_leads where id = ${real.id}`).length, 1);
  assert.ok((await D!.sql`select 1 from pt_access_log where action = 'purge_demo' and admin_id = ${admin.id}`).length > 0);
});

dbTest("delete: admins only; the lead and its calls go, the audit stays detached; an opted-out number stays blocked", async () => {
  setEnv(offEnv);
  const num = `+3519${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
  const a = await svc!.addManualLead(admin, { firstName: "Del", phone: num });
  await assert.rejects(svc!.deleteLeads(rep as never, [a.id!]), /forbidden/);
  await svc!.optOut(admin, a.id!);
  assert.deepEqual(await svc!.deleteLeads(admin, [a.id!]), { ok: true, count: 1, skipped: 0 });
  assert.equal(await leadRow(a.id!), undefined);
  assert.equal((await svc!.addManualLead(admin, { firstName: "Again", phone: num })).ok, false); // the block outlives the lead
  assert.equal((await svc!.deleteLeads(admin, [])).ok, false);
});

dbTest("lead split: reps taking leads at the same time never get the same one; a rep works only her own; admin splits evenly", async () => {
  setEnv(offEnv);
  // Keep the pool to this test's leads: park every other unassigned lead on the admin for the duration.
  const parked = (await D!.sql`update pt_leads set assigned_to = ${admin.id} where assigned_to is null returning id`).map((r) => r.id as number);
  try {
    const mk = async () => (await D!.db.insert(D!.schema.ptLeads).values({ apolloPersonId: `split-${RUN}-${Math.random()}`, firstName: "Rita", status: "new", demo: true, retentionUntil: new Date(Date.now() + 90 * 86400_000) }).returning())[0];
    const pool = await Promise.all(Array.from({ length: 30 }, mk));
    const ids = pool.map((l) => l.id);
    const [a, b] = await Promise.all([svc!.claimLeads(rep, 20), svc!.claimLeads(rep2, 20)]);
    assert.equal(a.count + b.count, 30);
    const rows = await D!.sql`select assigned_to, count(*)::int n from pt_leads where id = any(${ids}) group by assigned_to`;
    assert.deepEqual(rows.map((r) => r.assigned_to).sort(), [rep.id, rep2.id].sort());
    assert.equal(rows.reduce((t, r) => t + (r.n as number), 0), 30);
    // Nothing left to take.
    assert.equal((await svc!.claimLeads(rep, 5)).count, 0);
    await assert.rejects(svc!.claimLeads(admin as never, 5), /forbidden/);
    // A rep acts on her own lead, never on the other rep's.
    const [mine] = await D!.sql`select id from pt_leads where id = any(${ids}) and assigned_to = ${rep.id} limit 1`;
    const [theirs] = await D!.sql`select id from pt_leads where id = any(${ids}) and assigned_to = ${rep2.id} limit 1`;
    assert.equal((await svc!.approveLeads(rep, [mine.id as number])).ok, true);
    assert.match(why(await svc!.approveLeads(rep, [mine.id as number, theirs.id as number])), /assigned to you/);
    // Admin split: back to nobody, then round robin over the active reps.
    await D!.sql`update pt_leads set assigned_to = null where id = any(${ids})`;
    await assert.rejects(svc!.distributeLeads(rep as never, []), /forbidden/);
    const d = await svc!.distributeLeads(admin, []);
    assert.equal(d.ok, true);
    const per = await D!.sql`select assigned_to, count(*)::int n from pt_leads where id = any(${ids}) group by assigned_to`;
    assert.ok(per.every((r) => r.assigned_to !== null));
    const counts = per.map((r) => r.n as number);
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, JSON.stringify(per));
  } finally {
    if (parked.length) await D!.sql`update pt_leads set assigned_to = null where id = any(${parked})`;
  }
});

dbTest("inbox: a sales rep sees and writes only her own leads' e-mails; staff see everything; incoming and sent lists", async () => {
  const inbox = await import("../src/lib/inbox");
  const mine = `mine-${RUN}@empresa.pt`, theirs = `theirs-${RUN}@empresa.pt`;
  const mk = (email: string, assignedTo: number) => D!.db.insert(D!.schema.ptLeads).values({ apolloPersonId: `ib-${RUN}-${Math.random()}`, firstName: "Ana", email, assignedTo, status: "new", demo: true, retentionUntil: new Date(Date.now() + 90 * 86400_000) });
  await mk(mine.toUpperCase(), rep.id);
  await mk(theirs, rep2.id);
  const M = D!.schema.inboxMessages;
  await D!.db.insert(M).values([
    { direction: "in", kind: "received", contact: mine, fromAddr: mine, toAddrs: ["shop@x.pt"], subject: "Olá", status: "ok" },
    { direction: "out", kind: "pt_offer", contact: mine, fromAddr: "shop@x.pt", toAddrs: [mine], subject: "Oferta", status: "ok", readAt: new Date() },
    { direction: "in", kind: "received", contact: theirs, fromAddr: theirs, toAddrs: ["shop@x.pt"], subject: "Bom dia", status: "ok" },
  ]);
  const scope = await inbox.inboxScope(rep);
  assert.deepEqual(scope, [mine]); // lower-cased
  assert.equal(await inbox.inboxScope(admin), null);
  assert.ok(inbox.inScope(scope, mine.toUpperCase()));
  assert.equal(inbox.inScope(scope, theirs), false);
  assert.equal(inbox.inScope(null, theirs), true);
  const conv = await inbox.conversations("all", 200, scope);
  assert.deepEqual(conv.map((c) => c.contact), [mine]);
  assert.ok((await inbox.conversations("all", 500, null)).some((c) => c.contact === theirs));
  assert.equal(await inbox.unreadCount(scope), 1);
  assert.deepEqual((await inbox.messageList("in", 200, scope)).map((m) => m.subject), ["Olá"]);
  assert.deepEqual((await inbox.messageList("out", 200, scope)).map((m) => m.subject), ["Oferta"]);
  assert.deepEqual(await inbox.conversations("all", 200, []), []);
  assert.equal(await inbox.unreadCount([]), 0);
  assert.equal(inbox.contactHref("a.b+c@x.pt"), "/admin/inbox/a.b+c@x.pt");
  assert.equal(access.ptCallerAllowed("GET", inbox.contactHref(mine)), true);
});
