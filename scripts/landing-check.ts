// Landing page interaction checks. Usage: tsx scripts/landing-check.ts [url]
import { chromium } from "playwright-core";
const url = process.argv[2] ?? "http://localhost:3000/";
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
let fails = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? "PASS" : "FAIL"} ${m}`); if (!c) fails++; };
for (const w of [390, 320, 1280]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 844 }, isMobile: w < 800, hasTouch: w < 800 });
  const host = new URL(url).hostname;
  await ctx.addCookies([{ name: "wp_age", value: "1", domain: host, path: "/" }, { name: "wp_consent", value: encodeURIComponent('{"v":1,"s":0,"m":0}'), domain: host, path: "/" }]);
  const p = await ctx.newPage();
  const errs: string[] = [];
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("console", (m) => m.type() === "error" && !m.text().includes("502") && errs.push(m.text().slice(0, 200)));
  await p.goto(url, { waitUntil: "networkidle" });
  const ov = await p.evaluate(() => ({ cw: document.documentElement.clientWidth, sw: document.documentElement.scrollWidth }));
  ok(ov.sw <= ov.cw, `${w}px no horizontal overflow (client ${ov.cw}, scroll ${ov.sw})`);
  if (w === 390) {
    await p.click('#bundles-top [data-qty="3"]');
    const pressed = await p.$$eval('[data-qty="3"]', (els) => els.map((e) => e.getAttribute("aria-pressed")));
    ok(pressed.every((x) => x === "true") && pressed.length === 2, "qty 3 synced in both groups");
    ok((await p.textContent("#oferta-final .summarytotal strong"))?.includes("117,05") ?? false, "summary total 117,05 €");
    ok((await p.textContent(".sticky small"))?.includes("3 caixas") ?? false, "sticky bar shows 3 caixas");
    ok(await p.$eval("#upgradebutton", (e) => (e as HTMLButtonElement).disabled), "upgrade disabled at 3");
    await p.click('#bundles-final [data-qty="1"]');
    ok((await p.textContent("#oferta-final .summarytotal strong"))?.includes("50,80") ?? false, "1 box total incl. shipping 50,80 €");
    const wa = await p.getAttribute(".supportline a", "href");
    ok(!!wa && wa.startsWith("https://wa.me/351910348577?text=") && decodeURIComponent(wa).includes("1 caixa"), "WhatsApp link prefilled");
    await p.click('button[aria-label="Fotografia anterior"]');
    ok((await p.textContent(".albumcontrols span"))?.startsWith("7 / 7") ?? false, "gallery prev wraps to 7/7");
    ok((await p.$eval("#galleryimage", (e) => getComputedStyle(e).objectFit)) === "contain", "guide uses contain");
    await p.click(".previewbutton");
    ok(await p.$eval("dialog", (d) => (d as HTMLDialogElement).open), "recipe dialog opens");
    await p.keyboard.press("Escape");
    ok(!(await p.$eval("dialog", (d) => (d as HTMLDialogElement).open)), "Escape closes dialog");
    await p.click('#bundles-top [data-qty="2"]');
    await p.click("#hero-cta button");
    await p.waitForTimeout(2500);
    ok((await p.textContent(".ordererror").catch(() => null)) !== null || p.url().includes("stripe"), "order button calls checkout (error shown without Stripe keys, or redirect)");
  }
  ok(errs.length === 0, `${w}px no console errors ${errs.length ? JSON.stringify(errs) : ""}`);
  await ctx.close();
}
// Exit-intent popup + promo code (desktop)
{
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const host = new URL(url).hostname;
  await ctx.addCookies([{ name: "wp_consent", value: encodeURIComponent('{"v":1,"s":0,"m":0}'), domain: host, path: "/" }]);
  const p = await ctx.newPage();
  await p.goto(url, { waitUntil: "networkidle" });
  await p.evaluate(() => document.dispatchEvent(new MouseEvent("mouseout", { clientY: 0, bubbles: true })));
  ok(!(await p.$eval(".exitdialog", (d) => (d as HTMLDialogElement).open)), "exit popup does not open before 15s");
  await p.waitForTimeout(15500);
  await p.evaluate(() => document.dispatchEvent(new MouseEvent("mouseout", { clientY: 0, bubbles: true })));
  ok(await p.$eval(".exitdialog", (d) => (d as HTMLDialogElement).open), "exit popup opens on exit intent after 15s");
  await p.fill("#exit-name", "Teste Lead");
  await p.fill("#exit-email", `lead${Date.now()}@example.com`);
  await p.check(".exitconsent input");
  await p.click(".exitform button[type=submit]");
  await p.waitForSelector(".exitcode", { timeout: 8000 });
  ok((await p.textContent(".exitcode"))?.trim() === "NATAL5", "popup shows code NATAL5");
  await p.click(".exitdialog .cta");
  await p.click('#bundles-final [data-qty="2"]');
  ok((await p.textContent("#oferta-final .summarytotal strong"))?.includes("78,49") ?? false, "2 boxes with code: total 78,49 €");
  await p.click('#bundles-final [data-qty="3"]');
  ok((await p.textContent("#oferta-final .summarytotal strong"))?.includes("117,05") ?? false, "3 boxes: code not applied (117,05 €)");
  await p.reload({ waitUntil: "networkidle" });
  await p.waitForTimeout(16000);
  await p.evaluate(() => document.dispatchEvent(new MouseEvent("mouseout", { clientY: 0, bubbles: true })));
  ok(!(await p.$eval(".exitdialog", (d) => (d as HTMLDialogElement).open)), "popup not shown again after a lead");
  ok((await p.textContent(".sticky small"))?.includes("NATAL5") ?? false, "code persists after reload");
  await ctx.close();
}

await b.close();
console.log(fails ? `${fails} FAILED` : "all landing checks passed");
process.exit(fails ? 1 : 0);
