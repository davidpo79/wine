import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
process.env.SESSION_SECRET = "x".repeat(40);
const { isBelgianOrder, parseShipmentUpdate, shipheroItemsFor, shipheroOrderInput, validShipheroSignature } = await import("../src/lib/shiphero");

const order = (over: Record<string, unknown> = {}) =>
  ({ id: "WP1042", bundleKey: "bf2", qtyBoxes: 2, country: "DE", totalCents: 12900, email: "k@example.de", phone: "+4915112345678", customerName: "Klaus Müller", shippingAddress: { name: "Klaus Müller", line1: "Hauptstr. 1", line2: "", postal_code: "10115", city: "Berlin", country: "DE" }, createdAt: new Date("2026-11-18T10:00:00Z"), paidAt: new Date("2026-11-18T10:05:00Z"), ...over }) as never;

test("ShipHero: only the Belgian warehouse countries, and the right box per offer and country", () => {
  assert.equal(isBelgianOrder({ country: "DE" } as never), true);
  assert.equal(isBelgianOrder({ country: "BE" } as never), true);
  assert.equal(isBelgianOrder({ country: "ES" } as never), false);
  assert.equal(isBelgianOrder({ country: "LU" } as never), false); // the warehouse ships to DE, NL and BE only
  assert.equal(isBelgianOrder({ country: "PT" } as never), false);
  assert.deepEqual(shipheroItemsFor(order()), [{ key: "cheda_mix_6", qty: 2 }]); // Douro box to Germany = Cheda
  assert.deepEqual(shipheroItemsFor(order({ bundleKey: "bfq1", qtyBoxes: 1, country: "NL" })), [{ key: "poco_6", qty: 1 }]);
  assert.deepEqual(shipheroItemsFor(order({ bundleKey: "bfg3", qtyBoxes: 3, country: "BE" })), [{ key: "galhofa_mix_6", qty: 3 }]);
  assert.deepEqual(shipheroItemsFor(order({ bundleKey: "x2", qtyBoxes: 2, country: "NL" })), [{ key: "trilogia_2160", qty: 2 }]);
});

test("ShipHero: order_create input uses our order number, the mapped SKU and the delivery address", () => {
  const s = { shiphero: { enabled: true, shop_name: "wine-portugal", skus: { cheda_mix_6: "CHEDA-MIX-6" } } };
  const i = shipheroOrderInput(order(), s);
  assert.equal(i.order_number, "WP1042");
  assert.equal(i.total_price, "129.00");
  assert.equal(i.shipping_address.first_name, "Klaus");
  assert.equal(i.shipping_address.last_name, "Müller");
  assert.equal(i.shipping_address.zip, "10115");
  assert.equal(i.shipping_address.country_code, "DE");
  assert.deepEqual(i.line_items.map((l) => [l.sku, l.quantity, l.partner_line_item_id]), [["CHEDA-MIX-6", 2, "WP1042-1"]]);
  assert.throws(() => shipheroOrderInput(order({ bundleKey: "bfq1" }), s), /No ShipHero SKU/);
});

test("ShipHero: webhook signature and Shipment Update parsing", () => {
  const raw = JSON.stringify({ webhook_type: "Shipment Update" });
  const sig = createHmac("sha256", "s3cret").update(raw).digest("base64");
  assert.equal(validShipheroSignature(raw, sig, "s3cret"), true);
  assert.equal(validShipheroSignature(raw, sig, "other"), false);
  assert.equal(validShipheroSignature(raw, null, "s3cret"), false);
  const s = parseShipmentUpdate({
    webhook_type: "Shipment Update",
    fulfillment: { order_number: "WP1042", partner_order_id: "WP1042", tracking_number: "LEGACY", shipping_carrier: "ups" },
    total_packages: 1,
    packages: [{ shipping_label: { tracking_number: "1Z999AA10123456784", tracking_url: "https://www.ups.com/track?tracknum=1Z999AA10123456784", shipping_carrier: "ups", shipping_method: "UPS Standard" } }],
  });
  assert.deepEqual(s, { orderNumber: "WP1042", trackingNumber: "1Z999AA10123456784", trackingUrl: "https://www.ups.com/track?tracknum=1Z999AA10123456784", carrier: "ups", method: "UPS Standard", packages: 1 });
  assert.equal(parseShipmentUpdate({ fulfillment: {} }), null);
});

test("webhook signature accepts any of the saved secrets", async () => {
  const { createHmac } = await import("node:crypto");
  const raw = '{"webhook_type":"Shipment Update"}';
  const sig = createHmac("sha256", "second").update(raw).digest("base64");
  assert.equal(validShipheroSignature(raw, sig, ["first", "second"]), true);
  assert.equal(validShipheroSignature(raw, sig, ["first"]), false);
  assert.equal(validShipheroSignature(raw, sig, []), false);
});

test("customer_account_id is left out unless set (ShipHero refuses null)", async () => {
  const { customerArg } = await import("../src/lib/shiphero");
  delete process.env.SHIPHERO_CUSTOMER_ACCOUNT_ID;
  assert.deepEqual(customerArg(), { decl: "", arg: "", vars: {} });
  process.env.SHIPHERO_CUSTOMER_ACCOUNT_ID = "abc";
  assert.equal(customerArg().arg, "customer_account_id: $cid");
  delete process.env.SHIPHERO_CUSTOMER_ACCOUNT_ID;
});

test("the German sparkling box ships as the D. Graça ×3 SKU", () => {
  assert.deepEqual(shipheroItemsFor(order({ bundleKey: "bfk2", qtyBoxes: 2, country: "DE" })), [{ key: "dgraca_3", qty: 2 }]);
});

test("ShipHero: boxes added by a paid upsell ship in the same order (19/11/2026)", () => {
  assert.deepEqual(shipheroItemsFor(order({ bundleKey: "x2", qtyBoxes: 2, country: "DE" }), 2), [{ key: "trilogia_2160", qty: 4 }]);
  const s = { shiphero: { enabled: true, shop_name: "wine-portugal", skus: { trilogia_2160: "TRI-2160" } } };
  const i = shipheroOrderInput(order({ bundleKey: "x2", qtyBoxes: 2, totalCents: 8990 }), s, { boxes: 2, cents: 5980 });
  assert.equal(i.total_price, "149.70");
  assert.deepEqual(i.line_items.map((l) => [l.sku, l.quantity]), [["TRI-2160", 4]]);
});

// DE/NL/BE orders wait for the thank-you page while the post-purchase offer is on (it joins the same parcel).
const DB_URL = process.env.TEST_DATABASE_URL;
test("ShipHero: orders wait for the thank-you page (post-purchase offer), then go with their extra boxes", { skip: !DB_URL && "TEST_DATABASE_URL not set" }, async () => {
  process.env.DATABASE_URL = DB_URL;
  process.env.SHIPHERO_ACCESS_TOKEN = "test-token";
  process.env.SHIPHERO_API_URL = "http://127.0.0.1:9/graphql"; // nothing listens: a send attempt fails fast
  const { db, schema } = await import("../src/db");
  const { eq, inArray } = await import("drizzle-orm");
  const { autoSendToShiphero } = await import("../src/lib/shiphero-fulfilment");
  const run = `shw-${Date.now()}`;
  const [tri] = await db.select().from(schema.bundles).where(eq(schema.bundles.key, "x2"));
  const [bf] = await db.select().from(schema.bundles).where(eq(schema.bundles.key, "bf1"));
  const mk = async (suffix: string, b: typeof tri) =>
    (await db.insert(schema.orders).values({ id: `${run}-${suffix}`, bundleId: b.id, bundleKey: b.key, qtyBoxes: b.qty, subtotalCents: b.priceCents, shippingCents: 0, totalCents: b.priceCents, locale: "de", country: "DE", email: "t@example.com", status: "paid", paidAt: new Date() }).returning())[0];
  const t = await mk("tri", tri);
  const b = await mk("bf", bf);
  await autoSendToShiphero(t, "paid");
  await autoSendToShiphero(b, "paid");
  const ships = await db.select().from(schema.shipments).where(inArray(schema.shipments.orderId, [t.id, b.id]));
  assert.deepEqual(ships, []); // nothing sent at payment: the offer may still add boxes
  await autoSendToShiphero(t, "thanks");
  await autoSendToShiphero(b, "thanks");
  const after = await db.select().from(schema.shipments).where(inArray(schema.shipments.orderId, [t.id, b.id]));
  assert.equal(after.length, 2); // both tried at the thank-you page
  const ids = [t.id, b.id];
  await db.delete(schema.shipments).where(inArray(schema.shipments.orderId, ids));
  await db.delete(schema.orderEvents).where(inArray(schema.orderEvents.orderId, ids));
  await db.delete(schema.orders).where(inArray(schema.orders.id, ids));
});
