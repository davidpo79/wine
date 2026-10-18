// In-process fake of the CTT E-commerce API v3, exposed as a fetch function so the real client (signing, token
// refresh, error envelope) runs unchanged against it. Used when CTT credentials are missing and by the tests.
// Implements the v3 contract: 401 on a missing/stale token or a bad signature, 405 on endpoints not enabled for
// the key, Error/ErrorList/WarningList in every body, X_SIMULATE: 1 validates without storing, async labels
// (first poll in progress, a later poll finished with LabelPDF + TrackingId/TrackingUrl per shipment).
// Tracking numbers are UPU S10 ("DA12345678" + check digit + "PT"), so they pass the admin /^[A-Z0-9]{8,30}$/ check.
import { CTT_HEADERS, cttTrackingUrl, s10CheckDigit, sign, type CttMessage, type CttShipment } from "./ctt";

const MOCK_PDF = Buffer.from(
  "%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 298 420]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
).toString("base64");

export const MOCK_CARRIERS = [
  { Id: "CTT_EXPRESSO_19", Name: "CTT Expresso 19" },
  { Id: "CTT_REDE_PICKUP", Name: "CTT Rede Pickup" },
];

const POINTS = [
  { PointId: "PUDO-1000", Name: "Loja CTT Restauradores", Address: "Praça dos Restauradores 58", PostalCode: "1250-188", City: "Lisboa" },
  { PointId: "PUDO-4000", Name: "Loja CTT Batalha", Address: "Praça da Batalha 9", PostalCode: "4000-102", City: "Porto" },
  { PointId: "PUDO-5050", Name: "Ponto CTT Régua", Address: "Rua dos Camilos 20", PostalCode: "5050-272", City: "Peso da Régua" },
];

// Tracking steps by time since the label was rendered.
const STEPS = [
  { afterMs: 0, Code: "ACCEPTED", Text: "Objeto aceite" },
  { afterMs: 6 * 3600e3, Code: "IN_TRANSIT", Text: "Em trânsito" },
  { afterMs: 24 * 3600e3, Code: "OUT_FOR_DELIVERY", Text: "Em distribuição" },
  { afterMs: 30 * 3600e3, Code: "DELIVERED", Text: "Entregue" },
];

export type MockCttOptions = {
  appId: string;
  secret: string;
  now?: () => Date;
  disabledEndpoints?: string[]; // e.g. ["/pickuppoints"] -> 405
  pollsUntilDone?: number; // label polls before Finished = 100 (default 2)
};

type Stored = { id: string; shipment: CttShipment; tracking: string | null; labelledAt: Date | null };

export function mockTrackingNumber(reference: string) {
  let h = 2166136261;
  for (const ch of reference) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const serial = String(h % 100_000_000).padStart(8, "0");
  return `DA${serial}${s10CheckDigit(serial)}PT`;
}

const ok = (extra: object = {}, warnings: CttMessage[] = []) => ({ Error: { Id: 0, Message: "" }, ErrorList: [], WarningList: warnings, ...extra });
const fail = (id: number, message: string, errors: CttMessage[] = []) => ({ Error: { Id: id, Message: message }, ErrorList: errors, WarningList: [] });
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function validateShipment(s: Partial<CttShipment> | null, carriers: Set<string>): { errors: CttMessage[]; warnings: CttMessage[] } {
  const errors: CttMessage[] = [];
  const warnings: CttMessage[] = [];
  const a = s?.Address;
  if (!s?.ClientReferenceCode) errors.push({ Id: 10, Field: "ClientReferenceCode", Message: "required" });
  if (!s?.ShopItemId) errors.push({ Id: 11, Field: "ShopItemId", Message: "required" });
  for (const f of ["Name", "Streetname1", "City", "PostalCode", "Country"] as const) if (!a?.[f]) errors.push({ Id: 12, Field: `Address.${f}`, Message: "required" });
  if (a?.Country && !/^[A-Z]{3}$/.test(a.Country)) errors.push({ Id: 13, Field: "Address.Country", Message: "must be ISO3" });
  if (a?.Country === "PRT" && a.PostalCode && !/^\d{4}-\d{3}$/.test(a.PostalCode)) errors.push({ Id: 14, Field: "Address.PostalCode", Message: "must be 0000-000" });
  if (s?.Carrier && !carriers.has(s.Carrier.Id)) errors.push({ Id: 15, Field: "Carrier.Id", Message: "unknown carrier" });
  if (s?.PickupPoint && !POINTS.some((p) => p.PointId === s.PickupPoint!.PointId)) errors.push({ Id: 16, Field: "PickupPoint.PointId", Message: "unknown point" });
  if (!s?.ShipmentItems?.length) errors.push({ Id: 17, Field: "ShipmentItems", Message: "at least one item" });
  if (a && !a.Phone) warnings.push({ Id: 100, Field: "Address.Phone", Message: "missing: the carrier cannot call on delivery problems" });
  return { errors, warnings };
}

export function createMockCttServer(opts: MockCttOptions) {
  const base = "https://ctt.mock/v3";
  const now = opts.now ?? (() => new Date());
  const pollsUntilDone = opts.pollsUntilDone ?? 2;
  const carriers = new Set(MOCK_CARRIERS.map((c) => c.Id));
  const state = {
    tokens: new Set<string>(),
    tokensIssued: 0,
    shipments: new Map<string, Stored>(),
    runs: new Map<string, { shipmentIds: string[]; polls: number }>(),
    seq: 0,
    requests: [] as { method: string; path: string; simulate: boolean }[],
  };

  async function handle(method: string, url: URL, headers: Headers, body: string): Promise<Response> {
    const path = url.pathname.slice(new URL(base).pathname.length) || "/";
    const simulate = headers.get(CTT_HEADERS.simulate) === "1";
    state.requests.push({ method, path, simulate });

    if (headers.get(CTT_HEADERS.appId) !== opts.appId) return json(401, fail(401, "Unknown application key"));
    if (method === "POST" && path === "/keys/") {
      const token = `tok-${++state.tokensIssued}`;
      state.tokens.add(token);
      return json(200, ok({ Token: token }));
    }
    const token = headers.get(CTT_HEADERS.token) ?? "";
    if (!state.tokens.has(token)) return json(401, fail(401, "Invalid or expired token"));
    if (headers.get(CTT_HEADERS.signature) !== sign(opts.secret, token, body)) return json(401, fail(401, "Invalid signature"));
    const seg = path.split("/").filter(Boolean);
    if (opts.disabledEndpoints?.includes(`/${seg[0]}`)) return json(405, fail(405, "Method not allowed for this key"));

    let payload: Record<string, unknown> | null = null;
    if (body) {
      try {
        payload = JSON.parse(body);
      } catch {
        return json(400, fail(400, "Malformed JSON"));
      }
    }

    if (seg[0] === "shipments" && ((method === "POST" && seg.length === 1) || (method === "PUT" && seg.length === 2))) {
      const s = payload as Partial<CttShipment> | null;
      const { errors, warnings } = validateShipment(s, carriers);
      if (errors.length) return json(200, fail(1, "Validation failed", errors));
      const existing = method === "PUT" ? state.shipments.get(seg[1]) : null;
      if (method === "PUT" && !existing) return json(200, fail(2, "Shipment not found"));
      if (existing?.tracking) return json(200, fail(3, "Shipment already has a label and cannot be changed"));
      const id = existing?.id ?? `SHP${String(++state.seq).padStart(6, "0")}`;
      if (!simulate) state.shipments.set(id, { id, shipment: s as CttShipment, tracking: null, labelledAt: null });
      return json(200, ok({ ShipmentId: id }, warnings));
    }

    if (seg[0] === "labels" && method === "POST" && seg.length === 1) {
      const ids = (payload?.ShipmentIdList as string[] | undefined) ?? [];
      if (!ids.length) return json(200, fail(1, "Validation failed", [{ Id: 20, Field: "ShipmentIdList", Message: "required" }]));
      const missing = ids.filter((id) => !state.shipments.has(id));
      if (missing.length) return json(200, fail(2, "Shipment not found", missing.map((id) => ({ Id: 21, Field: "ShipmentIdList", Message: `${id} not found` }))));
      const runId = `RUN${String(++state.seq).padStart(6, "0")}`;
      if (!simulate) state.runs.set(runId, { shipmentIds: ids, polls: 0 });
      return json(200, ok({ RunId: runId, CallbackURL: `${base}/labels/${runId}` }));
    }

    if (seg[0] === "labels" && method === "GET" && seg.length === 2) {
      const run = state.runs.get(seg[1]);
      if (!run) return json(200, fail(2, "Run not found"));
      run.polls++;
      if (run.polls < pollsUntilDone) return json(200, ok({ Finished: Math.round((run.polls / pollsUntilDone) * 100) }));
      const list = run.shipmentIds.map((id) => {
        const st = state.shipments.get(id)!;
        st.tracking ??= mockTrackingNumber(st.shipment.ClientReferenceCode);
        st.labelledAt ??= now();
        return { ClientReferenceCode: st.shipment.ClientReferenceCode, TrackingId: st.tracking, TrackingUrl: cttTrackingUrl(st.tracking) };
      });
      return json(200, ok({ Finished: 100, LabelPDF: MOCK_PDF, ShipmentList: list }));
    }

    if (seg[0] === "tracking" && method === "GET" && seg.length === 2) {
      const st = [...state.shipments.values()].find((x) => x.tracking === seg[1]);
      if (!st?.labelledAt) return json(200, fail(2, "Object not found"));
      const age = now().getTime() - st.labelledAt.getTime();
      const Statuslist = STEPS.filter((x) => age >= x.afterMs).map((x) => ({
        Code: x.Code,
        DateTime: new Date(st.labelledAt!.getTime() + x.afterMs).toISOString(),
        Text: x.Text,
      }));
      return json(200, ok({ Statuslist }));
    }

    if (seg[0] === "pickuppoints" && method === "GET") {
      const pc = url.searchParams.get("PostalCode") ?? "";
      if (url.searchParams.get("Country") !== "PRT") return json(200, ok({ PointList: [] }, [{ Id: 101, Message: "Pickup points only in PRT" }]));
      return json(200, ok({ PointList: POINTS.filter((p) => p.PostalCode[0] === pc[0]) }));
    }

    if (seg[0] === "carriers" && method === "GET") return json(200, ok({ CarrierList: MOCK_CARRIERS }));

    return json(404, fail(404, `No route ${method} ${path}`));
  }

  const mockFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const body = typeof init?.body === "string" ? init.body : "";
    return handle((init?.method ?? "GET").toUpperCase(), url, new Headers(init?.headers), body);
  }) as typeof fetch;

  return {
    base,
    fetch: mockFetch,
    state,
    /** Invalidates every issued token, so the next call gets a 401 and must refresh. */
    expireTokens: () => state.tokens.clear(),
  };
}
