// Admin → Settings → Outbound calls: saved values override Railway, empty falls back, secrets can never be set here.
import { test } from "node:test";
import assert from "node:assert/strict";

const DB_URL = process.env.TEST_DATABASE_URL ?? process.env.HUMAN_CALLS_DB_URL;
if (DB_URL) process.env.DATABASE_URL = DB_URL;
const os = await import("../src/lib/outbound-settings");

test("outbound settings: validation (E.164, https, hours, ints, selects); booleans always explicit", () => {
  const ok = os.validateOutbound({ TELNYX_FROM_NUMBER: "+351210000000", PT_CALLERS_CALL_HOURS: "09:30-18:00", PT_CALLERS_DAILY_CALL_CAP: "50", HUMAN_CALL_AMD_MODE: "disabled", PT_CALLERS_ENABLED: "true" });
  assert.equal(ok.error, null);
  assert.equal(ok.values.PT_CALLERS_ENABLED, "true");
  assert.equal(ok.values.PT_CALLERS_LEGAL_APPROVED, "false"); // unticked = off, not "use Railway"
  assert.equal(ok.values.HUMAN_CALL_RECORDING, "0");
  assert.equal(ok.values.PT_CALLERS_DNC_REQUIRED, "false"); // explicit when the form is posted unticked
  assert.equal("APOLLO_DAILY_CREDIT_CAP" in ok.values, false); // empty = fall back (no cap)
  assert.match(String(os.validateOutbound({ TELNYX_FROM_NUMBER: "912345678" }).error), /E\.164/);
  assert.match(String(os.validateOutbound({ APOLLO_WEBHOOK_BASE_URL: "http://x" }).error), /https/);
  assert.match(String(os.validateOutbound({ PT_CALLERS_DAILY_CALL_CAP: "lots" }).error), /whole number/);
  assert.match(String(os.validateOutbound({ HUMAN_CALL_AMD_MODE: "maybe" }).error), /choose/);
  assert.match(String(os.validateOutbound({ PT_CALLERS_PILOT_NUMBERS: "+351912000001, 912" }).error), /Pilot/);
});

test("outbound settings: no secret can be set from the screen", () => {
  const keys = os.OUTBOUND_FIELDS.map((f) => f.key as string);
  for (const secret of ["TELNYX_API_KEY", "APOLLO_API_KEY", "DATABASE_URL", "SESSION_SECRET", "SITE_URL"]) assert.ok(!keys.includes(secret), secret);
  const v = os.validateOutbound({ TELNYX_API_KEY: "x", APOLLO_API_KEY: "y" } as Record<string, string>).values;
  assert.equal("TELNYX_API_KEY" in v, false);
  assert.equal("APOLLO_API_KEY" in v, false);
});

const dbTest = (name: string, fn: () => Promise<void>) => test(name, { skip: !DB_URL && "TEST_DATABASE_URL not set" }, fn);

dbTest("outbound settings: saved values win over Railway, empty falls back, the call code reads them", async () => {
  const { db, schema, sql } = await import("../src/db");
  const { eq } = await import("drizzle-orm");
  const [before] = await db.select().from(schema.settings).where(eq(schema.settings.key, "outbound_calls"));
  process.env.TELNYX_FROM_NUMBER = "+351200000000";
  process.env.PT_CALLERS_CALL_HOURS = "10:00-11:00";
  process.env.PT_CALLERS_ENABLED = "true";
  try {
    const { values } = os.validateOutbound({ TELNYX_FROM_NUMBER: "+351299999999", PT_CALLERS_ENABLED: "" });
    await os.saveOutbound(values);
    const env = os.outboundEnv();
    assert.equal(env.TELNYX_FROM_NUMBER, "+351299999999"); // saved wins
    assert.equal(env.PT_CALLERS_CALL_HOURS, "10:00-11:00"); // not saved: Railway
    assert.equal(env.PT_CALLERS_ENABLED, "false"); // unticked here beats Railway's "true"
    const { humanCallConfig } = await import("../src/lib/telnyx-call-control");
    assert.equal(humanCallConfig().fromNumber, "+351299999999");
    const { ptFlags } = await import("../src/lib/pt-callers/flags");
    assert.equal(ptFlags().live, false);
    // A secret smuggled into the stored row is ignored on load.
    await db.update(schema.settings).set({ value: { ...values, APOLLO_API_KEY: "evil", TELNYX_API_KEY: "evil" } }).where(eq(schema.settings.key, "outbound_calls"));
    await os.loadOutboundSettings(true);
    assert.notEqual(os.outboundEnv().APOLLO_API_KEY, "evil");
    assert.notEqual(os.outboundEnv().TELNYX_API_KEY, "evil");
  } finally {
    if (before) await db.update(schema.settings).set({ value: before.value }).where(eq(schema.settings.key, "outbound_calls"));
    else await db.delete(schema.settings).where(eq(schema.settings.key, "outbound_calls"));
    await os.loadOutboundSettings(true);
    delete process.env.TELNYX_FROM_NUMBER;
    delete process.env.PT_CALLERS_CALL_HOURS;
    delete process.env.PT_CALLERS_ENABLED;
    await sql.end();
  }
});
