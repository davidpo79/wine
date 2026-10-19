// CTT integration test against the mock (scripts/mock-ctt.ts) and a running app with the same CTT_* env:
// CTT_API_BASE=http://localhost:4600/v3 CTT_APP_ID=app-test CTT_PUBLIC_KEY=pub-test CTT_SECRET_KEY=sec-test CTT_SIMULATE=0
// (real mode: tracking is only followed for non-simulated shipments).
// Usage: tsx scripts/test-ctt.ts [baseUrl]
import "./load-env";
import { createHmac } from "node:crypto";
import { desc, eq, isNotNull } from "drizzle-orm";
import { db, schema, sql as pg } from "../src/db";
import { cttConfig, shopItemId, SHOP_STATUS } from "../src/lib/ctt";
import { createCttLabel, syncCttTracking } from "../src/lib/fulfilment";

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const mock = cttConfig().base.replace(/\/v3$/, "");
let fails = 0;
const ok = (c: boolean, m: string) => {
  console.log(`${c ? "PASS" : "FAIL"} ${m}`);
  if (!c) fails++;
};
const order = async (id: string) => (await db.select().from(schema.orders).where(eq(schema.orders.id, id)))[0];

// A paid order with a complete Portuguese address.
const [o] = await db.select().from(schema.orders).where(isNotNull(schema.orders.email)).orderBy(desc(schema.orders.createdAt)).limit(1);
await db.delete(schema.shipments).where(eq(schema.shipments.orderId, o.id));
await db.update(schema.orders).set({ status: "paid", trackingNumber: null, shippedAt: null, deliveredAt: null, shippingAddress: { name: "Teste CTT", line1: "Rua Augusta 1", postal_code: "1100-048", city: "Lisboa", country: "PT" } }).where(eq(schema.orders.id, o.id));

const r1 = await createCttLabel((await order(o.id))!, { email: "test", role: "admin" });
ok("ok" in r1 && !!r1.trackingId, `label created with tracking (${"trackingId" in r1 ? r1.trackingId : JSON.stringify(r1)})`);
const s1 = (await db.select().from(schema.shipments).where(eq(schema.shipments.orderId, o.id)))[0];
ok(!!s1?.labelPdf && Buffer.from(s1.labelPdf, "base64").subarray(0, 5).toString() === "%PDF-", "label PDF stored");
const o1 = await order(o.id);
ok(o1.status === "preparing" && o1.trackingNumber === s1.trackingId, `order preparing with tracking (got ${o1.status})`);

// Token expired at CTT: the client renews it once and carries on.
await fetch(`${mock}/__expire`, { method: "POST" });
await fetch(`${mock}/__status`, { method: "POST", body: JSON.stringify({ ref: o.id, code: 25, text: "Recolhido" }) });
await syncCttTracking();
const o2 = await order(o.id);
ok(o2.status === "shipped", `picked up (25) → shipped after a token renewal (got ${o2.status})`);

// Push from CTT: bad hash refused, good hash → delivered.
const url = cttConfig().shopUrl;
const push = async (status: number, hashOk: boolean) => {
  const tracking = s1.trackingId ?? "";
  const hash = createHmac("sha256", hashOk ? cttConfig().secret : "wrong").update(`${status}${tracking}${url}`).digest("base64").replace(/=+$/, "");
  return fetch(`${base}/api/webhooks/ctt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ShopItemId: shopItemId(o.id), Status: status, TrackingId: tracking, TrackingUrl: "https://example.test/t", Hash: hash }) });
};
ok((await push(SHOP_STATUS.delivered, false)).status === 401, "push with a wrong hash refused");
ok((await order(o.id)).status === "shipped", "order unchanged by the forged push");
ok((await push(SHOP_STATUS.delivered, true)).status === 200, "push with a valid hash accepted");
const o3 = await order(o.id);
ok(o3.status === "delivered" && !!o3.deliveredAt, `delivered push → order delivered (got ${o3.status})`);

// Idempotent: the same push and a tracking sync change nothing more.
ok((await push(SHOP_STATUS.delivered, true)).status === 200, "repeated push accepted");
ok((await order(o.id)).status === "delivered", "still delivered");

// Missing postal code: CTT refuses, the admin gets the reason.
const [o4] = await db.select().from(schema.orders).where(isNotNull(schema.orders.email)).orderBy(desc(schema.orders.createdAt)).offset(1).limit(1);
await db.delete(schema.shipments).where(eq(schema.shipments.orderId, o4.id));
await db.update(schema.orders).set({ status: "paid", shippingAddress: { name: "Sem CP", line1: "Rua X", postal_code: "", city: "Lisboa", country: "PT" } }).where(eq(schema.orders.id, o4.id));
const r4 = await createCttLabel((await order(o4.id))!, { email: "test", role: "admin" });
ok("error" in r4 && /PostalCode/.test(r4.error ?? ""), `CTT error shown to the admin (${"error" in r4 ? r4.error : "none"})`);

console.log(fails ? `\n${fails} FAILED` : "\nall CTT checks passed");
await pg.end();
process.exit(fails ? 1 : 0);
