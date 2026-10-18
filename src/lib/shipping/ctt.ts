// CTT E-commerce API v3 client (shipments, async labels, tracking, pickup points, carriers). Same shape as
// src/lib/ifthenpay.ts: BASE() env-overridable, credentials only from process.env on the server, typed methods,
// fetch with timeout. No rates endpoint exists (prices come from the CTT contract).
//
// Auth: every request carries X-APPID (application key), the current token and a signature of the exact body
// string: base64(HMAC-SHA256(secret, token + body)) without "=" padding. A 401 fetches a new token once via
// POST /keys/ and retries. X_SIMULATE: 1 = simulation mode (CTT validates but stores nothing).
// Errors: HTTP status first (401 re-token once, 405 endpoint not enabled for this key), then the body envelope:
// Error.Id = 0 and an empty ErrorList = success; WarningList = stored with caveats.
//
// Mode: CTT_MOCK=1, or CTT_APP_ID / CTT_SECRET unset -> the in-process mock server (ctt-mock.ts), which runs
// through this same client code (signing, token refresh, envelope checks).
// [[TODO: confirm with the v3 docs/contract: endpoint paths, token + signature header names, /keys/ request body,
// ShipmentItems weight unit, tracking status codes. Everything else follows the documented shapes.]]
// Not wired anywhere yet (zero behavior change).
import { createHmac } from "node:crypto";
import type { PickupPoint, ShipmentInput, ShippingProvider, TrackingStatus } from "./types";

export const CTT_HEADERS = { appId: "X-APPID", token: "X-TOKEN", signature: "X-SIGNATURE", simulate: "X_SIMULATE" } as const;

// ---- CTT v3 wire shapes ------------------------------------------------------------------------------
export type CttMessage = { Id?: number; Code?: string; Field?: string; Message?: string };
export type CttEnvelope = { Error?: { Id: number; Message?: string } | null; ErrorList?: CttMessage[] | null; WarningList?: CttMessage[] | null };

export type CttAddress = {
  Name: string;
  Streetname1: string;
  Streetname2?: string;
  City: string;
  PostalCode: string;
  Country: string; // ISO3: PRT, DEU...
  Phone?: string;
  Email?: string;
};

export type CttShipment = {
  ClientReferenceCode: string;
  ShopItemId: string;
  Address: CttAddress;
  Carrier?: { Id: string };
  OptionList?: { Id: string }[];
  PickupPoint?: { PointId: string };
  ShipmentItems: { Description: string; Quantity: number; Weight: number; Value?: number }[];
  Remarks?: string;
};

export type CttCreateShipmentReply = CttEnvelope & { ShipmentId?: string };
export type CttCreateLabelReply = CttEnvelope & { RunId?: string; CallbackURL?: string };
export type CttPollLabelReply = CttEnvelope & {
  Finished?: number;
  LabelPDF?: string;
  ShipmentList?: { ClientReferenceCode: string; TrackingId: string; TrackingUrl: string }[];
};
export type CttTrackingReply = CttEnvelope & { Statuslist?: { Code: string; DateTime: string; Text: string }[] };
export type CttPickupPointsReply = CttEnvelope & { PointList?: { PointId: string; Name: string; Address: string; PostalCode: string; City: string }[] };
export type CttCarriersReply = CttEnvelope & { CarrierList?: { Id: string; Name: string }[] };

// ---- Helpers (pure, unit-tested) ---------------------------------------------------------------------
/** base64(HMAC-SHA256(secret, token + body)) with the "=" padding stripped. */
export function sign(secret: string, token: string, body: string) {
  return createHmac("sha256", secret).update(token + body).digest("base64").replace(/=+$/, "");
}

const ISO3: Record<string, string> = { PT: "PRT", ES: "ESP", FR: "FRA", DE: "DEU", NL: "NLD", BE: "BEL", LU: "LUX" };
export function iso3(country: string) {
  const c = country.trim().toUpperCase();
  if (c.length === 3 && Object.values(ISO3).includes(c)) return c;
  const r = ISO3[c];
  if (!r) throw new Error(`CTT: unsupported country "${country}"`);
  return r;
}

/** "1234567" / "1234 567" -> "1234-567"; null when it is not a PT postal code. */
export function ptPostalCode(v: string) {
  const d = v.replace(/\D/g, "");
  return d.length === 7 ? `${d.slice(0, 4)}-${d.slice(4)}` : null;
}

/** UPU S10 check digit (weights 8 6 4 2 3 5 9 7), as in CTT tracking numbers like "RR473124829PT". */
export function s10CheckDigit(serial8: string) {
  const w = [8, 6, 4, 2, 3, 5, 9, 7];
  const sum = [...serial8].reduce((n, d, i) => n + Number(d) * w[i], 0);
  const c = 11 - (sum % 11);
  return c === 10 ? 0 : c === 11 ? 5 : c;
}

export function isS10(tracking: string) {
  const m = /^[A-Z]{2}(\d{8})(\d)[A-Z]{2}$/.exec(tracking);
  return !!m && s10CheckDigit(m[1]) === Number(m[2]);
}

export function cttTrackingUrl(tracking: string) {
  return `https://www.ctt.pt/feapl_2/app/open/objectSearch/objectSearch.jspx?objects=${encodeURIComponent(tracking)}`;
}

export class CttError extends Error {
  constructor(message: string, readonly status: number, readonly errors: string[] = []) {
    super(message);
    this.name = "CttError";
  }
}

const msg = (m: CttMessage) => [m.Field, m.Message ?? m.Code].filter(Boolean).join(": ") || `#${m.Id ?? "?"}`;

/** Applies the v3 error contract; returns the warnings when the call succeeded. */
export function checkCttResponse(status: number, body: unknown, path = ""): string[] {
  if (status === 401) throw new CttError(`CTT ${path} unauthorized (token rejected after refresh)`, status);
  if (status === 405) throw new CttError(`CTT ${path} endpoint not enabled for this application key`, status);
  if (status < 200 || status >= 300) throw new CttError(`CTT ${path} HTTP ${status}: ${JSON.stringify(body).slice(0, 200)}`, status);
  const b = (body ?? {}) as CttEnvelope;
  const errors = (b.ErrorList ?? []).map(msg);
  const id = b.Error?.Id ?? 0;
  if (id !== 0 || errors.length) {
    throw new CttError(`CTT ${path} error ${id}: ${[b.Error?.Message, ...errors].filter(Boolean).join("; ") || "unknown"}`, status, errors);
  }
  return (b.WarningList ?? []).map(msg);
}

/** Sends with the current token; on 401 fetches a new token once and retries. */
export async function requestWithTokenRefresh(
  send: (token: string) => Promise<Response>,
  state: { token: string | null },
  refresh: () => Promise<string>,
): Promise<Response> {
  state.token ??= await refresh();
  const r = await send(state.token);
  if (r.status !== 401) return r;
  state.token = await refresh();
  return send(state.token);
}

// [[TODO: confirm the v3 status codes; unknown codes fall back to "unknown" and keep the CTT text]]
const STATUS: Record<string, TrackingStatus> = {
  ACCEPTED: "created",
  IN_TRANSIT: "in_transit",
  OUT_FOR_DELIVERY: "out_for_delivery",
  DELIVERED: "delivered",
  DELIVERY_FAILED: "failed_attempt",
  RETURNED: "returned",
};

export function toCttShipment(input: ShipmentInput): CttShipment {
  const country = iso3(input.to.country);
  const postal = country === "PRT" ? ptPostalCode(input.to.postalCode) : input.to.postalCode.trim();
  if (!postal) throw new Error(`CTT: invalid PT postal code "${input.to.postalCode}"`);
  return {
    ClientReferenceCode: input.reference,
    ShopItemId: input.reference,
    Address: {
      Name: input.to.name.trim().slice(0, 60),
      Streetname1: input.to.line1.trim().slice(0, 60),
      ...(input.to.line2?.trim() ? { Streetname2: input.to.line2.trim().slice(0, 60) } : {}),
      City: input.to.city.trim().slice(0, 50),
      PostalCode: postal,
      Country: country,
      ...(input.to.phone ? { Phone: input.to.phone } : {}),
      ...(input.to.email ? { Email: input.to.email } : {}),
    },
    ...(input.carrierId ? { Carrier: { Id: input.carrierId } } : {}),
    ...(input.options?.length ? { OptionList: input.options.map((Id) => ({ Id })) } : {}),
    ...(input.pickupPointId ? { PickupPoint: { PointId: input.pickupPointId } } : {}),
    ShipmentItems: input.items.map((i) => ({
      Description: i.description.slice(0, 100),
      Quantity: i.quantity,
      Weight: i.weightGrams,
      ...(i.valueCents != null ? { Value: i.valueCents / 100 } : {}),
    })),
    ...(input.notes ? { Remarks: input.notes.slice(0, 100) } : {}),
  };
}

// ---- Client ------------------------------------------------------------------------------------------
export type CttConfig = {
  base: string;
  appId: string;
  secret: string;
  simulate?: boolean; // sends X_SIMULATE: 1
  fetch?: typeof fetch; // injectable for the mock server and tests
  mode?: ShippingProvider["mode"];
};

export function createCttClient(cfg: CttConfig): ShippingProvider & { readonly tokenState: { token: string | null } } {
  const doFetch = cfg.fetch ?? fetch;
  const base = cfg.base.replace(/\/$/, "");
  const tokenState = { token: null as string | null };
  const common = () => ({
    "Content-Type": "application/json",
    Accept: "application/json",
    [CTT_HEADERS.appId]: cfg.appId,
    ...(cfg.simulate ? { [CTT_HEADERS.simulate]: "1" } : {}),
  });

  async function refresh(): Promise<string> {
    const r = await doFetch(`${base}/keys/`, { method: "POST", headers: common(), body: "", signal: AbortSignal.timeout(20000) });
    const body = (await r.json().catch(() => ({}))) as CttEnvelope & { Token?: string };
    if (r.status === 401) throw new CttError("CTT /keys/ rejected the application key", 401);
    checkCttResponse(r.status, body, "/keys/");
    if (!body.Token) throw new CttError("CTT /keys/ returned no token", r.status);
    return body.Token;
  }

  async function call<T extends CttEnvelope>(method: "GET" | "POST" | "PUT", path: string, payload?: unknown): Promise<T & { warnings: string[] }> {
    const body = payload === undefined ? "" : JSON.stringify(payload);
    const r = await requestWithTokenRefresh(
      (token) =>
        doFetch(`${base}${path}`, {
          method,
          headers: { ...common(), [CTT_HEADERS.token]: token, [CTT_HEADERS.signature]: sign(cfg.secret, token, body) },
          body: method === "GET" ? undefined : body,
          signal: AbortSignal.timeout(20000),
        }),
      tokenState,
      refresh,
    );
    const text = await r.text();
    let parsed: unknown = {};
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      parsed = { raw: text.slice(0, 200) };
    }
    const warnings = checkCttResponse(r.status, parsed, path.split("?")[0]);
    return { ...(parsed as T), warnings };
  }

  const saveShipment = async (method: "POST" | "PUT", path: string, input: ShipmentInput) => {
    const r = await call<CttCreateShipmentReply>(method, path, toCttShipment(input));
    if (!r.ShipmentId) throw new CttError(`CTT ${path} returned no ShipmentId`, 200);
    return { shipmentId: r.ShipmentId, warnings: r.warnings };
  };

  return {
    id: "ctt",
    mode: cfg.mode ?? (cfg.simulate ? "simulate" : "live"),
    tokenState,
    createShipment: (input) => saveShipment("POST", "/shipments", input),
    updateShipment: (id, input) => saveShipment("PUT", `/shipments/${encodeURIComponent(id)}`, input),
    async createLabel(shipmentIds) {
      const r = await call<CttCreateLabelReply>("POST", "/labels", { ShipmentIdList: shipmentIds });
      const runId = r.RunId ?? r.CallbackURL?.split("/").filter(Boolean).at(-1);
      if (!runId) throw new CttError("CTT /labels returned no RunId/CallbackURL", 200);
      return { runId, callbackUrl: r.CallbackURL ?? null, warnings: r.warnings };
    },
    async pollLabel(runId) {
      const r = await call<CttPollLabelReply>("GET", `/labels/${encodeURIComponent(runId)}`);
      const finished = Math.max(0, Math.min(100, Number(r.Finished ?? 0)));
      if (finished < 100 || !r.LabelPDF) return { finished: Math.min(finished, 99), done: false, warnings: r.warnings };
      return {
        finished: 100,
        done: true,
        labelPdfBase64: r.LabelPDF,
        shipments: (r.ShipmentList ?? []).map((s) => ({ reference: s.ClientReferenceCode, trackingNumber: s.TrackingId.trim().toUpperCase(), trackingUrl: s.TrackingUrl })),
        warnings: r.warnings,
      };
    },
    async track(trackingNumber) {
      const r = await call<CttTrackingReply>("GET", `/tracking/${encodeURIComponent(trackingNumber)}`);
      const events = (r.Statuslist ?? [])
        .map((s) => ({ at: new Date(s.DateTime), code: s.Code, status: STATUS[s.Code] ?? ("unknown" as const), text: s.Text }))
        .sort((a, b) => a.at.getTime() - b.at.getTime());
      const last = events.at(-1);
      return { trackingNumber, status: last?.status ?? "unknown", deliveredAt: last?.status === "delivered" ? last.at : null, events, warnings: r.warnings };
    },
    async listPickupPoints(q) {
      const country = iso3(q.country);
      const postal = country === "PRT" ? (ptPostalCode(q.postalCode) ?? q.postalCode) : q.postalCode;
      const r = await call<CttPickupPointsReply>("GET", `/pickuppoints?PostalCode=${encodeURIComponent(postal)}&Country=${country}`);
      const points: PickupPoint[] = (r.PointList ?? []).map((p) => ({ id: p.PointId, name: p.Name, address: p.Address, postalCode: p.PostalCode, city: p.City }));
      return { points, warnings: r.warnings };
    },
    async listCarriers() {
      const r = await call<CttCarriersReply>("GET", "/carriers");
      return { carriers: (r.CarrierList ?? []).map((c) => ({ id: c.Id, name: c.Name })), warnings: r.warnings };
    },
  };
}
