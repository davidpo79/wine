// Post-purchase offer page checks (no charge: only the flow and prices). Usage: tsx scripts/upsell-check.ts [url]
import "./load-env";
import { chromium } from "playwright-core";
import { eq, inArray } from "drizzle-orm";
import { sql as pg, db, schema } from "../src/db";
import { resumeToken } from "../src/lib/recovery";

const url = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "PASS" : "FAIL"} ${m}`); if (!c) fails++; };
const ids: string[] = [];
async function paidOrder(key: "x1" | "x3") {
  const [b] = await db.select().from(schema.bundles).where(eq(schema.bundles.key, key));
  const id = `WP-UTEST-${key}-${Date.now() % 100000}`;
  await db.insert(schema.orders).values({ id, status: "paid", bundleId: b.id, bundleKey: b.key, qtyBoxes: b.qty, subtotalCents: b.priceCents, shippingCents: b.shippingCents, totalCents: b.priceCents + b.shippingCents, customerName: "Ana Teste", email: "ana@example.com" });
  ids.push(id);
  return id;
}
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addCookies([{ name: "wp_consent", value: encodeURIComponent(JSON.stringify({ v: 1, s: 0, m: 0 })), domain: new URL(url).hostname, path: "/" }]);
const page = await ctx.newPage();

const o1 = await paidOrder("x1");
await page.goto(`${url}/oferta?o=${o1}&t=${encodeURIComponent(resumeToken(o1))}`, { waitUntil: "networkidle" });
const body1 = (await page.textContent("main")) ?? "";
ok(body1.includes("36,72"), "1 box bought: offer +1 box for 36,72 € (2-box price)");
await page.click("text=Não, obrigado");
const body2 = (await page.textContent("main")) ?? "";
ok(body2.includes("14,90") && body2.includes("15,90"), "declined: offer 2 shows Espumante 14,90 € and Porto Vintage 15,90 €");
await Promise.all([page.waitForURL(/\/obrigado/), page.click("text=ver a minha encomenda")]);
ok(((await page.textContent("h1")) ?? "").includes("confirmada"), "finish goes to the thank-you page (paid)");

const o3 = await paidOrder("x3");
await page.goto(`${url}/oferta?o=${o3}&t=${encodeURIComponent(resumeToken(o3))}`, { waitUntil: "networkidle" });
ok(((await page.textContent("main")) ?? "").includes("39,02"), "3 boxes bought: +1 box at 39,02 € (3-box per-box price)");

await page.goto(`${url}/oferta?o=${o3}&t=forged`, { waitUntil: "networkidle" });
ok(!page.url().includes("/oferta"), "forged token is rejected");

await browser.close();
await db.delete(schema.orderEvents).where(inArray(schema.orderEvents.orderId, ids));
await db.delete(schema.orders).where(inArray(schema.orders.id, ids));
console.log(fails ? `${fails} FAILED` : "all upsell checks passed");
await pg.end();
process.exit(fails ? 1 : 0);
