// ifthenpay REST client (MB WAY, Multibanco dynamic references, card hosted page, Apple/Google Pay via Pay by Link,
// refunds, list of payments). Auth is the per-method key in the body/path; keys stay on the server.
// Docs: https://www.ifthenpay.com/docs/en/ (see docs/IFTHENPAY.md for the flags we verified or still need to confirm).
import { createHmac, timingSafeEqual } from "node:crypto";

const BASE = () => (process.env.IFTHENPAY_API_BASE ?? "https://api.ifthenpay.com").replace(/\/$/, "");
const sandbox = () => process.env.IFTHENPAY_SANDBOX === "1";
const key = (name: string) => process.env[`IFTHENPAY_${name}_KEY`]?.trim() || null;

export type PayMethod = "mbway" | "multibanco" | "card" | "wallet";

export function availableMethods(): PayMethod[] {
  const m: PayMethod[] = [];
  if (key("MBWAY")) m.push("mbway");
  if (key("CCARD")) m.push("card");
  if (key("GATEWAY") && (key("APPLE") || key("GOOGLE"))) m.push("wallet");
  if (key("MB")) m.push("multibanco");
  return m;
}

export function ifthenpayMode(): "sandbox" | "live" | "unset" {
  if (availableMethods().length === 0) return "unset";
  return sandbox() ? "sandbox" : "live";
}

/** "49.90" (string, dot decimal, two places) as every ifthenpay endpoint expects. */
export const amountStr = (cents: number) => (cents / 100).toFixed(2);

/** Parses "49.90" / "49,90" / "49.9" into cents; NaN-safe. */
export function parseAmountCents(v: string | null | undefined): number | null {
  if (!v) return null;
  const n = Number(String(v).replace(",", ".").trim());
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** 912345678 / +351912345678 -> "351#912345678" (MB WAY format). */
export function mbwayPhone(phone: string) {
  const d = phone.replace(/\D/g, "").replace(/^00/, "");
  const local = d.startsWith("351") && d.length === 12 ? d.slice(3) : d;
  return `351#${local}`;
}

async function call<T>(path: string, body: unknown, method: "POST" | "GET" = "POST"): Promise<T> {
  const r = await fetch(`${BASE()}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: method === "POST" ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`ifthenpay ${path.split("/").slice(0, 4).join("/")} HTTP ${r.status}: ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

// ---- MB WAY ------------------------------------------------------------------------------------
// Customer has 4 minutes to approve in the app. Init: 000 started; 100/999 retry; 122 declined.
// Status: 000 paid; 020 rejected by user; 101 expired; 122 declined; anything else = still pending.
export async function mbwayCreate(p: { ref: string; amountCents: number; phone: string; email?: string | null; description: string }) {
  const k = key("MBWAY");
  if (!k) throw new Error("IFTHENPAY_MBWAY_KEY is not set");
  const r = await call<{ Status?: string; Message?: string; RequestId?: string }>("/spg/payment/mbway", {
    mbWayKey: k,
    orderId: p.ref,
    amount: amountStr(p.amountCents),
    mobileNumber: mbwayPhone(p.phone),
    email: p.email?.slice(0, 100) ?? "",
    description: p.description.slice(0, 100),
  });
  return { ok: r.Status === "000" && !!r.RequestId, status: r.Status ?? "", message: r.Message ?? "", requestId: r.RequestId ?? null };
}

export type MbwayState = "paid" | "rejected" | "expired" | "declined" | "pending";
export async function mbwayStatus(requestId: string): Promise<{ state: MbwayState; raw: string }> {
  const k = key("MBWAY");
  if (!k) throw new Error("IFTHENPAY_MBWAY_KEY is not set");
  const r = await call<{ Status?: string }>(`/spg/payment/mbway/status?mbWayKey=${encodeURIComponent(k)}&requestId=${encodeURIComponent(requestId)}`, null, "GET");
  const s = r.Status ?? "";
  const state: MbwayState = s === "000" ? "paid" : s === "020" ? "rejected" : s === "101" ? "expired" : s === "122" ? "declined" : "pending";
  return { state, raw: s };
}

// ---- Multibanco (dynamic reference) --------------------------------------------------------------
export async function multibancoCreate(p: { ref: string; amountCents: number; expiryDays: number; description: string; name?: string | null; email?: string | null; phone?: string | null }) {
  const k = key("MB");
  if (!k) throw new Error("IFTHENPAY_MB_KEY is not set");
  const r = await call<{ Status?: string; Message?: string; Entity?: string; Reference?: string; ExpiryDate?: string; RequestId?: string }>(
    `/multibanco/reference/${sandbox() ? "sandbox" : "init"}`,
    {
      mbKey: k,
      orderId: p.ref,
      amount: amountStr(p.amountCents),
      description: p.description.slice(0, 200),
      clientName: p.name?.slice(0, 200) ?? "",
      clientEmail: p.email?.slice(0, 200) ?? "",
      clientPhone: p.phone?.slice(0, 200) ?? "",
      expiryDays: p.expiryDays,
    },
  );
  return {
    ok: String(r.Status) === "0" && !!r.Reference,
    message: r.Message ?? "",
    entity: r.Entity ?? null,
    reference: r.Reference ?? null,
    requestId: r.RequestId ?? null,
    expiresAt: parseIfthenpayDate(r.ExpiryDate, true),
  };
}

/** "30-10-2021" or "28-10-2021 10:55:21" (Lisbon local) -> Date. endOfDay: references expire 23:59 on that day. */
export function parseIfthenpayDate(v: string | null | undefined, endOfDay = false): Date | null {
  const m = v?.match(/^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?$/);
  if (!m) return null;
  const [, dd, mm, yyyy, h = endOfDay ? "23" : "00", mi = endOfDay ? "59" : "00", s = endOfDay ? "59" : "00"] = m;
  // Interpret as Europe/Lisbon wall time.
  const guess = new Date(Date.UTC(+yyyy, +mm - 1, +dd, +h, +mi, +s));
  const lisbon = new Date(guess.toLocaleString("en-US", { timeZone: "Europe/Lisbon" }));
  const utc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(guess.getTime() - (lisbon.getTime() - utc.getTime()));
}

/** "000000291" -> "000 000 291" */
export const formatMbReference = (r: string) => r.replace(/\D/g, "").replace(/(\d{3})(?=\d)/g, "$1 ");

// ---- Card (hosted page) --------------------------------------------------------------------------
export async function cardInit(p: { ref: string; amountCents: number; successUrl: string; errorUrl: string; cancelUrl: string }) {
  const k = key("CCARD");
  if (!k) throw new Error("IFTHENPAY_CCARD_KEY is not set");
  const r = await call<{ Status?: string; Message?: string; PaymentUrl?: string; RequestId?: string }>(`/creditcard/${sandbox() ? "sandbox/" : ""}init/${encodeURIComponent(k)}`, {
    orderId: p.ref,
    amount: amountStr(p.amountCents),
    successUrl: p.successUrl,
    errorUrl: p.errorUrl,
    cancelUrl: p.cancelUrl,
    language: "pt",
  });
  return { ok: String(r.Status) === "0" && !!r.PaymentUrl, message: r.Message ?? "", paymentUrl: r.PaymentUrl ?? null, requestId: r.RequestId ?? null };
}

/**
 * Success redirect signature: sk = HMAC-SHA256(key = CCARD KEY, msg = id + amount + requestId), hex.
 * Verified against the docs' test vector (see tests/unit.test.ts).
 */
export function cardSignature(id: string, amount: string, requestId: string, ccardKey = key("CCARD") ?? "") {
  return createHmac("sha256", ccardKey).update(`${id}${amount}${requestId}`).digest("hex");
}

export function verifyCardSignature(id: string, amount: string, requestId: string, sk: string, ccardKey?: string) {
  if (!sk || !/^[0-9a-f]{64}$/i.test(sk)) return false;
  const want = Buffer.from(cardSignature(id, amount, requestId, ccardKey), "hex");
  const got = Buffer.from(sk.toLowerCase(), "hex");
  return want.length === got.length && timingSafeEqual(want, got);
}

// ---- Apple Pay / Google Pay (Pay by Link with only the wallet accounts) --------------------------
export async function walletLink(p: { ref: string; amountCents: number; description: string; successUrl: string; errorUrl: string; cancelUrl: string }) {
  const gw = key("GATEWAY");
  if (!gw) throw new Error("IFTHENPAY_GATEWAY_KEY is not set");
  const accounts = [key("APPLE") && `APPLE|${key("APPLE")}`, key("GOOGLE") && `GOOGLE|${key("GOOGLE")}`].filter(Boolean).join(";");
  const r = await call<{ RedirectUrl?: string; PinpayUrl?: string; PinCode?: string }>(`/gateway/pinpay/${encodeURIComponent(gw)}`, {
    id: p.ref,
    amount: amountStr(p.amountCents),
    description: p.description.slice(0, 200),
    accounts,
    lang: "pt",
    otp: "true",
    success_url: p.successUrl,
    error_url: p.errorUrl,
    cancel_url: p.cancelUrl,
  });
  return { ok: !!r.RedirectUrl, redirectUrl: r.RedirectUrl ?? null };
}

export async function disableLink(url: string) {
  const gw = key("GATEWAY");
  if (!gw) return;
  await call(`/gateway/pinpay/${encodeURIComponent(gw)}/disable`, { url }).catch(() => {});
}

// ---- Refunds (MB WAY, card, Apple/Google Pay only; Multibanco is refunded by bank transfer) ----------
export async function refund(requestId: string, amountCents: number) {
  const bo = process.env.IFTHENPAY_BACKOFFICE_KEY;
  if (!bo) throw new Error("IFTHENPAY_BACKOFFICE_KEY is not set");
  const r = await call<{ Code?: string | number; Message?: string }>("/v2/payments/refund", { backofficekey: bo, requestId, amount: amountStr(amountCents) });
  const code = String(r.Code ?? "");
  return { ok: code === "1", code, message: r.Message ?? "" };
}

// ---- List of payments (reconciliation when a callback never arrived) -----------------------------
export type ListedPayment = { amount?: number | string; orderId?: string; requestId?: string; reference?: string; entity?: string; paymentDate?: string };
export async function findPayments(filter: { orderId?: string; requestId?: string }) {
  const bo = process.env.IFTHENPAY_BACKOFFICE_KEY;
  if (!bo) return null;
  const r = await call<{ status?: number; payments?: ListedPayment[] }>("/v2/payments/read", { boKey: bo, ...filter });
  return r.payments ?? [];
}

// ---- Callback -----------------------------------------------------------------------------------
/** Normalizes the callback query: param names differ per method (key/anti_phishing_key, orderId/order_id/id). */
export function parseCallback(sp: URLSearchParams) {
  const g = (...names: string[]) => names.map((n) => sp.get(n)).find((v) => v != null && v !== "") ?? null;
  return {
    m: g("m"),
    key: g("key", "anti_phishing_key", "chave"),
    ref: g("orderId", "order_id", "id"),
    amount: g("amount", "valor"),
    requestId: g("requestId", "request_id"),
    entity: g("entity", "entidade"),
    reference: g("reference", "referencia"),
    paymentDatetime: g("payment_datetime", "datahorapag"),
    paymentMethod: g("payment_method"),
  };
}

export function verifyAntiPhishing(k: string | null) {
  const want = process.env.IFTHENPAY_ANTI_PHISHING_KEY ?? "";
  if (!want || !k) return false;
  const a = Buffer.from(want);
  const b = Buffer.from(k);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Callback URL templates to register at ifthenpay (one per method). */
export function callbackTemplates(siteUrl: string) {
  const base = `${siteUrl.replace(/\/$/, "")}/api/ifthenpay/callback`;
  const common = "key=[ANTI_PHISHING_KEY]&amount=[AMOUNT]&payment_datetime=[PAYMENT_DATETIME]";
  return {
    MB: `${base}?m=mb&${common}&orderId=[ORDER_ID]&requestId=[REQUEST_ID]&entity=[ENTITY]&reference=[REFERENCE]`,
    MBWAY: `${base}?m=mbway&${common}&orderId=[ORDER_ID]&requestId=[REQUEST_ID]`,
    CCARD: `${base}?m=card&${common}&id=[ORDER_ID]&payment_method=[PAYMENT_METHOD]`,
    GATEWAY: `${base}?m=wallet&${common}&id=[ORDER_ID]&payment_method=[PAYMENT_METHOD]`,
  };
}

export async function activateCallback(paymentMethod: string, paymentKey: string, urlCb: string) {
  const bo = process.env.IFTHENPAY_BACKOFFICE_KEY;
  const ap = process.env.IFTHENPAY_ANTI_PHISHING_KEY;
  if (!bo || !ap) throw new Error("IFTHENPAY_BACKOFFICE_KEY and IFTHENPAY_ANTI_PHISHING_KEY are required");
  return call<string>("/v2/callback/activation", { boKey: bo, paymentMethod, paymentKey, apKey: ap, urlCb });
}

export function methodKey(name: "MB" | "MBWAY" | "CCARD" | "GATEWAY" | "APPLE" | "GOOGLE") {
  return key(name);
}
