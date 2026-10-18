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
  assert.equal(promoDiscountCents({ priceCents: 4990, qty: 1 }, cfg, " natal5 "), 250);
  assert.equal(promoDiscountCents({ priceCents: 8990, qty: 2 }, cfg, "NATAL5"), 450);
  assert.equal(promoDiscountCents({ priceCents: 14970, qty: 4 }, cfg, "NATAL5"), 0);
  assert.equal(promoDiscountCents({ priceCents: 7600, qty: 2 }, cfg, "NATAL5"), 200); // clamped to 2 x 37,00
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

test("recovery: call window and resume token", async () => {
  process.env.SESSION_SECRET = "x".repeat(40);
  const { nextCallSlot, resumeToken, verifyResumeToken } = await import("../src/lib/recovery");
  // Wed 2026-11-11 15:00 Lisbon (WET = UTC) is inside the window
  const inside = new Date("2026-11-11T15:00:00Z");
  assert.equal(nextCallSlot(inside).toISOString(), inside.toISOString());
  // Wed 21:30 -> Thu 10:00
  assert.equal(nextCallSlot(new Date("2026-11-11T21:30:00Z")).toISOString(), "2026-11-12T10:00:00.000Z");
  // Wed 07:00 -> same day 10:00
  assert.equal(nextCallSlot(new Date("2026-11-11T07:00:00Z")).toISOString(), "2026-11-11T10:00:00.000Z");
  // Sat 20:30 -> Mon 10:00 (no Sunday calls)
  assert.equal(nextCallSlot(new Date("2026-11-14T20:30:00Z")).toISOString(), "2026-11-16T10:00:00.000Z");
  const t = resumeToken("WP-2026-0007");
  assert.equal(verifyResumeToken(t), "WP-2026-0007");
  assert.equal(verifyResumeToken(t.slice(0, -1) + "x"), null);
});

test("telnyx webhook signature (ed25519)", async () => {
  const { generateKeyPairSync, sign } = await import("node:crypto");
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = publicKey.export({ format: "der", type: "spki" }).subarray(12);
  process.env.TELNYX_PUBLIC_KEY = Buffer.from(raw).toString("base64");
  const { verifyTelnyxWebhook } = await import("../src/lib/telnyx");
  const body = '{"data":{"event_type":"call.hangup"}}';
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = sign(null, Buffer.from(`${ts}|${body}`), privateKey).toString("base64");
  assert.equal(verifyTelnyxWebhook(body, sig, ts), true);
  assert.equal(verifyTelnyxWebhook(body + " ", sig, ts), false);
  assert.equal(verifyTelnyxWebhook(body, sig, String(Number(ts) - 1000)), false);
});

test("ifthenpay helpers", async () => {
  const ifp = await import("../src/lib/ifthenpay");
  // Docs test vector: id+amount+requestId with CCARD key AAA-000000.
  assert.equal(ifp.cardSignature("order_45678", "11.55", "36jvlEhUYeknQ8PHKprR", "AAA-000000"), "d7d2fd272233f0102e6dd0e50969025481cdfe3abb87cc3f135f74cfb47b2561");
  assert.ok(ifp.verifyCardSignature("order_45678", "11.55", "36jvlEhUYeknQ8PHKprR", "d7d2fd272233f0102e6dd0e50969025481cdfe3abb87cc3f135f74cfb47b2561", "AAA-000000"));
  assert.ok(!ifp.verifyCardSignature("order_45678", "11.56", "36jvlEhUYeknQ8PHKprR", "d7d2fd272233f0102e6dd0e50969025481cdfe3abb87cc3f135f74cfb47b2561", "AAA-000000"));
  assert.equal(ifp.amountStr(8262), "82.62");
  assert.equal(ifp.amountStr(500), "5.00");
  assert.equal(ifp.parseAmountCents("102.42"), 10242);
  assert.equal(ifp.parseAmountCents("45,9"), 4590);
  assert.equal(ifp.mbwayPhone("+351 912 345 678"), "351#912345678");
  assert.equal(ifp.mbwayPhone("912345678"), "351#912345678");
  assert.equal(ifp.formatMbReference("000000291"), "000 000 291");
  const c = ifp.parseCallback(new URLSearchParams("anti_phishing_key=k&order_id=WP-1&amount=5.00&reference=123&payment_datetime=28-10-2021 10:55:21"));
  assert.deepEqual([c.key, c.ref, c.amount, c.reference], ["k", "WP-1", "5.00", "123"]);
  // 30-11-2026 23:59:59 Lisbon (WET = UTC in winter)
  assert.equal(ifp.parseIfthenpayDate("30-11-2026", true)?.toISOString(), "2026-11-30T23:59:59.000Z");
  // summer time: 10:00 Lisbon = 09:00 UTC
  assert.equal(ifp.parseIfthenpayDate("01-07-2026 10:00:00")?.toISOString(), "2026-07-01T09:00:00.000Z");
  for (const t of Object.values(ifp.callbackTemplates("https://vinho.prendadenatal.com"))) assert.ok(t.length <= 300, `callback url <= 300 chars: ${t.length}`);
});

test("profit model reproduces David's numbers", async () => {
  const { computeOrderCosts, deliveryCost, expensesByDay } = await import("../src/lib/profit");
  const s = { cost_model: DEFAULT_SETTINGS.cost_model, upsell_products: DEFAULT_SETTINGS.upsell_products };
  const o = (total: number, qty: number) => ({ totalCents: total, qtyBoxes: qty, paymentMethodType: "card" });
  assert.equal(computeOrderCosts(o(5080, 1), [], s).profit, 2429);
  assert.equal(computeOrderCosts(o(8262, 2), [], s).profit, 4070);
  const c3 = computeOrderCosts(o(11705, 3), [], s);
  assert.deepEqual([c3.vat, c3.wine, c3.gift_boxes, c3.shipping_boxes, c3.delivery, c3.payment_fees, c3.profit], [1347, 3000, 240, 230, 1100, 351, 5437]);
  // 4 boxes: one full parcel of 3 + one of 1
  assert.equal(deliveryCost(4, DEFAULT_SETTINGS.cost_model.delivery_tiers), 1100 + 604);
  // add-on box after a 2-box order: 3 boxes in one parcel
  const up = computeOrderCosts(o(8262, 2), [{ amountCents: 3443, boxes: 1, kind: "boxes", sku: "trilogia-2160" }], s, 2);
  assert.equal(up.paid, 11705);
  assert.equal(up.delivery, 1100);
  const m = expensesByDay([{ date: "2026-11-01", endDate: "2026-11-10", amountCents: 1000 }], "2026-11-05", "2026-11-06");
  assert.equal(m.get("2026-11-05"), 100);
});

test("printed card add-on: own VAT rate and cost", async () => {
  const { computeOrderCosts } = await import("../src/lib/profit");
  const s = { cost_model: DEFAULT_SETTINGS.cost_model, upsell_products: DEFAULT_SETTINGS.upsell_products, gift_card: { enabled: true, price_cents: 390, cost_cents: 60, vat_percent: 23 } };
  const base = computeOrderCosts({ totalCents: 8262, qtyBoxes: 2, paymentMethodType: "card" }, [], s);
  const withCard = computeOrderCosts({ totalCents: 8262, qtyBoxes: 2, paymentMethodType: "card" }, [{ amountCents: 390, boxes: 0, kind: "card", sku: "gift-card" }], s);
  assert.equal(withCard.paid, 8652);
  // 3,90 incl. 23% VAT = 0,73 VAT; cost 0,60; fee 3% of 3,90 = 0,12 -> +2,45 profit
  assert.equal(withCard.vat - base.vat, 73);
  assert.equal(withCard.profit - base.profit, 245);
});

test("profit split: share, minimum per box, losses not shared, open until agreed", async () => {
  const { splitProfit } = await import("../src/lib/profit");
  const base = { my_name: "D", partner_name: "P", min_per_box_cents: null };
  assert.equal(splitProfit(10000, 4, { ...base, my_percent: null }), null);
  assert.deepEqual(splitProfit(10000, 4, { ...base, my_percent: 50 }), { mine: 5000, partner: 5000, floorApplied: false });
  assert.deepEqual(splitProfit(1000, 4, { ...base, my_percent: 40, min_per_box_cents: 200 }), { mine: 800, partner: 200, floorApplied: true });
  assert.deepEqual(splitProfit(-3000, 2, { ...base, my_percent: 50 }), { mine: 0, partner: -3000, floorApplied: false });
});

test("buy-and-get offers: 2nd box at 40 €, pay 3 get 4", async () => {
  const { dealOf, dealText, eurShort } = await import("../src/lib/offers");
  const x2 = dealOf({ qty: 2, priceCents: 8990 }, 4990);
  assert.equal(x2.nextBoxCents, 4000);
  assert.equal(dealText(x2).banner, "2.ª CAIXA POR 40 €");
  const x4 = dealOf({ qty: 4, priceCents: 14970 }, 4990);
  assert.deepEqual([x4.paid, x4.free, x4.saving], [3, 1, 4990]);
  assert.equal(dealText(x4).short, "Pague 3, leve 4");
  assert.equal(eurShort(3990), "39,90 €");
});

test("post-purchase boxes upsell climbs to the next bundle", async () => {
  const { boxesOffer } = await import("../src/lib/upsell");
  const b = (key: string, qty: number, priceCents: number) => ({ id: qty, productId: 1, key, label: key, qty, priceCents, compareAtCents: null, shippingCents: 0, badge: null, sort: qty, active: true });
  const bundles = [b("x1", 1, 4990), b("x2", 2, 8990), b("x4", 4, 14970)];
  const order = (qty: number, key: string) => ({ qtyBoxes: qty, bundleKey: key }) as Parameters<typeof boxesOffer>[0];
  const from1 = boxesOffer(order(1, "x1"), bundles)!;
  assert.deepEqual([from1.boxes, from1.priceCents], [1, 4000]);
  const from2 = boxesOffer(order(2, "x2"), bundles)!;
  assert.deepEqual([from2.boxes, from2.priceCents, from2.compareCents, from2.title], [2, 5980, 9980, "Pague 3, leve 4"]);
  const from4 = boxesOffer(order(4, "x4"), bundles)!;
  assert.deepEqual([from4.boxes, from4.priceCents], [1, 3743]);
});

test("markets: phone, postal code, language and country detection", async () => {
  const { normalizePhoneFor, postalValid, localeFromAcceptLanguage } = await import("../src/lib/markets");
  const { homeLocaleFor, countryFor } = await import("../src/lib/visitor");
  assert.equal(normalizePhoneFor("0151 2345 6789", "DE"), "+4915123456789");
  assert.equal(normalizePhoneFor("06 12345678", "NL"), "+31612345678");
  assert.equal(normalizePhoneFor("+32 470 12 34 56", "BE"), "+32470123456");
  assert.equal(normalizePhoneFor("621 123 456", "LU"), "+352621123456");
  assert.equal(postalValid("1000-001", "PT"), "ok");
  assert.equal(postalValid("9000-001", "PT"), "excluded");
  assert.equal(postalValid("10115", "DE"), "ok");
  assert.equal(postalValid("1012 AB", "NL"), "ok");
  assert.equal(postalValid("1012AB", "NL"), "ok");
  assert.equal(postalValid("1000", "BE"), "ok");
  assert.equal(postalValid("L-1009", "LU"), "ok");
  assert.equal(postalValid("1234-567", "DE"), "format");
  assert.equal(localeFromAcceptLanguage("fr-BE,fr;q=0.9,en;q=0.8"), "fr");
  assert.equal(localeFromAcceptLanguage("en-US,en"), null);
  const v = (ipCountry: string | null, savedLocale: "pt" | "de" | "nl" | "fr" | null = null, browserLocale: "pt" | "de" | "nl" | "fr" | null = null) => ({ ipCountry, savedLocale, browserLocale });
  // Only open markets redirect; Portugal and unknown countries stay on "/"
  assert.equal(homeLocaleFor(v("DE"), ["PT"]), "pt");
  assert.equal(homeLocaleFor(v("DE"), ["PT", "DE"]), "de");
  assert.equal(homeLocaleFor(v("BE", null, "fr"), ["PT", "BE"]), "fr");
  assert.equal(homeLocaleFor(v("BE"), ["PT", "BE"]), "nl");
  assert.equal(homeLocaleFor(v("US"), ["PT", "DE"]), "pt");
  assert.equal(homeLocaleFor(v("PT", "de"), ["PT"]), "de");
  assert.equal(countryFor("fr", v("LU")), "LU");
  assert.equal(countryFor("fr", v("DE")), "BE");
  assert.equal(countryFor("de", v(null)), "DE");
});

test("journey: device, privacy filter, batch validation and step logic", async () => {
  const { deviceOf, cleanProps, JourneyBatch } = await import("../src/lib/journey");
  const { reached } = await import("../src/lib/journey-stats");
  assert.deepEqual(deviceOf("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 [FBAN/FBIOS;FBAV/450.0]"), { device: "mobile", browser: "Facebook app" });
  assert.deepEqual(deviceOf("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Safari/604.1"), { device: "tablet", browser: "Safari" });
  assert.equal(deviceOf("Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36").device, "desktop");
  // Labels that look like an email or phone number are dropped.
  assert.deepEqual(cleanProps({ label: "ana@example.com", field: "email", n: 3 }), { field: "email", n: 3 });
  assert.equal(cleanProps({ label: "912 345 678" }), null);
  assert.equal(JourneyBatch.safeParse({ sid: "s_abcdef12", events: [{ n: "page_view" }] }).success, true);
  assert.equal(JourneyBatch.safeParse({ sid: "s_abcdef12", events: [{ n: "made_up" }] }).success, false);
  const base = { sawOffers: false, clickedBuy: false, checkout: false, started: false, contact: false, address: false, payClick: false, paymentStart: false, purchased: false };
  const resumed = { ...base, checkout: true, payClick: true } as Parameters<typeof reached>[0];
  assert.equal(reached(resumed, "sawOffers"), true); // a later step implies the earlier ones
  assert.equal(reached(resumed, "paymentStart"), false);
});

test("inbox: address parsing", async () => {
  const { addrOf } = await import("../src/lib/inbox");
  assert.equal(addrOf("Maria Teste <Maria.Teste@Example.pt>"), "maria.teste@example.pt");
  assert.equal(addrOf(" ana@example.pt "), "ana@example.pt");
});

test("reviews: signed link and display name", async () => {
  const { reviewToken, validReviewToken, defaultDisplayName } = await import("../src/lib/reviews");
  assert.equal(validReviewToken("WP-2026-0001", reviewToken("WP-2026-0001")), true);
  assert.equal(validReviewToken("WP-2026-0002", reviewToken("WP-2026-0001")), false);
  assert.equal(validReviewToken("WP-2026-0001", "short"), false);
  assert.equal(defaultDisplayName("maria da silva santos"), "maria S.");
  assert.equal(defaultDisplayName("Ana"), "Ana");
  assert.equal(defaultDisplayName(null), "");
});
