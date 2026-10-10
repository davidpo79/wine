// Usage: tsx scripts/screenshot.ts <url> <outDir> [--gates]
// Full-page screenshots at 390px (mobile) and 1440px (desktop). By default the age gate and cookie banner are pre-answered.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const [url = "http://localhost:3000/", out = "screenshots"] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const showGates = process.argv.includes("--gates");
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
for (const [name, width, height, mobile] of [["mobile-390", 390, 844, true], ["desktop-1440", 1440, 900, false]] as const) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile });
  if (!showGates) {
    const u = new URL(url);
    await ctx.addCookies([
      { name: "wp_age", value: "1", domain: u.hostname, path: "/" },
      { name: "wp_consent", value: encodeURIComponent(JSON.stringify({ v: 1, s: 0, m: 0 })), domain: u.hostname, path: "/" },
    ]);
  }
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const suffix = showGates ? "-gates" : "";
  await page.screenshot({ path: `${out}/${name}${suffix}-fold.png` });
  if (!showGates) await page.screenshot({ path: `${out}/${name}-full.png`, fullPage: true });
  await ctx.close();
}
await browser.close();
console.log("screenshots in", out);
