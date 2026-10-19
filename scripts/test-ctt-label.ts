// Admin "Create CTT shipment and label" end to end, against the in-process CTT mock and a real Postgres
// (DATABASE_URL, migrated and seeded). No app server and no CTT credentials needed. Creates its own test orders and
// removes them at the end.
// Usage: tsx scripts/test-ctt-label.ts
import "./load-env";
import { eq, inArray, like } from "drizzle-orm";
import { startMockCtt } from "./mock-ctt";

const mock = await startMockCtt(0);
Object.assign(process.env, {
  CTT_API_BASE: `http://localhost:${mock.port}/v3`,
  CTT_APP_ID: "app-test",
  CTT_PUBLIC_KEY: "pub-test",
  CTT_SECRET_KEY: "sec-test",
  SITE_URL: "https://vinho.test",
});
delete process.env.CTT_SIMULATE; // default must be simulate

const { db, schema, sql: pg } = await import("../src/db");
const { createCttLabel } = await import("../src/lib/fulfilment");

let fails = 0;
const ok = (c: boolean, m: string) => {
  console.log(`${c ? "PASS" : "FAIL"} ${m}`);
  if (!c) fails++;
};
const PREFIX = "WP-TEST-CTT2-";
const admin = { email: "test@vinho.test", role: "admin" as const };
const order = async (id: string) => (await db.select().from(schema.orders).where(eq(schema.orders.id, id)))[0];
const shipment = async (id: string) => (await db.select().from(schema.shipments).where(eq(schema.shipments.orderId, id)))[0];
const count = (method: string, path: string) => mock.calls.filter((c) => c.method === method && c.path === path).length;

async function cleanup() {
  const ids = (await db.select({ id: schema.orders.id }).from(schema.orders).where(like(schema.orders.id, `${PREFIX}%`))).map((r) => r.id);
  if (!ids.length) return;
  await db.delete(schema.shipments).where(inArray(schema.shipments.orderId, ids));
  await db.delete(schema.orderEvents).where(inArray(schema.orderEvents.orderId, ids));
  await db.delete(schema.orders).where(inArray(schema.orders.id, ids));
}

const [bundle] = await db.select().from(schema.bundles).limit(1);
if (!bundle) throw new Error("No bundle: run npm run db:migrate && npm run db:seed first.");
async function newOrder(n: string, address: Record<string, string>, country = "PT") {
  const id = `${PREFIX}${n}`;
  await db.insert(schema.orders).values({
    id,
    status: "paid",
    bundleId: bundle.id,
    bundleKey: bundle.key,
    qtyBoxes: 1,
    subtotalCents: 4990,
    shippingCents: 0,
    totalCents: 4990,
    country,
    email: "cliente@vinho.test",
    phone: "+351912345678",
    customerName: "Teste CTT",
    shippingAddress: { name: "Teste CTT", line1: "Rua Augusta 1", postal_code: "1100-048", city: "Lisboa", country, ...address },
  });
  return (await order(id))!;
}

await cleanup();
await db.delete(schema.settings).where(eq(schema.settings.key, "ctt_token"));
try {
  // 1. Default = simulate: shipment + async label, tracking on the order, still "preparing", shippedAt untouched.
  const a = await newOrder("A", {});
  const r1 = await createCttLabel(a, admin);
  ok("ok" in r1 && !!r1.trackingId && !r1.reused, `label created (${JSON.stringify(r1)})`);
  ok(mock.calls.length > 0 && mock.calls.every((c) => c.simulate), "every CTT call carried X_SIMULATE: 1");
  const s1 = await shipment(a.id);
  ok(s1?.simulated === true && Buffer.from(s1.labelPdf ?? "", "base64").subarray(0, 5).toString() === "%PDF-", "simulated shipment with the label PDF stored");
  const a1 = await order(a.id);
  ok(a1.status === "preparing" && a1.trackingNumber === s1?.trackingId && /^[A-Z0-9]{8,30}$/.test(a1.trackingNumber ?? ""), `order preparing with the tracking number (${a1.status} ${a1.trackingNumber})`);
  ok(a1.shippedAt === null, "shippedAt stays empty until CTT picks the parcel up");

  // 2. Second click: the stored result, no CTT call at all.
  const before = mock.calls.length;
  const r2 = await createCttLabel(a1, admin);
  ok("ok" in r2 && r2.reused === true && r2.trackingId === s1?.trackingId, "second click re-uses the stored label");
  ok(mock.calls.length === before, `no new CTT calls on the second click (${mock.calls.length - before})`);

  // 3. Double click at the same time: one shipment at CTT, the other click is told to wait.
  process.env.CTT_SIMULATE = "0";
  const b = await newOrder("B", {});
  const shipmentsBefore = count("POST", "/shipments/");
  const [p, q] = await Promise.all([createCttLabel(b, admin), createCttLabel(b, admin)]);
  const oks = [p, q].filter((x) => "ok" in x).length;
  const busy = [p, q].find((x) => "error" in x);
  ok(oks === 1 && !!busy && "error" in busy && /already being created/.test(busy.error), `parallel clicks: one created, one waits (${JSON.stringify([p, q])})`);
  ok(count("POST", "/shipments/") - shipmentsBefore === 1, "only one POST /shipments/ for the order");

  // 4. Real mode (CTT_SIMULATE=0): no X_SIMULATE header; a simulated label is re-created for real, once.
  const n = mock.calls.length;
  const r4 = await createCttLabel((await order(a.id))!, admin);
  ok("ok" in r4 && !r4.reused && (await shipment(a.id))?.simulated === false, "simulated label re-created for real when simulate is off");
  ok(mock.calls.slice(n).every((c) => !c.simulate), "real mode sends no X_SIMULATE header");
  const r4b = await createCttLabel((await order(a.id))!, admin);
  ok("ok" in r4b && r4b.reused === true, "and then re-used");
  process.env.CTT_SIMULATE = "1";
  const r4c = await createCttLabel((await order(a.id))!, admin);
  ok("ok" in r4c && r4c.reused === true && (await shipment(a.id))?.simulated === false, "back in simulate mode the real label is kept, not replaced");
  process.env.CTT_SIMULATE = "0";

  // 5. Plain-language errors: ErrorList from CTT, then a 405.
  const c = await newOrder("C", { postal_code: "" });
  const r5 = await createCttLabel(c, admin);
  ok("error" in r5 && /CTT rejected the shipment.*210 PostalCode missing/.test(r5.error), `ErrorList shown plainly (${"error" in r5 ? r5.error : ""})`);
  mock.disable("/labels/");
  const d = await newOrder("D", {});
  const r6 = await createCttLabel(d, admin);
  ok("error" in r6 && /labels.*not enabled for our CTT API key.*ask CTT/i.test(r6.error), `405 shown plainly (${"error" in r6 ? r6.error : ""})`);
  ok((await shipment(d.id))?.error === ("error" in r6 ? r6.error : null), "the error is stored on the shipment for the order page");

  // 6. Guards before any CTT call: other countries and fulfilment users.
  const m = mock.calls.length;
  const e = await newOrder("E", { postal_code: "10115", city: "Berlin" }, "DE");
  const r7 = await createCttLabel(e, admin);
  ok("error" in r7 && /Portugal/.test(r7.error), "non-Portugal order refused");
  const r8 = await createCttLabel(await newOrder("F", {}), { email: "f@vinho.test", role: "fulfilment" });
  ok("error" in r8 && /Only admins/.test(r8.error), "fulfilment user refused");
  ok(mock.calls.length === m, "no CTT calls for refused requests");
} finally {
  await cleanup();
  await mock.close();
  await pg.end();
}
console.log(fails ? `\n${fails} FAILED` : "\nall passed");
process.exit(fails ? 1 : 0);
