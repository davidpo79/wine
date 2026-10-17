// ifthenpay payment flow test against a running app that points at the mock API.
// 1) tsx scripts/mock-ifthenpay.ts 4599
// 2) app env: IFTHENPAY_API_BASE=http://localhost:4599 IFTHENPAY_SANDBOX=1 IFTHENPAY_MBWAY_KEY=TST-000001 IFTHENPAY_MB_KEY=TST-000002
//    IFTHENPAY_CCARD_KEY=TST-000003 IFTHENPAY_ANTI_PHISHING_KEY=<secret> IFTHENPAY_BACKOFFICE_KEY=0000-0000-0000-0000
// 3) tsx scripts/test-payments.ts [baseUrl]   (same env in this shell)
import "./load-env";
import { and, eq, inArray, like } from "drizzle-orm";
import { sql as pg, db, schema } from "../src/db";
import { cardSignature } from "../src/lib/ifthenpay";
import Stripe from "stripe";

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
  check(prep.offer?.priceCents === 4000, "x1: one-time offer is the 2nd box for 40 € (2-box price)");
  check(prep.products?.some((p: { priceCents: number }) => p.priceCents === 1490), "extra products offered (Espumante 14,90 €)");
  const again = await j(await post("/api/checkout/prepare", d));
  check(!again.offer, "offer is shown only once per order");
  const add = await j(await post("/api/checkout/addons", { ...d, keys: ["boxes", "espumante-dgraca-bruto"] }));
  check(add.amounts?.total === 4990 + 4000 + 1490, `cart total with offer = 104,80 € (got ${add.amounts?.total})`);
  const bad = await j(await post("/api/pay", { ...d, method: "mbway", phone: "912000000" }));
  check(!!bad.error, "declined MB WAY request returns an error");
  const r = await j(await post("/api/pay", { ...d, method: "mbway", phone: "+351 912 345 678" }));
  check(r.kind === "mbway", "MB WAY request sent");
  const [p] = (await pays(d.o)).filter((x) => x.method === "mbway" && x.status === "pending");
  check(p?.amountCents === 10480 && p.ref.length <= 15, `payment row: amount 104,80 €, ref ${p?.ref} <= 15 chars`);
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
  check(page.includes("11990") && page.includes("89,90"), "thank-you page shows entity and amount");
  const q = { m: "mb", orderId: p.ref, amount: "89.90", requestId: p.requestId!, entity: p.entity!, reference: p.reference!, payment_datetime: "10-10-2026 11:00:00" };
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

// ---- Card on ifthenpay's hosted page (only when Stripe is not configured) -----------------------------------
if (!process.env.STRIPE_API_BASE) {
  const d = await draft("x4");
  await post("/api/checkout/prepare", d);
  await post("/api/checkout/addons", { ...d, keys: [] });
  const r = await j(await post("/api/pay", { ...d, method: "card" }));
  check(r.kind === "redirect" && String(r.url).includes("cardpage"), "card -> ifthenpay hosted page");
  const [p] = await pays(d.o);
  const ret = (sk: string, amount = "149.70") => fetch(`${base}/pagamento/retorno?o=${d.o}&t=${encodeURIComponent(d.t)}&r=ok&id=${p.ref}&amount=${amount}&requestId=${p.requestId}&sk=${sk}`, { redirect: "manual" });
  await ret("0".repeat(64));
  check((await order(d.o)).status === "pending_payment", "forged signature does not confirm");
  const res = await ret(cardSignature(p.ref, "149.70", p.requestId!, process.env.IFTHENPAY_CCARD_KEY));
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
  await fetch(`${mock}/__paid`, { method: "POST", body: JSON.stringify({ orderId: p.ref, amount: "89.90" }) });
  const { paymentHousekeeping } = await import("../src/lib/payments");
  await paymentHousekeeping();
  check((await order(d.o)).status === "paid", "reconciliation confirms a payment whose callback never arrived");
  const { refundOrder } = await import("../src/lib/payments");
  const rf = await refundOrder(await order(d.o), "api");
  check(!rf.ok && /Multibanco/.test(rf.error ?? ""), "Multibanco refund by API is refused (manual transfer)");
}

// ---- Card via Stripe + one-click upsell with the saved card ---------------------------------------------
if (process.env.STRIPE_API_BASE) {
  const d = await draft("x2");
  check(d.methods.includes("card"), "card offered (Stripe)");
  const prep = await j(await post("/api/checkout/prepare", { ...d, method: "card" }));
  check(!prep.offer, "card via Stripe: no offer before payment (it comes after, one click)");
  const r = await j(await post("/api/pay", { ...d, method: "card" }));
  check(r.kind === "stripe" && !!r.clientSecret, "Stripe PaymentIntent created");
  const [p] = await pays(d.o);
  check(p?.provider === "stripe" && p.amountCents === 8990, "payment row (stripe, 89,90 €)");
  await fetch(`${mock}/__pi`, { method: "POST", body: JSON.stringify({ id: p.requestId, status: "succeeded", payment_method: "pm_card_visa" }) });
  const back = await fetch(`${base}/checkout/concluido?o=${d.o}&t=${encodeURIComponent(d.t)}`, { redirect: "manual" });
  check((back.headers.get("location") ?? "").includes("/oferta"), "after card payment -> one-time offer page");
  let o = await order(d.o);
  check(o.status === "paid" && o.stripePaymentMethodId === "pm_card_visa", "order paid, card saved for one click");
  check(o.costs?.profit === 4692, `profit snapshot 46,92 € for 2 boxes (got ${o.costs?.profit})`);
  const page = await (await fetch(`${base}/oferta?o=${d.o}&t=${encodeURIComponent(d.t)}`)).text();
  check(page.includes("Oferta única") && page.includes("1 clique"), "offer page shows 'Oferta única' + one-click button");
  const up = await j(await post("/api/upsell", { ...d, offer: "boxes" }));
  check(up.status === "succeeded", "one click: +1 box charged on the saved card");
  const addons = await db.select().from(schema.orderAddons).where(eq(schema.orderAddons.orderId, d.o));
  check(addons.length === 1 && addons[0].status === "paid" && addons[0].amountCents === 5980 && addons[0].boxes === 2, "add-on: 2 more boxes for 59,80 € paid (pague 3, leve 4)");
  o = await order(d.o);
  check(o.costs?.paid === 14970 && o.costs?.delivery === 1704 && o.costs?.profit === 6315, `snapshot updated: 149,70 € paid, 4 boxes in two parcels, profit 63,15 € (got ${o.costs?.profit})`);
  check((await db.select().from(schema.trackingEvents).where(and(eq(schema.trackingEvents.eventId, `purchase_addon_${addons[0].id}`), eq(schema.trackingEvents.sentTo, "internal")))).length === 1, "add-on Purchase with its own event id");
  const again = await j(await post("/api/upsell", { ...d, offer: "boxes" }));
  check(again.already === true, "same offer cannot be charged twice");
  if (process.env.STRIPE_WEBHOOK_SECRET) {
    const stripe = new Stripe("sk_test_dummy");
    const payload = JSON.stringify({ id: `evt_${Date.now()}`, object: "event", type: "payment_intent.succeeded", api_version: "2026-09-30", created: 1, data: { object: { id: p.requestId, object: "payment_intent", status: "succeeded", amount: 8990, amount_received: 8990 } } });
    const wh = await fetch(`${base}/api/webhooks/stripe`, { method: "POST", headers: { "stripe-signature": stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET }), "content-type": "application/json" }, body: payload });
    check(wh.status === 200 && (await purchases(d.o)).length === 2, "late Stripe webhook is a no-op (order + add-on Purchase only)");
    const bad = await fetch(`${base}/api/webhooks/stripe`, { method: "POST", headers: { "stripe-signature": "t=1,v1=bad" }, body: payload });
    check(bad.status === 400, "Stripe webhook with bad signature rejected");
  }
  const { refundOrder } = await import("../src/lib/payments");
  const rf = await refundOrder(await order(d.o), "api");
  check(rf.ok && (await order(d.o)).status === "refunded", "Stripe refund from admin marks the order refunded");
}

// ---- MB WAY: offer after payment, new push to the same phone ----------------------------------------------
{
  const d = await draft("x1");
  const prep = await j(await post("/api/checkout/prepare", { ...d, method: "mbway" }));
  check(!prep.offer, "MB WAY: no offer before payment (it comes after)");
  await post("/api/pay", { ...d, method: "mbway" });
  const [p] = await pays(d.o);
  await fetch(`${mock}/__mbway`, { method: "POST", body: JSON.stringify({ requestId: p.requestId, status: "000" }) });
  await new Promise((res) => setTimeout(res, 3200));
  const st = await j(await fetch(`${base}/api/pay/status?o=${d.o}&t=${encodeURIComponent(d.t)}`));
  check(st.state === "paid" && String(st.next).includes("/oferta"), "MB WAY paid -> one-time offer page");
  const page = await (await fetch(`${base}/oferta?o=${d.o}&t=${encodeURIComponent(d.t)}`)).text();
  check(page.includes("MB WAY") && page.includes("40,00"), "offer page: 2nd box 40,00 € by MB WAY");
  const up = await j(await post("/api/upsell", { ...d, offer: "boxes" }));
  check(up.kind === "mbway" && up.paymentId, "accepting sends a new MB WAY request to the same phone");
  const [ap] = (await pays(d.o)).filter((x) => x.addonId);
  check(ap?.phone === "+351912345678" && ap.amountCents === 4000, "add-on MB WAY request: same phone, 40,00 €");
  await fetch(`${mock}/__mbway`, { method: "POST", body: JSON.stringify({ requestId: ap.requestId, status: "000" }) });
  await new Promise((res) => setTimeout(res, 3200));
  const s2 = await j(await fetch(`${base}/api/upsell/status?o=${d.o}&t=${encodeURIComponent(d.t)}&p=${up.paymentId}`));
  check(s2.state === "paid", "approved in the app -> add-on paid");
  const o = await order(d.o);
  check(o.costs?.paid === 8990 && o.costs?.boxes === 2, `snapshot: 89,90 € paid, 2 boxes (got ${o.costs?.paid})`);
}

// ---- Order bump: printed card with the message -------------------------------------------------------
{
  const d = await draft("x2");
  const patch = (p: Record<string, unknown>) => fetch(`${base}/api/checkout`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...d, patch: p }) }).then(j);
  const on = await patch({ giftCard: true });
  check(on.amounts?.total === 8990 + 390 && on.amounts.addons?.some((a: { key: string }) => a.key === "gift-card"), `card ticked: total 93,80 € (got ${on.amounts?.total})`);
  const noMsg = await post("/api/checkout/prepare", { ...d, method: "mbway" });
  check(noMsg.status === 422 && !!(await j(noMsg)).errors?.giftMessage, "card without a message is refused");
  await patch({ giftMessage: "Feliz Natal, mãe! Beijinhos, Ana" });
  await post("/api/checkout/prepare", { ...d, method: "multibanco" });
  const kept = await j(await post("/api/checkout/addons", { ...d, keys: [] }));
  check(kept.amounts?.total === 9380, "declining the one-time offer keeps the card");
  const off = await patch({ giftCard: false });
  check(off.amounts?.total === 8990, "unticking removes the card");
  await patch({ giftCard: true });
  await post("/api/pay", { ...d, method: "multibanco" });
  const [p] = await pays(d.o);
  check(p.amountCents === 9380, "payment includes the card (93,80 €)");
  await callback({ m: "mb", key: apk, orderId: p.ref, amount: "93.80", requestId: p.requestId!, entity: p.entity!, reference: p.reference!, payment_datetime: "12-10-2026 10:00:00" });
  const o = await order(d.o);
  const card = (await db.select().from(schema.orderAddons).where(eq(schema.orderAddons.orderId, d.o))).find((a) => a.sku === "gift-card");
  check(o.status === "paid" && card?.status === "paid" && o.isGift && o.giftMessage === "Feliz Natal, mãe! Beijinhos, Ana", "paid: card add-on paid, message stored");
  check(o.costs?.paid === 9380, "profit snapshot includes the card");
  const { giftCardOrders } = await import("../src/lib/gift-cards");
  check((await giftCardOrders([d.o])).length === 1, "order listed in Admin → Gift cards");
}

// ---- Multibanco keeps the offer before payment ---------------------------------------------------------
{
  const d = await draft("x1");
  const prep = await j(await post("/api/checkout/prepare", { ...d, method: "multibanco" }));
  check(prep.offer?.priceCents === 4000, "Multibanco: one-time offer shown before payment");
}

{
  const { dailyPnl, lisbonDay } = await import("../src/lib/profit");
  const { getSettings } = await import("../src/lib/settings");
  const today = lisbonDay(new Date());
  const pnl = await dailyPnl(today, today, await getSettings());
  check(pnl.total.orders >= 3 && pnl.total.profit !== 0, `finance: today's P&L includes the paid test orders (${pnl.total.orders} orders)`);
}

check((await callback({ m: "mbway", key: apk, orderId: "NOPE-1", amount: "1.00", payment_datetime: "x" })).status === 200, "unknown order acknowledged (no retries)");

const testRows = await db.select({ id: schema.webhookLog.id }).from(schema.webhookLog).where(like(schema.webhookLog.eventId, "ifp:%"));
await db.delete(schema.webhookLog).where(inArray(schema.webhookLog.id, testRows.map((r) => r.id)));
for (const t of [schema.trackingEvents, schema.orderEvents, schema.orderAddons, schema.payments, schema.recoverySteps]) await db.delete(t).where(inArray(t.orderId, ids));
await db.delete(schema.orders).where(inArray(schema.orders.id, ids));
console.log(failures ? `\n${failures} FAILED` : "\nall payment checks passed");
await pg.end();
process.exit(failures ? 1 : 0);
