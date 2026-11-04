// CTT Expresso web services (SOAP): CTTShipmentProviderWS (CreateShipment, CloseShipment) and EventosWS
// (GetEventosObjectos_V3). Spec: "SGEE - CTTX - WS Aplicacoes Proprias - Especificacao Tecnica V1.8" and the request
// examples CTT sent on 02/11/2026. Sandbox: https://cttexpressows.qa.ctt.pt/CTTEWSPoolHTTPS (CTTX_BASE for production).
//
// Flow: one CreateShipment per order (one object per parcel, returns the A4 transport guide as PDF, one page per object),
// one CloseShipment per day for the day's objects (returns the acceptance certificate), tracking by polling
// GetEventosObjectos_V3 (CTT has no push for this service).
// WCF data contracts: the elements of each class must be sent in alphabetical order, or CTT rejects the message.
import { randomUUID } from "node:crypto";
import { s10CheckDigit } from "./shipping/ctt";
import { zonedToUtc } from "./time";
import { CTT_EVENT_NAMES, CTT_REASONS, CTT_SITUATIONS } from "./cttx-codes";

export const CTTX_PRODUCTS = { twoDays: "EMSF057.01", tomorrow: "EMSF056.01" } as const;

export type CttxSender = { name: string; contact: string; address: string; postalCode: string; city: string; phone: string; email: string };
export type CttxConfig = {
  base: string;
  authId: string;
  userId: string;
  clientId: string;
  contractId: string;
  subProduct: string;
  sender: CttxSender;
  boxWeightG: number; // one Trilogia box
  boxesPerParcel: number;
};

export function cttxConfig(): CttxConfig {
  const e = (k: string) => (process.env[k] ?? "").trim();
  return {
    base: (e("CTTX_BASE") || "https://cttexpressows.qa.ctt.pt/CTTEWSPoolHTTPS").replace(/\/$/, ""),
    authId: e("CTTX_AUTH_ID"),
    userId: e("CTTX_USER_ID"),
    clientId: e("CTTX_CLIENT_ID"),
    contractId: e("CTTX_CONTRACT_ID"),
    subProduct: e("CTTX_SUBPRODUCT") || CTTX_PRODUCTS.twoDays,
    sender: {
      name: e("CTTX_SENDER_NAME") || "Wine Portugal",
      contact: e("CTTX_SENDER_CONTACT"),
      address: e("CTTX_SENDER_ADDRESS"),
      postalCode: e("CTTX_SENDER_POSTAL"),
      city: e("CTTX_SENDER_CITY"),
      phone: e("CTTX_SENDER_PHONE"),
      email: e("CTTX_SENDER_EMAIL"),
    },
    boxWeightG: Number(e("CTT_BOX_WEIGHT_G") || 4000),
    boxesPerParcel: Number(e("CTTX_BOXES_PER_PARCEL") || 2),
  };
}

/** What is still missing before shipments can be created (empty = ready). */
export function cttxMissing(c = cttxConfig()) {
  const m: string[] = [];
  if (!c.authId) m.push("CTTX_AUTH_ID");
  if (!c.clientId) m.push("CTTX_CLIENT_ID");
  if (!c.contractId) m.push("CTTX_CONTRACT_ID");
  if (!c.sender.address) m.push("CTTX_SENDER_ADDRESS");
  if (!splitPtPostal(c.sender.postalCode)) m.push("CTTX_SENDER_POSTAL");
  if (!c.sender.city) m.push("CTTX_SENDER_CITY");
  return m;
}

export const cttxConfigured = () => cttxMissing().length === 0;
export const cttxSandbox = (c = cttxConfig()) => /\.qa\./.test(c.base);

// ---- Pure helpers (unit-tested) ----------------------------------------------------------------------

const xmlEsc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
const clip = (s: string | null | undefined, n: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const el = (ns: string, name: string, v: string | number | boolean | null | undefined) => (v === undefined || v === null || v === "" ? "" : `<${ns}:${name}>${xmlEsc(String(v))}</${ns}:${name}>`);

/** "1100-001" / "1100001" -> { z4: "1100", z3: "001" }; null when not a Portuguese postal code. */
export function splitPtPostal(postal: string | null | undefined) {
  const d = (postal ?? "").replace(/\D/g, "");
  return d.length === 7 ? { z4: d.slice(0, 4), z3: d.slice(4) } : null;
}

/** Every object code from the first to the last of a shipment (consecutive S10 serials: DB005827782PT, DB005827796PT). */
export function objectRange(first: string, last: string): string[] {
  const a = /^([A-Z]{2})(\d{8})\d([A-Z]{2})$/.exec(first);
  const b = /^([A-Z]{2})(\d{8})\d([A-Z]{2})$/.exec(last);
  if (!a || !b || a[1] !== b[1] || a[3] !== b[3]) return [...new Set([first, last].filter(Boolean))];
  const from = Number(a[2]);
  const to = Number(b[2]);
  if (to < from || to - from > 50) return [...new Set([first, last])];
  const out: string[] = [];
  for (let n = from; n <= to; n++) {
    const serial = String(n).padStart(8, "0");
    out.push(`${a[1]}${serial}${s10CheckDigit(serial)}${a[3]}`);
  }
  return out;
}

/** CTT dates "04-11-2026 06:51:23" (Lisbon wall clock) -> ISO instant. */
export function parseCttDate(s: string): string {
  const m = /^(\d{2})-(\d{2})-(\d{4}) (\d{2}):(\d{2})(?::(\d{2}))?/.exec(s.trim());
  if (!m) return new Date().toISOString();
  const d = zonedToUtc(`${m[3]}-${m[2]}-${m[1]}`, `${m[4]}:${m[5]}`, "Europe/Lisbon");
  return new Date(d.getTime() + Number(m[6] ?? 0) * 1000).toISOString();
}

/** Parcels for n Trilogia boxes (two boxes, six bottles, per 8 kg parcel by default). */
export function parcelsForBoxes(boxes: number, perParcel = 2) {
  return Math.max(1, Math.ceil(Math.max(1, boxes) / Math.max(1, perParcel)));
}

export type CttxShipmentInput = {
  reference: string; // our order id (max 21)
  subProduct: string;
  parcels: number;
  weightG: number; // total
  observations?: string;
  receiver: { name: string; address: string; postalCode: string; city: string; country: string; email?: string | null; phone?: string | null };
};

const NS = {
  soap: "http://schemas.xmlsoap.org/soap/envelope/",
  tem: "http://tempuri.org/",
  ctt: "http://schemas.datacontract.org/2004/07/CTTExpressoWS",
  ctt1: "http://schemas.datacontract.org/2004/07/CTTExpressoWS.Models.ShipmentProvider",
  ctt2: "http://schemas.datacontract.org/2004/07/CTTExpressoWS.Models.ShipmentProvider.SEPs",
  arr: "http://schemas.microsoft.com/2003/10/Serialization/Arrays",
};

const envelope = (body: string, ns: (keyof typeof NS)[]) =>
  `<soapenv:Envelope xmlns:soapenv="${NS.soap}" ${ns.map((k) => `xmlns:${k}="${NS[k]}"`).join(" ")}><soapenv:Header/><soapenv:Body>${body}</soapenv:Body></soapenv:Envelope>`;

/** AddressData, fields in alphabetical order (WCF). Portuguese postal codes go split in PTZipCode4 / PTZipCode3. */
function addressXml(type: "Sender" | "Receiver", a: { name: string; contact?: string; address: string; postalCode: string; city: string; country: string; email?: string | null; phone?: string | null }) {
  const pt = a.country === "PT" ? splitPtPostal(a.postalCode) : null;
  if (a.country === "PT" && !pt) throw new Error(`CTT: invalid Portuguese postal code "${a.postalCode}" (${type.toLowerCase()})`);
  const phone = (a.phone ?? "").replace(/[^\d+]/g, "");
  const mobile = /^(\+351)?9\d{8}$/.test(phone) || (!!phone && !phone.startsWith("+351"));
  return `<ctt1:${type}Data>${[
    el("ctt1", "Address", clip(a.address, 100)),
    el("ctt1", "City", clip(a.city, 50)),
    el("ctt1", "ContactName", clip(a.contact || a.name, 60)),
    el("ctt1", "Country", a.country),
    el("ctt1", "Email", clip(a.email, 200)),
    mobile ? el("ctt1", "MobilePhone", phone.slice(0, 20)) : "",
    el("ctt1", "Name", clip(a.name, 60)),
    pt ? "" : el("ctt1", "NonPTZipCode", clip(a.postalCode, 10)),
    pt ? "" : el("ctt1", "NonPTZipCodeLocation", clip(a.city, 50)),
    pt ? el("ctt1", "PTZipCode3", pt.z3) : "",
    pt ? el("ctt1", "PTZipCode4", pt.z4) : "",
    pt ? el("ctt1", "PTZipCodeLocation", clip(a.city, 50)) : "",
    !mobile ? el("ctt1", "Phone", phone.slice(0, 20)) : "",
    el("ctt1", "Type", type),
  ].join("")}</ctt1:${type}Data>`;
}

export function createShipmentXml(s: CttxShipmentInput, c: CttxConfig, requestId: string = randomUUID()) {
  const sender = { ...c.sender, country: "PT" };
  const shipment = `<ctt1:ShipmentCTT><ctt1:ShipmentCTT>${[
    el("ctt1", "HasSenderInformation", true),
    addressXml("Receiver", s.receiver),
    addressXml("Sender", sender),
    `<ctt1:ShipmentData>${[
      el("ctt1", "ClientReference", clip(s.reference, 21)),
      el("ctt1", "IsDevolution", false),
      el("ctt1", "Observations", clip(s.observations, 50)),
      el("ctt1", "Quantity", Math.max(1, Math.round(s.parcels))),
      el("ctt1", "Weight", Math.max(1, Math.round(s.weightG))),
    ].join("")}</ctt1:ShipmentData>`,
    // Required by CTT for these products: two delivery attempts, then the parcel waits at the CTT shop.
    `<ctt1:SpecialServices><ctt1:SpecialService><ctt1:MultipleHomeDelivery><ctt2:AttemptsNumber>2</ctt2:AttemptsNumber><ctt2:InNonDeliveryCase>PostOfficeNotiffied</ctt2:InNonDeliveryCase></ctt1:MultipleHomeDelivery><ctt1:SpecialServiceType>MultipleHomeDelivery</ctt1:SpecialServiceType></ctt1:SpecialService></ctt1:SpecialServices>`,
  ].join("")}</ctt1:ShipmentCTT></ctt1:ShipmentCTT>`;
  const body = `<tem:CreateShipment><tem:Input>${[
    el("ctt", "AuthenticationID", c.authId),
    `<ctt:DeliveryNote>${[el("ctt1", "ClientId", c.clientId), el("ctt1", "ContractId", c.contractId), el("ctt1", "DistributionChannelId", 99), shipment, el("ctt1", "SubProductId", s.subProduct)].join("")}</ctt:DeliveryNote>`,
    el("ctt", "RequestID", requestId),
    el("ctt", "UserID", c.userId),
  ].join("")}</tem:Input></tem:CreateShipment>`;
  return envelope(body, ["tem", "ctt", "ctt1", "ctt2"]);
}

export type CttxCloseItem = { first: string; last: string; subProduct: string };

export function closeShipmentXml(items: CttxCloseItem[], c: CttxConfig, requestId: string = randomUUID()) {
  const list = items
    .map((i) => `<ctt:Shipment2Close>${el("ctt", "FirstObjectCode", i.first)}${el("ctt", "LastObjectCode", i.last)}${el("ctt", "SubProductCode", i.subProduct)}</ctt:Shipment2Close>`)
    .join("");
  const body = `<tem:CloseShipment><tem:Input>${[
    el("ctt", "AuthenticationID", c.authId),
    el("ctt", "ClientId", c.clientId),
    el("ctt", "ContractId", c.contractId),
    el("ctt", "DistributionChannel", 99),
    `<ctt:ListOfShipmentToClose>${list}</ctt:ListOfShipmentToClose>`,
    el("ctt", "RequestID", requestId),
    el("ctt", "UserID", c.userId),
  ].join("")}</tem:Input></tem:CloseShipment>`;
  return envelope(body, ["tem", "ctt"]);
}

export function eventsXml(objects: string[], c: CttxConfig) {
  const body = `<tem:GetEventosObjectos_V3>${el("tem", "ID", c.authId)}<tem:NObjectos>${objects.map((o) => el("arr", "string", o)).join("")}</tem:NObjectos></tem:GetEventosObjectos_V3>`;
  return envelope(body, ["tem", "arr"]);
}

// ---- Response parsing --------------------------------------------------------------------------------

const unesc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#xD;/gi, "\r").replace(/&amp;/g, "&");
/** Text of every <x:name>…</x:name> (any namespace prefix). */
export const tags = (xml: string, name: string) => [...xml.matchAll(new RegExp(`<(?:\\w+:)?${name}(?:\\s[^>]*[^/])?>([\\s\\S]*?)</(?:\\w+:)?${name}>`, "g"))].map((m) => unesc(m[1]));
const tag = (xml: string, name: string) => tags(xml, name)[0] ?? "";

export class CttxError extends Error {
  constructor(message: string, readonly messages: string[] = []) {
    super(message);
    this.name = "CttxError";
  }
}

function errorsOf(xml: string) {
  const fault = tag(xml, "faultstring");
  if (fault) return [fault];
  return [...new Set(tags(tag(xml, "ErrorsList"), "Message").filter(Boolean))];
}

export type CttxCreated = { first: string; last: string; objects: string[]; shipmentNumber: string | null; pdfs: string[] };

export function parseCreateShipment(xml: string): CttxCreated {
  const errors = errorsOf(xml);
  if (errors.length || tag(xml, "Status") !== "Success") throw new CttxError(`CTT shipment not created: ${errors.join("; ") || "unknown error"}`, errors);
  const out = tag(xml, "ShipmentDataOutput");
  const first = tag(out, "FirstObject");
  const last = tag(out, "LastObject") || first;
  if (!first) throw new CttxError("CTT shipment created without an object code.");
  return { first, last, objects: objectRange(first, last), shipmentNumber: tag(out, "ShipmentNumber") || null, pdfs: tags(tag(out, "DocumentsList"), "File") };
}

export function parseCloseShipment(xml: string) {
  const errors = errorsOf(xml);
  if (errors.length) throw new CttxError(`CTT close failed: ${errors.join("; ")}`, errors);
  return { pdfs: tags(tag(xml, "DocumentsList"), "File") };
}

export type CttxEvent = { code: string; at: string; text: string; place?: string; reason?: string; situation?: string; receiver?: string };

/** One readable line per event: name, and for EMH / EDF the reason and situation from CTT's tables. */
function eventOf(b: string): CttxEvent {
  const code = tag(b, "_CodigoEvento");
  const reason = tag(b, "_CodigoMotivo");
  const situation = tag(b, "_CodigoSituacao");
  const reasonText = reason && reason !== "0" ? CTT_REASONS[code]?.[reason] : undefined;
  const situationText = tag(b, "_DescricaoSituacao") || (situation ? CTT_SITUATIONS[situation] : undefined);
  const name = tag(b, "_DescricaoEvento") || CTT_EVENT_NAMES[code] || code;
  return {
    code,
    at: parseCttDate(tag(b, "_DataEvento")),
    text: [name, reasonText, situationText].filter(Boolean).join(" · "),
    ...(tag(b, "_DescricaoNoEvento") ? { place: tag(b, "_DescricaoNoEvento") } : {}),
    ...(reason && reason !== "0" ? { reason } : {}),
    ...(situation ? { situation } : {}),
    ...(tag(b, "_NomeReceptor") ? { receiver: tag(b, "_NomeReceptor") } : {}),
  };
}

export function parseEvents(xml: string): Map<string, CttxEvent[]> {
  const errors = errorsOf(xml);
  if (errors.length) throw new CttxError(`CTT tracking failed: ${errors.join("; ")}`, errors);
  const out = new Map<string, CttxEvent[]>();
  for (const o of tags(xml, "DadosObjectos_V3BE")) {
    const id = tag(o, "_NObjecto");
    if (!id) continue;
    const events = tags(o, "DadosEventos_V3BE")
      .filter((b) => tag(b, "_Valido") !== "0")
      .map(eventOf)
      .filter((e) => e.code);
    out.set(id, events);
  }
  return out;
}

// What an event means for the order. Codes from CTT (02/11/2026): EMO pre-advised, EMA accepted, EMB/EMF/EMG in the
// network, EDF on hold, EMZ out for delivery, EMI delivered, EMH not delivered, EDH/EMW waiting at a pickup point,
// EMM returned to the sender.
export const CTTX_SHIPPED = new Set(["EMA", "EMB", "EMF", "EMG", "EMY", "EMZ", "EDH", "EMW", "EMH", "EDF"]);
export const CTTX_DELIVERED = "EMI";
export const CTTX_ALERT = new Set(["EMH", "EDF", "EDH", "EMW", "EMM", "EMV"]);

// ---- Client ------------------------------------------------------------------------------------------

async function soap(c: CttxConfig, service: "CTTShipmentProviderWS" | "EventosWS", action: string, xml: string) {
  const iface = service === "EventosWS" ? "IEventosWS" : "ICTTShipmentProviderWS";
  const r = await fetch(`${c.base}/${service}.svc`, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: `"http://tempuri.org/${iface}/${action}"` },
    body: xml,
    signal: AbortSignal.timeout(45_000),
  });
  const text = await r.text();
  if (!r.ok && !/<(?:\w+:)?faultstring>/.test(text)) throw new CttxError(`CTT ${action}: HTTP ${r.status}`);
  return text;
}

export async function cttxCreateShipment(s: CttxShipmentInput, c = cttxConfig()) {
  return parseCreateShipment(await soap(c, "CTTShipmentProviderWS", "CreateShipment", createShipmentXml(s, c)));
}

export async function cttxCloseShipments(items: CttxCloseItem[], c = cttxConfig()) {
  return parseCloseShipment(await soap(c, "CTTShipmentProviderWS", "CloseShipment", closeShipmentXml(items, c)));
}

/** Events of up to 50 objects per call. */
export async function cttxEvents(objects: string[], c = cttxConfig()) {
  const out = new Map<string, CttxEvent[]>();
  for (let i = 0; i < objects.length; i += 50) {
    for (const [k, v] of parseEvents(await soap(c, "EventosWS", "GetEventosObjectos_V3", eventsXml(objects.slice(i, i + 50), c)))) out.set(k, v);
  }
  return out;
}

/** Admin "Test CTT connection": a tracking query (creates nothing) plus the list of missing settings. Never shows keys. */
export async function cttxTestConnection() {
  const c = cttxConfig();
  const steps = [`CTT Expresso ${cttxSandbox(c) ? "sandbox" : "production"}: ${c.base}`];
  const missing = cttxMissing(c);
  if (missing.length) steps.push(`Missing in Railway: ${missing.join(", ")}`);
  if (!c.authId) return { ok: false, steps };
  try {
    const r = await cttxEvents(["DB000000000PT"], c);
    steps.push(`GetEventosObjectos_V3 → answered (${r.size} object${r.size === 1 ? "" : "s"} found for a test code).`);
    return { ok: missing.length === 0, steps };
  } catch (e) {
    steps.push(`GetEventosObjectos_V3 → ${e instanceof Error ? e.message : String(e)}`);
    return { ok: false, steps };
  }
}
