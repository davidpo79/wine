// Local stand-in for api.ifthenpay.com, for tests only (MB WAY has no official sandbox).
// Usage: tsx scripts/mock-ifthenpay.ts [port]   then run the app with IFTHENPAY_API_BASE=http://localhost:<port>
// Control: POST /__mbway {requestId, status} sets the MB WAY status; POST /__paid {orderId, amount} adds a listed payment.
// Also mimics the few Stripe endpoints the app uses (STRIPE_API_BASE=http://localhost:<port>); POST /__pi {id, status,
// payment_method} simulates the customer completing a PaymentIntent in the browser.
import { createServer } from "node:http";

const port = Number(process.argv[2] ?? 4599);
const mbway = new Map<string, string>();
const listed: { orderId: string; amount: string; requestId: string }[] = [];
const rid = () => Math.random().toString(36).slice(2, 12).toUpperCase();
const pis = new Map<string, Record<string, unknown>>();
const piOut = (pi: Record<string, unknown>) => ({ ...pi, amount_received: pi.status === "succeeded" ? pi.amount : 0, latest_charge: pi.status === "succeeded" ? { id: `ch_${pi.id}`, payment_method_details: { type: "card", card: { wallet: null } } } : null });

createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const rawBody = Buffer.concat(chunks).toString();
  const isForm = (req.headers["content-type"] ?? "").includes("x-www-form-urlencoded");
  const body = !rawBody ? {} : isForm ? Object.fromEntries(new URLSearchParams(rawBody)) : JSON.parse(rawBody);
  const url = new URL(req.url ?? "/", `http://localhost:${port}`);
  const json = (o: unknown, status = 200) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(o));
  };
  const p = url.pathname;
  // ---- Stripe ----
  if (p === "/__pi") {
    const pi = pis.get(body.id);
    if (pi) Object.assign(pi, { status: body.status, payment_method: body.payment_method ?? pi.payment_method });
    return json(pi ?? { error: "no pi" }, pi ? 200 : 404);
  }
  if (p === "/v1/customers" && req.method === "POST") return json({ id: `cus_${rid()}`, object: "customer" });
  if (p === "/v1/payment_intents" && req.method === "POST") {
    const id = `pi_${rid()}`;
    const confirm = body.confirm === "true" && body.payment_method;
    const pi: Record<string, unknown> = {
      id, object: "payment_intent", amount: Number(body.amount), currency: "eur", customer: body.customer ?? null, payment_method: body.payment_method ?? null,
      status: confirm ? (body.payment_method === "pm_3ds" ? "requires_action" : "succeeded") : "requires_payment_method", client_secret: `${id}_secret_x`,
      metadata: Object.fromEntries(Object.entries(body).filter(([k]) => k.startsWith("metadata[")).map(([k, v]) => [k.slice(9, -1), v])), last_payment_error: null,
    };
    pis.set(id, pi);
    return json(piOut(pi));
  }
  const piMatch = p.match(/^\/v1\/payment_intents\/(pi_[A-Z0-9]+)$/);
  if (piMatch) {
    const pi = pis.get(piMatch[1]);
    return pi ? json(piOut(pi)) : json({ error: { message: "No such payment_intent" } }, 404);
  }
  if (p === "/v1/refunds" && req.method === "POST") return json({ id: `re_${rid()}`, object: "refund", status: "succeeded", payment_intent: body.payment_intent });
  if (p === "/__mbway") return mbway.set(body.requestId, body.status), json({ ok: true });
  if (p === "/__paid") return listed.push({ orderId: body.orderId, amount: body.amount, requestId: rid() }), json({ ok: true });
  if (p === "/spg/payment/mbway" && req.method === "POST") {
    if (!/^351#9\d{8}$/.test(body.mobileNumber)) return json({ Status: "999", Message: "Invalid phone" });
    if (body.mobileNumber.endsWith("000000")) return json({ Status: "122", Message: "Declined" });
    const id = rid();
    mbway.set(id, "123");
    return json({ Amount: Number(body.amount), Message: "Pending", orderId: body.orderId, RequestId: id, Status: "000" });
  }
  if (p === "/spg/payment/mbway/status") return json({ Status: mbway.get(url.searchParams.get("requestId") ?? "") ?? "123", RequestId: url.searchParams.get("requestId") });
  if (p === "/multibanco/reference/sandbox" || p === "/multibanco/reference/init") {
    const d = new Date(Date.now() + (body.expiryDays ?? 3) * 86400_000);
    const dd = `${String(d.getUTCDate()).padStart(2, "0")}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${d.getUTCFullYear()}`;
    return json({ Amount: body.amount, Entity: "11990", ExpiryDate: dd, Message: "Success", OrderId: body.orderId, Reference: String(100000000 + Math.floor(Math.random() * 899999999)), RequestId: rid(), Status: "0" });
  }
  if (p.startsWith("/creditcard/")) return json({ Message: "Success", PaymentUrl: `http://localhost:${port}/cardpage?o=${body.orderId}`, RequestId: rid(), Status: "0" });
  if (p.startsWith("/gateway/pinpay/")) return json({ PinCode: "1234567890", RedirectUrl: `http://localhost:${port}/gw/${rid()}`, PinpayUrl: "https://pinpay.pt/1234567890" });
  if (p === "/v2/payments/refund") return json({ Code: "1", Message: "Refunded" });
  if (p === "/v2/payments/read") return json({ message: "OK", status: 200, payments: listed.filter((x) => !body.orderId || x.orderId === body.orderId) });
  json({ error: "not found" }, 404);
}).listen(port, () => console.log(`mock ifthenpay on :${port}`));
