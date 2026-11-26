import { test } from "node:test";
import assert from "node:assert/strict";
process.env.SESSION_SECRET = "x".repeat(40);
const { DEFAULT_SETTINGS } = await import("../src/lib/settings-defaults");
const { BF_BUNDLES, BF_OFFERS, BF_OFFER_BUNDLES, bfBoxCost, bfOfferByPath, bfOfferFor, bfOpen, bfOpenCountries, bottlesPerBox, isBfBundle } = await import("../src/lib/black-friday");
const { bfCopyFor } = await import("../src/components/black-friday/copy");
const { bfLocaleForVisitor } = await import("../src/lib/black-friday-visitor");
const { computeOrderCosts } = await import("../src/lib/profit");
const { computeAmounts } = await import("../src/lib/draft");
const { postalValid, normalizePhoneFor } = await import("../src/lib/markets");

test("black friday bundles: 68,50 € a box, cheaper per box with more boxes, 6 bottles each", () => {
  assert.deepEqual(BF_BUNDLES.map((b) => b.priceCents), [6850, 12900, 18500]);
  const per = BF_BUNDLES.map((b) => b.priceCents / b.qty);
  assert.ok(per[0] > per[1] && per[1] > per[2]);
  assert.ok(BF_BUNDLES.every((b) => isBfBundle(b.key) && b.shippingCents === 0));
  assert.equal(bottlesPerBox("bf2"), 6);
  assert.equal(bottlesPerBox("x2"), 3);
  assert.equal(isBfBundle("x1"), false);
});

test("black friday costs: 30,50 € a box (David's numbers of 18/11/2026) and the profit before marketing", () => {
  const bf = DEFAULT_SETTINGS.black_friday;
  // Wine 15 + transport to Belgium 2,50 + shipping box 2,50 + handling 2 + delivery 8,50.
  assert.equal(bfBoxCost(bf), 3050);
  // 21% VAT included, 3% banking. 68,50 € -> 24,06 € before the 20% marketing (13,70 €).
  const fee3 = { percent: 3, fixed_cents: 0 };
  const s = { cost_model: { ...DEFAULT_SETTINGS.cost_model, payment_fees: { card: fee3, mb_way: fee3, multibanco: fee3, other: fee3 } }, upsell_products: [], black_friday: bf };
  const es1 = computeOrderCosts({ totalCents: 6850, qtyBoxes: 1, paymentMethodType: "card", bundleKey: "bf1", country: "ES" }, [], s);
  assert.equal(es1.vat, 1189);
  assert.equal(es1.profit, 2406);
  assert.equal(es1.wine + es1.shipping_boxes + es1.delivery + es1.other, 3050);
  // Germany: 19% VAT.
  const de1 = computeOrderCosts({ totalCents: 6850, qtyBoxes: 1, paymentMethodType: "card", bundleKey: "bf1", country: "DE" }, [], s);
  assert.equal(de1.vat, 1094);
  // David's German sheet (18/11/2026): 25,00 € before the 20% marketing (13,70 €) = about 11,31 € a box.
  assert.ok(Math.abs(de1.profit - 2500) <= 1, String(de1.profit));
  // More boxes: more profit per order.
  const es2 = computeOrderCosts({ totalCents: 12900, qtyBoxes: 2, paymentMethodType: "card", bundleKey: "bf2", country: "ES" }, [], s);
  const es3 = computeOrderCosts({ totalCents: 18500, qtyBoxes: 3, paymentMethodType: "card", bundleKey: "bf3", country: "ES" }, [], s);
  assert.ok(es2.profit - 0.2 * 12900 > es1.profit - 0.2 * 6850);
  assert.ok(es3.profit - 0.2 * 18500 > es2.profit - 0.2 * 12900);
});

test("black friday prices ignore the Christmas discount codes", () => {
  const b = { ...BF_BUNDLES[0], id: 1, productId: 2, active: true };
  const a = computeAmounts(b, DEFAULT_SETTINGS, DEFAULT_SETTINGS.lead_plus_code);
  assert.deepEqual(a, { subtotal: 6850, discount: 0, shipping: 0, total: 6850, promoCode: null });
});

test("black friday closes only with its own switch, never at the deadline or by country list (David, 26/11)", () => {
  assert.equal(DEFAULT_SETTINGS.black_friday.enabled, true);
  const bf = DEFAULT_SETTINGS.black_friday;
  assert.equal(bfOpen(bf, new Date("2026-11-27T22:58:00Z")), true);
  assert.equal(bfOpen(bf, new Date("2026-12-05T12:00:00Z")), true); // after the shown deadline: still open
  assert.equal(bfOpen({ ...bf, enabled: false }, new Date("2026-11-01T12:00:00Z")), false);
  assert.deepEqual([...bfOpenCountries({ ...bf, countries: ["DE"] })].sort(), ["BE", "DE", "ES", "NL", "PT"]); // a saved list cannot close a country
  assert.deepEqual(bfOpenCountries({ ...bf, enabled: false }), []);
});

test("black friday language follows the saved choice, then the phone, then the location", () => {
  const v = (savedLocale: string | null, browserLocale: string | null, ipCountry: string | null) => ({ savedLocale, browserLocale, ipCountry }) as never;
  assert.equal(bfLocaleForVisitor(v(null, null, "ES")), "es");
  assert.equal(bfLocaleForVisitor(v(null, null, "DE")), "de");
  assert.equal(bfLocaleForVisitor(v(null, null, "AT")), "de");
  assert.equal(bfLocaleForVisitor(v(null, "es", "DE")), "es"); // a Spanish phone in Germany
  assert.equal(bfLocaleForVisitor(v(null, null, "NL")), "nl");
  assert.equal(bfLocaleForVisitor(v(null, "fr", "BE")), "fr"); // a French phone in Belgium
  assert.equal(bfLocaleForVisitor(v("de", "es", "ES")), "de"); // picked German in the switcher
  assert.equal(bfLocaleForVisitor(v("pt", null, "ES")), null);
  assert.equal(bfLocaleForVisitor(v(null, null, "US")), null); // crawlers: keep the page asked for
});

test("spain: postal codes and phone numbers", () => {
  assert.equal(postalValid("28001", "ES"), "ok");
  assert.equal(postalValid("07001", "ES"), "ok"); // Balearic Islands
  assert.equal(postalValid("35001", "ES"), "excluded"); // Canary Islands
  assert.equal(postalValid("51001", "ES"), "excluded"); // Ceuta
  assert.equal(postalValid("2800", "ES"), "format");
  assert.equal(normalizePhoneFor("612 345 678", "ES"), "+34612345678");
  assert.equal(normalizePhoneFor("+34 612 345 678", "ES"), "+34612345678");
});

test("black friday offers in spain: sparkling (3 bottles, 90 €) and Poço do Canto (6 bottles, 55 €)", async () => {
  const { BF_OFFERS, BF_OFFER_BUNDLES, bfOfferFor, bfOfferByPath, bfOfferCountries, bfHref, contentIdFor } = await import("../src/lib/black-friday");
  assert.equal(bfOfferFor("bf2")?.id, "douro6");
  assert.equal(bfOfferFor("bfs1")?.id, "burbujas");
  assert.equal(bfOfferFor("bfp3")?.id, "poco");
  assert.equal(bfOfferFor("x2"), null);
  assert.equal(bottlesPerBox("bfs2"), 3);
  assert.equal(bottlesPerBox("bfp2"), 6);
  assert.equal(contentIdFor("bfs1"), BF_OFFERS.burbujas.slug);
  assert.equal(bfOfferByPath("espumoso")?.id, "burbujas");
  assert.equal(bfOfferByPath(""), null);
  assert.equal(bfHref("es", BF_OFFERS.poco), "/es/black-friday/poco-do-canto");
  assert.equal(bfHref("es"), "/es/black-friday");
  // Spain only, even while Germany sells the Douro box.
  assert.deepEqual(bfOfferCountries(BF_OFFERS.burbujas, ["DE", "ES"]), ["ES"]);
  assert.deepEqual(bfOfferCountries(BF_OFFERS.douro6, ["DE", "ES"]), ["DE", "ES"]);
  for (const id of ["burbujas", "poco"] as const) {
    const b = BF_OFFER_BUNDLES[id];
    assert.ok(b.every((x) => isBfBundle(x.key) && bfOfferFor(x.key)?.id === id && x.shippingCents === 0));
    const per = b.map((x) => x.priceCents / x.qty);
    assert.ok(per[0] > per[1] && per[1] > per[2]);
  }
  assert.equal(BF_OFFER_BUNDLES.burbujas[0].priceCents, 9000);
  assert.equal(BF_OFFER_BUNDLES.burbujas[0].compareAtCents, 18000);
  assert.equal(BF_OFFER_BUNDLES.poco[0].priceCents, 5500);
});

test("black friday sparkling costs: David's sheet (90 €: 79,32 € costs with 20% marketing, 10,68 € profit)", () => {
  const fee3 = { percent: 3, fixed_cents: 0 };
  const s = { cost_model: { ...DEFAULT_SETTINGS.cost_model, payment_fees: { card: fee3, mb_way: fee3, multibanco: fee3, other: fee3 } }, upsell_products: [], black_friday: DEFAULT_SETTINGS.black_friday };
  assert.equal(bfBoxCost(DEFAULT_SETTINGS.black_friday, "burbujas"), 4300);
  const c = computeOrderCosts({ totalCents: 9000, qtyBoxes: 1, paymentMethodType: "card", bundleKey: "bfs1", country: "ES" }, [], s);
  assert.equal(c.vat, 1562);
  assert.equal(c.payment_fees, 270);
  assert.equal(c.profit - 1800, 1068);
});

test("black friday one-time offer after payment: the other offer, Spain only, and its profit", async () => {
  const { bfCrossOffer } = await import("../src/lib/upsell");
  const { BF_OFFERS } = await import("../src/lib/black-friday");
  const fromBox = bfCrossOffer({ bundleKey: "bf1", country: "ES", locale: "es" });
  assert.equal(fromBox?.sku, BF_OFFERS.burbujas.slug);
  assert.equal(fromBox?.priceCents, 6900);
  assert.equal(bfCrossOffer({ bundleKey: "bfp2", country: "ES", locale: "es" })?.sku, BF_OFFERS.burbujas.slug);
  assert.equal(bfCrossOffer({ bundleKey: "bfs1", country: "ES", locale: "es" })?.sku, BF_OFFERS.douro6.slug);
  assert.equal(bfCrossOffer({ bundleKey: "bfs1", country: "ES", locale: "es" })?.priceCents, 5500);
  assert.equal(bfCrossOffer({ bundleKey: "bf1", country: "DE", locale: "de" }), null);
  assert.equal(bfCrossOffer({ bundleKey: "x2", country: "PT", locale: "pt" }), null);
  // 69 € sparkling on a 68,50 € box: wine 30 € only (same parcel), VAT 21% and 3% fee on both.
  const fee3 = { percent: 3, fixed_cents: 0 };
  const s = { cost_model: { ...DEFAULT_SETTINGS.cost_model, payment_fees: { card: fee3, mb_way: fee3, multibanco: fee3, other: fee3 } }, upsell_products: [], black_friday: DEFAULT_SETTINGS.black_friday };
  const base = computeOrderCosts({ totalCents: 6850, qtyBoxes: 1, paymentMethodType: "card", bundleKey: "bf1", country: "ES" }, [], s);
  const withAddon = computeOrderCosts({ totalCents: 6850, qtyBoxes: 1, paymentMethodType: "card", bundleKey: "bf1", country: "ES" }, [{ amountCents: 6900, boxes: 0, kind: "product", sku: BF_OFFERS.burbujas.slug }], s);
  assert.equal(withAddon.products, 3000);
  // 69 / 1,21 = 57,02 net, minus 30 € wine and 2,07 € fee = 24,95 € more profit.
  assert.equal(withAddon.profit - base.profit, 2495);
});

test("black friday Poço do Canto costs: David's sheet (55 €: 46,70 € costs with 20% marketing, 8,30 € profit)", () => {
  const fee3 = { percent: 3, fixed_cents: 0 };
  const s = { cost_model: { ...DEFAULT_SETTINGS.cost_model, payment_fees: { card: fee3, mb_way: fee3, multibanco: fee3, other: fee3 } }, upsell_products: [], black_friday: DEFAULT_SETTINGS.black_friday };
  assert.equal(bfBoxCost(DEFAULT_SETTINGS.black_friday, "poco"), 2450);
  const c = computeOrderCosts({ totalCents: 5500, qtyBoxes: 1, paymentMethodType: "card", bundleKey: "bfp1", country: "ES" }, [], s);
  assert.equal(c.vat, 955);
  assert.equal(c.payment_fees, 165);
  assert.equal(c.profit - 1100, 830);
});

test("Poço do Canto for Germany, the Netherlands and Belgium: own offer, prices and costs, same page path as Spain", () => {
  const o = BF_OFFERS.pocoeu;
  assert.deepEqual([...o.countries], ["DE", "NL", "BE"]);
  assert.equal(bfOfferByPath("poco-do-canto", "es")?.id, "poco");
  assert.equal(bfOfferByPath("poco-do-canto", "nl")?.id, "pocoeu");
  assert.equal(bfOfferByPath("poco-do-canto", "de")?.id, "pocoeu");
  assert.equal(bfOfferFor("bfq2")?.id, "pocoeu");
  assert.deepEqual(BF_OFFER_BUNDLES.pocoeu.map((b) => [b.priceCents, b.compareAtCents]), [[6000, 12000], [11000, 24000], [15900, 36000]]);
  assert.equal(bfBoxCost(DEFAULT_SETTINGS.black_friday, "pocoeu"), 2750); // 12 + 2,50 + 2,50 + 2 + 8,50 (+ 3% fee and 20% marketing = 41,30 €)
  for (const l of ["de", "nl", "fr"] as const) assert.ok(bfCopyFor("pocoeu", l), l);
  assert.equal(bfCopyFor("douro6", "nl"), null);
});

test("Black Friday panels reproduce David's numbers (3% fee, 20% marketing, VAT of the country)", async () => {
  const { bfPanel } = await import("../src/lib/bf-panels");
  const s = { black_friday: DEFAULT_SETTINGS.black_friday, cost_model: DEFAULT_SETTINGS.cost_model };
  const profit = (id: Parameters<typeof bfPanel>[0], price: number, c: string) => Math.round(bfPanel(id, s, price).countries.find((x) => x.country === c)!.profit);
  assert.equal(profit("douro6", 6850, "DE"), 1131); // Cheda: 11,31 € a box
  assert.equal(profit("pocoeu", 6000, "DE"), 912); // Poço do Canto: 9,12 €
  assert.equal(profit("pocoeu", 6000, "NL"), 829); // 8,29 €
  assert.equal(profit("galhofa", 6850, "BE"), 1036); // Galhofa NL/BE: 10,36 €
  assert.equal(Math.round(bfPanel("galhofa", s, 6850).ifAllSold!.profitMin), 372837); // 360 boxes (customs documents): 3.728,37 €
});

test("Sekt for Germany (19/11/2026): own page, bundles and Belgian warehouse box", async () => {
  const { BF_OFFERS, BF_OFFER_BUNDLES, bfOfferByPath, bfOfferFor } = await import("../src/lib/black-friday");
  const { bfCopyFor } = await import("../src/components/black-friday/copy");
  assert.equal(bfOfferByPath("sekt", "de")?.id, "sekt");
  assert.equal(bfOfferByPath("sekt", "es"), null);
  assert.equal(bfOfferFor("bfk2")?.id, "sekt");
  assert.deepEqual(BF_OFFERS.sekt.countries, ["DE"]);
  assert.deepEqual(BF_OFFER_BUNDLES.sekt.map((b) => [b.key, b.priceCents, b.compareAtCents]), [["bfk1", 9000, 18000], ["bfk2", 16900, 36000], ["bfk3", 23900, 54000]]);
  assert.ok(bfCopyFor("sekt", "de")?.bundles.bfk3);
});

test("Black Friday boxes get one more box after paying (19/11/2026), from their own bundles", async () => {
  const { boxesOffer } = await import("../src/lib/upsell");
  const { BF_BUNDLES } = await import("../src/lib/black-friday");
  const bundles = BF_BUNDLES.map((b, i) => ({ ...b, id: i + 1, productId: 1, active: true })) as never;
  const o = (over: Record<string, unknown>) => ({ id: "WP1", bundleKey: "bf1", qtyBoxes: 1, country: "DE", locale: "de", ...over }) as never;
  const de = boxesOffer(o({}), bundles)!;
  assert.equal(de.priceCents, 12900 - 6850); // 2 boxes 129 €: the 2nd box 60,50 €
  assert.equal(de.boxes, 1);
  assert.equal(de.sku, "black-friday-douro-6");
  assert.ok(!de.title.includes("Trilogia") && !de.description.includes("Trilogia"));
  assert.ok(de.label.includes("12") === false && de.label.includes("6")); // 1 box of 6 bottles
  assert.equal(de.image, "/lp/bf/cheda-cut.webp");
  const top = boxesOffer(o({ bundleKey: "bf3", qtyBoxes: 3, country: "NL", locale: "nl" }), bundles);
  assert.equal(top?.priceCents, Math.round(18500 / 3)); // at 3 boxes: one more at the 3-box price per box
  assert.equal(boxesOffer(o({ country: "ES", locale: "es" }), bundles)?.priceCents, 12900 - 6850); // Spain: shown when its cross-offer is not
});
