// Local stand-in for the CTT e-commerce API v3, for tests only (CTT has no test environment).
// Usage: tsx scripts/mock-ctt.ts [port]   then CTT_API_BASE=http://localhost:<port>/v3 with any CTT_APP_ID,
// CTT_PUBLIC_KEY=pub-test, CTT_SECRET_KEY=sec-test. Checks the X-APPID header and the HMAC Basic auth like CTT.
// Control: POST /__status {ref, code, text} adds a tracking status · POST /__expire makes the current token invalid.
import { createHmac } from "node:crypto";
import { createServer } from "node:http";

const port = Number(process.argv[2] ?? 4600);
const PUBLIC = "pub-test";
const SECRET = "sec-test";
let token = "tok-1";
let tokens = 1;
const shipments = new Map<string, { tracking: string; statuses: { Code: number; DateTime: string; Text: string }[] }>();
const runs = new Map<string, { ref: string; polls: number }>();
const sign = (u: string, body: string) => createHmac("sha256", SECRET).update(u + body).digest("base64").replace(/=+$/, "");
// One page, enough to be a valid PDF.
const PDF = Buffer.from("%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 288 432]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF").toString("base64");

createServer(async (req, res) => {
  let body = "";
  for await (const c of req) body += c;
  const send = (status: number, json: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(json));
  };
  const url = req.url ?? "/";
  if (url === "/__status") {
    const { ref, code, text } = JSON.parse(body);
    shipments.get(ref)?.statuses.push({ Code: code, DateTime: new Date().toISOString(), Text: text ?? `status ${code}` });
    return send(200, { ok: true });
  }
  if (url === "/__expire") {
    token = `tok-${++tokens}`;
    return send(200, { ok: true });
  }
  if (!req.headers["x-appid"]) return send(400, { Error: { Id: 1, Tekst: "X-APPID missing" } });
  const [user, pass] = Buffer.from(String(req.headers.authorization ?? "").replace(/^Basic /, ""), "base64").toString().split(":");
  const path = url.replace(/^\/v3/, "");
  if (path === "/keys/" && req.method === "POST") {
    if (user !== PUBLIC || pass !== sign(user, body)) return send(401, { Error: { Id: 401, Tekst: "bad public key signature" } });
    return send(200, { Error: { Id: 0 }, Key: token, Expire: new Date(Date.now() + 3600_000).toISOString() });
  }
  if (user !== token || pass !== sign(user, body)) return send(401, { Error: { Id: 401, Tekst: "token invalid" } });
  const j = body ? JSON.parse(body) : {};
  const simulate = req.headers["x_simulate"] === "1";
  if (path === "/shipments/" && req.method === "POST") {
    const out = (j.Shipment ?? []).map((s: { ClientReferenceCode: string; ShopItemId: string; Address?: { PostalCode?: string } }) => {
      if (!s.Address?.PostalCode) return { ShopItemId: s.ShopItemId, ErrorList: [{ Id: 210, Tekst: "PostalCode missing" }] };
      if (!simulate) shipments.set(s.ClientReferenceCode, { tracking: "", statuses: [{ Code: 10, DateTime: new Date().toISOString(), Text: "Imported" }] });
      return { ShopItemId: s.ShopItemId, CarrierSelect: { Id: 1, Name: "CTT Expresso" }, ErrorList: [], WarningList: [] };
    });
    return send(200, { Error: { Id: 0 }, ErrorList: [], Shipment: out });
  }
  if (path === "/labels/" && req.method === "POST") {
    const run = `run${runs.size + 1}`;
    runs.set(run, { ref: j.ClientReferenceCodeList[0], polls: 0 });
    return send(200, { Error: { Id: 0 }, CallbackURL: `http://localhost:${port}/v3/labels/${run}` });
  }
  const m = path.match(/^\/labels\/(run\d+)$/);
  if (m && req.method === "GET") {
    const r = runs.get(m[1]);
    if (!r) return send(404, { Error: { Id: 404, Tekst: "run not found" } });
    r.polls += 1;
    if (r.polls < 2) return send(200, { Finished: 50 });
    const s = shipments.get(r.ref);
    const tracking = s?.tracking || `EA${String(Date.now()).slice(-9)}PT`;
    if (s) {
      s.tracking = tracking;
      s.statuses.push({ Code: 20, DateTime: new Date().toISOString(), Text: "Pre-alerted" });
    }
    return send(200, { Finished: 100, LabelPDF: PDF, ClientReferenceCodeList: [{ ReferenceCode: r.ref, TrackingId: tracking, TrackingUrl: `https://www.ctt.pt/feapl_2/app/open/objectSearch/objectSearch.jspx?objects=${tracking}` }] });
  }
  if (path === "/settings/" && req.method === "GET") return send(200, { Error: { Id: 0 }, EnableTrackingEmail: 0, LabelFormat: 0 });
  if (path === "/carriers/" && req.method === "GET") return send(200, { Error: { Id: 0 }, Carrier: [{ Id: 1, Name: "CTT Expresso", HasPickup: 1 }] });
  if (path === "/tracking/" && req.method === "POST") {
    const list = (j.ClientReferenceCodeList ?? []).filter((r: string) => shipments.has(r)).map((r: string) => ({ ClientReferenceCode: r, TrackingId: shipments.get(r)!.tracking, Statuslist: shipments.get(r)!.statuses }));
    return send(200, { Error: { Id: 0 }, Shipments: list });
  }
  return send(405, { Error: { Id: 405, Tekst: "not enabled" } });
}).listen(port, () => console.log(`mock CTT on :${port}`));
