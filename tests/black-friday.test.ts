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
