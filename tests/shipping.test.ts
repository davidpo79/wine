import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
for (const k of ["CTT_APP_ID", "CTT_SECRET", "CTT_MOCK", "CTT_SIMULATE"]) delete process.env[k];
const { sign, checkCttResponse, requestWithTokenRefresh, iso3, ptPostalCode, s10CheckDigit, isS10, toCttShipment, createCttClient, CttError } = await import(
  "../src/lib/shipping/ctt"
);
const { createMockCttServer } = await import("../src/lib/shipping/ctt-mock");
const { cttMode, getShippingProvider } = await import("../src/lib/shipping");

const ADMIN_TRACKING = /^[A-Z0-9]{8,30}$/; // same check as the admin "shipped" action

const input = {
  reference: "WP-2026-0001",
  to: { name: "Maria Silva", line1: "Rua das Flores 10", postalCode: "1200 195", city: "Lisboa", country: "PT", phone: "912345678" },
  carrierId: "CTT_EXPRESSO_19",
  items: [{ description: "Trilogia 2160 (3 garrafas)", quantity: 1, weightGrams: 4500, valueCents: 4990 }],
};

function setup(o: Partial<Parameters<typeof createMockCttServer>[0]> = {}, simulate = false) {
  const server = createMockCttServer({ appId: "app", secret: "s3cret", ...o });
  const client = createCttClient({ base: server.base, appId: "app", secret: "s3cret", fetch: server.fetch, simulate, mode: "mock" });
  return { server, client };
}

test("sign = base64(HMAC-SHA256(secret, token + body)) without padding", () => {
  const raw = createHmac("sha256", "s3cret").update("tok" + '{"a":1}').digest("base64");
  assert.ok(raw.endsWith("="));
  assert.equal(sign("s3cret", "tok", '{"a":1}'), raw.replace(/=+$/, ""));
  assert.ok(!sign("s3cret", "tok", "").includes("="));
  assert.notEqual(sign("s3cret", "tok", "a"), sign("s3cret", "tok2", "a"));
});

test("error contract: status first, then Error/ErrorList, warnings returned", () => {
  assert.deepEqual(checkCttResponse(200, { Error: { Id: 0 }, ErrorList: [], WarningList: [{ Field: "Phone", Message: "missing" }] }), ["Phone: missing"]);
  assert.deepEqual(checkCttResponse(200, {}), []);
  assert.throws(() => checkCttResponse(401, {}), /unauthorized/);
  assert.throws(() => checkCttResponse(405, { Error: { Id: 0 } }), /not enabled for this application key/);
  assert.throws(() => checkCttResponse(500, {}), /HTTP 500/);
  assert.throws(() => checkCttResponse(200, { Error: { Id: 7, Message: "Bad" }, ErrorList: [] }), /error 7: Bad/);
  assert.throws(
    () => checkCttResponse(200, { Error: { Id: 0 }, ErrorList: [{ Field: "Address.City", Message: "required" }] }),
    (e: unknown) => e instanceof CttError && e.errors[0] === "Address.City: required",
  );
});

test("requestWithTokenRefresh: fetches a token, re-tokens once on 401, never loops", async () => {
  let refreshes = 0;
  const refresh = async () => `t${++refreshes}`;
  const seen: string[] = [];
  const state = { token: null as string | null };
  let r = await requestWithTokenRefresh(async (t) => (seen.push(t), new Response("{}", { status: t === "t1" ? 401 : 200 })), state, refresh);
  assert.equal(r.status, 200);
  assert.deepEqual(seen, ["t1", "t2"]);
  assert.equal(state.token, "t2");
  r = await requestWithTokenRefresh(async () => new Response("{}", { status: 401 }), state, refresh);
  assert.equal(r.status, 401);
  assert.equal(refreshes, 3);
});

test("helpers: ISO3, PT postal code, S10, wire shape", () => {
  assert.equal(iso3("pt"), "PRT");
  assert.equal(iso3("DE"), "DEU");
  assert.equal(iso3("PRT"), "PRT");
  assert.throws(() => iso3("XX"), /unsupported/);
  assert.equal(ptPostalCode("1200195"), "1200-195");
  assert.equal(ptPostalCode("1200-19"), null);
  assert.equal(s10CheckDigit("47312482"), 9); // UPU S10 reference example RR473124829GB
  assert.ok(isS10("RR473124829PT"));
  assert.ok(!isS10("RR473124820PT"));
  const s = toCttShipment({ ...input, pickupPointId: "PUDO-1000", options: ["SIGNATURE"] });
  assert.equal(s.ClientReferenceCode, "WP-2026-0001");
  assert.deepEqual(s.Address, { Name: "Maria Silva", Streetname1: "Rua das Flores 10", City: "Lisboa", PostalCode: "1200-195", Country: "PRT", Phone: "912345678" });
  assert.deepEqual(s.Carrier, { Id: "CTT_EXPRESSO_19" });
  assert.deepEqual(s.PickupPoint, { PointId: "PUDO-1000" });
  assert.deepEqual(s.OptionList, [{ Id: "SIGNATURE" }]);
  assert.deepEqual(s.ShipmentItems, [{ Description: "Trilogia 2160 (3 garrafas)", Quantity: 1, Weight: 4500, Value: 49.9 }]);
});

test("registry: mock without credentials, only PT has a provider", () => {
  assert.equal(cttMode(), "mock");
  assert.equal(getShippingProvider("pt")?.mode, "mock");
  assert.equal(getShippingProvider("DE"), null);
});

test("mock flow: shipment -> async label -> tracking progression", async () => {
  let now = new Date("2026-11-20T10:00:00Z");
  const { server, client } = setup({ now: () => now });
  const shp = await client.createShipment(input);
  assert.match(shp.shipmentId, /^SHP\d+$/);
  assert.deepEqual(shp.warnings, []);
  assert.equal(server.state.tokensIssued, 1);

  const upd = await client.updateShipment(shp.shipmentId, { ...input, to: { ...input.to, phone: null } });
  assert.equal(upd.shipmentId, shp.shipmentId);
  assert.equal(upd.warnings.length, 1); // stored, with a caveat (no phone)

  const job = await client.createLabel([shp.shipmentId]);
  assert.ok(job.runId && job.callbackUrl?.endsWith(job.runId));
  const first = await client.pollLabel(job.runId);
  assert.equal(first.done, false);
  assert.ok(first.finished >= 0 && first.finished < 100);
  const second = await client.pollLabel(job.runId);
  assert.ok(second.done);
  if (!second.done) return;
  assert.ok(Buffer.from(second.labelPdfBase64, "base64").toString().startsWith("%PDF"));
  const [s] = second.shipments;
  assert.equal(s.reference, "WP-2026-0001");
  assert.match(s.trackingNumber, ADMIN_TRACKING);
  assert.ok(isS10(s.trackingNumber));
  assert.ok(s.trackingUrl.includes(s.trackingNumber));

  await assert.rejects(client.updateShipment(shp.shipmentId, input), /cannot be changed/);
  assert.equal((await client.track(s.trackingNumber)).status, "created");
  now = new Date("2026-11-21T17:00:00Z");
  const t = await client.track(s.trackingNumber);
  assert.equal(t.status, "delivered");
  assert.equal(t.events.length, 4);
  assert.equal(t.deliveredAt?.toISOString(), "2026-11-21T16:00:00.000Z");
  await assert.rejects(client.track("DA000000000PT"), /Object not found/);
});

test("mock: validation errors, 405, re-token on 401, simulation stores nothing", async () => {
  const { server, client } = setup({ disabledEndpoints: ["/pickuppoints"] });
  await assert.rejects(client.createShipment({ ...input, to: { ...input.to, postalCode: "123" } }), /postal code/); // caught client side
  await assert.rejects(client.createShipment({ ...input, carrierId: "NOPE" }), (e: unknown) => e instanceof CttError && /Carrier\.Id/.test(e.message));
  await assert.rejects(client.createShipment({ ...input, items: [] }), /ShipmentItems/);
  await assert.rejects(client.listPickupPoints({ postalCode: "1200-195", country: "PT" }), /not enabled/);
  assert.deepEqual((await client.listCarriers()).carriers.map((c) => c.id), ["CTT_EXPRESSO_19", "CTT_REDE_PICKUP"]);

  server.expireTokens();
  await client.listCarriers();
  assert.equal(server.state.tokensIssued, 2);

  const sim = setup({}, true);
  const r = await sim.client.createShipment(input);
  assert.ok(r.shipmentId);
  assert.equal(sim.server.state.shipments.size, 0);
  assert.ok(sim.server.state.requests.every((x) => x.simulate));
  await assert.rejects(sim.client.createLabel([r.shipmentId]), /not found/);
});

test("mock: auth failures surface, pickup points by postal code", async () => {
  const bad = createCttClient({ base: setup().server.base, appId: "other", secret: "s3cret", fetch: setup().server.fetch });
  await assert.rejects(bad.listCarriers(), /rejected the application key/);
  const wrongSecret = (() => {
    const server = createMockCttServer({ appId: "app", secret: "s3cret" });
    return createCttClient({ base: server.base, appId: "app", secret: "wrong", fetch: server.fetch });
  })();
  await assert.rejects(wrongSecret.listCarriers(), /unauthorized/);
  const { client } = setup();
  const pts = await client.listPickupPoints({ postalCode: "4000102", country: "PT" });
  assert.deepEqual(pts.points.map((p) => p.id), ["PUDO-4000"]);
  const de = await client.listPickupPoints({ postalCode: "10115", country: "DE" });
  assert.equal(de.points.length, 0);
  assert.equal(de.warnings.length, 1);
});
