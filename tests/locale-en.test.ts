// English (en): a language of the Portugal market, for English speakers living in Portugal.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Locale } from "../src/lib/markets";
process.env.SESSION_SECRET = "x".repeat(40);
const { MARKETS, COUNTRIES_FOR_LOCALE, isLocale, defaultCountry, localeFromAcceptLanguage } = await import("../src/lib/markets");
const { legalHref, legalKindFromSlug, homeHref } = await import("../src/lib/i18n/paths");
const { getDict, moneyFor, dateFor, deliveryDaysFor } = await import("../src/lib/i18n");
const { fmt } = await import("../src/lib/i18n/rich");
const { pt } = await import("../src/lib/i18n/pt");
const { CONSENT_COPY } = await import("../src/lib/i18n/consent");
const { homeLocaleFor, countryFor } = await import("../src/lib/visitor");
const { EBOOK_LOCALES, ebookKey, ebookFileName, guideImage } = await import("../src/lib/ebook");
const { LEGAL_CONTENT, LEGAL_UPDATED } = await import("../src/components/legal/content");
const { callScript, saidStop } = await import("../src/lib/recovery");
const { existsSync } = await import("node:fs");

test("en is a locale of the Portugal market only", () => {
  assert.equal(isLocale("en"), true);
  assert.deepEqual(COUNTRIES_FOR_LOCALE.en, ["PT"]);
  assert.equal(defaultCountry("en"), "PT");
  for (const c of ["DE", "NL", "BE", "LU"] as const) assert.equal(MARKETS[c].locales.includes("en"), false);
  assert.equal(moneyFor("en")(4990), "€49.90");
  assert.equal(dateFor("en", "2026-11-30T12:00:00Z"), "30/11/2026");
  assert.equal(deliveryDaysFor("en", "2 a 4"), "2-4");
});

test("English is never picked from the browser language", () => {
  const v = (ipCountry: string | null, browserLocale: Locale | null = null, savedLocale: Locale | null = null) => ({ ipCountry, savedLocale, browserLocale });
  assert.equal(localeFromAcceptLanguage("en-US,en;q=0.9"), null);
  assert.equal(localeFromAcceptLanguage("en-GB,en;q=0.9,pt;q=0.8"), "pt");
  assert.equal(homeLocaleFor(v("PT", localeFromAcceptLanguage("en-US,en;q=0.9")), ["PT"]), "pt");
  assert.equal(homeLocaleFor(v("DE", localeFromAcceptLanguage("en-US,de;q=0.8")), ["PT", "DE"]), "de");
  assert.equal(homeLocaleFor(v("PT", null, "en"), ["PT"]), "en"); // chosen in the switcher
  assert.equal(countryFor("en", v("DE")), "PT");
});

test("en legal pages", () => {
  assert.equal(homeHref("en"), "/en");
  assert.equal(legalHref("terms", "en"), "/en/terms");
  assert.equal(legalHref("privacy", "en"), "/en/privacy");
  assert.equal(legalHref("shipping", "en"), "/en/shipping-returns");
  assert.equal(legalKindFromSlug("en", "shipping-returns"), "shipping");
  assert.ok(LEGAL_CONTENT.en?.terms && LEGAL_CONTENT.en.privacy && LEGAL_CONTENT.en.shipping);
  assert.equal(LEGAL_UPDATED.en, "1 October 2026");
});

/** Every leaf path with its string ("a.b.0"). */
function leaves(x: unknown, path = ""): [string, string][] {
  if (typeof x === "string") return [[path, x]];
  if (Array.isArray(x)) return x.flatMap((v, i) => leaves(v, `${path}.${i}`));
  return Object.entries(x as Record<string, unknown>).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
}
const placeholders = (s: string) => new Set([...s.matchAll(/\{(\w+)(?:\|[^{}]*)?\}/g)].map((m) => m[1]));

test("en dictionary: same placeholders and markup, translated", () => {
  const en = new Map(leaves(getDict("en")));
  let same = 0;
  for (const [path, src] of leaves(pt)) {
    const s = en.get(path)!;
    for (const p of placeholders(s)) assert.ok(placeholders(src).has(p), `${path}: unknown {${p}}`);
    for (const tag of ["<a1>", "<a2>", "<b>", "<em>", "<br>"]) if (src.includes(tag)) assert.ok(s.includes(tag), `${path}: missing ${tag}`);
    assert.ok(!/\{\w+\|/.test(s), `${path}: Russian plural syntax`);
    if (s === src && /[a-zà-ÿ]{5,}/i.test(s)) same++;
  }
  assert.ok(same < 25, `${same} strings left in Portuguese`);
  assert.equal(getDict("en").email.htmlLang, "en");
  assert.equal(fmt(getDict("en").common.nBoxes, { n: 2 }), "2 boxes");
  assert.ok(CONSENT_COPY.en.accept);
});

test("en gift guide and AI call", () => {
  assert.ok((EBOOK_LOCALES as readonly string[]).includes("en"));
  assert.match(ebookKey("en"), /-en\.pdf$/);
  assert.equal(ebookFileName("en"), "Sabores-de-Portugal-Recipes.pdf");
  for (const n of ["guide", "guide-768", "guide-thumb"] as const) assert.ok(existsSync(`public${guideImage(n, "en")}`), n);
  const order = { id: "WP-1", customerName: "Anna Smith", totalCents: 4990, qtyBoxes: 1, locale: "en", country: "PT" } as never;
  const s = callScript(order, "30/11", true, "email");
  assert.match(s.greeting, /^Hello Anna! This is Emma/);
  assert.match(s.instructions, /Speak English/);
  assert.ok(saidStop("the customer said they are not interested"));
});
