// Recovery engine integration test against the local DB (no external sends: channels are not configured).
import "./load-env";
import { eq, inArray } from "drizzle-orm";
import { sql as pg, db, schema } from "../src/db";
import { processDueRecovery, scheduleRecovery, stopRecovery } from "../src/lib/recovery";

let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "PASS" : "FAIL"} ${m}`); if (!c) fails++; };
const [b] = await db.select().from(schema.bundles).where(eq(schema.bundles.key, "x2"));
const mk = async (suffix: string, extra: Partial<typeof schema.orders.$inferInsert> = {}) => {
  const id = `WP-RTEST-${suffix}-${Date.now() % 100000}`;
  await db.insert(schema.orders).values({ id, bundleId: b.id, bundleKey: b.key, qtyBoxes: 2, subtotalCents: 8262, shippingCents: 0, totalCents: 8262, customerName: "Ana Teste", email: `${suffix.toLowerCase()}${Date.now()}@example.com`, phone: "+351912000111", consentMessages: true, consentCalls: true, ...extra });
  return id;
};
const due = async (id: string) => {
  await scheduleRecovery(id, (await db.select().from(schema.orders).where(eq(schema.orders.id, id)))[0].email!);
  await db.update(schema.recoverySteps).set({ scheduledAt: new Date(Date.now() - 1000) }).where(eq(schema.recoverySteps.orderId, id));
};
const steps = async (id: string) => Object.fromEntries((await db.select().from(schema.recoverySteps).where(eq(schema.recoverySteps.orderId, id))).map((s) => [s.step, s]));

const a = await mk("ABANDON");
await due(a);
await processDueRecovery(50);
let s = await steps(a);
ok(s.reminder_20m.status === "done" && (s.reminder_20m.channels ?? []).includes("email"), "abandoned: 20m reminder processed via email");
ok(s.ai_call.status === "skipped" || s.ai_call.status === "pending", `abandoned: AI call skipped/rescheduled without Telnyx (${s.ai_call.status}: ${JSON.stringify(s.ai_call.result)})`);
ok(s.final_email.status === "done", "abandoned: final email processed");

const p = await mk("PAID", { status: "paid" });
await due(p);
await processDueRecovery(50);
s = await steps(p);
ok(Object.values(s).every((x) => x.status === "skipped"), "paid order: all steps skipped");

const m = await mk("MB");
await db.insert(schema.orderEvents).values({ orderId: m, type: "mb_reference_issued", payload: { entity: "11111", reference: "123456789" } });
await due(m);
await processDueRecovery(50);
s = await steps(m);
ok(Object.values(s).every((x) => x.status === "skipped"), "Multibanco reference issued: no recovery");

const n = await mk("NOCONSENT", { consentMessages: false, consentCalls: false });
await due(n);
await processDueRecovery(50);
s = await steps(n);
ok(Object.values(s).every((x) => x.status === "skipped"), "no consent: nothing sent");

const st = await mk("STOP");
await scheduleRecovery(st, (await db.select().from(schema.orders).where(eq(schema.orders.id, st)))[0].email!);
await stopRecovery(st);
s = await steps(st);
ok(Object.values(s).every((x) => x.status === "skipped"), "stop link cancels pending steps");

const ids = [a, p, m, n, st];
await db.delete(schema.recoverySteps).where(inArray(schema.recoverySteps.orderId, ids));
await db.delete(schema.orderEvents).where(inArray(schema.orderEvents.orderId, ids));
await db.delete(schema.orders).where(inArray(schema.orders.id, ids));
console.log(fails ? `${fails} FAILED` : "all recovery checks passed");
await pg.end();
process.exit(fails ? 1 : 0);
