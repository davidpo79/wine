// Captures the customer journey (after the landing page) for the clickable demo: one screenshot per screen plus the
// on-page position of each button that leads somewhere. Needs the local app + scripts/mock-ifthenpay.ts (Stripe mock).
// Usage: tsx scripts/demo-capture.ts <outDir>   -> <outDir>/<id>.png + manifest.json
import "./load-env";
import { writeFileSync } from "node:fs";
import { chromium, type Locator, type Page } from "playwright-core";
import { desc, eq } from "drizzle-orm";
import { sql as pg, db, schema } from "../src/db";

const base = "http://localhost:3000";
const mock = "http://localhost:4599";
const out = process.argv[2];
type Hot = { x: number; y: number; w: number; h: number; to: string };
type Screen = { id: string; w: number; h: number; fixed: boolean; hot: Hot[] };
const screens: Screen[] = [];
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const cookie = { name: "wp_consent", value: encodeURIComponent('{"v":1,"s":0,"m":0}'), domain: "localhost", path: "/" };
async function phone(height = 844) {
  const c = await b.newContext({ viewport: { width: 390, height }, deviceScaleFactor: 2 });
  await c.addCookies([cookie]);
  return c.newPage();
}
async function rect(l: Locator, fixed: boolean) {
  return l.first().evaluate((el, fx) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top + (fx ? 0 : window.scrollY), w: r.width, h: r.height };
  }, fixed);
}
/** Screenshot + hotspots. `fixed`: viewport-only screen (dialogs, overlays). */
async function cap(p: Page, id: string, hot: [Locator, string][], fixed = false) {
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(400);
  const hs: Hot[] = [];
  for (const [l, to] of hot) hs.push({ ...(await rect(l, fixed)), to });
  await p.screenshot({ path: `${out}/${id}.png`, fullPage: !fixed });
  const size = await p.evaluate((fx) => ({ w: window.innerWidth, h: fx ? window.innerHeight : document.documentElement.scrollHeight }), fixed);
  screens.push({ id, ...size, fixed, hot: hs });
  console.log("captured", id, hs.length, "hotspots");
}
async function fill(p: Page, bundle = "x2") {
  await p.goto(`${base}/checkout?b=${bundle}`, { waitUntil: "networkidle" });
  await p.waitForURL(/o=/);
  await p.fill("#f-email", "ana.silva@example.com");
  await p.fill("#f-phone", "912 345 678");
  await p.fill("#f-firstName", "Ana");
  await p.fill("#f-lastName", "Silva");
  await p.fill("#f-address1", "Rua Augusta 100, 2.º Esq.");
  await p.fill("#f-postalCode", "1100-053");
  await p.fill("#f-city", "Lisboa");
  await p.waitForTimeout(1200);
}
const lastPay = async (o: string) => (await db.select().from(schema.payments).where(eq(schema.payments.orderId, o)).orderBy(desc(schema.payments.id)).limit(1))[0];
const ids = (p: Page) => ({ o: new URL(p.url()).searchParams.get("o")!, t: new URL(p.url()).searchParams.get("t")! });
const radio = (p: Page, m: string) => p.locator(`label:has(input[name=method][value=${m}])`);
const submit = (p: Page) => p.locator("form button[type=submit]");
const toggle = (p: Page) => p.locator("button[aria-expanded]");

// ---- Checkout screens -------------------------------------------------------------------------------
{
  const p = await phone();
  await p.goto(`${base}/checkout?b=x2`, { waitUntil: "networkidle" });
  await p.waitForURL(/o=/);
  await cap(p, "checkout-empty", []);
  await fill(p);
  await cap(p, "checkout-mbway", [[toggle(p), "checkout-summary"], [radio(p, "card"), "checkout-card"], [radio(p, "multibanco"), "checkout-mb"], [submit(p), "mbway-wait"]]);
  await toggle(p).click();
  await cap(p, "checkout-summary", [[toggle(p), "checkout-mbway"]]);
  await toggle(p).click();
  await p.check("input[name=method][value=card]");
  await p.waitForTimeout(800);
  await cap(p, "checkout-card", [[toggle(p), "checkout-summary"], [radio(p, "mbway"), "checkout-mbway"], [radio(p, "multibanco"), "checkout-mb"], [submit(p), "offer-card"]]);
  await p.check("input[name=method][value=multibanco]");
  await cap(p, "checkout-mb", [[toggle(p), "checkout-summary"], [radio(p, "mbway"), "checkout-mbway"], [radio(p, "card"), "checkout-card"], [submit(p), "mb-offer"]]);
  await p.check("input[name=method][value=mbway]");
  await submit(p).click();
  await p.waitForSelector("text=Confirme na app MB WAY");
  await p.waitForTimeout(600);
  await cap(p, "mbway-wait", [], true);
  // MB WAY approved -> offer page
  const { o, t } = ids(p);
  await fetch(`${mock}/__mbway`, { method: "POST", body: JSON.stringify({ requestId: (await lastPay(o)).requestId, status: "000" }) });
  await p.waitForURL(/\/oferta/, { timeout: 30000 });
  await p.waitForLoadState("networkidle");
  const offerUrl = p.url();
  await cap(p, "offer-mbway", [[p.locator("button", { hasText: "Sim, adicionar" }), "offer-mbway-wait"], [p.locator("button", { hasText: "Não, obrigado" }), "products-mbway-declined"]]);
  await p.locator("button", { hasText: "Não, obrigado" }).click();
  await p.waitForTimeout(500);
  await cap(p, "products-mbway-declined", [[p.locator("button", { hasText: "ver a minha encomenda" }), "thankyou-plain"]]);
  await p.goto(offerUrl, { waitUntil: "networkidle" });
  await p.locator("button", { hasText: "Sim, adicionar" }).click();
  await p.waitForSelector("text=Confirme na app MB WAY");
  await p.waitForTimeout(600);
  await cap(p, "offer-mbway-wait", [], true);
  await fetch(`${mock}/__mbway`, { method: "POST", body: JSON.stringify({ requestId: (await lastPay(o)).requestId, status: "000" }) });
  await p.waitForSelector("text=Caixa adicionada", { timeout: 30000 });
  await cap(p, "products-mbway-added", [[p.locator("button", { hasText: "Concluir" }), "thankyou-mbway"]]);
  await p.locator("button", { hasText: "Concluir" }).click();
  await p.waitForURL(/\/obrigado/);
  await p.waitForLoadState("networkidle");
  await cap(p, "thankyou-mbway", []);
  void t;
}
// ---- Plain thank-you (paid, no add-on) -----------------------------------------------------------------
{
  const p = await phone();
  await fill(p);
  const { o, t } = ids(p);
  const post = (path: string, body: unknown) => fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  await post("/api/checkout/prepare", { o, t, method: "mbway" });
  await post("/api/pay", { o, t, method: "mbway" });
  await fetch(`${mock}/__mbway`, { method: "POST", body: JSON.stringify({ requestId: (await lastPay(o)).requestId, status: "000" }) });
  await new Promise((r) => setTimeout(r, 3200));
  await fetch(`${base}/api/pay/status?o=${o}&t=${encodeURIComponent(t)}`);
  await p.goto(`${base}/obrigado?o=${o}&t=${encodeURIComponent(t)}`, { waitUntil: "networkidle" });
  await cap(p, "thankyou-plain", []);
}
// ---- Card (Stripe): one-click offer -------------------------------------------------------------------
{
  const p = await phone();
  await fill(p);
  const { o, t } = ids(p);
  const post = (path: string, body: unknown) => fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  await post("/api/checkout/prepare", { o, t, method: "card" });
  await post("/api/pay", { o, t, method: "card" });
  await fetch(`${mock}/__pi`, { method: "POST", body: JSON.stringify({ id: (await lastPay(o)).requestId, status: "succeeded", payment_method: "pm_card_visa" }) });
  await p.goto(`${base}/checkout/concluido?o=${o}&t=${encodeURIComponent(t)}`, { waitUntil: "networkidle" });
  const offerUrl = p.url();
  await cap(p, "offer-card", [[p.locator("button", { hasText: "1 clique" }), "products-card-added"], [p.locator("button", { hasText: "Não, obrigado" }), "products-card-declined"]]);
  await p.locator("button", { hasText: "Não, obrigado" }).click();
  await p.waitForTimeout(500);
  await cap(p, "products-card-declined", [[p.locator("button", { hasText: "ver a minha encomenda" }), "thankyou-plain"]]);
  await p.goto(offerUrl, { waitUntil: "networkidle" });
  await p.locator("button", { hasText: "1 clique" }).click();
  await p.waitForSelector("text=Caixa adicionada");
  await cap(p, "products-card-added", [[p.locator("button", { hasText: "Concluir" }), "thankyou-card"]]);
  await p.locator("button", { hasText: "Concluir" }).click();
  await p.waitForURL(/\/obrigado/);
  await p.waitForLoadState("networkidle");
  await cap(p, "thankyou-card", []);
}
// ---- Multibanco: offer before payment (tall viewport so the whole window fits) -------------------------
for (const accept of [true, false]) {
  const p = await phone(844);
  await fill(p);
  await p.check("input[name=method][value=multibanco]");
  await p.setViewportSize({ width: 390, height: 1500 });
  await submit(p).click();
  await p.waitForSelector("dialog[open]");
  await p.waitForTimeout(800);
  if (accept) {
    const box = await p.locator("dialog[open]").boundingBox();
    // Crop the screenshot to the dialog area plus margin, keep coordinates relative to the crop.
    const top = Math.max(0, Math.floor(box!.y) - 12);
    const height = Math.ceil(box!.height) + 24;
    const hs: Hot[] = [];
    for (const [txt, to] of [["Sim, juntar à encomenda", "thankyou-mb-added"], ["Não, obrigado", "thankyou-mb"]] as const) {
      const r = await p.locator("dialog[open] button", { hasText: txt }).first().boundingBox();
      hs.push({ x: r!.x, y: r!.y - top, w: r!.width, h: r!.height, to });
    }
    await p.screenshot({ path: `${out}/mb-offer.png`, clip: { x: 0, y: top, width: 390, height } });
    screens.push({ id: "mb-offer", w: 390, h: height, fixed: true, hot: hs });
    console.log("captured mb-offer");
  }
  await p.locator("dialog[open] button", { hasText: accept ? "Sim, juntar à encomenda" : "Não, obrigado" }).first().click();
  await p.waitForURL(/\/obrigado/);
  await p.setViewportSize({ width: 390, height: 844 });
  await p.waitForLoadState("networkidle");
  await cap(p, accept ? "thankyou-mb-added" : "thankyou-mb", []);
}
writeFileSync(`${out}/manifest.json`, JSON.stringify(screens, null, 1));
await b.close();
await pg.end();
console.log("done", screens.length);
