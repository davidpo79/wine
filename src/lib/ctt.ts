// CTT e-commerce shipping API v3 (enviosecommerceapi.ctt.pt): shipments, labels, tracking and status pushes.
// Docs: https://enviosecommerceapi.ctt.pt/v3/apidocs/usa/start · spec: docs in the repo history (2026-10-18).
// Auth: HTTP Basic, user = token (public key for POST /keys/), password = base64(HMAC-SHA256(user + body, secret))
// without "=" padding; every call carries X-APPID (the application key issued by CTT). No test environment:
// CTT_SIMULATE=1 sends X_SIMULATE: 1 (nothing is stored at CTT, ids are simulated).
import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Order } from "@/db/schema";

export const CTT_DELIVERED = [99, 94, 32]; // delivered · delivered (system) · manual delivered
export const CTT_PICKED_UP = [25]; // picked up / first scan: the parcel is on its way
export const CTT_ENDED = (code: number) => code > 90;

/** Our status ids, given to CTT for the shop update push (ShopItemId + Status). */
export const SHOP_STATUS = { imported: 1, shipped: 2, delivered: 3, problem: 4 } as const;

const ISO3: Record<string, string> = { PT: "PRT", ES: "ESP", DE: "DEU", NL: "NLD", BE: "BEL", LU: "LUX", FR: "FRA" };

export function cttConfig() {
  return {
    appId: (process.env.CTT_APP_ID ?? "").trim(),
    publicKey: (process.env.CTT_PUBLIC_KEY ?? "").trim(),
    secret: (process.env.CTT_SECRET_KEY ?? "").trim(),
    base: (process.env.CTT_API_BASE ?? "https://enviosecommerceapi.ctt.pt/v3").replace(/\/$/, ""),
    simulate: process.env.CTT_SIMULATE === "1",
    carrierId: process.env.CTT_CARRIER_ID ? Number(process.env.CTT_CARRIER_ID) : null, // empty: the rulebook in the CTT app decides
    optionIds: (process.env.CTT_OPTION_IDS ?? "").split(",").map((s) => Number(s.trim())).filter((n) => n > 0),
    labelType: Number(process.env.CTT_LABEL_TYPE ?? 0), // 0 = PDF, 1 = ZPL
    labelStart: Number(process.env.CTT_LABEL_START ?? 1),
    boxWeightG: Number(process.env.CTT_BOX_WEIGHT_G ?? 4800), // one Trilogia box: 3 bottles + gift box + carton
    shopUrl: `${(process.env.SITE_URL ?? "").replace(/\/$/, "")}/api/webhooks/ctt`,
  };
}

export const cttConfigured = () => {
  const c = cttConfig();
  return !!(c.appId && c.publicKey && c.secret);
};

const b64nopad = (buf: Buffer) => buf.toString("base64").replace(/=+$/, "");

/**
 * Password for Basic auth: HMAC-SHA256 of (username + body) with the secret key, base64. The docs say "padding
 * removed", but CTT's own WooCommerce plugin (Shiptimize API v3 client) sends it with the "=" padding, so that is
 * the default; CTT_SIG_PADDING=0 switches to the documented form.
 */
export function cttSign(username: string, body: string, secret = cttConfig().secret, padded = process.env.CTT_SIG_PADDING !== "0") {
  const sig = createHmac("sha256", secret).update(username + body).digest().toString("base64");
  return padded ? sig : sig.replace(/=+$/, "");
}

/** ShopItemId must be a hex string (max 60): the order id, hex encoded. */
export const shopItemId = (orderId: string) => Buffer.from(orderId, "utf8").toString("hex");
export const orderIdFromShopItem = (hex: string) => (/^[0-9a-f]+$/i.test(hex) && hex.length % 2 === 0 ? Buffer.from(hex, "hex").toString("utf8") : null);

/** Shop update push: Hash = base64(HMAC-SHA256(Status + TrackingId + our callback URL, secret)), padding removed. */
export function validShopUpdateHash(p: { Status?: unknown; TrackingId?: unknown; Hash?: unknown }, secret = cttConfig().secret, url = cttConfig().shopUrl) {
  if (typeof p.Hash !== "string" || !secret) return false;
  const got = Buffer.from(p.Hash.replace(/=+$/, ""));
  // The docs write the payload both with and without separators: accept either.
  return [`${p.Status}${p.TrackingId ?? ""}${url}`, `${p.Status},${p.TrackingId ?? ""},${url}`].some((payload) => {
    const want = Buffer.from(b64nopad(createHmac("sha256", secret).update(payload).digest()));
    return want.length === got.length && timingSafeEqual(want, got);
  });
}

type CttError = { Id?: number; Tekst?: string; Text?: string; Info?: string };
const errText = (e?: CttError | CttError[] | null) =>
  (Array.isArray(e) ? e : e ? [e] : [])
    .filter((x) => x && x.Id !== 0)
    .map((x) => `${x.Id ?? ""} ${x.Tekst ?? x.Text ?? x.Info ?? ""}`.trim())
    .join("; ");

const TOKEN_KEY = "ctt_token";

async function storedToken(): Promise<{ key: string; expire: string } | null> {
  const [r] = await db.select().from(schema.settings).where(eq(schema.settings.key, TOKEN_KEY));
  const v = r?.value as { key?: string; expire?: string } | undefined;
  return v?.key ? { key: v.key, expire: v.expire ?? "" } : null;
}

async function saveToken(t: { key: string; expire: string } | null) {
  await db.insert(schema.settings).values({ key: TOKEN_KEY, value: t }).onConflictDoUpdate({ target: schema.settings.key, set: { value: t } });
}

async function raw(method: string, path: string, username: string, body?: unknown, appId?: string, padded?: boolean) {
  const c = cttConfig();
  const text = body === undefined ? "" : JSON.stringify(body);
  const url = path.startsWith("http") ? path : `${c.base}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${username}:${cttSign(username, text, c.secret, padded)}`).toString("base64")}`,
      "X-APPID": appId ?? c.appId,
      ...(c.simulate ? { X_SIMULATE: "1" } : {}),
      ...(text ? { "Content-Type": "application/json" } : {}),
      Accept: "application/json",
    },
    body: text || undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
}

/** Requests a token with the public key (also registers our callback URL as ShopUrl). */
export async function newToken() {
  const c = cttConfig();
  const r = await raw("POST", "/keys/", c.publicKey, { PlatformVersion: "vinho-next-15", PluginVersion: "1.0.0", ShopUrl: c.shopUrl });
  const key = (r.json.Key ?? r.json.Token ?? r.json.key) as string | undefined;
  if (r.status !== 200 || !key) throw new Error(`CTT token: HTTP ${r.status} ${errText(r.json.Error as CttError) || errText(r.json.ErrorList as CttError[])}`.trim());
  const t = { key, expire: String(r.json.Expire ?? r.json.expire ?? "") };
  await saveToken(t);
  return t;
}

async function token() {
  const t = await storedToken();
  if (t && (!t.expire || Date.parse(t.expire) > Date.now() + 60_000)) return t.key;
  return (await newToken()).key;
}

/** Authenticated call: on 401 the token is renewed once (a second 401 means a key or account problem). */
export async function cttCall(method: string, path: string, body?: unknown) {
  if (!cttConfigured()) throw new Error("CTT is not configured (CTT_APP_ID, CTT_PUBLIC_KEY, CTT_SECRET_KEY).");
  let r = await raw(method, path, await token(), body);
  if (r.status === 401) {
    await saveToken(null);
    r = await raw(method, path, (await newToken()).key, body);
  }
  if (r.status === 405) throw new Error(`CTT: endpoint ${path} is not enabled for this API key (ask CTT to enable it).`);
  if (r.status === 401) throw new Error("CTT: authentication refused twice. Check the keys or contact CTT.");
  if (r.status >= 400) throw new Error(`CTT: HTTP ${r.status} on ${path} ${errText(r.json.Error as CttError)}`.trim());
  return r.json;
}

/** Imports the order as a shipment (rulebook in the CTT app picks the service unless CTT_CARRIER_ID is set). */
export async function cttCreateShipment(o: Order) {
  const c = cttConfig();
  const a = o.shippingAddress ?? {};
  const country = (a.country ?? o.country ?? "PT").toUpperCase();
  const shipment = {
    ClientReferenceCode: o.id,
    ShopItemId: shopItemId(o.id),
    ColliCount: "1",
    Weight: Math.max(1, o.qtyBoxes) * c.boxWeightG,
    OrderTotal: (o.totalCents / 100).toFixed(2),
    Note1: o.isGift ? "Oferta" : undefined,
    Address: {
      Name: a.name || o.customerName || "",
      Streetname1: a.line1 ?? "",
      Streetname2: a.line2 || undefined,
      PostalCode: a.postal_code ?? "",
      City: a.city ?? "",
      Country: ISO3[country] ?? country,
      Email: o.email ?? undefined,
      Phone: o.phone ?? undefined,
    },
    ...(c.carrierId ? { Carrier: { Id: c.carrierId } } : {}),
    ...(c.optionIds.length ? { OptionList: c.optionIds.map((Id) => ({ Id })) } : {}),
  };
  const r = await cttCall("POST", "/shipments/", { Shipment: [shipment] });
  const top = errText(r.Error as CttError) || errText(r.ErrorList as CttError[]);
  const item = (Array.isArray(r.Shipment) ? r.Shipment[0] : null) as { ErrorList?: CttError[]; WarningList?: CttError[]; CarrierSelect?: { Name?: string } } | null;
  const err = top || errText(item?.ErrorList);
  if (err) throw new Error(`CTT shipment not created: ${err}`);
  return { carrierName: item?.CarrierSelect?.Name ?? null, warnings: errText(item?.WarningList) };
}

export type LabelResult = { pdf: string | null; trackingId: string | null; trackingUrl: string | null };

/** Creates the label (one per request, one process at a time) and polls until it is ready (max ~60 s). */
export async function cttLabel(orderId: string): Promise<LabelResult> {
  const c = cttConfig();
  const r = await cttCall("POST", "/labels/", { ClientReferenceCodeList: [orderId], LabelType: c.labelType, LabelStart: c.labelStart });
  const err = errText(r.Error as CttError);
  if (err) throw new Error(`CTT label: ${err}`);
  const cb = r.CallbackURL as string | undefined;
  if (!cb) throw new Error("CTT label: no CallbackURL in the reply.");
  const path = cb.startsWith("http") ? cb.replace(/^https?:\/\/[^/]+\/v3/, "") : cb;
  for (let i = 0; i < 40; i++) {
    await new Promise((res) => setTimeout(res, 1500));
    const p = await cttCall("GET", path.startsWith("/") ? path : `/${path}`);
    if (Number(p.Finished ?? 0) < 100) continue;
    const ref = ((p.ClientReferenceCodeList as Record<string, unknown>[] | undefined) ?? []).find((x) => x.ReferenceCode === orderId) ?? (p.ClientReferenceCodeList as Record<string, unknown>[] | undefined)?.[0];
    const refErr = errText(ref?.Error as CttError);
    if (refErr) throw new Error(`CTT label: ${refErr}`);
    return { pdf: (p.LabelPDF as string) ?? (p.LabelFile as string) ?? null, trackingId: (ref?.TrackingId as string) ?? null, trackingUrl: (ref?.TrackingUrl as string) ?? null };
  }
  throw new Error("CTT label: still not ready after 60 seconds. Try again in a few minutes.");
}

export type TrackingStatus = { code: number; at: string; text: string };

/** Status history for up to 10 orders per call. */
export async function cttTrack(orderIds: string[]) {
  const out = new Map<string, { trackingId: string | null; statuses: TrackingStatus[] }>();
  for (let i = 0; i < orderIds.length; i += 10) {
    const r = await cttCall("POST", "/tracking/", { ClientReferenceCodeList: orderIds.slice(i, i + 10) });
    const list = (r.Shipments ?? r.Shipment ?? []) as { ClientReferenceCode?: string; TrackingId?: string; Statuslist?: { Code: number; DateTime: string; Text?: string }[] }[];
    for (const s of list) {
      if (!s.ClientReferenceCode) continue;
      out.set(s.ClientReferenceCode, {
        trackingId: s.TrackingId ?? null,
        statuses: (s.Statuslist ?? []).map((x) => ({ code: Number(x.Code), at: x.DateTime, text: x.Text ?? "" })),
      });
    }
  }
  return out;
}

/**
 * Admin "Test CTT connection": asks for a token (POST /keys/) and reads the account settings (GET /settings/),
 * nothing is created. appId overrides CTT_APP_ID for this test only. Never returns the token or keys.
 */
export async function cttTestConnection(appIdOverride?: string) {
  const c = cttConfig();
  const appId = appIdOverride?.trim() || c.appId;
  const missing = [!appId && "CTT_APP_ID", !c.publicKey && "CTT_PUBLIC_KEY", !c.secret && "CTT_SECRET_KEY"].filter(Boolean) as string[];
  if (missing.length) return { ok: false, steps: [`Missing in Railway: ${missing.join(", ")}`] };
  // Shape of the values only (never the values): a key pair is long random text, not a short portal number.
  const shape = (v: string) => `${v.length} chars${/^\d+$/.test(v) ? ", digits only" : ""}${/^\s|\s$/.test(v) ? ", has spaces at the ends" : ""}`;
  const keysLine = `Values used: application id ${shape(appIdOverride ?? process.env.CTT_APP_ID ?? "")} · CTT_PUBLIC_KEY ${shape(process.env.CTT_PUBLIC_KEY ?? "")} · CTT_SECRET_KEY ${shape(process.env.CTT_SECRET_KEY ?? "")}`;
  const short = (j: unknown) => JSON.stringify(j).replace(/"(Key|Token)":"[^"]+"/g, '"$1":"…"').slice(0, 400);
  const steps: string[] = [keysLine];
  try {
    const keyBody = { PlatformVersion: "vinho-next-15", PluginVersion: "1.0.0", ShopUrl: c.shopUrl };
    // Both signature forms (with "=" padding like CTT's plugin, and without as in the docs).
    let k = await raw("POST", "/keys/", c.publicKey, keyBody, appId, true);
    steps.push(`POST /keys/ (signature with padding) → HTTP ${k.status} · ${short(k.json)}`);
    let padded = true;
    if (k.status === 401) {
      k = await raw("POST", "/keys/", c.publicKey, keyBody, appId, false);
      padded = false;
      steps.push(`POST /keys/ (signature without padding) → HTTP ${k.status} · ${short(k.json)}`);
    }
    const key = (k.json.Key ?? k.json.Token ?? k.json.key) as string | undefined;
    if (k.status !== 200 || !key) {
      steps.push(
        "401 = CTT refused the application id or the key pair. The application id (X-APPID) is not shown in the portal: CTT's plugins carry their own, and a custom shop needs one issued by the CTT salesperson. Also check that CTT_PUBLIC_KEY / CTT_SECRET_KEY have no spaces.",
      );
      return { ok: false, steps };
    }
    steps.push(`Token received (${padded ? "with" : "without"} padding${padded ? "" : ": set CTT_SIG_PADDING=0 in Railway"}).`);
    const st = await raw("GET", "/settings/", key, undefined, appId, padded);
    steps.push(`GET /settings/ → HTTP ${st.status} · ${short(st.json)}`);
    const cr = await raw("GET", "/carriers/", key, undefined, appId, padded);
    const carriers = ((cr.json.Carrier as { Id?: number; Name?: string }[] | undefined) ?? []).map((x) => `${x.Id} ${x.Name}`);
    steps.push(`GET /carriers/ → HTTP ${cr.status}${carriers.length ? ` · ${carriers.join(", ")}` : ` · ${short(cr.json)}`}`);
    if (!appIdOverride || appIdOverride.trim() === c.appId) await saveToken({ key, expire: String(k.json.Expire ?? "") });
    if ([st.status, cr.status].includes(405)) steps.push("405 = that endpoint is not enabled for this application key: ask CTT to enable keys, shipments, labels, tracking, carriers, settings.");
    // A token means the application id and the key pair are accepted.
    return { ok: true, steps };
  } catch (e) {
    steps.push(`Network error: ${e instanceof Error ? e.message : String(e)}`);
    return { ok: false, steps };
  }
}
