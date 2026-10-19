// Portugal HR callers: the telephony adapter on the project's OWN Telnyx
// account (PT_TELNYX_*), the browser device provisioning, and the signed
// webhook. No real Telnyx call: fetch is faked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
process.env.SESSION_SECRET = "x".repeat(40);

const t = await import("../src/lib/pt-callers/telnyx");
const { createMemoryEndpointStore } = t;

const ENV = {
  PT_TELNYX_API_KEY: "pt-key-not-real", PT_TELNYX_CONNECTION_ID: "cc_conn", PT_TELNYX_WEBRTC_CONNECTION_ID: "webrtc_conn",
  PT_TELNYX_FROM_NUMBER: "+351210000000", SITE_URL: "https://vinho.example.test",
  // The shop's own Telnyx account must never be used by this module.
  TELNYX_API_KEY: "shop-key-must-not-be-used", TELNYX_CONNECTION_ID: "shop_conn",
};

function fakeFetch() {
  const calls: Array<{ url: string; method: string; body: any; auth: string }> = [];
  let cred = 0;
  const f = async (url: any, init: any) => {
    const body = init?.body ? JSON.parse(init.body) : null;
    calls.push({ url: String(url), method: init?.method ?? "GET", body, auth: init?.headers?.Authorization });
    const u = String(url);
    if (u.endsWith("/telephony_credentials") && init.method === "POST") return new Response(JSON.stringify({ data: { id: "cred_" + ++cred, sip_username: "gencred" + cred } }), { status: 200 });
    if (/\/telephony_credentials\/[^/]+\/token$/.test(u)) return new Response("eyJhbGciOiJSUzI1NiJ9.eyJleHAiOjE5MDAwMDAwMDB9.c2ln", { status: 200 });
    if (u.endsWith("/calls")) return new Response(JSON.stringify({ data: { call_control_id: "v3:cc_" + calls.length } }), { status: 200 });
    return new Response("{}", { status: 200 });
  };
  return { f: f as typeof fetch, calls };
}

test("rep leg first, on the PT account, to the rep's own browser, no recording", async () => {
  const ff = fakeFetch();
  const endpoints = createMemoryEndpointStore();
  await endpoints.claim({ uid: "u_rep", sipUsername: "gencrmrep1", credentialId: "cred1", connectionId: "webrtc_conn", active: true, createdAt: 1, updatedAt: 1 });
  const d = t.createPtDialer({ env: () => ENV, fetchImpl: ff.f, endpoints });
  const out = await d.startRepLeg({ callId: "ptc_1", uid: "u_rep", lead: {} as never });
  assert.equal(out.callControlId, "v3:cc_1");
  const c = ff.calls[0];
  assert.equal(c.auth, "Bearer pt-key-not-real");
  assert.equal(c.body.connection_id, "cc_conn");
  assert.equal(c.body.to, "sip:gencrmrep1@sip.telnyx.com");
  assert.equal(c.body.from, "+351210000000");
  assert.equal(c.body.webhook_url, "https://vinho.example.test/api/pt-callers/telnyx-webhook");
  assert.equal(t.decodeClientState(c.body.client_state)?.callId, "ptc_1");
  for (const k of ["record", "record_channels", "answering_machine_detection", "transcription"]) assert.ok(!(k in c.body), k);
});

test("the lead's leg bridges to the rep leg, only to +351, no answering-machine detection", async () => {
  const ff = fakeFetch();
  const d = t.createPtDialer({ env: () => ENV, fetchImpl: ff.f, endpoints: createMemoryEndpointStore() });
  await d.dialCustomer({ callId: "ptc_1", to: "+351912345678", linkTo: "v3:rep" });
  const b = ff.calls[0].body;
  assert.deepEqual([b.to, b.link_to, b.bridge_on_answer], ["+351912345678", "v3:rep", true]);
  assert.ok(!("answering_machine_detection" in b));
  assert.ok(!("record" in b));
  await assert.rejects(d.dialCustomer({ callId: "ptc_1", to: "+14155550100", linkTo: "v3:rep" }), { code: "phone_not_pt_e164" });
});

test("never falls back to the shop's Telnyx account; refuses without a +351 caller id", async () => {
  const ff = fakeFetch();
  const endpoints = createMemoryEndpointStore();
  const shopOnly = { TELNYX_API_KEY: "shop", TELNYX_CONNECTION_ID: "shop_conn", TELNYX_FROM_NUMBER: "+351210000000" };
  await assert.rejects(t.createPtDialer({ env: () => shopOnly, fetchImpl: ff.f, endpoints }).dialCustomer({ callId: "c", to: "+351912345678", linkTo: "x" }), { code: "pt_telephony_not_configured" });
  await assert.rejects(t.createPtDialer({ env: () => ({ ...ENV, PT_TELNYX_FROM_NUMBER: "+16695550100" }), fetchImpl: ff.f, endpoints }).dialCustomer({ callId: "c", to: "+351912345678", linkTo: "x" }), { code: "pt_from_number_not_pt" });
  await assert.rejects(t.createPtDialer({ env: () => ENV, fetchImpl: ff.f, endpoints }).startRepLeg({ callId: "c", uid: "nobody", lead: {} as never }), { code: "no_device" });
  assert.equal(ff.calls.length, 0);
});

test("phone token: reuse an active device, refuse a revoked one, provision once on first use", async () => {
  const ff = fakeFetch();
  const endpoints = createMemoryEndpointStore();
  await endpoints.claim({ uid: "u_revoked", sipUsername: "x", credentialId: "c0", connectionId: "webrtc_conn", active: false, createdAt: 1, updatedAt: 1 });
  const d = t.createPtDialer({ env: () => ENV, fetchImpl: ff.f, endpoints });
  await assert.rejects(d.mintToken("u_revoked"), { code: "device_revoked" });
  assert.equal(ff.calls.length, 0, "nothing created for a revoked member");
  const first = await d.mintToken("u_new");
  assert.match(first.token, /^eyJ/);
  assert.equal(ff.calls.filter((c) => c.url.endsWith("/telephony_credentials")).length, 1);
  assert.equal(ff.calls[0].body.connection_id, "webrtc_conn");
  await d.mintToken("u_new");
  assert.equal(ff.calls.filter((c) => c.url.endsWith("/telephony_credentials")).length, 1, "reused, not re-created");
});

test("a device from another Telnyx connection is not used", async () => {
  const ff = fakeFetch();
  const endpoints = createMemoryEndpointStore();
  await endpoints.claim({ uid: "u_rep", sipUsername: "y", credentialId: "c9", connectionId: "some_other_conn", active: true, createdAt: 1, updatedAt: 1 });
  const d = t.createPtDialer({ env: () => ENV, fetchImpl: ff.f, endpoints });
  await assert.rejects(d.mintToken("u_rep"), { code: "device_wrong_account" });
  await assert.rejects(d.startRepLeg({ callId: "c", uid: "u_rep", lead: {} as never }), { code: "device_wrong_account" });
});

test("the PT webhook is verified with the PT account's key and forwards only this module's calls", async () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw32 = publicKey.export({ format: "der", type: "spki" }).subarray(12).toString("base64");
  const env = { ...ENV, PT_TELNYX_PUBLIC_KEY: raw32, TELNYX_PUBLIC_KEY: "" };
  const seen: unknown[] = [];
  const service = { onCallEvent: async (e: unknown) => { seen.push(e); return { ok: true }; } };
  const signed = (body: string) => {
    const ts = String(Math.floor(Date.now() / 1000));
    return { "telnyx-signature-ed25519": sign(null, Buffer.from(`${ts}|${body}`), privateKey).toString("base64"), "telnyx-timestamp": ts };
  };
  const evt = (type: string, cs: string) => JSON.stringify({ data: { event_type: type, payload: { call_control_id: "v3:x", client_state: cs } } });

  const good = evt("call.answered", t.encodeClientState("ptc_9", "rep"));
  assert.equal((await t.handlePtTelnyxWebhook(good, signed(good), { env: () => env, service })).status, 200);
  const bad = await t.handlePtTelnyxWebhook(good, { "telnyx-signature-ed25519": "AAAA", "telnyx-timestamp": "1" }, { env: () => env, service });
  assert.equal(bad.status, 401);
  const shopKeyOnly = await t.handlePtTelnyxWebhook(good, signed(good), { env: () => ({ ...env, PT_TELNYX_PUBLIC_KEY: "" }), service });
  assert.equal(shopKeyOnly.status, 401, "no PT key, no processing");
  const foreign = evt("call.answered", Buffer.from(JSON.stringify({ orderId: "o1", stepId: 1 })).toString("base64"));
  await t.handlePtTelnyxWebhook(foreign, signed(foreign), { env: () => env, service });
  const hang = evt("call.hangup", t.encodeClientState("ptc_9", "customer"));
  await t.handlePtTelnyxWebhook(hang, signed(hang), { env: () => env, service });
  assert.deepEqual(seen, [
    { callId: "ptc_9", leg: "rep", type: "answered", callControlId: "v3:x" },
    { callId: "ptc_9", leg: "customer", type: "hangup", callControlId: "v3:x" },
  ]);
});
