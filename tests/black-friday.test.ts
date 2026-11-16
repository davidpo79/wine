import { test } from "node:test";
import assert from "node:assert/strict";
process.env.SESSION_SECRET = "x".repeat(40);
const { DEFAULT_SETTINGS } = await import("../src/lib/settings-defaults");
const { BF_BUNDLES, bfBoxCost, bfOpen, bottlesPerBox, isBfBundle } = await import("../src/lib/black-friday");
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

test("black friday costs: 29 € a box (David's numbers) and the profit before marketing", () => {
  const bf = DEFAULT_SETTINGS.black_friday;
  assert.equal(bfBoxCost(bf), 2900);
  // David's sheet: 21% VAT included, 3% banking. 68,50 € -> 25,56 € before the 20% marketing (13,70 €) = 11,86 €.
  const fee3 = { percent: 3, fixed_cents: 0 };
  const s = { cost_model: { ...DEFAULT_SETTINGS.cost_model, payment_fees: { card: fee3, mb_way: fee3, multibanco: fee3, other: fee3 } }, upsell_products: [], black_friday: bf };
  const es1 = computeOrderCosts({ totalCents: 6850, qtyBoxes: 1, paymentMethodType: "card", bundleKey: "bf1", country: "ES" }, [], s);
  assert.equal(es1.vat, 1189);
  assert.equal(es1.profit, 2556);
  assert.equal(es1.wine + es1.shipping_boxes + es1.delivery + es1.other, 2900);
  // Germany: 19% VAT.
  const de1 = computeOrderCosts({ totalCents: 6850, qtyBoxes: 1, paymentMethodType: "card", bundleKey: "bf1", country: "DE" }, [], s);
  assert.equal(de1.vat, 1094);
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

test("black friday opens and closes with its own switch and cutoff", () => {
  assert.equal(DEFAULT_SETTINGS.black_friday.enabled, true);
  const bf = DEFAULT_SETTINGS.black_friday;
  assert.equal(bf.cutoff_at, "2026-11-25T22:59:00Z"); // Wednesday 25/11 23:59 in Madrid and Berlin, Black Friday is 27/11
  assert.equal(bfOpen(bf, new Date("2026-11-25T22:58:00Z")), true);
  assert.equal(bfOpen(bf, new Date("2026-11-25T23:00:00Z")), false);
  assert.equal(bfOpen({ ...bf, enabled: false }, new Date("2026-11-01T12:00:00Z")), false);
});

test("black friday language follows the saved choice, then the phone, then the location", () => {
  const v = (savedLocale: string | null, browserLocale: string | null, ipCountry: string | null) => ({ savedLocale, browserLocale, ipCountry }) as never;
  assert.equal(bfLocaleForVisitor(v(null, null, "ES")), "es");
  assert.equal(bfLocaleForVisitor(v(null, null, "DE")), "de");
  assert.equal(bfLocaleForVisitor(v(null, null, "AT")), "de");
  assert.equal(bfLocaleForVisitor(v(null, "es", "DE")), "es"); // a Spanish phone in Germany
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
