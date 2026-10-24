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

test("whatsapp settings: E.164 sender and a WhatsApp-style template name; the token is never a setting", () => {
  assert.equal(os.validateOutbound({ TELNYX_WHATSAPP_FROM: "+351910348577", WHATSAPP_TEMPLATE_RECOVERY: "trilogia_retomar", WHATSAPP_TEMPLATE_LANG: "pt_PT", WHATSAPP_PROVIDER: "telnyx" }).error, null);
  assert.match(String(os.validateOutbound({ TELNYX_WHATSAPP_FROM: "910348577" }).error), /E\.164/);
  assert.match(String(os.validateOutbound({ WHATSAPP_TEMPLATE_RECOVERY: "Trilogia Retomar" }).error), /Template name/);
  assert.equal(os.OUTBOUND_FIELDS.some((f) => (f.key as string) === "WHATSAPP_TOKEN"), false);
});

test("whatsapp recovery template: Telnyx by default, exact payload, from the saved sender; missing list", async () => {
  const wa = await import("../src/lib/whatsapp");
  const keep = { ...process.env };
  for (const k of ["WHATSAPP_PROVIDER", "TELNYX_WHATSAPP_FROM", "WHATSAPP_TEMPLATE_RECOVERY", "WHATSAPP_TEMPLATE_LANG", "TELNYX_API_KEY"]) delete process.env[k];
  try {
    assert.deepEqual(wa.whatsappMissing(), ["WHATSAPP_TEMPLATE_RECOVERY", "TELNYX_API_KEY", "TELNYX_WHATSAPP_FROM"]);
    Object.assign(process.env, { TELNYX_API_KEY: "KEY_test", TELNYX_WHATSAPP_FROM: "+351910348577", WHATSAPP_TEMPLATE_RECOVERY: "trilogia_retomar" });
    assert.equal(wa.whatsappConfigured(), true);
    const calls: { url: string; init: RequestInit }[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ data: { id: "m1" } }), { status: 200 });
    }) as typeof fetch;
    try {
      await wa.sendRecoveryTemplate("+351916926644", "Ana", "2 caixas", "retomar/abc.def");
    } finally {
      globalThis.fetch = realFetch;
    }
    assert.equal(calls[0].url, "https://api.telnyx.com/v2/messages/whatsapp");
    assert.equal((calls[0].init.headers as Record<string, string>).Authorization, "Bearer KEY_test");
    const body = JSON.parse(String(calls[0].init.body));
    assert.equal(body.from, "+351910348577");
    assert.equal(body.to, "+351916926644");
    assert.equal(body.whatsapp_message.type, "template");
    assert.equal(body.whatsapp_message.template.name, "trilogia_retomar");
    assert.equal(body.whatsapp_message.template.language.code, "pt_PT");
    assert.deepEqual(body.whatsapp_message.template.components, [
      { type: "body", parameters: [{ type: "text", text: "Ana" }, { type: "text", text: "2 caixas" }] },
      { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "retomar/abc.def" }] },
    ]);
    globalThis.fetch = (async () => new Response(JSON.stringify({ errors: [{ code: "40008" }] }), { status: 400 })) as typeof fetch;
    await assert.rejects(wa.sendRecoveryTemplate("+351916926644", "Ana", "2 caixas", "retomar/x"), /Telnyx WhatsApp 400/);
    globalThis.fetch = realFetch;
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in keep)) delete process.env[k];
    Object.assign(process.env, keep);
  }
});

test("whatsapp template: the definition matches what the reminder sends; create posts it with the WABA id", async () => {
  const wa = await import("../src/lib/whatsapp");
  const d = wa.recoveryTemplateDefinition("pt", "https://vinho.prendadenatal.com");
  assert.equal(d.name, "trilogia_retomar");
  assert.equal(d.category, "MARKETING");
  assert.equal(d.language, "pt_PT");
  const body = d.components[0] as { type: string; text: string; example: { body_text: string[][] } };
  assert.equal(body.type, "BODY");
  assert.match(body.text, /^Olá \{\{1\}\}! A sua Trilogia 2160 \(\{\{2\}\}\)/);
  assert.deepEqual(body.example.body_text, [["Maria", "2 caixas"]]); // two variables, two examples
  const button = (d.components[1] as { buttons: { type: string; url: string; example: string[] }[] }).buttons[0];
  assert.equal(button.type, "URL");
  assert.equal(button.url, "https://vinho.prendadenatal.com/{{1}}");
  assert.equal(button.example[0], "https://vinho.prendadenatal.com/retomar/abc123");

  const keep = { ...process.env };
  const realFetch = globalThis.fetch;
  try {
    delete process.env.WHATSAPP_WABA_ID;
    process.env.TELNYX_API_KEY = "KEY_test";
    assert.equal((await wa.createRecoveryTemplate()).ok, false); // no WABA id: nothing sent
    process.env.WHATSAPP_WABA_ID = "840441822391639";
    const calls: { url: string; init: RequestInit }[] = [];
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ data: { id: "t1", status: "PENDING" } }), { status: 200 });
    }) as typeof fetch;
    const r = await wa.createRecoveryTemplate();
    if (/^https:/.test((await import("../src/lib/site")).SITE.url)) {
      assert.equal(r.ok, true, r.message);
      // First the list of existing templates (GET), then one POST per missing language.
      const posts = calls.filter((c) => c.init.method === "POST");
      assert.equal(posts[0].url, "https://api.telnyx.com/v2/whatsapp/message_templates");
      const sent = JSON.parse(String(posts[0].init.body));
      assert.equal(sent.waba_id, "840441822391639");
      assert.equal(sent.name, "trilogia_retomar");
    } else {
      assert.equal(r.ok, false); // a non-https site address never goes into a template
      assert.equal(calls.length, 0);
    }
  } finally {
    globalThis.fetch = realFetch;
    for (const k of Object.keys(process.env)) if (!(k in keep)) delete process.env[k];
    Object.assign(process.env, keep);
  }
});

test("the inbound forward number must be E.164", () => {
  assert.match(String(os.validateOutbound({ TELNYX_INBOUND_FORWARD_TO: "916926644" }).error), /E\.164/);
  assert.equal(os.validateOutbound({ TELNYX_INBOUND_FORWARD_TO: "+351916926644" }).error, null);
});
