// Black Friday Meta ads (Germany, Spain): feed 4:5 1080x1350 and story 9:16 1080x1920, same look as the page.
// Usage: tsx scripts/ads/render-bf.ts [outDir]   -> bf_<concept>_<de|es>_<4x5|9x16>.jpg
// Only true claims: prices of 29/10/2026, delivery included, 6 Douro DOC wines (3 red, 2 white, 1 rosé), orders until
// 25/11 (delivery in 2 working days, before Black Friday 27/11). No reference price: the box was never sold at one.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const ROOT = resolve(import.meta.dirname, "../..");
const out = resolve(process.argv[2] ?? "public/ads");
const file = (p: string) => `file://${ROOT}/${p}`;

type Copy = { kicker: string; title: string; sub: string; price: string; per: string; ticks: string[]; deadline: string; cta: string; two: string };
const COPY: Record<"de" | "es", Copy> = {
  de: {
    kicker: "Black Friday",
    title: "6 Douro-Weine",
    sub: "3 Rotweine · 2 Weißweine · 1 Rosé",
    price: "68,50 €",
    per: "11,42 € pro Flasche · inkl. MwSt.",
    ticks: ["Gratisversand", "Lieferung in 2 Werktagen", "Douro DOC, direkt aus Portugal"],
    deadline: "Nur bis 25.11.",
    cta: "Jetzt sichern",
    two: "2 Boxen 129 € · 3 Boxen 185 €",
  },
  es: {
    kicker: "Black Friday",
    title: "6 vinos del Douro",
    sub: "3 tintos · 2 blancos · 1 rosado",
    price: "68,50 €",
    per: "11,42 € por botella · IVA incluido",
    ticks: ["Envío gratis", "Entrega en 2 días laborables", "Douro DOC, directo de Portugal"],
    deadline: "Solo hasta el 25/11",
    cta: "Comprar ahora",
    two: "2 cajas 129 € · 3 cajas 185 €",
  },
};
const FORMATS = { "4x5": { w: 1080, h: 1350 }, "9x16": { w: 1080, h: 1920 } } as const;

const html = (c: Copy, f: keyof typeof FORMATS) => {
  const { w, h } = FORMATS[f];
  const story = f === "9x16";
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Inter;src:url(${file("src/fonts/inter-latin-wght-normal.woff2")}) format("woff2");font-weight:100 900}
*{box-sizing:border-box;margin:0;padding:0}
body{width:${w}px;height:${h}px;overflow:hidden;font-family:Inter,sans-serif;color:#fff;background:#0b0b0b}
.ad{position:relative;width:100%;height:100%;padding:${story ? "190px 70px 330px" : "64px 64px"};display:flex;flex-direction:column;align-items:center;text-align:center;
  background:radial-gradient(90% 55% at 50% ${story ? 48 : 52}%,rgba(225,29,42,.38),transparent 70%),#0b0b0b}
.top{width:100%;display:flex;justify-content:space-between;align-items:center;font-weight:800;letter-spacing:.14em;font-size:26px;color:#ffd6d9}
.bf{font-weight:900;font-size:${story ? 150 : 132}px;line-height:.9;letter-spacing:-.03em;margin-top:${story ? 40 : 18}px}
.bf span{color:#e11d2a}
.t{font-weight:850;font-size:${story ? 64 : 58}px;margin-top:18px;letter-spacing:-.01em}
.s{font-weight:600;font-size:32px;color:#d9d9d9;margin-top:8px}
.img{flex:1;width:100%;min-height:0;margin:${story ? 34 : 22}px 0;background:url(${file("public/lp/bf/bottles.webp")}) center/contain no-repeat;filter:drop-shadow(0 30px 40px rgba(0,0,0,.6))}
.price{font-weight:900;font-size:${story ? 150 : 128}px;line-height:1;color:#fff;letter-spacing:-.03em}
.per{font-weight:600;font-size:30px;color:#d9d9d9;margin-top:10px}
.two{font-weight:700;font-size:30px;color:#ffd6d9;margin-top:8px}
.ticks{display:flex;flex-wrap:wrap;justify-content:center;gap:12px 16px;margin-top:${story ? 34 : 22}px}
.ticks span{border:2px solid rgba(255,255,255,.25);border-radius:999px;padding:10px 20px;font-weight:700;font-size:27px}
.ticks span:before{content:"✓ ";color:#e11d2a;font-weight:900}
.cta{margin-top:${story ? 40 : 26}px;display:flex;gap:18px;align-items:center}
.btn{background:#e11d2a;border-radius:16px;padding:22px 44px;font-weight:900;font-size:38px;text-transform:uppercase;letter-spacing:.02em;box-shadow:0 10px 30px rgba(225,29,42,.45)}
.dl{font-weight:800;font-size:32px;color:#ffd6d9}
</style></head><body><div class="ad">
  <div class="top"><span>WINE-PORTUGAL.COM</span><span>🔥 ${c.deadline.toUpperCase()}</span></div>
  <div class="bf"><span>BLACK</span> FRIDAY</div>
  <div class="t">${c.title}</div>
  <div class="s">${c.sub}</div>
  <div class="img"></div>
  <div class="price">${c.price}</div>
  <div class="per">${c.per}</div>
  <div class="two">${c.two}</div>
  <div class="ticks">${c.ticks.map((t) => `<span>${t}</span>`).join("")}</div>
  <div class="cta"><span class="btn">${c.cta}</span></div>
</div></body></html>`;
};

mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
for (const loc of ["de", "es"] as const) {
  for (const f of Object.keys(FORMATS) as (keyof typeof FORMATS)[]) {
    const { w, h } = FORMATS[f];
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    // Loaded from a file (not setContent) so the page may read the local photo and font.
    const tmp = resolve(out, `.bf_${loc}_${f}.html`);
    writeFileSync(tmp, html(COPY[loc], f));
    await page.goto(`file://${tmp}`, { waitUntil: "load" });
    await page.waitForTimeout(300);
    const buf = await page.screenshot({ type: "jpeg", quality: 90 });
    const name = `bf_box_${loc}_${f}.jpg`;
    writeFileSync(resolve(out, name), buf);
    console.log(name);
    await page.close();
    rmSync(tmp);
  }
}
await browser.close();
