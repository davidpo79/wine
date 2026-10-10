// ifthenpay payment flow test against a running app that points at the mock API.
// 1) tsx scripts/mock-ifthenpay.ts 4599
// 2) app env: IFTHENPAY_API_BASE=http://localhost:4599 IFTHENPAY_SANDBOX=1 IFTHENPAY_MBWAY_KEY=TST-000001 IFTHENPAY_MB_KEY=TST-000002
//    IFTHENPAY_CCARD_KEY=TST-000003 IFTHENPAY_ANTI_PHISHING_KEY=<secret> IFTHENPAY_BACKOFFICE_KEY=0000-0000-0000-0000
// 3) tsx scripts/test-payments.ts [baseUrl]   (same env in this shell)
import "./load-env";
import { and, eq, inArray, like } from "drizzle-orm";
import { sql as pg, db, schema } from "../src/db";
import { cardSignature } from "../src/lib/ifthenpay";

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const mock = process.env.IFTHENPAY_API_BASE ?? "http://localhost:4599";
const apk = process.env.IFTHENPAY_ANTI_PHISHING_KEY!;
let failures = 0;
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? "PASS" : "FAIL"} ${msg}`);
  if (!cond) failures++;
};
const ids: string[] = [];
const j = (r: Response) => r.json().catch(() => ({}));
const post = (path: string, body: unknown) => fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

async function draft(bundle: string) {
  const d = await j(await post("/api/checkout", { bundle_key: bundle }));
  ids.push(d.order_id);
  const k = { o: d.order_id as string, t: d.token as string };
  await fetch(`${base}/api/checkout`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...k, patch: { email: "teste@example.com", phone: "912345678", firstName: "Maria", lastName: "Teste", address1: "Rua Augusta 10", postalCode: "1100-053", city: "Lisboa" } }),
  });
  return { ...k, methods: d.methods as string[] };
}
const order = async (id: string) => (await db.select().from(schema.orders).where(eq(schema.orders.id, id)))[0];
const pays = async (id: string) => db.select().from(schema.payments).where(eq(schema.payments.orderId, id)).orderBy(schema.payments.id);
const purchases = async (id: string) => db.select().from(schema.trackingEvents).where(and(eq(schema.trackingEvents.orderId, id), eq(schema.trackingEvents.eventName, "Purchase"), eq(schema.trackingEvents.sentTo, "internal")));
const events = async (id: string, type: string) => db.select().from(schema.orderEvents).where(and(eq(schema.orderEvents.orderId, id), eq(schema.orderEvents.type, type)));
const callback = (q: Record<string, string>) => fetch(`${base}/api/ifthenpay/callback?${new URLSearchParams(q)}`);

// ---- MB WAY + one-time offer ----------------------------------------------------------------------
{
  const d = await draft("x1");
  check(["mbway", "card", "multibanco"].every((m) => d.methods.includes(m)), "configured methods offered (mbway, card, multibanco)");
  const prep = await j(await post("/api/checkout/prepare", d));
  check(prep.offer?.priceCents === 3672, "x1: one-time offer is +1 box for 36,72 € (2-box price)");
  check(prep.products?.some((p: { priceCents: number }) => p.priceCents === 1490), "extra products offered (Espumante 14,90 €)");
  const again = await j(await post("/api/checkout/prepare", d));
  check(!again.offer, "offer is shown only once per order");
  const add = await j(await post("/api/checkout/addons", { ...d, keys: ["boxes", "espumante-dgraca-bruto"] }));
  check(add.amounts?.total === 5080 + 3672 + 1490, `cart total with offer = 102,42 € (got ${add.amounts?.total})`);
  const bad = await j(await post("/api/pay", { ...d, method: "mbway", phone: "912000000" }));
  check(!!bad.error, "declined MB WAY request returns an error");
  const r = await j(await post("/api/pay", { ...d, method: "mbway", phone: "+351 912 345 678" }));
  check(r.kind === "mbway", "MB WAY request sent");
  const [p] = (await pays(d.o)).filter((x) => x.method === "mbway" && x.status === "pending");
  check(p?.amountCents === 10242 && p.ref.length <= 15, `payment row: amount 102,42 €, ref ${p?.ref} <= 15 chars`);
  const st1 = await j(await fetch(`${base}/api/pay/status?o=${d.o}&t=${encodeURIComponent(d.t)}`));
  check(st1.state === "pending", "status pending while not approved");
  await fetch(`${mock}/__mbway`, { method: "POST", body: JSON.stringify({ requestId: p.requestId, status: "000" }) });
  await new Promise((res) => setTimeout(res, 3200));
  const st2 = await j(await fetch(`${base}/api/pay/status?o=${d.o}&t=${encodeURIComponent(d.t)}`));
  check(st2.state === "paid", "approved in app -> paid (status endpoint)");
  const o = await order(d.o);
  check(o.status === "paid" && o.paymentMethodType === "mb_way", "order paid via MB WAY");
  const addons = await db.select().from(schema.orderAddons).where(eq(schema.orderAddons.orderId, d.o));
  check(addons.length === 2 && addons.every((a) => a.status === "paid"), "offer items paid with the order");
  // Late callback for the same payment: idempotent.
  const cb = await callback({ m: "mbway", key: apk, orderId: p.ref, amount: "102.42", requestId: p.requestId!, payment_datetime: "10-10-2026 10:00:00" });
  check(cb.status === 200, "late MB WAY callback accepted");
  const pu = await purchases(d.o);
  check(pu.length === 1, "Purchase reported once");
}

// ---- Multibanco -------------------------------------------------------------------------------------
{
  const d = await draft("x2");
  await post("/api/checkout/prepare", d);
  await post("/api/checkout/addons", { ...d, keys: [] });
  const r = await j(await post("/api/pay", { ...d, method: "multibanco" }));
  check(r.kind === "redirect" && String(r.url).includes("/obrigado"), "Multibanco -> thank-you page");
  const [p] = await pays(d.o);
  check(!!p?.entity && !!p.reference && !!p.expiresAt, "reference stored with entity and expiry");
  check((await events(d.o, "mb_reference_issued")).length === 1, "mb_reference_issued logged (stops cart recovery)");
  const page = await (await fetch(`${base}/obrigado?o=${d.o}&t=${encodeURIComponent(d.t)}`)).text();
  check(page.includes("11990") && page.includes("82,62"), "thank-you page shows entity and amount");
  const q = { m: "mb", orderId: p.ref, amount: "82.62", requestId: p.requestId!, entity: p.entity!, reference: p.reference!, payment_datetime: "10-10-2026 11:00:00" };
  check((await callback({ ...q, key: "wrong" })).status === 403, "wrong anti-phishing key rejected");
  await callback({ ...q, key: apk, amount: "1.00" });
  check((await order(d.o)).status === "pending_payment", "amount mismatch does not confirm");
  check((await events(d.o, "amount_mismatch")).length === 1, "amount mismatch logged");
  await callback({ ...q, key: apk });
  check((await order(d.o)).status === "paid", "valid callback confirms the order");
  await callback({ ...q, key: apk });
  check((await purchases(d.o)).length === 1, "duplicate callback is a no-op");
  await callback({ ...q, key: apk, payment_datetime: "11-10-2026 09:00:00" });
  check((await events(d.o, "duplicate_payment")).length === 1, "same reference paid twice -> flagged for manual refund");
}

// ---- Card (hosted page, signed return) ----------------------------------------------------------------
{
  const d = await draft("x3");
  await post("/api/checkout/prepare", d);
  await post("/api/checkout/addons", { ...d, keys: [] });
  const r = await j(await post("/api/pay", { ...d, method: "card" }));
  check(r.kind === "redirect" && String(r.url).includes("cardpage"), "card -> ifthenpay hosted page");
  const [p] = await pays(d.o);
  const ret = (sk: string, amount = "117.05") => fetch(`${base}/pagamento/retorno?o=${d.o}&t=${encodeURIComponent(d.t)}&r=ok&id=${p.ref}&amount=${amount}&requestId=${p.requestId}&sk=${sk}`, { redirect: "manual" });
  await ret("0".repeat(64));
  check((await order(d.o)).status === "pending_payment", "forged signature does not confirm");
  const res = await ret(cardSignature(p.ref, "117.05", p.requestId!, process.env.IFTHENPAY_CCARD_KEY));
  check(res.status === 303 && (res.headers.get("location") ?? "").includes("/obrigado"), "signed return redirects to thank-you");
  check((await order(d.o)).status === "paid", "valid card signature confirms");
  const err = await fetch(`${base}/pagamento/retorno?o=${d.o}&t=${encodeURIComponent(d.t)}&r=cancelado`, { redirect: "manual" });
  check((err.headers.get("location") ?? "").includes("pagamento=cancelado"), "cancel goes back to the checkout");
}

// ---- Lost callback: reconciliation via list of payments ----------------------------------------------
{
  const d = await draft("x2");
  await post("/api/checkout/prepare", d);
  await post("/api/checkout/addons", { ...d, keys: [] });
  await post("/api/pay", { ...d, method: "multibanco" });
  const [p] = await pays(d.o);
  await fetch(`${mock}/__paid`, { method: "POST", body: JSON.stringify({ orderId: p.ref, amount: "82.62" }) });
  const { paymentHousekeeping } = await import("../src/lib/payments");
  await paymentHousekeeping();
  check((await order(d.o)).status === "paid", "reconciliation confirms a payment whose callback never arrived");
  const { refundOrder } = await import("../src/lib/payments");
  const rf = await refundOrder(await order(d.o), "api");
  check(!rf.ok && /Multibanco/.test(rf.error ?? ""), "Multibanco refund by API is refused (manual transfer)");
}

check((await callback({ m: "mbway", key: apk, orderId: "NOPE-1", amount: "1.00", payment_datetime: "x" })).status === 200, "unknown order acknowledged (no retries)");

const testRows = await db.select({ id: schema.webhookLog.id }).from(schema.webhookLog).where(like(schema.webhookLog.eventId, "ifp:%"));
await db.delete(schema.webhookLog).where(inArray(schema.webhookLog.id, testRows.map((r) => r.id)));
for (const t of [schema.trackingEvents, schema.orderEvents, schema.orderAddons, schema.payments, schema.recoverySteps]) await db.delete(t).where(inArray(t.orderId, ids));
await db.delete(schema.orders).where(inArray(schema.orders.id, ids));
console.log(failures ? `\n${failures} FAILED` : "\nall payment checks passed");
await pg.end();
process.exit(failures ? 1 : 0);
