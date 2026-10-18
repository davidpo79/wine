// Admin "Test CTT connection": runs against the local CTT stand-in (scripts/mock-ctt.ts) in a child process.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";

const PORT = 4600 + Math.floor(Math.random() * 300);
const BASE = `http://localhost:${PORT}/v3`;
let mock: ChildProcess;

const env = (over: Record<string, string | undefined> = {}) => {
  const all = { CTT_APP_ID: "app-test", CTT_PUBLIC_KEY: "pub-test", CTT_SECRET_KEY: "sec-test", CTT_API_BASE: BASE, CTT_SIMULATE: undefined, ...over };
  for (const [k, v] of Object.entries(all)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
};

// Every request the check makes, so the tests can prove it only reads.
const calls: { method: string; url: string }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  calls.push({ method: init?.method ?? "GET", url: String(input) });
  return realFetch(input, init);
}) as typeof fetch;

const { cttConnectionCheck } = await import("../src/lib/ctt");

before(async () => {
  mock = spawn(process.execPath, ["--import", "tsx", "scripts/mock-ctt.ts", String(PORT)], { stdio: ["ignore", "pipe", "inherit"] });
  for await (const chunk of mock.stdout!) if (String(chunk).includes("mock CTT on")) break;
});

after(async () => {
  mock.kill();
  await once(mock, "exit");
});

test("CTT check: missing env reports not configured, makes no request", async () => {
  env({ CTT_APP_ID: undefined });
  calls.length = 0;
  const r = await cttConnectionCheck();
  assert.equal(r.state, "not_configured");
  assert.ok(r.state === "not_configured" && r.message.startsWith("CTT_APP_ID not configured"), JSON.stringify(r));
  assert.equal(calls.length, 0);

  env({ CTT_APP_ID: undefined, CTT_PUBLIC_KEY: undefined, CTT_SECRET_KEY: undefined });
  const all = await cttConnectionCheck();
  assert.ok(all.state === "not_configured" && all.missing.join() === "CTT_APP_ID,CTT_PUBLIC_KEY,CTT_SECRET_KEY");
  assert.equal(calls.length, 0);
});

test("CTT check: token + read-only call against the mock, raw replies verbatim, nothing written", async () => {
  env();
  calls.length = 0;
  // DATABASE_URL is unset in tests: any DB read or write would throw, so a pass also proves the DB is untouched.
  const r = await cttConnectionCheck();
  assert.ok(r.state === "ok", JSON.stringify(r));
  assert.deepEqual(
    r.replies.map((x) => [x.method, x.path, x.status]),
    [["POST", "/keys/", 200], ["POST", "/tracking/", 200]],
  );
  const keys = JSON.parse(r.replies[0].body);
  assert.match(keys.Key, /^tok-/);
  assert.equal(r.replies[1].body, '{"Error":{"Id":0},"Shipments":[]}');
  // Only those two endpoints were called: no /shipments/, no /labels/.
  assert.deepEqual(calls.map((c) => `${c.method} ${c.url}`), [`POST ${BASE}/keys/`, `POST ${BASE}/tracking/`]);
});

test("CTT check: CTT error is returned as-is and stops at the token", async () => {
  env({ CTT_SECRET_KEY: "wrong-secret" });
  calls.length = 0;
  const r = await cttConnectionCheck();
  assert.equal(r.state, "error");
  assert.ok(r.state === "error");
  assert.equal(r.replies.length, 1);
  assert.equal(r.replies[0].status, 401);
  assert.equal(r.replies[0].body, '{"Error":{"Id":401,"Tekst":"bad public key signature"}}');
  assert.equal(calls.length, 1); // no retry, no second call
});

test("CTT check: unreachable CTT is an error, never a success", async () => {
  env({ CTT_API_BASE: "http://127.0.0.1:1/v3" });
  const r = await cttConnectionCheck();
  assert.equal(r.state, "error");
  assert.ok(r.state === "error" && r.replies.length === 0 && /fetch failed|ECONNREFUSED/.test(r.error ?? ""), JSON.stringify(r));
});

test("CTT check action: admin guard runs before any CTT request", async () => {
  env();
  calls.length = 0;
  const { cttTestAction } = await import("../src/app/admin/actions");
  // Outside a request there is no admin session: the guard throws and CTT is never called.
  await assert.rejects(cttTestAction(undefined, new FormData()), /cookies/);
  assert.equal(calls.length, 0);
});
