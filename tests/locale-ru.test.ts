// Russian (ru): a language of the Portugal market, for the Russian-speaking community living in Portugal.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { Locale } from "../src/lib/markets";
process.env.SESSION_SECRET = "x".repeat(40);
const { LOCALES, LOCALE_INFO, MARKETS, COUNTRIES_FOR_LOCALE, isLocale, defaultCountry, localeFromAcceptLanguage } = await import("../src/lib/markets");
const { LEGAL_SLUGS, legalHref, legalKindFromSlug, homeHref } = await import("../src/lib/i18n/paths");
const { getDict, moneyFor, moneyShortFor, dateFor, deliveryDaysFor } = await import("../src/lib/i18n");
const { fmt, pluralRu } = await import("../src/lib/i18n/rich");
const { pt } = await import("../src/lib/i18n/pt");
const { CONSENT_COPY } = await import("../src/lib/i18n/consent");
const { homeLocaleFor, countryFor, languagesOf } = await import("../src/lib/visitor");
const { EBOOK_LOCALES, ebookKey, ebookFileName } = await import("../src/lib/ebook");

test("ru is a locale of the Portugal market only", () => {
  assert.ok((LOCALES as readonly string[]).includes("ru"));
  assert.equal(isLocale("ru"), true);
  assert.deepEqual(COUNTRIES_FOR_LOCALE.ru, ["PT"]);
  assert.equal(defaultCountry("ru"), "PT");
  // Portuguese stays the default for Portugal; Russian comes second.
  assert.deepEqual(MARKETS.PT.locales, ["pt", "ru", "en"]);
  for (const c of ["DE", "NL", "BE", "LU"] as const) assert.equal(MARKETS[c].locales.includes("ru"), false);
  assert.deepEqual(LOCALE_INFO.ru, { intl: "ru-RU", htmlLang: "ru", og: "ru_RU", name: "Русский" });
  assert.deepEqual(languagesOf(["PT"]), ["pt", "ru", "en"]);
});

test("ru money and dates keep the Portuguese market format", () => {
  assert.equal(moneyFor("ru")(4990), "49,90 €");
  assert.equal(moneyFor("ru")(8490), "84,90 €");
  assert.equal(moneyShortFor("ru")(4000), "40 €");
  assert.equal(moneyShortFor("ru")(3990), "39,90 €");
  assert.equal(dateFor("ru", "2026-11-30T23:59:00Z"), "30.11.2026");
});

test("ru legal slugs resolve", () => {
  assert.deepEqual(LEGAL_SLUGS.ru, { terms: "usloviya", privacy: "konfidentsialnost", shipping: "dostavka-i-vozvrat" });
  assert.equal(homeHref("ru"), "/ru");
  assert.equal(legalHref("terms", "ru"), "/ru/usloviya");
  assert.equal(legalHref("privacy", "ru"), "/ru/konfidentsialnost");
  assert.equal(legalHref("shipping", "ru"), "/ru/dostavka-i-vozvrat");
  assert.equal(legalKindFromSlug("ru", "usloviya"), "terms");
  assert.equal(legalKindFromSlug("ru", "konfidentsialnost"), "privacy");
  assert.equal(legalKindFromSlug("ru", "dostavka-i-vozvrat"), "shipping");
  assert.equal(legalKindFromSlug("ru", "termos"), null);
});

/** Every leaf path with its string ("a.b.0"), and the shape (object keys, array lengths). */
function leaves(x: unknown, path = ""): [string, string][] {
  if (typeof x === "string") return [[path, x]];
  if (Array.isArray(x)) return x.flatMap((v, i) => leaves(v, `${path}.${i}`));
  return Object.entries(x as Record<string, unknown>).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k));
}
const placeholders = (s: string) => new Set([...s.matchAll(/\{(\w+)(?:\|[^{}]*)?\}/g)].map((m) => m[1]));

test("every dictionary has exactly the keys of pt.ts", () => {
  const ref = leaves(pt).map(([p]) => p).sort();
  for (const l of LOCALES) assert.deepEqual(leaves(getDict(l)).map(([p]) => p).sort(), ref, `keys of ${l}`);
});

test("ru dictionary: translated, same placeholders, no dashes", () => {
  const ru = new Map(leaves(getDict("ru")));
  const bad: string[] = [];
  for (const [path, src] of leaves(pt)) {
    const s = ru.get(path)!;
    // A Russian string may drop a placeholder it does not need ({country}: always Portugal), never invent one.
    for (const p of placeholders(s)) assert.ok(placeholders(src).has(p), `${path}: unknown {${p}}`);
    for (const tag of ["<a1>", "<a2>", "<b>", "<em>", "<br>"]) if (src.includes(tag)) assert.ok(s.includes(tag), `${path}: missing ${tag}`);
    assert.ok(!/[\u2014\u2013]/.test(s), `${path}: dash`);
    // Russian copy, apart from names (brands, wines, payment methods) and symbols.
    const words = s.replace(/<[^>]+>|\{[^}]*\}/g, " ").match(/[A-Za-zÀ-ÿ]{4,}/g) ?? [];
    const names = /^(Trilogia|Douro|Onde|Tudo|Nasce|Martin|Boutique|Wines|Wine|Portugal|Branco|Tinto|Sabores|WhatsApp|Visa|Mastercard|Apple|Google|Stripe|ifthenpay|Multibanco|Email|email|Bancontact|iDEAL|Natal|Feliz|Pagamentos|Servi[çc]os|Analytics|Meta|bacalhau|lagareiro|arroz|pato|postal|localidade|Livro|Reclama[çc][õo]es|Entidade|Rosé|Ros|cookies|c[óo]digo|TODO)$/i;
    const stray = words.filter((w) => !names.test(w));
    if (path !== "email.htmlLang" && stray.length) bad.push(`${path}: ${stray.join(",")}`);
  }
  assert.deepEqual(bad, []);
  assert.equal(getDict("ru").email.htmlLang, "ru");
  assert.ok(CONSENT_COPY.ru.accept);
});

test("Russian plurals", () => {
  assert.deepEqual([1, 2, 4, 5, 11, 12, 21, 22, 25, 112].map((n) => pluralRu(n, "коробка", "коробки", "коробок")), ["коробка", "коробки", "коробки", "коробок", "коробок", "коробок", "коробка", "коробки", "коробок", "коробок"]);
  assert.equal(pluralRu("2-4", "день", "дня", "дней"), "дня");
  assert.equal(pluralRu("3-5", "день", "дня", "дней"), "дней");
  const ru = getDict("ru");
  assert.equal(fmt(ru.common.nBoxes, { n: 2 }), "2 коробки");
  assert.equal(fmt(ru.common.bottles, { n: 3 }), "3 бутылки");
  assert.equal(fmt(ru.common.bottles, { n: 12 }), "12 бутылок");
  assert.equal(fmt(ru.market.PT.deliveryText, { days: deliveryDaysFor("ru", "2 a 4") }), "Доставка за 2-4 рабочих дня · континентальная Португалия");
  // Portuguese is untouched by the plural syntax and by the days helper.
  assert.equal(deliveryDaysFor("pt", "2 a 4"), "2 a 4");
  assert.equal(fmt(pt.common.nBoxes, { n: 2 }), "2 caixas");
});

test("Accept-Language ru from Portugal opens the Russian shop", () => {
  const v = (ipCountry: string | null, browserLocale: Locale | null = null, savedLocale: Locale | null = null) => ({ ipCountry, savedLocale, browserLocale });
  assert.equal(localeFromAcceptLanguage("ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7"), "ru");
  assert.equal(localeFromAcceptLanguage("pt-PT,pt;q=0.9,ru;q=0.8"), "pt");
  assert.equal(homeLocaleFor(v("PT", localeFromAcceptLanguage("ru-RU,ru;q=0.9")), ["PT"]), "ru");
  assert.equal(homeLocaleFor(v("PT"), ["PT"]), "pt"); // Portugal default stays Portuguese
  assert.equal(homeLocaleFor(v("PT", "ru", "pt"), ["PT"]), "pt"); // an explicit choice wins
  assert.equal(homeLocaleFor(v("DE", "ru"), ["PT", "DE"]), "de"); // Russian is not offered outside Portugal
  assert.equal(homeLocaleFor(v(null, "ru"), ["PT"]), "pt");
  assert.equal(countryFor("ru", v("PT")), "PT");
  assert.equal(countryFor("ru", v("DE")), "PT");
});

test("ru edition of the gift guide", () => {
  assert.ok((EBOOK_LOCALES as readonly string[]).includes("ru"));
  assert.match(ebookKey("ru"), /-ru\.pdf$/);
  assert.equal(ebookFileName("ru"), "Sabores-de-Portugal-Retsepty.pdf");
});
