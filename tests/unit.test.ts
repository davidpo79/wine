import { test } from "node:test";
import assert from "node:assert/strict";
process.env.SESSION_SECRET = "x".repeat(40);
const { eur, perBottleCents, parseEuroToCents } = await import("../src/lib/money");
const { salesState } = await import("../src/lib/catalog");
const { DEFAULT_SETTINGS } = await import("../src/lib/settings-defaults");
const { norm, buildUserData, sha256, parseConsent, gaClientIdFromCookie } = await import("../src/lib/tracking");
const { makeToken, readToken } = await import("../src/lib/auth");
const { lisbonToUtc } = await import("../src/lib/time");
const { canTransition } = await import("../src/lib/orders");
const { toCsv } = await import("../src/lib/csv");

test("money formatting pt-PT", () => {
  assert.equal(eur(8490), "84,90 €");
  assert.equal(perBottleCents(8490, 6), 1415);
  assert.equal(perBottleCents(11990, 9), 1332);
  assert.equal(parseEuroToCents("84,90"), 8490);
  assert.equal(parseEuroToCents("€ 4.9"), 490);
  assert.equal(parseEuroToCents("abc"), null);
});

test("sales state", () => {
  const s = { ...DEFAULT_SETTINGS };
  const before = new Date("2026-11-30T23:58:00Z");
  const after = new Date("2026-12-01T00:00:00Z");
  assert.equal(salesState(s, 0, before).mode, "open");
  assert.equal(salesState(s, 0, after).mode, "closed");
  assert.equal(salesState({ ...s, post_cutoff_mode: "after_christmas" }, 0, after).mode, "after_christmas");
  assert.equal(salesState({ ...s, sales_open: false }, 0, before).mode, "closed");
  assert.equal(salesState({ ...s, stock_cap_boxes: 10 }, 10, before).mode, "sold_out");
});

test("lisbon time conversion", () => {
  assert.equal(lisbonToUtc("2026-11-30", "23:59").toISOString(), "2026-11-30T23:59:00.000Z"); // WET
  assert.equal(lisbonToUtc("2026-07-01", "12:00").toISOString(), "2026-07-01T11:00:00.000Z"); // WEST
});

test("CAPI normalization and hashing", () => {
  assert.equal(norm.email("  Foo@Bar.PT "), "foo@bar.pt");
  assert.equal(norm.phone("+351 912 345 678"), "351912345678");
  assert.equal(norm.phone("912345678"), "351912345678");
  assert.equal(norm.name("João"), "joao");
  const ud = buildUserData({ email: "A@B.pt", fbp: "fb.1.1.1" });
  assert.deepEqual(ud.em, [sha256("a@b.pt")]);
  assert.equal(ud.fbp, "fb.1.1.1");
  assert.equal("ph" in ud, false);
});

test("consent cookie parsing", () => {
  assert.deepEqual(parseConsent(undefined), { statistics: false, marketing: false });
  assert.deepEqual(parseConsent(encodeURIComponent('{"v":1,"s":1,"m":0}')), { statistics: true, marketing: false });
  assert.deepEqual(parseConsent("garbage"), { statistics: false, marketing: false });
  assert.equal(gaClientIdFromCookie("GA1.1.123.456"), "123.456");
});

test("admin session token", () => {
  const t = makeToken(7);
  assert.equal(readToken(t), 7);
  assert.equal(readToken(t.slice(0, -2) + "xx"), null);
  assert.equal(readToken(makeToken(7, Date.now() - 13 * 3600_000)), null);
});

test("order transitions", () => {
  assert.ok(canTransition("pending_payment", "paid"));
  assert.ok(!canTransition("refunded", "paid"));
  assert.ok(!canTransition("pending_payment", "shipped"));
});

test("csv escaping", () => {
  assert.equal(toCsv(["a", "b"], [["x;y", 'q"z']]), '﻿a;b\r\n"x;y";"q""z"\r\n');
});

test("promo discount respects max qty and per-box floor", async () => {
  const { promoDiscountCents } = await import("../src/lib/promo");
  const cfg = { code: "NATAL5", percent: 5, maxQty: 2 };
  assert.equal(promoDiscountCents({ priceCents: 4590, qty: 1 }, cfg, " natal5 "), 230);
  assert.equal(promoDiscountCents({ priceCents: 8262, qty: 2 }, cfg, "NATAL5"), 413);
  assert.equal(promoDiscountCents({ priceCents: 11705, qty: 3 }, cfg, "NATAL5"), 0);
  assert.equal(promoDiscountCents({ priceCents: 8000, qty: 2 }, cfg, "NATAL5"), 200); // clamped to 2 x 39,00
  assert.equal(promoDiscountCents({ priceCents: 4590, qty: 1 }, cfg, "WRONG"), 0);
  assert.equal(promoDiscountCents({ priceCents: 4590, qty: 1 }, null, "NATAL5"), 0);
});

test("plus code: same discount + free shipping", async () => {
  const { promoDiscountCents, promoShippingCents } = await import("../src/lib/promo");
  const cfg = { code: "NATAL5", percent: 5, maxQty: 2, plusCode: "NATALMAIS" };
  assert.equal(promoDiscountCents({ priceCents: 4590, qty: 1 }, cfg, "natalmais"), 230);
  assert.equal(promoShippingCents({ shippingCents: 490 }, cfg, "NATALMAIS"), 0);
  assert.equal(promoShippingCents({ shippingCents: 490 }, cfg, "NATAL5"), 490);
  assert.equal(promoShippingCents({ shippingCents: 490 }, { ...cfg, plusCode: "" }, "NATALMAIS"), 490);
});

test("PT mobile normalization", async () => {
  const { normalizePtMobile, leadToken } = await import("../src/lib/leads");
  assert.equal(normalizePtMobile("912 345 678"), "+351912345678");
  assert.equal(normalizePtMobile("+351 93-123-4567"), "+351931234567");
  assert.equal(normalizePtMobile("00351961234567"), "+351961234567");
  assert.equal(normalizePtMobile("212345678"), null); // landline
  assert.equal(normalizePtMobile("94123456"), null);
  assert.equal(leadToken("A@B.pt"), leadToken("a@b.pt"));
});
