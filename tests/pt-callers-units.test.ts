// Portugal HR callers: the pure leaves. Flags (fail closed), Portuguese phone
// numbers, calling hours, the exact Apollo request shapes (checked against
// docs.apollo.io on 19/10/2026), request_id kept as a string, and the role
// mapping that keeps the Portugal caller role out of the rest of the admin.
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.SESSION_SECRET = "x".repeat(40);

const flags = await import("../src/lib/pt-callers/flags");
const phone = await import("../src/lib/pt-callers/phone");
const hours = await import("../src/lib/pt-callers/hours");
const apollo = await import("../src/lib/pt-callers/apollo");
const access = await import("../src/lib/pt-callers/access");

test("flags: zero env is demo, every limit at its fail-closed or documented default", () => {
  const f = flags.readFlags({});
  assert.equal(f.enabled, false);
  assert.equal(f.legalApproved, false);
  assert.equal(f.live, false);
  assert.deepEqual([f.caps.daily, f.caps.monthly, f.caps.valid], [300, 4000, true]);
  assert.equal(f.globalDailyCallCap, 0, "no spend cap until David sets one");
  assert.equal(f.maxAttemptsPerLead, 3);
  assert.equal(f.callingHours, null, "no calling hours until approved");
  assert.equal(f.pilotOnly, true);
  assert.deepEqual(f.pilotNumbers, []);
  assert.equal(f.enrichDelivery, "webhook", "webhook is the default; polling only when chosen");
});

test("flags: only the exact token \"true\" opens the legal gate, and both are needed", () => {
  for (const v of ["1", "TRUE", "yes", "on", " true", "true ", ""]) {
    assert.equal(flags.readFlags({ PT_CALLERS_ENABLED: v, PT_CALLERS_LEGAL_APPROVED: v }).live, false, JSON.stringify(v));
  }
  assert.equal(flags.readFlags({ PT_CALLERS_ENABLED: "true" }).live, false);
  assert.equal(flags.readFlags({ PT_CALLERS_LEGAL_APPROVED: "true" }).live, false);
  assert.equal(flags.readFlags({ PT_CALLERS_ENABLED: "true", PT_CALLERS_LEGAL_APPROVED: "true" }).live, true);
});

test("flags: a malformed cap is zero, never the default", () => {
  for (const v of ["abc", "-5", "0", "1.5", "300credits"]) {
    const f = flags.readFlags({ APOLLO_DAILY_CREDIT_CAP: v });
    assert.equal(f.caps.valid, false, v);
    assert.equal(f.caps.daily, 0, v);
  }
  assert.equal(flags.readFlags({ PT_CALLERS_DAILY_CALL_CAP: "lots" }).globalDailyCallCap, 0);
  assert.equal(flags.readFlags({ PT_CALLERS_DAILY_CALL_CAP: "40" }).globalDailyCallCap, 40);
});

test("flags: webhook delivery needs an https base; polling only when chosen explicitly", () => {
  const none = flags.readFlags({});
  assert.equal(none.webhookBaseUrl, null);
  assert.equal(none.configError, "apollo_webhook_not_configured");
  assert.equal(flags.readFlags({ APOLLO_WEBHOOK_BASE_URL: "http://x.test" }).configError, "apollo_webhook_base_not_https");
  const ok = flags.readFlags({ APOLLO_WEBHOOK_BASE_URL: "https://x.test/" });
  assert.deepEqual([ok.enrichDelivery, ok.webhookBaseUrl, ok.configError], ["webhook", "https://x.test", null]);
  const poll = flags.readFlags({ APOLLO_ENRICH_DELIVERY: "poll" });
  assert.deepEqual([poll.enrichDelivery, poll.configError], ["poll", null]);
  assert.equal(flags.readFlags({ APOLLO_ENRICH_DELIVERY: "both" }).configError, "apollo_enrich_delivery_invalid");
});

test("flags: pilot mode is on unless exactly \"false\"; pilot numbers are normalized +351", () => {
  assert.equal(flags.readFlags({ PT_CALLERS_PILOT_ONLY: "no" }).pilotOnly, true);
  assert.equal(flags.readFlags({ PT_CALLERS_PILOT_ONLY: "false" }).pilotOnly, false);
  assert.deepEqual(flags.readFlags({ PT_CALLERS_PILOT_NUMBERS: "+351 912 345 678, 213456789, +1415555" }).pilotNumbers, ["+351912345678", "+351213456789"]);
});

test("phone: E.164 +351 only, no premium or toll-free, masked for reps", () => {
  assert.equal(phone.normalizePtPhone("+351 912 345 678"), "+351912345678");
  assert.equal(phone.normalizePtPhone("00351912345678"), "+351912345678");
  assert.equal(phone.normalizePtPhone("912345678"), "+351912345678");
  for (const v of ["+14155550100", "+34912345678", "+351812345678", "+351712345678", "+35191234567", "", null, "abc"]) {
    assert.equal(phone.isDialablePtE164(phone.normalizePtPhone(v)), false, String(v));
  }
  assert.equal(phone.maskPhone("+351912345678"), "+351 9•• ••• •78");
  assert.equal(phone.maskPhone(null), null);
});

test("calling hours: parsed strictly, read in Lisbon time, unset or malformed means no calling", () => {
  assert.equal(hours.parseCallingHours(undefined), null);
  assert.equal(hours.parseCallingHours("whenever"), null);
  assert.equal(hours.parseCallingHours("mon-fri 18:00-09:00"), null);
  const h = hours.parseCallingHours("mon-fri 09:30-18:00")!;
  assert.ok(h);
  // Monday 19/10/2026: Lisbon is UTC+1 (summer time until 25/10).
  assert.equal(hours.withinCallingHours(h, Date.UTC(2026, 9, 19, 8, 29)), false, "09:29 Lisbon");
  assert.equal(hours.withinCallingHours(h, Date.UTC(2026, 9, 19, 8, 30)), true, "09:30 Lisbon");
  assert.equal(hours.withinCallingHours(h, Date.UTC(2026, 9, 19, 16, 59)), true, "17:59 Lisbon");
  assert.equal(hours.withinCallingHours(h, Date.UTC(2026, 9, 19, 17, 0)), false, "18:00 Lisbon");
  assert.equal(hours.withinCallingHours(h, Date.UTC(2026, 9, 24, 10, 0)), false, "Saturday");
  // After the clock change Lisbon is UTC+0.
  assert.equal(hours.withinCallingHours(h, Date.UTC(2026, 10, 2, 9, 0)), false, "09:00 UTC is 09:00 Lisbon in winter: before opening");
  assert.equal(hours.withinCallingHours(h, Date.UTC(2026, 10, 2, 9, 30)), true, "09:30 Lisbon in winter");
  const days = hours.parseCallingHours("mon,wed 10:00-12:00")!;
  assert.equal(hours.withinCallingHours(days, Date.UTC(2026, 9, 20, 10, 0)), false, "Tuesday");
  assert.equal(hours.withinCallingHours(days, Date.UTC(2026, 9, 21, 10, 0)), true, "Wednesday 11:00 Lisbon");
});

test("Apollo search: the spec's exact titles, seniority, both locations in Portugal, 51-500 staff, 25 per page", () => {
  const r = apollo.buildSearchRequest({ page: 1 });
  assert.equal(r.path, "/mixed_people/api_search");
  assert.deepEqual(r.body.person_titles, [
    "HR Manager", "Human Resources Manager", "Head of HR", "HR Director",
    "Responsável de Recursos Humanos", "Diretor de Recursos Humanos", "Diretora de Recursos Humanos",
  ]);
  assert.deepEqual(r.body.person_seniorities, ["manager", "head", "director"]);
  assert.equal(r.body.include_similar_titles, false);
  assert.deepEqual(r.body.person_locations, ["Portugal"]);
  assert.deepEqual(r.body.organization_locations, ["Portugal"]);
  assert.deepEqual(r.body.organization_num_employees_ranges, ["51,100", "101,500"]);
  assert.equal(r.body.per_page, 25);
});

test("Apollo enrichment: phone reveal on, personal emails off, waterfall off, webhook XOR poll, at most 10", () => {
  const w = apollo.buildBulkMatchRequest({ personIds: ["a1", "a2"], webhookUrl: "https://x.test/h/1/s" });
  assert.equal(w.path, "/people/bulk_match");
  assert.deepEqual(w.query, { reveal_phone_number: "true", reveal_personal_emails: "false", run_waterfall_email: "false", run_waterfall_phone: "false", webhook_url: "https://x.test/h/1/s" });
  assert.deepEqual(w.body.details, [{ id: "a1" }, { id: "a2" }]);
  const p = apollo.buildBulkMatchRequest({ personIds: ["a1"], pollOnly: true });
  assert.equal(p.query.poll_only, "true");
  assert.ok(!("webhook_url" in p.query));
  assert.throws(() => apollo.buildBulkMatchRequest({ personIds: ["a1"], webhookUrl: "https://x.test/h", pollOnly: true }), /both/);
  assert.throws(() => apollo.buildBulkMatchRequest({ personIds: ["a1"] }), /either/);
  assert.throws(() => apollo.buildBulkMatchRequest({ personIds: Array.from({ length: 11 }, (_, i) => "p" + i), pollOnly: true }), /10/);
});

test("Apollo request_id: read from the raw text as a string, beyond 2^53 and negative", () => {
  const big = "9007199254740993123";
  const raw = `{"status":"success","request_id":${big},"matches":[]}`;
  assert.notEqual(String(JSON.parse(raw).request_id), big, "JSON.parse alone corrupts it");
  assert.equal(apollo.extractRequestId(raw), big);
  assert.equal(apollo.extractRequestId('{"request_id":-1039995589705121900}'), "-1039995589705121900");
  assert.equal(apollo.extractRequestId('{"request_id":"1039995589705121900"}'), "1039995589705121900");
  assert.equal(apollo.extractRequestId('{"status":"success"}'), null);
});

test("Apollo live client: key only in the x-api-key header; a timeout is outcome-unknown", async () => {
  let seen: { url: string; headers: Record<string, string> } | null = null;
  const c = apollo.createApolloClient({
    apiKey: "test-key-not-real",
    fetchImpl: async (url, init) => { seen = { url: String(url), headers: init!.headers as Record<string, string> }; return new Response('{"request_id":12345678901234567890,"matches":[],"credits_consumed":1.5}', { status: 200 }); },
  });
  const out = await c.bulkMatch({ personIds: ["a1"], pollOnly: true });
  assert.equal(out.requestId, "12345678901234567890");
  assert.equal(out.creditsConsumed, 1.5);
  assert.equal(seen!.headers["x-api-key"], "test-key-not-real");
  assert.ok(!seen!.url.includes("test-key-not-real"));
  const slow = apollo.createApolloClient({
    apiKey: "k", timeoutMs: 20,
    fetchImpl: (_u, init) => new Promise((_, reject) => init!.signal!.addEventListener("abort", () => { const e = new Error("aborted"); e.name = "AbortError"; reject(e); })),
  });
  await assert.rejects(slow.bulkMatch({ personIds: ["a1"], pollOnly: true }), (e: { kind: string; outcomeUnknown: boolean }) => e.kind === "timeout" && e.outcomeUnknown === true);
});

test("Apollo poll: pending, ready and gone are distinct", async () => {
  const replies: Array<[number, string]> = [
    [404, '{"error_code":"result_pending","retry_after_seconds":10}'],
    [200, '{"request_id":"77","webhook_status":"success","webhook_result":{"credits_consumed":8,"people":[{"id":"a1","status":"success","phone_numbers":[{"sanitized_number":"+351912345678","type_cd":"mobile"}]}]}}'],
    [404, '{"error_code":"request_id_unknown"}'],
    [410, '{"error_code":"request_id_expired"}'],
  ];
  const c = apollo.createApolloClient({ apiKey: "k", fetchImpl: async () => { const [s, b] = replies.shift()!; return new Response(b, { status: s }); } });
  assert.deepEqual(await c.pollResult("77"), { state: "pending", retryAfterSeconds: 10 });
  const ready = await c.pollResult("77");
  assert.equal(ready.state, "ready");
  assert.equal(ready.state === "ready" && ready.result.people[0].phones[0].e164, "+351912345678");
  assert.deepEqual(await c.pollResult("77"), { state: "gone", code: "request_id_unknown" });
  assert.deepEqual(await c.pollResult("77"), { state: "gone", code: "request_id_expired" });
});

test("Apollo mock: no key, no network, 25 demo people, string request ids", async () => {
  const m = apollo.createMockApolloClient();
  const s = await m.searchPeople({ page: 1 });
  assert.equal(s.people.length, 25);
  assert.ok(s.people.every((p) => p.apolloId.startsWith("demo_")));
  assert.equal(typeof (await m.bulkMatch({ personIds: [s.people[0].apolloId], pollOnly: true })).requestId, "string");
});

test("roles: an unknown role is no session at all, never admin", () => {
  assert.equal(access.normalizeRole("admin"), "admin");
  assert.equal(access.normalizeRole("fulfilment"), "fulfilment");
  assert.equal(access.normalizeRole("pt_caller"), "pt_caller");
  for (const r of ["", "Admin", "owner", null, undefined, "pt_callers"]) assert.equal(access.normalizeRole(r), null, String(r));
});

test("roles: the Portugal caller role is refused by default and admitted only where a page opts in", () => {
  assert.equal(access.admits("pt_caller", {}), false);
  assert.equal(access.admits("pt_caller", { allowPtCaller: true }), true);
  assert.equal(access.admits("admin", {}), true);
  assert.equal(access.admits("fulfilment", {}), true);
  assert.equal(access.admits("fulfilment", { role: "admin" }), false);
  assert.equal(access.admits("pt_caller", { role: "admin", allowPtCaller: true }), false);
});
