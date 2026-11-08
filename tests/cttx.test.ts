import { test } from "node:test";
import assert from "node:assert/strict";
process.env.SESSION_SECRET = "x".repeat(40);
const x = await import("../src/lib/cttx");

const cfg = {
  base: "https://cttexpressows.qa.ctt.pt/CTTEWSPoolHTTPS",
  authId: "auth",
  userId: "user",
  clientId: "100",
  contractId: "300",
  subProduct: x.CTTX_PRODUCTS.twoDays,
  sender: { name: "Wine Portugal", contact: "", address: "Rua do Céu 3", postalCode: "2410-498", city: "Leiria", phone: "+351910348577", email: "info@wine-portugal.com" },
  boxWeightG: 4000,
  boxesPerParcel: 2,
  fragile: true,
};
const input = {
  reference: "WP-2026-0042",
  subProduct: x.CTTX_PRODUCTS.twoDays,
  parcels: 2,
  weightG: 12000,
  observations: "Vinho em garrafas: frágil",
  receiver: { name: "Ana & Rui <Silva>", address: "Rua Augusta 100, 2.º Esq.", postalCode: "1100053", city: "Lisboa", country: "PT", email: "ana@example.com", phone: "+351912345678" },
};

test("CreateShipment: fields in alphabetical order (WCF), split postal codes, escaped text", () => {
  const xml = x.createShipmentXml(input, cfg, "req-1");
  // Order of the ShipmentCTT members and of AddressData members, as CTT's deserializer expects.
  const order = (names: string[], within: string) => names.map((n) => within.indexOf(`<ctt1:${n}>`)).every((v, i, a) => v >= 0 && (i === 0 || v > a[i - 1]));
  assert.ok(order(["HasSenderInformation", "ReceiverData", "SenderData", "ShipmentData", "SpecialServices"], xml));
  const receiver = xml.slice(xml.indexOf("<ctt1:ReceiverData>"), xml.indexOf("</ctt1:ReceiverData>"));
  assert.ok(order(["Address", "City", "ContactName", "Country", "Email", "MobilePhone", "Name", "PTZipCode3", "PTZipCode4", "PTZipCodeLocation", "Type"], receiver));
  assert.match(receiver, /<ctt1:PTZipCode4>1100<\/ctt1:PTZipCode4>/);
  assert.match(receiver, /<ctt1:PTZipCode3>053<\/ctt1:PTZipCode3>/);
  assert.match(receiver, /Ana &amp; Rui &lt;Silva&gt;/);
  assert.match(xml, /<ctt1:Quantity>2<\/ctt1:Quantity><ctt1:Weight>12000<\/ctt1:Weight>/);
  assert.match(xml, /<ctt1:SubProductId>EMSF057\.01<\/ctt1:SubProductId>/);
  assert.match(xml, /<ctt:RequestID>req-1<\/ctt:RequestID><ctt:UserID>user<\/ctt:UserID>/);
  assert.doesNotMatch(xml, /ATCode/); // the invoice travels in the parcel
  assert.throws(() => x.createShipmentXml({ ...input, receiver: { ...input.receiver, postalCode: "1100" } }, cfg), /postal code/);
});

test("object range: consecutive S10 codes with their check digits", () => {
  assert.deepEqual(x.objectRange("DB005827819PT", "DB005827822PT"), ["DB005827819PT", "DB005827822PT"]);
  assert.deepEqual(x.objectRange("DB005827782PT", "DB005827796PT"), ["DB005827782PT", "DB005827796PT"]);
  assert.deepEqual(x.objectRange("DB005827805PT", "DB005827805PT"), ["DB005827805PT"]);
  assert.equal(x.parcelsForBoxes(1), 1);
  assert.equal(x.parcelsForBoxes(2), 1);
  assert.equal(x.parcelsForBoxes(4), 2);
});

test("CreateShipment response: objects and documents, errors as a message", () => {
  const ok = `<s:Envelope><s:Body><CreateShipmentResponse><CreateShipmentResult><a:ErrorsList/><a:ShipmentData><a:ShipmentDataOutput><a:ClientReference>WP-1</a:ClientReference><a:DocumentsList><a:DocumentData><a:File>JVBERi0x</a:File><a:FileName>OIB.pdf</a:FileName></a:DocumentData><a:DocumentData><a:File>JVBERi0y</a:File><a:FileName>OIB.pdf</a:FileName></a:DocumentData></a:DocumentsList><a:FirstObject>DB005827819PT</a:FirstObject><a:LastObject>DB005827822PT</a:LastObject><a:ShipmentNumber>19664</a:ShipmentNumber></a:ShipmentDataOutput></a:ShipmentData><a:Status>Success</a:Status></CreateShipmentResult></CreateShipmentResponse></s:Body></s:Envelope>`;
  const r = x.parseCreateShipment(ok);
  assert.deepEqual(r.objects, ["DB005827819PT", "DB005827822PT"]);
  assert.deepEqual(r.pdfs, ["JVBERi0x", "JVBERi0y"]);
  assert.equal(r.shipmentNumber, "19664");
  const bad = `<a:ErrorsList><a:ErrorData><a:Code>0</a:Code><a:Message>O codigo postal do Remetente é inválido: 5050-000.</a:Message></a:ErrorData><a:ErrorData><a:Code>0</a:Code><a:Message>O codigo postal do Remetente é inválido: 5050-000.</a:Message></a:ErrorData></a:ErrorsList><a:ShipmentData i:nil="true"/><a:Status>Failure</a:Status>`;
  assert.throws(() => x.parseCreateShipment(bad), /codigo postal do Remetente é inválido: 5050-000\.$/);
  assert.throws(() => x.parseCreateShipment(`<s:Fault><faultstring xml:lang="pt-PT">Element Type is not expected</faultstring></s:Fault>`), /not expected/);
});

test("tracking: events with reasons and situations, dates in Lisbon time", () => {
  const ev = (code: string, at: string, extra = "") => `<a:DadosEventos_V3BE><a:_CodigoEvento>${code}</a:_CodigoEvento>${extra}<a:_DataEvento>${at}</a:_DataEvento><a:_DescricaoNoEvento>C.O. LOURES - MARL</a:_DescricaoNoEvento><a:_Valido>1</a:_Valido></a:DadosEventos_V3BE>`;
  const xml = `<a:_Objectos><a:DadosObjectos_V3BE><a:_Eventos>${ev("EMA", "03-11-2026 23:59:59")}${ev("EMH", "05-11-2026 10:15:00", "<a:_CodigoMotivo>1</a:_CodigoMotivo><a:_CodigoSituacao>B</a:_CodigoSituacao><a:_DescricaoSituacao/>")}</a:_Eventos><a:_NObjecto>DB005827297PT</a:_NObjecto></a:DadosObjectos_V3BE></a:_Objectos>`;
  const list = x.parseEvents(xml).get("DB005827297PT")!;
  assert.deepEqual(list.map((e) => e.code), ["EMA", "EMH"]);
  assert.equal(list[0].at, "2026-11-03T23:59:59.000Z"); // November: Lisbon = UTC
  assert.equal(list[1].text, "ENTREGA NÃO CONSEGUIDA · NÃO ATENDEU · Aguarda nova tentativa de entrega");
  assert.equal(list[1].reason, "1");
  assert.equal(list[1].situation, "B");
  assert.equal(x.parseCttDate("15-07-2026 10:00:00"), "2026-07-15T09:00:00.000Z"); // summer time
  assert.ok(x.CTTX_SHIPPED.has("EMA") && x.CTTX_ALERT.has("EMH") && x.CTTX_DELIVERED === "EMI");
});

test("CreateShipment: Fragile service, and CTT's own sender address when ours is empty", () => {
  const own = x.createShipmentXml(input, cfg, "r");
  assert.match(own, /<ctt1:HasSenderInformation>true<\/ctt1:HasSenderInformation>/);
  assert.match(own, /<ctt1:SpecialServiceType>Fragil<\/ctt1:SpecialServiceType>/);
  assert.match(own, /<ctt1:PTZipCode4>2410<\/ctt1:PTZipCode4>/);
  const contract = x.createShipmentXml(input, { ...cfg, fragile: false, sender: { ...cfg.sender, address: "", postalCode: "", city: "" } }, "r");
  assert.match(contract, /<ctt1:HasSenderInformation>false<\/ctt1:HasSenderInformation>/);
  assert.match(contract, /<ctt1:SenderData><ctt1:Address>-<\/ctt1:Address><ctt1:City>-<\/ctt1:City><ctt1:Country>PT<\/ctt1:Country><ctt1:Name>Wine Portugal<\/ctt1:Name><ctt1:Type>Sender<\/ctt1:Type><\/ctt1:SenderData>/);
  assert.doesNotMatch(contract, /Fragil/);
  assert.deepEqual(x.cttxMissing({ ...cfg, sender: { ...cfg.sender, address: "", postalCode: "", city: "" } }), []);
});
