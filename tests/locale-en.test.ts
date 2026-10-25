// English (en): a language of the Portugal market, for English speakers living in Portugal.
import { test } from "node:test";
import assert from "node:assert/strict";
process.env.SESSION_SECRET = "x".repeat(40);
const { MARKETS, COUNTRIES_FOR_LOCALE, defaultCountry, localeFromAcceptLanguage } = await import("../src/lib/markets");
const { legalHref, legalKindFromSlug, homeHref } = await import("../src/lib/i18n/paths");
const { getDict, moneyFor, deliveryDaysFor } = await import("../src/lib/i18n");
const { fmt } = await import("../src/lib/i18n/rich");
const { pt } = await import("../src/lib/i18n/pt");
const { en } = await import("../src/lib/i18n/en");
const { CONSENT_COPY } = await import("../src/lib/i18n/consent");
const { homeLocaleFor } = await import("../src/lib/visitor");
const { ebookKey, ebookFileName, guideImage } = await import("../src/lib/ebook");
const { callScript, saidStop } = await import("../src/lib/recovery");

test("en is a locale of the Portugal market only, never picked from the browser", () => {
  assert.deepEqual(COUNTRIES_FOR_LOCALE.en, ["PT"]);
  assert.equal(defaultCountry("en"), "PT");
  assert.ok(MARKETS.PT.locales.includes("en"));
  for (const c of ["DE", "NL", "BE", "LU"] as const) assert.equal(MARKETS[c].locales.includes("en"), false);
  // Many Portuguese use English phones: an English browser in Portugal stays on the Portuguese page.
  assert.equal(localeFromAcceptLanguage("en-GB,en;q=0.9,pt;q=0.8"), "pt");
  assert.equal(homeLocaleFor({ ipCountry: "PT", savedLocale: null, browserLocale: localeFromAcceptLanguage("en-US,en") }, ["PT"]), "pt");
  // Chosen in the switcher: kept.
  assert.equal(homeLocaleFor({ ipCountry: "PT", savedLocale: "en", browserLocale: null }, ["PT"]), "en");
});

test("en dictionary has every key of pt and no Portuguese or Russian leftovers", () => {
  const keys = (o: unknown, p = ""): string[] =>
    o && typeof o === "object" && !Array.isArray(o) ? Object.entries(o).flatMap(([k, v]) => keys(v, `${p}${k}.`)) : [p];
  assert.deepEqual(keys(en).sort(), keys(pt).sort());
  const text = JSON.stringify(en);
  assert.equal(/[А-Яа-яЁё]/.test(text), false);
  for (const w of [" caixa", " garrafas", " envio ", "Obrigad", " encomenda"]) assert.equal(text.includes(w), false, w);
});

test("en pages, money, delivery days and plurals", () => {
  assert.equal(homeHref("en"), "/en");
  assert.equal(legalHref("shipping", "en"), "/en/delivery-returns");
  assert.equal(legalKindFromSlug("en", "privacy"), "privacy");
  assert.equal(moneyFor("en")(4990), "€49.90");
  assert.equal(deliveryDaysFor("en", "2 a 4"), "2-4");
  const d = getDict("en");
  assert.equal(fmt(d.common.nBoxes, { n: 1 }), "1 box");
  assert.equal(fmt(d.common.nBoxes, { n: 4 }), "4 boxes");
  assert.equal(fmt(d.common.bottles, { n: 12 }), "12 bottles");
  assert.ok(CONSENT_COPY.en.accept === "Accept");
});

test("en e-book, cover image and AI call", () => {
  assert.equal(ebookKey("en"), "private/ebook/sabores-de-portugal-2160-en.pdf");
  assert.equal(ebookFileName("en"), "Sabores-de-Portugal-Recipes.pdf");
  assert.equal(guideImage("guide", "en"), "/lp/guide.en.webp");
  const order = { id: "WP-1", customerName: "Anna Smith", totalCents: 8990, qtyBoxes: 2, locale: "en", country: "PT" } as never;
  const s = callScript(order, "30/11/2026", true, "sms", "2 a 4");
  assert.match(s.greeting, /^Hello Anna! This is Madalena/);
  assert.match(s.instructions, /Speak English/);
  assert.match(s.instructions, /mainland Portugal only, in 2-4 working days/);
  assert.equal(saidStop("please don't call me again"), true);
});
