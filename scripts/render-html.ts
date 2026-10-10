// Renders a local HTML file to PNG with headless Chromium. Usage: tsx scripts/render-html.ts <in.html> <out.png> <width> <height>
import { chromium } from "playwright-core";
import { resolve } from "node:path";

const [input, output, w = "1200", h = "630"] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) } });
await page.goto("file://" + resolve(input));
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: output });
await browser.close();
console.log("rendered", output);
