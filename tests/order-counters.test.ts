// Admin home counters: "Pending Multibanco" counts only orders with an open Multibanco reference; people who left
// their e-mail without starting a payment are counted apart ("Left before paying").
import { test } from "node:test";
import assert from "node:assert/strict";

const DB_URL = process.env.TEST_DATABASE_URL;
if (DB_URL) process.env.DATABASE_URL = DB_URL;
process.env.SESSION_SECRET ??= "s".repeat(40);
const dbTest = (name: string, fn: () => Promise<void>) => test(name, { skip: !DB_URL && "TEST_DATABASE_URL not set" }, fn);

dbTest("pending Multibanco = open reference only; left before paying = e-mail and no payment started", async () => {
  const { db, schema } = await import("../src/db");
  const { eq, inArray } = await import("drizzle-orm");
  const { leftBeforePaying, pendingMultibanco } = await import("../src/lib/stats");
  const [bundle] = await db.select().from(schema.bundles).limit(1);
  assert.ok(bundle, "seeded bundle");
  const run = `cnt-${Date.now()}`;
  const mk = async (suffix: string, email: string | null) =>
    (await db.insert(schema.orders).values({ id: `${run}-${suffix}`, bundleId: bundle.id, bundleKey: bundle.key, qtyBoxes: bundle.qty, subtotalCents: 1000, shippingCents: 0, totalCents: 1000, locale: "pt", country: "PT", email }).returning())[0];
  const before = { mb: await pendingMultibanco(), left: await leftBeforePaying(30) };
  const open = await mk("open", "a@example.com");
  const expired = await mk("expired", "b@example.com");
  const leftOne = await mk("left", "c@example.com");
  await mk("noemail", null);
  const failedCard = await mk("failed", "d@example.com");
  await db.insert(schema.payments).values([
    { orderId: open.id, method: "multibanco", ref: `${run}-r1`, amountCents: 1000, status: "pending", expiresAt: new Date(Date.now() + 86400_000) },
    { orderId: expired.id, method: "multibanco", ref: `${run}-r2`, amountCents: 1000, status: "pending", expiresAt: new Date(Date.now() - 1000) },
    { orderId: failedCard.id, method: "card", ref: `${run}-r3`, amountCents: 1000, status: "failed" },
  ]);
  const mb = await pendingMultibanco();
  const left = await leftBeforePaying(30);
  assert.equal(mb.count - before.mb.count, 1); // only the open reference
  assert.equal(mb.valueCents - before.mb.valueCents, 1000);
  // Left before paying: the one with no payment, the expired reference (nothing open) and the failed card; not the open one, not the one without e-mail.
  assert.equal(left.count - before.left.count, 3);
  void leftOne;
  const ids = [open, expired, leftOne, failedCard].map((o) => o.id).concat(`${run}-noemail`);
  await db.delete(schema.payments).where(inArray(schema.payments.orderId, ids));
  for (const id of ids) await db.delete(schema.orders).where(eq(schema.orders.id, id));
});
