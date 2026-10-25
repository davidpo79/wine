// Customer messages outside the pages follow the customer's language: abandoned-checkout email, SMS, WhatsApp
// template and AI call; lead emails; the stop/unsubscribe pages. Portuguese stays byte-identical to what was sent before.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Order } from "../src/db/schema";

// The Portuguese fixture was captured from the code before this change with these values.
process.env.SESSION_SECRET = "dev";
process.env.SITE_URL = "http://localhost:3000";
const DB_URL = process.env.TEST_DATABASE_URL ?? process.env.HUMAN_CALLS_DB_URL;
if (DB_URL) process.env.DATABASE_URL = DB_URL;

const email = await import("../src/lib/email");
const recovery = await import("../src/lib/recovery");
const wa = await import("../src/lib/whatsapp");
const { assistantFor } = await import("../src/lib/telnyx");
const { getDict, dayMonthFor, apiErrorsFor } = await import("../src/lib/i18n");
const { linkPageHtml } = await import("../src/lib/link-page");
const { shouldScheduleRecovery } = await import("../src/lib/draft");
const { LOCALES } = await import("../src/lib/markets");

const PT = JSON.parse(readFileSync(new URL("./fixtures/pt-messages.json", import.meta.url), "utf8")) as Record<string, { subject: string; html: string }>;
const LINK = "https://vinho.prendadenatal.com/retomar/T";
const STOP = "https://vinho.prendadenatal.com/api/recovery/stop?t=T";

const order = (over: Partial<Order> = {}) =>
  ({
    id: "WP-TEST1",
    locale: "pt",
    country: "PT",
    email: "ana@example.com",
    phone: "+351916000000",
    customerName: "Ana Silva",
    qtyBoxes: 2,
    subtotalCents: 8990,
    shippingCents: 0,
    totalCents: 8990,
    shippingAddress: { name: "Ana Silva", line1: "Rua A 1", postal_code: "1000-001", city: "Lisboa" },
    isGift: false,
    giftMessage: null,
    consentMessages: true,
    consentCalls: true,
    ...over,
  }) as unknown as Order;
const lead = (locale: string) => ({ name: "Ana Silva", email: "ana@example.com", locale });

const DASHES = new RegExp("[\\u2013\\u2014]"); // en and em dashes are never used as punctuation

test("Portuguese messages are byte-identical to before (recovery emails, lead emails, SMS, call SMS, pages)", () => {
  const cut = dayMonthFor("pt", "2026-11-30T23:59:00Z");
  assert.equal(cut, "30/11");
  for (const kind of ["first", "final"] as const) assert.deepEqual(email.recoveryEmail(order(), kind, LINK, STOP, cut), PT[`recovery_${kind}`]);
  assert.deepEqual(email.leadCodeEmail(lead("pt"), "NATAL5", 5, 2, cut, true), PT.lead_code_2);
  assert.deepEqual(email.leadCodeEmail(lead("pt"), "NATAL5", 5, 1, cut, true), PT.lead_code_1);
  assert.deepEqual(email.leadReminderEmail(lead("pt"), "NATAL5", 5, "30/11/2026"), PT.lead_reminder);
  // SMS exactly as the old template literal built it, with and without a first name.
  assert.equal(
    recovery.recoverySmsText(order(), LINK, STOP, cut),
    `Wine Portugal: Olá Ana, a sua Trilogia 2160 (2 caixas) ficou por concluir. Retome aqui: ${LINK} Encomendas até 30/11 chegam antes do Natal. Para não receber mais: ${STOP}`,
  );
  assert.equal(
    recovery.recoverySmsText(order({ customerName: null, qtyBoxes: 1 }), LINK, STOP, cut),
    `Wine Portugal: A sua Trilogia 2160 (1 caixa) ficou por concluir. Retome aqui: ${LINK} Encomendas até 30/11 chegam antes do Natal. Para não receber mais: ${STOP}`,
  );
  assert.equal(getDict("pt").messages.recovery.callSms.replace("{link}", LINK), `Wine Portugal: como combinado, aqui está o link para concluir a sua Trilogia 2160: ${LINK}`);
  assert.equal(
    linkPageHtml("pt", "stopDone"),
    `<!doctype html><html lang="pt-PT"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Wine Portugal</title><body style="font:16px Arial;padding:40px;text-align:center;color:#202b25"><p>Pronto. Não voltará a receber mensagens nem chamadas sobre esta encomenda.</p><p><a href="/" style="color:#184b36">Voltar à loja</a></p></body></html>`,
  );
  assert.equal(apiErrorsFor(null).orderUnavailable, "Esta encomenda já não está disponível.");
});

test("recovery email per language: subject, greeting, button, cutoff, no Portuguese left", () => {
  const ru = email.recoveryEmail(order({ locale: "ru", customerName: "Ольга Иванова" }), "first", LINK, STOP, dayMonthFor("ru", "2026-11-30T23:59:00Z"));
  assert.equal(ru.subject, "Ваша Trilogia 2160 ждёт Вас");
  assert.match(ru.html, /<html lang="ru">/);
  assert.match(ru.html, /Здравствуйте, Ольга!/);
  assert.match(ru.html, /Завершить заказ/);
  assert.match(ru.html, /Заказы, оплаченные до 30\.11, будут доставлены до Рождества/);
  assert.match(ru.html, /Я не хочу больше получать сообщения об этом заказе/);
  assert.match(ru.html, /Trilogia 2160 · 2 коробки \(6 бутылок\)/);
  assert.doesNotMatch(ru.html, /Concluir|Olá|encomenda|Encomendas/);
  assert.equal(email.recoveryEmail(order({ locale: "ru" }), "final", LINK, STOP, "30.11").subject, "Последнее напоминание: Ваш рождественский подарок");

  const de = email.recoveryEmail(order({ locale: "de", country: "DE", customerName: "Anna Weber" }), "first", LINK, STOP, dayMonthFor("de", "2026-11-30T23:59:00Z"));
  assert.equal(de.subject, "Ihre Trilogia 2160 wartet auf Sie");
  assert.match(de.html, /Hallo Anna,/);
  assert.match(de.html, /Bestellung abschließen/);
  assert.match(de.html, /bis zum 30\.11\. bezahlt sind/);
  assert.doesNotMatch(de.html, /CTT|Portugal Continental|Concluir|Olá/);
  for (const l of LOCALES) {
    for (const k of ["first", "final"] as const) {
      const m = email.recoveryEmail(order({ locale: l }), k, LINK, STOP, "30/11");
      assert.doesNotMatch(m.subject + m.html, DASHES, `${l} ${k}`);
    }
  }
});

test("lead emails per language: code, scope, link to the language home with ?codigo=", () => {
  const ru = email.leadCodeEmail(lead("ru"), "NATAL5", 5, 2, "30.11", true);
  assert.equal(ru.subject, "Ваш код NATAL5: скидка 5% на Trilogia 2160");
  assert.match(ru.html, /<strong>скидка 5%<\/strong> при заказе от 1 до 2 коробок Trilogia 2160/);
  assert.match(ru.html, /href="http:\/\/localhost:3000\/ru\?codigo=NATAL5#escolher"/);
  assert.match(ru.html, /Sabores de Portugal в подарок\. Заказы до 30\.11/);
  assert.match(email.leadCodeEmail(lead("ru"), "NATAL5", 5, 1, "30.11", false).html, /при заказе 1 коробки/);
  assert.doesNotMatch(email.leadCodeEmail(lead("ru"), "NATAL5", 5, 2, "30.11", false).html, /Sabores/);
  const de = email.leadCodeEmail(lead("de"), "NATAL5", 5, 2, "30.11.", true);
  assert.match(de.html, /href="http:\/\/localhost:3000\/de\?codigo=NATAL5#escolher"/);
  assert.match(de.html, /5 % Rabatt<\/strong> auf 1 bis 2 Boxen/);
  const rr = email.leadReminderEmail(lead("ru"), "NATAL5", 5, "30.11.2026");
  assert.equal(rr.subject, "Осталось несколько дней: рождественские заказы до 30.11.2026");
  assert.match(rr.html, /Ваш код <strong>NATAL5<\/strong> \(скидка 5%\) по-прежнему действует/);
  assert.equal(email.leadCodeUrl("pt", "NATAL5"), "http://localhost:3000/?codigo=NATAL5#escolher");
  // Unknown language on a lead: Portuguese.
  assert.deepEqual(email.leadCodeEmail(lead("xx"), "NATAL5", 5, 2, "30/11", true), PT.lead_code_2);
});

test("SMS text and box labels per language (Russian plurals)", () => {
  assert.equal(recovery.bundleLabel(order({ locale: "ru", qtyBoxes: 1 })), "1 коробка");
  assert.equal(recovery.bundleLabel(order({ locale: "ru", qtyBoxes: 2 })), "2 коробки");
  assert.equal(recovery.bundleLabel(order({ locale: "ru", qtyBoxes: 4 })), "4 коробки");
  assert.equal(recovery.bundleLabel(order({ locale: "ru", qtyBoxes: 5 })), "5 коробок");
  assert.equal(recovery.bundleLabel(order({ locale: "ru", qtyBoxes: 21 })), "21 коробка");
  assert.equal(recovery.bundleLabel(order({ locale: "pt", qtyBoxes: 1 })), "1 caixa");
  assert.equal(recovery.bundleLabel(order({ locale: "pt", qtyBoxes: 2 })), "2 caixas");
  assert.equal(recovery.bundleLabel(order({ locale: "de", qtyBoxes: 2 })), "2 Boxen");
  assert.equal(
    recovery.recoverySmsText(order({ locale: "ru", customerName: "Ольга Иванова", qtyBoxes: 4 }), LINK, STOP, "30.11"),
    `Wine Portugal: Здравствуйте, Ольга! Ваш заказ Trilogia 2160 (4 коробки) не завершён. Продолжить: ${LINK} Заказы до 30.11 будут доставлены до Рождества. Отказаться от сообщений: ${STOP}`,
  );
  const de = recovery.recoverySmsText(order({ locale: "de", country: "DE", customerName: "Anna Weber" }), LINK, STOP, "30.11.");
  assert.equal(de, `Wine Portugal: Hallo Anna, Ihre Bestellung der Trilogia 2160 (2 Boxen) ist noch nicht abgeschlossen. Hier geht es weiter: ${LINK} Bestellungen bis zum 30.11. kommen vor Weihnachten an. Keine Nachrichten mehr: ${STOP}`);
  assert.doesNotMatch(de, /CTT|Continental/);
  for (const l of LOCALES) assert.doesNotMatch(recovery.recoverySmsText(order({ locale: l }), LINK, STOP, "30/11"), DASHES);
});

test("WhatsApp template definitions: pt_PT unchanged; ru and de with the same structure and variables", () => {
  const ptDef = wa.recoveryTemplateDefinition("pt", "https://vinho.prendadenatal.com");
  // The APPROVED Portuguese template, exactly as it was submitted.
  assert.deepEqual(ptDef, {
    name: "trilogia_retomar",
    category: "MARKETING",
    language: "pt_PT",
    components: [
      {
        type: "BODY",
        text: "Olá {{1}}! A sua Trilogia 2160 ({{2}}) ficou à espera. Encomendas até 30/11 chegam antes do Natal. Para não receber mais mensagens, responda PARAR.",
        example: { body_text: [["Maria", "2 caixas"]] },
      },
      {
        type: "BUTTONS",
        buttons: [{ type: "URL", text: "Concluir encomenda", url: "https://vinho.prendadenatal.com/{{1}}", example: ["https://vinho.prendadenatal.com/retomar/abc123"] }],
      },
    ],
  });
  const expectLang = { ru: "ru", de: "de" } as const;
  for (const l of ["ru", "de"] as const) {
    const d = wa.recoveryTemplateDefinition(l, "https://vinho.prendadenatal.com");
    assert.equal(d.name, "trilogia_retomar");
    assert.equal(d.category, "MARKETING");
    assert.equal(d.language, expectLang[l]);
    assert.equal(d.components.length, 2);
    const body = d.components[0] as { type: string; text: string; example: { body_text: string[][] } };
    assert.equal(body.type, "BODY");
    assert.deepEqual(body.text.match(/\{\{\d+\}\}/g), ["{{1}}", "{{2}}"]); // same two variables, in order, once each
    assert.equal(body.example.body_text[0].length, 2);
    assert.ok(!/^\{\{|\}\}$/.test(body.text.trim()) && !/\}\}\.?$/.test(body.text.trim()), "a body cannot start or end with a variable");
    assert.ok(body.text.length <= 1024);
    assert.doesNotMatch(body.text, DASHES);
    const b = (d.components[1] as { type: string; buttons: { type: string; text: string; url: string; example: string[] }[] });
    assert.equal(b.type, "BUTTONS");
    assert.equal(b.buttons.length, 1);
    assert.equal(b.buttons[0].type, "URL");
    assert.equal(b.buttons[0].url, "https://vinho.prendadenatal.com/{{1}}");
    assert.deepEqual(b.buttons[0].example, ["https://vinho.prendadenatal.com/retomar/abc123"]);
    assert.ok(b.buttons[0].text.length <= 25, "Meta: button text up to 25 characters");
  }
  const ru = (wa.recoveryTemplateDefinition("ru").components[0] as { text: string }).text;
  assert.match(ru, /^Здравствуйте, \{\{1\}\}!/);
  assert.match(ru, /ответьте СТОП\.$/);
  const en = wa.recoveryTemplateDefinition("en");
  assert.equal(en.language, "en_GB");
  assert.match((en.components[0] as { text: string }).text, /^Hello \{\{1\}\}! .*Orders by 30\/11 arrive before Christmas\. .*reply STOP\.$/);
  const de = (wa.recoveryTemplateDefinition("de").components[0] as { text: string }).text;
  assert.match(de, /^Hallo \{\{1\}\}!/);
  assert.match(de, /antworten Sie STOPP\.$/);
  assert.doesNotMatch(de, /CTT|Portugal|30\/11/);
});

test("sendRecoveryTemplate picks the order's language and never sends Portuguese to another language", async () => {
  const keep = { ...process.env };
  const realFetch = globalThis.fetch;
  const sent: { code: string; params: unknown }[] = [];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const b = JSON.parse(String(init.body));
    sent.push({ code: b.whatsapp_message.template.language.code, params: b.whatsapp_message.template.components[0].parameters });
    return new Response(JSON.stringify({ data: { id: "m1" } }), { status: 200 });
  }) as typeof fetch;
  try {
    for (const k of ["WHATSAPP_PROVIDER", "WHATSAPP_TEMPLATE_LANG", "WHATSAPP_TEMPLATE_LANGS"]) delete process.env[k];
    Object.assign(process.env, { TELNYX_API_KEY: "KEY_test", TELNYX_WHATSAPP_FROM: "+351910348577", WHATSAPP_TEMPLATE_RECOVERY: "trilogia_retomar" });
    // pt order -> pt_PT (default, as before)
    await wa.sendRecoveryTemplate("+351916926644", "Ana", "2 caixas", "retomar/x", "pt");
    assert.equal(sent.at(-1)!.code, "pt_PT");
    // ru order, ru not approved -> skipped, nothing sent
    const n = sent.length;
    assert.deepEqual(await wa.sendRecoveryTemplate("+351916926644", "Ольга", "2 коробки", "retomar/x", "ru"), { skipped: "template_language_not_approved", locale: "ru" });
    assert.equal(sent.length, n);
    assert.equal(wa.recoveryTemplateLanguage("ru"), null);
    // ru approved -> ru
    process.env.WHATSAPP_TEMPLATE_LANGS = "ru";
    await wa.sendRecoveryTemplate("+351916926644", "Ольга", "2 коробки", "retomar/x", "ru");
    assert.equal(sent.at(-1)!.code, "ru");
    assert.deepEqual(sent.at(-1)!.params, [{ type: "text", text: "Ольга" }, { type: "text", text: "2 коробки" }]);
    // de not listed -> skipped; nl/fr have no template at all
    assert.equal(wa.recoveryTemplateLanguage("de"), null);
    process.env.WHATSAPP_TEMPLATE_LANGS = "ru, de";
    assert.equal(wa.recoveryTemplateLanguage("de"), "de");
    assert.equal(wa.recoveryTemplateLanguage("nl"), null);
    // en only once en_GB is listed as approved
    assert.equal(wa.recoveryTemplateLanguage("en"), null);
    process.env.WHATSAPP_TEMPLATE_LANGS = "ru, en_GB, de";
    assert.equal(wa.recoveryTemplateLanguage("en"), "en_GB");
    assert.equal(wa.recoveryTemplateLanguage("fr"), null);
    // Listing pt_PT or anything else never makes a Portuguese template go to a Russian order.
    process.env.WHATSAPP_TEMPLATE_LANGS = "pt_PT";
    assert.equal(wa.recoveryTemplateLanguage("ru"), null);
  } finally {
    globalThis.fetch = realFetch;
    for (const k of Object.keys(process.env)) if (!(k in keep)) delete process.env[k];
    Object.assign(process.env, keep);
  }
});

test("createRecoveryTemplate submits only the missing languages; status lists every language", async () => {
  const keep = { ...process.env };
  const realFetch = globalThis.fetch;
  const posts: { language: string }[] = [];
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    if (init.method === "GET")
      return new Response(JSON.stringify({ data: [{ name: "trilogia_retomar", language: "pt_PT", status: "APPROVED" }, { name: "trilogia_retomar", language: "ru", status: "APPROVED" }] }), { status: 200 });
    posts.push(JSON.parse(String(init.body)));
    return new Response(JSON.stringify({ data: { id: "t", status: "PENDING" } }), { status: 200 });
  }) as typeof fetch;
  try {
    Object.assign(process.env, { TELNYX_API_KEY: "KEY_test", WHATSAPP_WABA_ID: "840441822391639" });
    delete process.env.WHATSAPP_TEMPLATE_LANGS;
    const status = await wa.recoveryTemplateStatus();
    assert.match(status.message, /trilogia_retomar \(pt_PT\): APPROVED/);
    assert.match(status.message, /trilogia_retomar \(ru\): APPROVED/);
    assert.match(status.message, /Not created yet: en_GB, de\./);
    assert.match(status.message, /not in "Approved template languages" yet: ru/);
    const r = await wa.createRecoveryTemplate();
    if (/^https:/.test((await import("../src/lib/site")).SITE.url)) {
      assert.deepEqual(posts.map((p) => p.language), ["en_GB", "de"]); // pt_PT and ru already exist: untouched
      assert.match(r.message, /pt_PT: already there \(APPROVED\), not submitted/);
    } else {
      assert.equal(r.ok, false); // the test site is http: nothing is ever submitted
      assert.equal(posts.length, 0);
    }
  } finally {
    globalThis.fetch = realFetch;
    for (const k of Object.keys(process.env)) if (!(k in keep)) delete process.env[k];
    Object.assign(process.env, keep);
  }
});

test("AI call: a script per page language (pt, ru, de, nl, fr); only numbers of our markets; one assistant per language", async () => {
  const ptScript = recovery.callScript(order(), "30/11/2026");
  assert.match(ptScript.greeting, /^Olá, Ana! Fala a Madalena, assistente virtual da Wine Portugal\. Esta chamada pode ser gravada\./);
  assert.doesNotMatch(ptScript.greeting, /inteligência artificial/);
  assert.match(ptScript.instructions, /link por SMS/);
  // No Telnyx SMS yet: the link goes by email after the call, in the order's language.
  const ptEmail = recovery.callScript(order(), "30/11/2026", true, "email");
  assert.match(ptEmail.instructions, /link de pagamento por email logo a seguir à chamada/);
  assert.doesNotMatch(ptEmail.instructions, /SMS/);
  const ruEmail = recovery.callScript(order({ locale: "ru" }), "30.11.2026", true, "email");
  assert.match(ruEmail.instructions, /по электронной почте/);
  assert.doesNotMatch(ruEmail.instructions, /SMS/);

  const ru = recovery.callScript(order({ locale: "ru", customerName: "Ольга Иванова", qtyBoxes: 2 }), "30.11.2026");
  assert.match(ru.greeting, /^Здравствуйте, Ольга!/);
  assert.match(ru.greeting, /Это Ольга, виртуальный ассистент Wine Portugal/); // says it is a virtual assistant
  assert.match(ru.greeting, /может записываться/); // the call may be recorded
  assert.match(ru.instructions, /никогда не спрашивай данные карты/); // never asks for card data
  assert.match(ru.instructions, /не более 3 минут/);
  assert.match(ru.instructions, /старше 18 лет/);
  assert.match(ru.instructions, /\+351 910 348 577/);
  assert.match(ru.instructions, /по SMS на русском языке/);
  assert.match(ru.instructions, /CTT только по континентальной Португалии/);
  assert.match(ru.instructions, /2 коробки \(6 бутылок\), итого 89,90 €/);
  assert.match(ru.instructions, /1 коробка 49,90 €, 2 коробки 89,90 € \(вторая за 40 €\), 4 коробки 149,70 €/);
  assert.match(ru.instructions, /до 30\.11\.2026/);
  assert.doesNotMatch(ru.greeting + ru.instructions, /Olá|português|encomenda/);
  assert.doesNotMatch(ru.greeting + ru.instructions, DASHES);
  assert.doesNotMatch(recovery.callScript(order({ locale: "ru" }), "30.11.2026", false).instructions, /Sabores/);
  // de, nl, fr: greeting in the page language with the persona of its voice; the market's own facts.
  const de = recovery.callScript(order({ locale: "de", country: "DE", customerName: "Anna Schmidt", qtyBoxes: 2, totalCents: 8990 }), "30.11.2026", false, "email", "3 bis 5");
  assert.match(de.greeting, /^Hallo Anna! Hier ist Miriam, die virtuelle Assistentin von Wine Portugal\. Dieses Gespräch kann aufgezeichnet werden\./);
  assert.match(de.instructions, /Speak German/);
  assert.match(de.instructions, /2 boxes \(6 bottles\), total 89,90 euros/);
  assert.match(de.instructions, /warehouse in Belgium, delivery in 3 bis 5 working days; orders paid by 30\.11\.2026 arrive before Christmas/);
  assert.match(de.instructions, /Payment on the site: card, Apple Pay, Google Pay\./);
  assert.match(de.instructions, /email them the payment link right after the call/);
  assert.doesNotMatch(de.instructions, /MB WAY|Multibanco|CTT|Sabores/);
  const nl = recovery.callScript(order({ locale: "nl", country: "NL" }), "30.11.2026");
  assert.match(nl.greeting, /U spreekt met Katrien, de virtuele assistent van Wine Portugal/);
  assert.match(nl.instructions, /card, Apple Pay, Google Pay, iDEAL/);
  assert.doesNotMatch(nl.instructions, /delivery in/); // no delivery days set: none are promised
  const fr = recovery.callScript(order({ locale: "fr", country: "BE" }), "30.11.2026");
  assert.match(fr.greeting, /Ici Hélène, l'assistante virtuelle de Wine Portugal/);
  assert.match(fr.instructions, /Bancontact/);
  for (const x of [ptScript, ru, de, nl, fr]) assert.doesNotMatch(x.greeting + x.instructions, DASHES);
  // Call hours in the customer's time zone: 20:30 in Berlin is after hours, 19:30 in Lisbon is not.
  assert.equal(recovery.nextCallSlot(new Date("2026-11-11T19:30:00Z"), "Europe/Berlin").toISOString(), "2026-11-12T09:00:00.000Z");
  assert.equal(recovery.nextCallSlot(new Date("2026-11-11T19:30:00Z")).toISOString(), "2026-11-11T19:30:00.000Z");
  // Opt-out heard in the call, Portuguese as before and now Russian.
  for (const s of ["não me ligue mais", "não estou interessada", "пожалуйста, не звоните мне", "мне не интересно", "удалите мой номер"]) assert.equal(recovery.saidStop(s), true, s);
  assert.equal(recovery.saidStop("да, хочу завершить заказ"), false);
  assert.equal(getDict("ru").messages.recovery.callSms.replace("{link}", LINK), `Wine Portugal: как договорились, вот ссылка, чтобы завершить заказ Trilogia 2160: ${LINK}`);

  const step = { id: 1, step: "ai_call" };
  const keep = { ...process.env };
  try {
    Object.assign(process.env, { TELNYX_API_KEY: "KEY_test", TELNYX_FROM_NUMBER: "+351210000000", TELNYX_CONNECTION_ID: "c1", TELNYX_ASSISTANT_ID: "a-pt" });
    for (const k of ["RU", "DE", "NL", "FR"]) delete process.env[`TELNYX_ASSISTANT_ID_${k}`];
    // Every page language can be called, once its own assistant (native voice) is set up.
    for (const l of ["de", "nl", "fr"]) {
      const r = await recovery.runStep(step, order({ locale: l, country: l === "de" ? "DE" : "BE", phone: l === "de" ? "+4915123456789" : "+32470123456" }));
      assert.deepEqual(r.result, { reason: `${l}_assistant_not_configured` }, l);
      assert.equal(r.status, "skipped");
    }
    // Only numbers of the countries we sell to: anything else gets messages only, whatever the language.
    assert.deepEqual((await recovery.runStep(step, order({ locale: "de", country: "DE", phone: "+12025550123" }))).result, { reason: "non_market_phone" });
    // ru without the Russian assistant: no call (never the Portuguese assistant's voice).
    assert.deepEqual((await recovery.runStep(step, order({ locale: "ru" }))).result, { reason: "ru_assistant_not_configured" });
    assert.equal(assistantFor("ru"), null);
    assert.equal(assistantFor("pt"), "a-pt");
    process.env.TELNYX_ASSISTANT_ID_RU = "a-ru";
    assert.equal(assistantFor("ru"), "a-ru");
    assert.equal(assistantFor("de"), null);
    process.env.TELNYX_ASSISTANT_ID_DE = "a-de";
    assert.equal(assistantFor("de"), "a-de");
    // ru with its assistant: the call is dialed (Telnyx mocked), and the webhook later starts the Russian assistant.
    const realFetch = globalThis.fetch;
    const posted: { url: string; body: Record<string, unknown> }[] = [];
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      posted.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ data: { call_control_id: "cc1" } }), { status: 200 });
    }) as typeof fetch;
    try {
      const { startAssistant, LANGUAGE_RULE, HUMAN_RULE } = await import("../src/lib/telnyx");
      const { CONDUCT_RULE } = await import("../src/lib/inbound-agent");
      const withRule = `i\n\n${LANGUAGE_RULE}\n${HUMAN_RULE}\n${CONDUCT_RULE}`;
      await startAssistant("cc1", { greeting: "g", instructions: "i", state: { orderId: "WP-TEST1", stepId: 1 }, assistantId: assistantFor("ru") });
      assert.deepEqual(posted[0].body.assistant, { id: "a-ru", instructions: withRule });
      await startAssistant("cc1", { greeting: "g", instructions: "i", state: { orderId: "WP-TEST1", stepId: 1 }, assistantId: assistantFor("pt") });
      assert.deepEqual(posted[1].body.assistant, { id: "a-pt", instructions: withRule });
    } finally {
      globalThis.fetch = realFetch;
    }
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in keep)) delete process.env[k];
    Object.assign(process.env, keep);
  }
});

test("recovery is scheduled for every site language once email and phone are known", () => {
  const s = { recovery_enabled: true };
  for (const l of LOCALES) assert.equal(shouldScheduleRecovery(s, { locale: l, recoveryScheduledAt: null, email: "a@b.pt", phone: "+351916000000" }), true, l);
  assert.equal(shouldScheduleRecovery(s, { locale: "ru", recoveryScheduledAt: null, email: "a@b.pt", phone: null }), false);
  assert.equal(shouldScheduleRecovery(s, { locale: "ru", recoveryScheduledAt: new Date(), email: "a@b.pt", phone: "+351916000000" }), false);
  assert.equal(shouldScheduleRecovery({ recovery_enabled: false }, { locale: "ru", recoveryScheduledAt: null, email: "a@b.pt", phone: "+351916000000" }), false);
  assert.equal(shouldScheduleRecovery(s, { locale: "xx", recoveryScheduledAt: null, email: "a@b.pt", phone: "+351916000000" }), false);
});

test("stop/unsubscribe pages and API errors in the customer's language", () => {
  assert.match(linkPageHtml("ru", "stopDone"), /<html lang="ru">.*Вы больше не будете получать сообщения и звонки.*href="\/ru".*Вернуться в магазин/);
  assert.match(linkPageHtml("de", "unsubDone"), /<html lang="de">.*keine E-Mails mehr.*href="\/de"/);
  assert.equal(apiErrorsFor({ locale: "ru" }).orderUnavailable, "Этот заказ больше недоступен.");
  assert.equal(apiErrorsFor({ locale: "de" }).addFailed, "Hinzufügen nicht möglich. Es wurde nichts berechnet.");
  for (const l of LOCALES) assert.doesNotMatch(JSON.stringify(getDict(l).messages), DASHES, l);
});

const dbTest = (name: string, fn: () => Promise<void>) => test(name, { skip: !DB_URL && "TEST_DATABASE_URL not set" }, fn);

dbTest("a Russian draft with email and phone schedules the follow-ups; the reminder goes by Russian SMS when ru WhatsApp is not approved", async () => {
  const { db, schema, sql } = await import("../src/db");
  const { eq } = await import("drizzle-orm");
  const { updateDraft } = await import("../src/lib/draft");
  const { setSetting, getSettings } = await import("../src/lib/settings");
  const before = (await getSettings()).recovery_enabled;
  const [bundle] = await db.select().from(schema.bundles).limit(1);
  assert.ok(bundle, "seeded bundles (npm run db:seed)");
  const id = `WP-TRU-${Date.now()}`;
  const keep = { ...process.env };
  const realFetch = globalThis.fetch;
  try {
    await setSetting("recovery_enabled", true);
    const [o] = await db.insert(schema.orders).values({ id, bundleId: bundle.id, bundleKey: bundle.key, qtyBoxes: bundle.qty, subtotalCents: bundle.priceCents, shippingCents: 0, totalCents: bundle.priceCents, locale: "ru", country: "PT", consentMessages: true }).returning();
    await updateDraft(o, { email: `ru-${Date.now()}@example.com`, phone: "+351916000001", firstName: "Ольга" });
    const [scheduled] = await db.select().from(schema.orders).where(eq(schema.orders.id, id));
    assert.ok(scheduled.recoveryScheduledAt, "recovery scheduled");
    const steps = await db.select().from(schema.recoverySteps).where(eq(schema.recoverySteps.orderId, id));
    assert.deepEqual(steps.map((s) => s.step).sort(), ["ai_call", "final_email", "reminder_20m"]);

    // reminder_20m: WhatsApp is set up but only Portuguese is approved -> no WhatsApp, Russian SMS instead.
    for (const k of ["WHATSAPP_PROVIDER", "WHATSAPP_TEMPLATE_LANGS", "EMAIL_PROVIDER", "RESEND_API_KEY", "EMAIL_FROM"]) delete process.env[k];
    Object.assign(process.env, { TELNYX_API_KEY: "KEY_test", TELNYX_FROM_NUMBER: "+351210000000", TELNYX_WHATSAPP_FROM: "+351910348577", WHATSAPP_TEMPLATE_RECOVERY: "trilogia_retomar" });
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ data: { id: "m" } }), { status: 200 });
    }) as typeof fetch;
    const [fresh] = await db.select().from(schema.orders).where(eq(schema.orders.id, id));
    const r = await recovery.runStep({ id: steps[0].id, step: "reminder_20m" }, fresh);
    assert.equal(calls.some((c) => c.url.includes("whatsapp")), false, "no Portuguese template to a Russian customer");
    const sms = calls.find((c) => c.url.endsWith("/messages"));
    assert.ok(sms, "SMS sent");
    assert.match(String(sms.body.text), /^Wine Portugal: Здравствуйте, Ольга! Ваш заказ Trilogia 2160 \(\d+ (коробка|коробки|коробок)\) не завершён\./);
    const res = r.result as Record<string, unknown>;
    assert.equal(res.sms, "sent");
    assert.match(String(res.whatsapp), /^skipped/);
  } finally {
    globalThis.fetch = realFetch;
    for (const k of Object.keys(process.env)) if (!(k in keep)) delete process.env[k];
    Object.assign(process.env, keep);
    await db.delete(schema.recoverySteps).where(eq(schema.recoverySteps.orderId, id));
    await db.delete(schema.orderEvents).where(eq(schema.orderEvents.orderId, id));
    await db.delete(schema.orders).where(eq(schema.orders.id, id));
    await setSetting("recovery_enabled", before);
    await sql.end();
  }
});
