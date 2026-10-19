// Admin → customer phone calls (Telnyx WebRTC + Call Control).
// Pure helpers always run. The end-to-end flow needs a Postgres with the migrations applied:
//   HUMAN_CALLS_DB_URL=postgres://... npm test
// It runs the real store, start/state logic and webhook state machine against an in-process fake Telnyx API.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { once } from "node:events";

const DB_URL = process.env.HUMAN_CALLS_DB_URL;
if (DB_URL) process.env.DATABASE_URL = DB_URL;

const tcc = await import("../src/lib/telnyx-call-control");

// --- Pure helpers ---------------------------------------------------------------------------------------------------

const jwt = (exp: number) => `${Buffer.from('{"alg":"none"}').toString("base64url")}.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.sig`;

test("credential token: raw JWT body, JSON string or envelope; junk refused", () => {
  const t = jwt(2_000_000_000);
  assert.equal(tcc.extractCredentialToken(t), t);
  assert.equal(tcc.extractCredentialToken(`"${t}"`), t);
  assert.equal(tcc.extractCredentialToken(JSON.stringify({ data: { token: t } })), t);
  assert.equal(tcc.extractCredentialToken('{"errors":[{"code":"10015"}]}'), "");
  assert.equal(tcc.extractCredentialToken("<html>oops</html>"), "");
  assert.equal(tcc.extractCredentialToken("two words"), "");
  assert.equal(tcc.tokenExpiresInSecs(jwt(1000), 400_000), 600);
  assert.equal(tcc.tokenExpiresInSecs("not-a-jwt"), null);
});

test("SIP URI: host is always ours, user part validated", () => {
  assert.equal(tcc.repSipUri("gencred123"), "sip:gencred123@sip.telnyx.com");
  assert.throws(() => tcc.repSipUri("attacker@evil.example"));
  assert.throws(() => tcc.repSipUri("sip:x"));
});

test("client_state round trip; unknown leg = customer; garbage = null", () => {
  assert.deepEqual(tcc.decodeClientState(tcc.encodeClientState("hc_1", "rep")), { humanCallId: "hc_1", leg: "rep" });
  assert.deepEqual(tcc.decodeClientState(Buffer.from('{"humanCallId":"hc_2"}').toString("base64")), { humanCallId: "hc_2", leg: "customer" });
  assert.equal(tcc.decodeClientState("@@@"), null);
  assert.equal(tcc.decodeClientState(Buffer.from('{"x":1}').toString("base64")), null);
});

test("status per event: only call.bridged connects; hangup causes; terminal never moves", () => {
  const s = tcc.statusForEvent;
  assert.equal(s("call.initiated", {}, "rep", "dialing", false, false), "rep_ringing");
  assert.equal(s("call.initiated", {}, "customer", "customer_dialing", true, false), null);
  assert.equal(s("call.answered", {}, "rep", "rep_ringing", false, false), "rep_answered");
  assert.equal(s("call.answered", {}, "customer", "customer_dialing", true, false), null);
  assert.equal(s("call.bridged", {}, "customer", "customer_dialing", true, false), "bridged");
  assert.equal(s("call.hangup", {}, "rep", "bridged", true, true), "completed");
  assert.equal(s("call.hangup", {}, "rep", "rep_ringing", false, false), "rep_no_answer");
  assert.equal(s("call.hangup", {}, "rep", "customer_dialing", true, false), "canceled");
  assert.equal(s("call.hangup", { hangup_cause: "user_busy" }, "customer", "customer_dialing", true, false), "busy");
  assert.equal(s("call.hangup", { hangup_cause: "normal_clearing" }, "customer", "customer_dialing", true, false), "no_answer");
  assert.equal(s("call.bridged", {}, "customer", "completed", true, true), null);
});

test("machine verdict: ambiguous is neither", () => {
  assert.deepEqual(tcc.machineVerdict("call.machine.premium.detection.ended", { result: "machine_end_beep" }), { result: "machine_end_beep", isMachine: true, isHuman: false });
  assert.deepEqual(tcc.machineVerdict("call.machine.premium.detection.ended", { result: "not_sure" }), { result: "not_sure", isMachine: false, isHuman: false });
  assert.equal(tcc.machineVerdict("call.answered", {}), null);
});

test("ringback is a valid 8 kHz 8-bit mono WAV, one 6 s cycle", () => {
  const w = tcc.ringbackWav();
  assert.equal(w.subarray(0, 4).toString(), "RIFF");
  assert.equal(w.subarray(8, 16).toString(), "WAVEfmt ");
  assert.equal(w.readUInt32LE(24), 8000);
  assert.equal(w.readUInt16LE(34), 8);
  assert.equal(w.readUInt32LE(40), 8000 * 6);
});

// --- End to end against Postgres + fake Telnyx ----------------------------------------------------------------------

type Req = { method: string; path: string; body: Record<string, unknown> };
const reqs: Req[] = [];
const fake = { failRepDial: false, hangupStatus: 200, credentials: 0 };
const RUN = Date.now().toString(36); // fake credential names unique per run (the DB may be reused)
let server: Server;

const env = {
  TELNYX_API_KEY: "KEY_test",
  TELNYX_WEBRTC_CONNECTION_ID: "cred-conn",
  TELNYX_CONNECTION_ID: "cc-app",
  TELNYX_FROM_NUMBER: "+351210000000",
  SITE_URL: "https://wine.test",
  TELNYX_PUBLIC_KEY: "dGVzdA==",
  HUMAN_CALL_RECORDING: "1",
};

const db = DB_URL ? await import("../src/db") : null;
const hc = DB_URL ? await import("../src/lib/human-calls") : null;
const admin = { id: 0, email: "caller@wine.test", role: "admin" as const, mustChangePassword: false };
let leadId = 0;
let noConsentLead = 0;

before(async () => {
  if (!db) return;
  server = createServer(async (req, res) => {
    let raw = "";
    for await (const c of req) raw += c;
    const path = (req.url ?? "").replace(/^\/v2/, "");
    const body = raw ? JSON.parse(raw) : {};
    reqs.push({ method: req.method ?? "", path, body });
    const json = (status: number, j: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(j));
    };
    if (path === "/telephony_credentials" && req.method === "POST") {
      fake.credentials++;
      return json(200, { data: { id: `cred-${RUN}-${fake.credentials}`, sip_username: `gencred${RUN}x${fake.credentials}`, sip_password: "never-stored" } });
    }
    if (/^\/telephony_credentials\/[^/]+\/token$/.test(path)) {
      res.writeHead(201, { "Content-Type": "text/plain" });
      return res.end(jwt(Math.floor(Date.now() / 1000) + 86400));
    }
    if (path === "/calls" && req.method === "POST") {
      if (String(body.to).startsWith("sip:")) {
        if (fake.failRepDial) return json(422, { errors: [{ code: "90015", detail: "Invalid SIP URI" }] });
        return json(200, { data: { call_control_id: `cc-rep-${body.command_id}`, call_session_id: "sess-1" } });
      }
      return json(200, { data: { call_control_id: `cc-cust-${body.command_id}` } });
    }
    if (path.endsWith("/actions/hangup")) return json(fake.hangupStatus, fake.hangupStatus === 200 ? { data: { result: "ok" } } : { errors: [{ detail: "Call has already ended" }] });
    if (path.includes("/actions/")) return json(200, { data: { result: "ok" } });
    return json(404, { errors: [{ detail: "not found" }] });
  }).listen(0);
  await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  Object.assign(process.env, env, { TELNYX_API_BASE: `http://127.0.0.1:${port}/v2` });

  const { schema } = db;
  const stamp = Date.now();
  const [a] = await db.db.insert(schema.adminUsers).values({ email: `caller-${stamp}@wine.test`, passwordHash: "x" }).returning();
  admin.id = a.id;
  admin.email = a.email;
  const [l] = await db.db.insert(schema.leads).values({ name: "Ana", email: `ana-${stamp}@wine.test`, consentMarketing: true, consentText: "t", phone: "+351912345678", consentPhone: true }).returning();
  leadId = l.id;
  const [n] = await db.db.insert(schema.leads).values({ name: "Rui", email: `rui-${stamp}@wine.test`, consentMarketing: true, consentText: "t", phone: "+351912345679", consentPhone: false }).returning();
  noConsentLead = n.id;
});

after(async () => {
  if (!db) return;
  server.close();
  await db.sql.end();
});

const dbTest = (name: string, fn: () => Promise<void>) => test(name, { skip: !DB_URL && "HUMAN_CALLS_DB_URL not set" }, fn);
const ev = (event_type: string, payload: Record<string, unknown>) => hc!.handleHumanCallEvent({ event_type, occurred_at: new Date().toISOString(), payload });
const row = async (id: string) => (await db!.sql`select * from human_calls where id = ${id}`)[0];
const since = (n: number) => reqs.slice(n);

dbTest("webrtc token: credential created once on the WebRTC connection, password never returned", async () => {
  const r1 = await hc!.webrtcToken(admin);
  assert.equal(r1.status, 200, JSON.stringify(r1.body));
  assert.equal(r1.body.sipUsername, `gencred${RUN}x1`);
  assert.ok(typeof r1.body.token === "string" && (r1.body.expiresInSecs as number) > 80000);
  assert.ok(!JSON.stringify(r1.body).includes("never-stored"));
  const create = reqs.find((r) => r.path === "/telephony_credentials")!;
  assert.equal(create.body.connection_id, "cred-conn");
  const r2 = await hc!.webrtcToken(admin);
  assert.equal(r2.status, 200);
  assert.equal(fake.credentials, 1); // reused, only a new token
});

dbTest("full call: rep leg → answer → customer leg bridged → recording → hangup", async () => {
  let n = reqs.length;
  const s = await hc!.startCall(admin, { leadId });
  assert.equal(s.status, 200, JSON.stringify(s.body));
  assert.equal(s.body.status, "rep_ringing");
  const id = s.body.callId as string;
  const rep = since(n).filter((r) => r.path === "/calls");
  assert.equal(rep.length, 1);
  assert.deepEqual(
    { to: rep[0].body.to, connection_id: rep[0].body.connection_id, from: rep[0].body.from, webhook_url: rep[0].body.webhook_url, command_id: rep[0].body.command_id, timeout_secs: rep[0].body.timeout_secs, record: rep[0].body.record },
    { to: `sip:gencred${RUN}x1@sip.telnyx.com`, connection_id: "cc-app", from: "+351210000000", webhook_url: "https://wine.test/api/telnyx/human-call-webhook", command_id: `hc-rep-${id}`, timeout_secs: 30, record: undefined },
  );
  const repCc = `cc-rep-hc-rep-${id}`;
  const custCc = `cc-cust-hc-cust-${id}`;

  // The browser answers leg A; the customer is dialed exactly once even if Telnyx repeats the event.
  n = reqs.length;
  await ev("call.answered", { call_control_id: repCc });
  await ev("call.answered", { call_control_id: repCc });
  const cust = since(n).filter((r) => r.path === "/calls");
  assert.equal(cust.length, 1);
  assert.equal(cust[0].body.to, "+351912345678");
  assert.equal(cust[0].body.link_to, repCc);
  assert.equal(cust[0].body.bridge_on_answer, true);
  assert.equal(cust[0].body.timeout_secs, 60);
  assert.equal(cust[0].body.answering_machine_detection, "premium");
  assert.equal((await row(id)).status, "customer_dialing");
  assert.equal((await hc!.callState(admin, id)).body.state && ((await hc!.callState(admin, id)).body.state as { connected: boolean }).connected, false);

  // Customer leg rings → ringback to the admin; customer answering alone is not a conversation.
  n = reqs.length;
  await ev("call.initiated", { call_control_id: custCc });
  assert.ok(since(n).some((r) => r.path === `/calls/${repCc}/actions/playback_start` && r.body.loop === "infinity"));
  await ev("call.answered", { call_control_id: custCc });
  assert.equal((await row(id)).status, "customer_dialing");

  // Bridged: connected, ringback stopped, recording started on the customer leg (once).
  n = reqs.length;
  await ev("call.bridged", { call_control_id: custCc });
  await ev("call.bridged", { call_control_id: repCc });
  const st = (await hc!.callState(admin, id)).body.state as Record<string, unknown>;
  assert.equal(st.status, "bridged");
  assert.equal(st.connected, true);
  assert.ok(st.connectedAt);
  assert.ok(since(n).some((r) => r.path === `/calls/${repCc}/actions/playback_stop`));
  const rec = since(n).filter((r) => r.path.endsWith("/record_start"));
  assert.equal(rec.length, 1);
  assert.equal(rec[0].path, `/calls/${custCc}/actions/record_start`);
  assert.equal(rec[0].body.channels, "dual");

  await ev("call.machine.premium.detection.ended", { call_control_id: custCc, result: "human_residence" });
  assert.equal((await row(id)).answered_by, "human");

  // The admin hangs up their leg: completed, the customer leg is hung up by the server (tolerating "already gone").
  await db!.sql`update human_calls set bridged_at = now() - interval '30 seconds' where id = ${id}`;
  fake.hangupStatus = 422;
  n = reqs.length;
  await ev("call.hangup", { call_control_id: repCc, hangup_cause: "normal_clearing" });
  fake.hangupStatus = 200;
  const end = await row(id);
  assert.equal(end.status, "completed");
  assert.ok(end.duration_ms >= 29000, String(end.duration_ms));
  assert.ok(since(n).some((r) => r.path === `/calls/${custCc}/actions/hangup`));

  // Terminal rows never move.
  await ev("call.bridged", { call_control_id: custCc });
  assert.equal((await row(id)).status, "completed");
});

dbTest("one live call per admin (409 rep_busy); consent and missing config refused", async () => {
  const first = await hc!.startCall(admin, { leadId });
  assert.equal(first.status, 200);
  const busy = await hc!.startCall(admin, { leadId });
  assert.equal(busy.status, 409);
  assert.equal(busy.body.code, "rep_busy");
  assert.equal(busy.body.activeCallId, first.body.callId);
  // The admin's device never picks up.
  await ev("call.hangup", { call_control_id: `cc-rep-hc-rep-${first.body.callId}`, hangup_cause: "timeout" });
  assert.equal((await row(first.body.callId as string)).status, "rep_no_answer");

  assert.equal((await hc!.startCall(admin, { leadId: noConsentLead })).status, 403);
  assert.equal((await hc!.startCall(admin, { leadId: 999999999 })).status, 404);

  delete process.env.TELNYX_WEBRTC_CONNECTION_ID;
  const n = reqs.length;
  const nc = await hc!.startCall(admin, { leadId });
  process.env.TELNYX_WEBRTC_CONNECTION_ID = env.TELNYX_WEBRTC_CONNECTION_ID;
  assert.equal(nc.status, 200);
  assert.equal(nc.body.dialed, false);
  assert.match(String(nc.body.dialError), /TELNYX_WEBRTC_CONNECTION_ID/);
  assert.equal(since(n).length, 0); // nothing sent to Telnyx
  assert.equal(((await hc!.callState(admin, nc.body.callId)).body.state as { error: string }).error, "calling_not_configured");
  assert.equal((await hc!.webrtcToken(admin)).status, 200);
});

dbTest("rep leg refused by Telnyx: failed with a readable message, provider text stays server-side", async () => {
  fake.failRepDial = true;
  const r = await hc!.startCall(admin, { leadId });
  fake.failRepDial = false;
  assert.equal(r.body.dialed, false);
  assert.equal(r.body.dialError, "The call could not be placed. Please try again.");
  const st = (await hc!.callState(admin, r.body.callId)).body.state as Record<string, unknown>;
  assert.equal(st.status, "failed");
  assert.equal(st.error, "call_not_placed");
  assert.ok(!JSON.stringify(st).includes("Invalid SIP URI"));
  assert.match((await row(r.body.callId as string)).error, /^rep_leg_dial_rejected:.*Invalid SIP URI/);
});

dbTest("webhook before the bind: client_state recovers the row; unknown calls ignored; others' calls are 404", async () => {
  const s = await hc!.startCall(admin, { leadId });
  const id = s.body.callId as string;
  await db!.sql`update human_calls set rep_call_control_id = null where id = ${id}`;
  await ev("call.answered", { call_control_id: `cc-late-${RUN}`, client_state: tcc.encodeClientState(id, "rep") });
  const r = await row(id);
  assert.equal(r.rep_call_control_id, `cc-late-${RUN}`);
  assert.equal(r.status, "customer_dialing");
  await ev("call.answered", { call_control_id: "cc-someone-else" }); // not ours: no throw, nothing written
  assert.equal((await hc!.callState({ ...admin, id: admin.id + 999 }, id)).status, 404);
  await ev("call.hangup", { call_control_id: `cc-late-${RUN}`, hangup_cause: "normal_clearing" });
  assert.equal((await row(id)).status, "canceled");
});

dbTest("webhook route: bad signature refused before anything is read", async () => {
  const { POST } = await import("../src/app/api/telnyx/human-call-webhook/route");
  const res = await POST(new Request("https://wine.test/api/telnyx/human-call-webhook", { method: "POST", body: "{}", headers: { "telnyx-signature-ed25519": "AAAA", "telnyx-timestamp": String(Math.floor(Date.now() / 1000)) } }));
  assert.equal(res.status, 400);
});
