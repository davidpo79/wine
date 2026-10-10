// Captures the funnel after the landing page + admin finance (local app + scripts/mock-ifthenpay.ts with Stripe mock).
// Usage: tsx scripts/screenshots.ts <outDir>   (needs a local admin shots@example.com / ShotsLocal2026!)
import "./load-env";
import { chromium, type Page } from "playwright-core";
import { desc, eq } from "drizzle-orm";
import { sql as pg, db, schema } from "../src/db";

const base = "http://localhost:3000";
const mock = "http://localhost:4599";
const out = process.argv[2];
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const cookie = { name: "wp_consent", value: encodeURIComponent('{"v":1,"s":0,"m":0}'), domain: "localhost", path: "/" };
const mobile = async () => {
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await c.addCookies([cookie]);
  return c.newPage();
};
const shot = (p: Page, name: string, full = true) => p.screenshot({ path: `${out}/${name}.png`, fullPage: full });
const params = (p: Page) => ({ o: new URL(p.url()).searchParams.get("o")!, t: new URL(p.url()).searchParams.get("t")! });
async function fill(p: Page, bundle: string) {
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
const paymentOf = async (o: string) => (await db.select().from(schema.payments).where(eq(schema.payments.orderId, o)).orderBy(desc(schema.payments.id)).limit(1))[0];

// A. MB WAY path
{
  const p = await mobile();
  await p.goto(`${base}/checkout?b=x2`, { waitUntil: "networkidle" });
  await p.waitForURL(/o=/);
  await shot(p, "01-checkout-vazio");
  await fill(p, "x2");
  await shot(p, "02-checkout-preenchido-mbway");
  await p.click("text=Mostrar resumo da encomenda");
  await p.waitForTimeout(400);
  await shot(p, "03-checkout-resumo-aberto", false);
  await p.click("text=Ocultar resumo");
  await p.check("input[name=method][value=card]");
  await p.locator("h2", { hasText: /^Pagamento$/ }).evaluate((e) => e.scrollIntoView());
  await p.waitForTimeout(1500);
  await shot(p, "04-checkout-cartao-stripe", false);
  await p.check("input[name=method][value=mbway]");
  await p.click("form button[type=submit]");
  await p.waitForSelector("text=Confirme na app MB WAY");
  await p.waitForTimeout(800);
  await shot(p, "05-mbway-a-aguardar", false);
  const { o } = params(p);
  const pay = await paymentOf(o);
  await fetch(`${mock}/__mbway`, { method: "POST", body: JSON.stringify({ requestId: pay.requestId, status: "000" }) });
  await p.waitForURL(/\/oferta/, { timeout: 30000 });
  await p.waitForLoadState("networkidle");
  await shot(p, "06-oferta-unica-mbway");
  await p.click("text=Sim, adicionar");
  await p.waitForSelector("text=Confirme na app MB WAY");
  await shot(p, "07-oferta-mbway-confirmar", false);
  const ap = await paymentOf(o);
  await fetch(`${mock}/__mbway`, { method: "POST", body: JSON.stringify({ requestId: ap.requestId, status: "000" }) });
  await p.waitForSelector("text=Para a passagem de ano", { timeout: 30000 });
  await p.waitForTimeout(500);
  await shot(p, "08-oferta-produtos-extra");
  await p.click("text=Concluir");
  await p.waitForURL(/\/obrigado/);
  await p.waitForLoadState("networkidle");
  await shot(p, "09-obrigado-pago");
}
// B. Multibanco path: offer before payment
{
  const p = await mobile();
  await fill(p, "x1");
  await p.check("input[name=method][value=multibanco]");
  await p.click("form button[type=submit]");
  await p.waitForSelector("dialog[open]");
  await p.waitForTimeout(800);
  await shot(p, "10-multibanco-oferta-antes-de-pagar", false);
  await p.locator("dialog[open]").evaluate((d) => d.scrollTo(0, d.scrollHeight));
  await p.waitForTimeout(300);
  await shot(p, "11-multibanco-oferta-fundo", false);
  await p.click("dialog[open] >> text=Sim, juntar à encomenda");
  await p.waitForURL(/\/obrigado/);
  await p.waitForLoadState("networkidle");
  await shot(p, "12-obrigado-multibanco-referencia");
}
// C. Card via Stripe: one-click offer
{
  const p = await mobile();
  await fill(p, "x1");
  const { o, t } = params(p);
  const post = (path: string, body: unknown) => fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  await post("/api/checkout/prepare", { o, t, method: "card" });
  await post("/api/pay", { o, t, method: "card" });
  const pay = await paymentOf(o);
  await fetch(`${mock}/__pi`, { method: "POST", body: JSON.stringify({ id: pay.requestId, status: "succeeded", payment_method: "pm_card_visa" }) });
  await p.goto(`${base}/checkout/concluido?o=${o}&t=${encodeURIComponent(t)}`, { waitUntil: "networkidle" });
  await shot(p, "13-oferta-unica-cartao-1-clique");
  await p.click("text=Sim, adicionar com 1 clique");
  await p.waitForSelector("text=Caixa adicionada");
  await p.waitForTimeout(500);
  await shot(p, "14-oferta-cartao-adicionado");
}
// D. Desktop checkout
{
  const c = await b.newContext({ viewport: { width: 1280, height: 900 } });
  await c.addCookies([cookie]);
  const p = await c.newPage();
  await fill(p, "x2");
  await shot(p, "15-checkout-desktop");
}
// E. Admin finance
{
  const c = await b.newContext({ viewport: { width: 1360, height: 900 } });
  const p = await c.newPage();
  await p.goto(`${base}/admin/login`);
  await p.fill("input[name=email]", "shots@example.com");
  await p.fill("input[name=password]", "ShotsLocal2026!");
  await Promise.all([p.waitForURL(`${base}/admin`), p.click("button[type=submit]")]);
  await p.goto(`${base}/admin/finance`, { waitUntil: "networkidle" });
  await shot(p, "16-admin-finance");
  await p.goto(`${base}/admin/orders`, { waitUntil: "networkidle" });
  await shot(p, "17-admin-encomendas-lucro", false);
}
await b.close();
await pg.end();
console.log("done");
