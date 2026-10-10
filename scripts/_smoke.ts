import { chromium } from "playwright-core";
const base = process.argv[2] ?? "http://localhost:3000";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const errs: string[] = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => m.type() === "error" && errs.push(m.text().split("\n").filter((l) => /^\s*[+-] /.test(l)).join("|").slice(0, 400) || m.text().slice(0,200)));
await p.goto(base + "/admin");
console.log("redirected to", p.url());
await p.fill("input[name=email]", "david@trusthebrokers.com");
await p.fill("input[name=password]", "wrongpassword");
await p.click("button[type=submit]");
await p.waitForTimeout(1500);
console.log("bad login msg:", await p.locator("p.text-red-700").textContent().catch(() => null));
await p.waitForTimeout(500);
await p.fill("input[name=email]", "david@trusthebrokers.com");
await p.fill("input[name=password]", "devpassword123");
await p.click("button[type=submit]");
await p.waitForURL(base + "/admin", { timeout: 15000 });
for (const path of ["/admin", "/admin/orders", "/admin/products", "/admin/settings", "/admin/creatives"]) {
  const r = await p.goto(base + path);
  console.log(path, r?.status(), (await p.locator("h1").first().textContent())?.trim());
  await p.screenshot({ path: `${process.env.SS}/admin${path.replace(/\//g, "_")}.png`, fullPage: true });
}
console.log("errors:", errs);
await b.close();
