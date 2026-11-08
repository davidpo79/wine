// Runs our CTT Expresso flow against the sandbox and saves every request and response (the examples CTT asked to
// validate before production): CreateShipment (1 and 2 parcels), CloseShipment, GetEventosObjectos_V3.
// Usage: CTTX_AUTH_ID=… CTTX_USER_ID=… CTTX_CLIENT_ID=… CTTX_CONTRACT_ID=… CTTX_SENDER_ADDRESS=… CTTX_SENDER_POSTAL=… \
//        CTTX_SENDER_CITY=… npx tsx scripts/cttx-sandbox.ts <outDir> [--mask]
// --mask replaces the keys and contract numbers with placeholders (for copies kept in the repository).
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { closeShipmentXml, createShipmentXml, cttxConfig, cttxMissing, eventsXml, parseCloseShipment, parseCreateShipment, parseEvents, type CttxShipmentInput } from "../src/lib/cttx";

const out = process.argv[2] ?? "ctt-examples";
const mask = process.argv.includes("--mask");
const c = cttxConfig();
if (!/\.qa\./.test(c.base)) throw new Error(`Not the sandbox: ${c.base}`);
const missing = cttxMissing(c);
if (missing.length) throw new Error(`Missing: ${missing.join(", ")}`);
mkdirSync(out, { recursive: true });

const secrets = [c.authId, c.userId, c.clientId, c.contractId].filter(Boolean);
const clean = (x: string) => {
  let s = x;
  if (mask) for (const [i, v] of secrets.entries()) s = s.split(v).join(["AUTHENTICATION-ID", "USER-ID", "CLIENT-ID", "CONTRACT-ID"][i]);
  // Base64 documents are long: keep the first characters so the file stays readable.
  return s.replace(/(<(?:\w+:)?File>)([A-Za-z0-9+/=]{80})[A-Za-z0-9+/=]*/g, "$1$2…[PDF base64 truncated]");
};

async function call(name: string, service: string, action: string, xml: string) {
  const iface = service === "EventosWS" ? "IEventosWS" : "ICTTShipmentProviderWS";
  const r = await fetch(`${c.base}/${service}.svc`, { method: "POST", headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: `"http://tempuri.org/${iface}/${action}"` }, body: xml });
  const text = await r.text();
  writeFileSync(join(out, `${name}_request.xml`), clean(xml));
  writeFileSync(join(out, `${name}_response.xml`), clean(text));
  console.log(`${name}: HTTP ${r.status}`);
  return text;
}

const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const order = (ref: string, boxes: number): CttxShipmentInput => ({
  reference: ref,
  subProduct: c.subProduct,
  parcels: Math.ceil(boxes / c.boxesPerParcel),
  weightG: boxes * c.boxWeightG,
  observations: `Vinho em garrafas: frágil${boxes > c.boxesPerParcel ? ` · ${Math.ceil(boxes / c.boxesPerParcel)} volumes` : ""}`,
  receiver: { name: "Ana Teste", address: "Rua Augusta 100, 2.º Esq.", postalCode: "1100-053", city: "Lisboa", country: "PT", email: "ana.teste@example.com", phone: "+351912345678" },
});

const one = parseCreateShipment(await call("1_CreateShipment_1_parcel", "CTTShipmentProviderWS", "CreateShipment", createShipmentXml(order(`WP-T${stamp}-1`, 2), c)));
console.log("  objects", one.objects.join(", "));
for (const [i, p] of one.pdfs.entries()) writeFileSync(join(out, `1_transport_guide_${i + 1}.pdf`), Buffer.from(p, "base64"));
const two = parseCreateShipment(await call("2_CreateShipment_2_parcels", "CTTShipmentProviderWS", "CreateShipment", createShipmentXml(order(`WP-T${stamp}-2`, 4), c)));
console.log("  objects", two.objects.join(", "));
for (const [i, p] of two.pdfs.entries()) writeFileSync(join(out, `2_transport_guide_${i + 1}.pdf`), Buffer.from(p, "base64"));

const closed = parseCloseShipment(
  await call("3_CloseShipment", "CTTShipmentProviderWS", "CloseShipment", closeShipmentXml([one, two].map((s) => ({ first: s.first, last: s.last, subProduct: c.subProduct })), c)),
);
for (const [i, p] of closed.pdfs.entries()) writeFileSync(join(out, `3_close_document_${i + 1}.pdf`), Buffer.from(p, "base64"));

const events = parseEvents(await call("4_GetEventosObjectos_V3", "EventosWS", "GetEventosObjectos_V3", eventsXml([...one.objects, ...two.objects], c)));
for (const [obj, list] of events) console.log(`  ${obj}: ${list.map((e) => e.code).join(" → ") || "no events yet"}`);
console.log(`saved in ${out}`);
