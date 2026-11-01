// Black Friday Meta ads (Germany, Spain): feed 4:5 1080x1350 and story 9:16 1080x1920, same look as the page.
// Usage: tsx scripts/ads/render-bf.ts [outDir]   -> bf_<concept>_<de|es>_<4x5|9x16>.jpg (box, bottle) and
// bf_frame_<de|es>_<4x5|9x16>.png: the transparent-window frame laid over the harvest footage by scripts/ads/bf-video.sh.
// Only true claims: prices of 29/10/2026, delivery included, 6 Douro DOC wines (3 red, 2 white, 1 rosé), orders until
// 25/11 (delivery in 2 working days, before Black Friday 27/11). No reference price: the box was never sold at one.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const ROOT = resolve(import.meta.dirname, "../..");
const out = resolve(process.argv[2] ?? "public/ads");
const file = (p: string) => `file://${ROOT}/${p}`;

type Copy = { kicker: string; title: string; sub: string; price: string; per: string; ticks: string[]; deadline: string; cta: string; two: string; perBig: string; perSmall: string; six: string; direct: string; foot: string };
const COPY: Record<"de" | "es", Copy> = {
  de: {
    kicker: "Black Friday",
    title: "6 Flaschen Douro-Wein",
    sub: "3 Rotweine · 2 Weißweine · 1 Rosé",
    price: "68,50 €",
    per: "11,42 € pro Flasche · inkl. MwSt.",
    ticks: ["Gratisversand", "Lieferung in 2 Werktagen", "Douro DOC, direkt aus Portugal"],
    deadline: "Nur bis 25.11.",
    cta: "Jetzt sichern",
    two: "2 Boxen 129 € · 3 Boxen 185 €",
    perBig: "11,42 €",
    perSmall: "pro Flasche",
    six: "6 Flaschen",
    direct: "Vom Douro zu Ihnen",
    foot: "Lieferung in 2 Werktagen · inkl. MwSt.",
  },
  es: {
    kicker: "Black Friday",
    title: "6 botellas del Douro",
    sub: "3 tintos · 2 blancos · 1 rosado",
    price: "68,50 €",
    per: "11,42 € por botella · IVA incluido",
    ticks: ["Envío gratis", "Entrega en 2 días laborables", "Douro DOC, directo de Portugal"],
    deadline: "Solo hasta el 25/11",
    cta: "Comprar ahora",
    two: "2 cajas 129 € · 3 cajas 185 €",
    perBig: "11,42 €",
    perSmall: "por botella",
    six: "6 botellas",
    direct: "Del Douro a tu casa",
    foot: "Entrega en 2 días laborables · IVA incluido",
  },
};
const FORMATS = { "4x5": { w: 1080, h: 1350 }, "9x16": { w: 1080, h: 1920 } } as const;

// Party decoration: glossy black and red balloons on strings, and a little red/gold confetti. Placed per layout on
// the sides and corners only, never over the price or the copy.
type B = [x: number, y: number, size: number, color: "red" | "black", rot: number];
const balloon = ([x, y, w, color, rot]: B, i: number) => {
  const h = w * 1.22;
  const [c1, c2, c3] = color === "red" ? ["#ff7a82", "#e11d2a", "#7a0910"] : ["#6b6b6b", "#1b1b1b", "#000"];
  const id = `g${i}`;
  return `<svg style="position:absolute;left:${x}px;top:${y}px;transform:rotate(${rot}deg);transform-origin:50% 0;filter:drop-shadow(0 18px 22px rgba(0,0,0,.55))" width="${w}" height="${h + w * 1.3}" viewBox="0 0 100 ${(h + w * 1.3) / w * 100}">
    <defs><radialGradient id="${id}" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="${c1}"/><stop offset=".45" stop-color="${c2}"/><stop offset="1" stop-color="${c3}"/></radialGradient></defs>
    <path d="M50 ${h / w * 100 + 6} q-10 30 4 55 t-6 70" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="1.4"/>
    <ellipse cx="50" cy="${h / w * 50}" rx="48" ry="${h / w * 50 - 2}" fill="url(#${id})"/>
    <path d="M44 ${h / w * 100 - 3} L56 ${h / w * 100 - 3} L50 ${h / w * 100 + 7} Z" fill="${c3}"/>
    <ellipse cx="32" cy="${h / w * 28}" rx="10" ry="${h / w * 14}" fill="rgba(255,255,255,.55)" transform="rotate(-25 32 ${h / w * 28})"/>
  </svg>`;
};
const confetti = (w: number, h: number, zones: [x: number, y: number, zw: number, zh: number][], seed = 7) => {
  let r = seed;
  const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  return zones
    .flatMap(([zx, zy, zw, zh]) =>
      Array.from({ length: 14 }, () => {
        const c = rnd() < 0.5 ? "#e11d2a" : rnd() < 0.5 ? "#d4af37" : "#ffffff";
        return `<i style="position:absolute;left:${Math.round(zx + rnd() * zw)}px;top:${Math.round(zy + rnd() * zh)}px;width:${6 + Math.round(rnd() * 10)}px;height:${4 + Math.round(rnd() * 6)}px;background:${c};opacity:.85;transform:rotate(${Math.round(rnd() * 180)}deg);border-radius:2px"></i>`;
      }),
    )
    .join("");
};
const deco = (bs: B[], conf: [number, number, number, number][], w: number, h: number) => `<div style="position:absolute;inset:0;pointer-events:none;z-index:0">${confetti(w, h, conf)}${bs.map(balloon).join("")}</div>`;

const html = (c: Copy, f: keyof typeof FORMATS) => {
  const { w, h } = FORMATS[f];
  const story = f === "9x16";
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:Inter;src:url(${file("src/fonts/inter-latin-wght-normal.woff2")}) format("woff2");font-weight:100 900}
*{box-sizing:border-box;margin:0;padding:0}
body{width:${w}px;height:${h}px;overflow:hidden;font-family:Inter,sans-serif;color:#fff;background:#0b0b0b}
.ad>*:not(svg):not(div[style*="inset:0"]){position:relative;z-index:1}
.ad{position:relative;width:100%;height:100%;padding:${story ? "190px 70px 330px" : "64px 64px"};display:flex;flex-direction:column;align-items:center;text-align:center;
  background:radial-gradient(90% 55% at 50% ${story ? 48 : 52}%,rgba(225,29,42,.38),transparent 70%),#0b0b0b}
.top{width:100%;display:flex;justify-content:space-between;align-items:center;font-weight:800;letter-spacing:.14em;font-size:26px;color:#ffd6d9}
.bf{font-weight:900;font-size:${story ? 150 : 132}px;line-height:.9;letter-spacing:-.03em;margin-top:${story ? 40 : 18}px}
.bf span{color:#e11d2a}
.t{font-weight:850;font-size:${story ? 64 : 58}px;margin-top:18px;letter-spacing:-.01em}
.s{font-weight:600;font-size:32px;color:#d9d9d9;margin-top:8px}
.img{flex:1;width:100%;min-height:0;margin:${story ? 34 : 22}px 0;-webkit-mask-image:linear-gradient(#000 78%,transparent);background:url(${file("public/lp/bf/bottles-cut.webp")}) center/contain no-repeat,radial-gradient(closest-side,rgba(225,29,42,.35),transparent) center/80% 90% no-repeat;filter:drop-shadow(0 30px 40px rgba(0,0,0,.6))}
.price{font-weight:900;font-size:${story ? 150 : 128}px;line-height:1;color:#fff;letter-spacing:-.03em}
.per{font-weight:600;font-size:30px;color:#d9d9d9;margin-top:10px}
.two{font-weight:700;font-size:30px;color:#ffd6d9;margin-top:8px}
.ticks{display:flex;flex-wrap:wrap;justify-content:center;gap:12px 16px;margin-top:${story ? 34 : 22}px}
.ticks span{border:2px solid rgba(255,255,255,.25);border-radius:999px;padding:10px 20px;font-weight:700;font-size:27px}
.ticks span:before{content:"✓ ";color:#e11d2a;font-weight:900}
.cta{margin-top:${story ? 40 : 26}px;display:flex;gap:18px;align-items:center}
.btn{background:#e11d2a;border-radius:16px;padding:22px 44px;font-weight:900;font-size:38px;text-transform:uppercase;letter-spacing:.02em;box-shadow:0 10px 30px rgba(225,29,42,.45)}
.dl{font-weight:800;font-size:32px;color:#ffd6d9}
</style></head><body><div class="ad">${deco(story ? [[-40, 640, 190, "red", -8], [100, 830, 130, "black", 6], [930, 600, 190, "black", 8], [845, 860, 130, "red", -6], [-30, 40, 140, "black", -10], [965, 30, 140, "red", 10]] : [[-30, 330, 170, "red", -8], [90, 490, 120, "black", 6], [930, 300, 170, "black", 8], [860, 520, 115, "red", -6]], story ? [[0, 560, 220, 700], [860, 560, 220, 700]] : [[0, 250, 200, 520], [880, 250, 200, 520]], w, h)}
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

const FONT = `@font-face{font-family:Inter;src:url(${file("src/fonts/inter-latin-wght-normal.woff2")}) format("woff2");font-weight:100 900}`;

// Bottles up close: the price per bottle is the message.
const bottle = (c: Copy, f: keyof typeof FORMATS) => {
  const { w, h } = FORMATS[f];
  const story = f === "9x16";
  return `<!doctype html><html><head><meta charset="utf-8"><style>${FONT}
*{box-sizing:border-box;margin:0;padding:0}
body{width:${w}px;height:${h}px;overflow:hidden;font-family:Inter,sans-serif;color:#fff;background:#0b0b0b}
.ad{position:relative;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;text-align:center;padding:${story ? "200px 60px 320px" : "56px 60px"}}
.ad>.bf,.ad>.s,.ad>.big,.ad>.small,.ad>.mix,.ad>.row{z-index:2}
.photo{position:absolute;left:30px;right:30px;top:${story ? 560 : 290}px;height:${story ? 760 : 600}px;background:url(${file("public/lp/bf/bottles-cut.webp")}) center/contain no-repeat;-webkit-mask-image:linear-gradient(#000 80%,transparent);filter:drop-shadow(0 20px 40px rgba(225,29,42,.35))}
.glow{position:absolute;left:0;right:0;top:${story ? 560 : 290}px;height:${story ? 760 : 600}px;background:radial-gradient(50% 50% at 50% 55%,rgba(225,29,42,.45),transparent 70%)}
.bf{position:relative;font-weight:900;font-size:${story ? 120 : 96}px;letter-spacing:-.03em;line-height:.9}.bf span{color:#e11d2a}
.s{position:relative;font-weight:700;font-size:34px;color:#ffd6d9;margin-top:16px;letter-spacing:.04em;text-transform:uppercase}
.spacer{flex:1}
.big{position:relative;font-weight:900;font-size:${story ? 190 : 170}px;line-height:.9;letter-spacing:-.04em}
.small{position:relative;font-weight:800;font-size:44px;margin-top:6px}
.mix{position:relative;font-weight:600;font-size:32px;color:#d9d9d9;margin-top:18px}
.row{position:relative;display:flex;gap:16px;margin-top:${story ? 34 : 24}px;align-items:center}
.pill{background:#e11d2a;border-radius:999px;padding:14px 28px;font-weight:900;font-size:32px}
.pill.ghost{background:transparent;border:2px solid rgba(255,255,255,.35)}
</style></head><body><div class="ad">${deco(story ? [[-50, 20, 150, "red", -12], [970, 10, 150, "black", 12], [-40, 1380, 170, "black", -8], [950, 1400, 170, "red", 8]] : [[-20, 10, 150, "red", -10], [950, 0, 150, "black", 10], [-30, 1000, 160, "black", -8], [950, 1010, 160, "red", 8]], story ? [[0, 0, 1080, 180], [0, 1350, 240, 300], [840, 1350, 240, 300]] : [[0, 0, 1080, 280], [0, 950, 220, 400], [860, 950, 220, 400]], w, h)}
  <div class="glow"></div>
  <div class="photo"></div>
  <div class="bf"><span>BLACK</span> FRIDAY</div>
  <div class="s">${c.direct}</div>
  <div class="spacer"></div>
  <div class="big">${c.perBig}</div>
  <div class="small">${c.perSmall}</div>
  <div class="mix">${c.sub} · ${c.price}</div>
  <div class="row"><span class="pill">${c.deadline}</span><span class="pill ghost">${c.ticks[0]}</span></div>
</div></body></html>`;
};

// Frame for the harvest video (same layout as the winning vineyard ad): the footage shows through a transparent window.
export const WINDOW = { "4x5": { x: 44, y: 170, w: 576, h: 1022 }, "9x16": { x: 180, y: 400, w: 720, h: 1278 } } as const;
const frame = (c: Copy, f: keyof typeof FORMATS) => {
  const { w, h } = FORMATS[f];
  const win = WINDOW[f];
  const story = f === "9x16";
  const side = story
    ? `<div style="position:absolute;left:0;right:0;top:110px;text-align:center">
         <div class="bf" style="font-size:96px"><span>BLACK</span> FRIDAY</div>
         <div class="t" style="font-size:56px;margin-top:12px">${c.title} · ${c.price}</div>
         <div class="s" style="margin-top:8px">${c.sub} · ${c.ticks[0]}</div></div>
       <div class="bottles" style="position:absolute;right:24px;top:${win.y + 24}px;width:400px;height:280px"></div>
       <div style="position:absolute;left:0;right:0;top:${win.y + win.h + 34}px;text-align:center">
         <div class="s" style="font-size:34px;color:#fff;font-weight:800">${c.per}</div>
         <div class="pill" style="display:inline-block;margin-top:16px">${c.deadline}</div></div>`
    : `<div style="position:absolute;left:0;right:0;top:40px;text-align:center"><div class="bf" style="font-size:92px"><span>BLACK</span> FRIDAY</div></div>
       <div style="position:absolute;left:650px;right:30px;top:${win.y + 10}px;text-align:center">
         <div class="kick">${c.direct}</div>
         <div class="t" style="font-size:54px;margin-top:22px;line-height:1.05">${c.title}</div>
         <div class="price">${c.price}</div>
         <div class="bottles" style="width:100%;height:250px;margin-top:18px"></div>
         <div class="s" style="margin-top:14px;font-size:23px;white-space:nowrap">${c.sub}</div>
         <div class="s" style="margin-top:20px;color:#fff;font-weight:800;font-size:30px">${c.perBig} ${c.perSmall}</div>
         <div class="s" style="margin-top:6px;font-size:25px">${c.ticks[0]}</div>
         <div class="s" style="margin-top:4px;font-size:25px;white-space:nowrap">${c.two}</div>
         <div class="pill" style="display:inline-block;margin-top:26px">${c.deadline}</div></div>
       <div style="position:absolute;left:0;right:0;top:${win.y + win.h + 30}px;text-align:center" class="s">${c.foot}</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${FONT}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:transparent}
body{width:${w}px;height:${h}px;overflow:hidden;font-family:Inter,sans-serif;color:#fff}
.win{position:absolute;left:${win.x}px;top:${win.y}px;width:${win.w}px;height:${win.h}px;border:6px solid #e11d2a;border-radius:6px;box-shadow:0 0 0 4000px #0b0b0b}
.bf{font-weight:900;letter-spacing:-.03em;line-height:.9}.bf span{color:#e11d2a}
.t{font-weight:850;letter-spacing:-.01em}
.price{font-weight:900;font-size:100px;letter-spacing:-.03em;margin-top:6px;line-height:1}
.s{font-weight:600;font-size:28px;color:#d9d9d9}
.kick{display:inline-block;border:2px solid #e11d2a;border-radius:999px;padding:8px 18px;font-weight:800;font-size:24px;letter-spacing:.08em;text-transform:uppercase;color:#ffd6d9}
.bottles{-webkit-mask-image:linear-gradient(#000 80%,transparent);background:url(${file("public/lp/bf/bottles-cut.webp")}) center/contain no-repeat;filter:drop-shadow(0 18px 24px rgba(0,0,0,.7))}
.pill{background:#e11d2a;border-radius:999px;padding:14px 30px;font-weight:900;font-size:32px}
.banner{position:absolute;left:${win.x}px;width:${win.w}px;top:${win.y + win.h - (story ? 150 : 120)}px;text-align:center}
.banner span{display:inline-block;background:#e11d2a;color:#fff;font-weight:900;font-size:${story ? 58 : 48}px;padding:12px 26px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.5);letter-spacing:-.01em}
</style></head><body><div class="win"></div>${deco(story ? [[-30, 20, 140, "black", -10], [970, 20, 140, "red", 10], [-20, 520, 170, "red", -6], [30, 900, 140, "black", 6], [920, 820, 160, "black", 8], [950, 1150, 130, "red", -6]] : [[-30, -40, 130, "red", -10], [960, -30, 130, "black", 10], [960, 1120, 130, "red", 8]], story ? [[0, 380, 180, 1300], [900, 380, 180, 1300]] : [[0, 0, 1080, 150]], w, h)}${side}<div class="banner"><span>${c.six} · ${c.price}</span></div></body></html>`;
};

mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
const CONCEPTS = { box: html, bottle, frame } as const;
for (const loc of ["de", "es"] as const) {
  for (const f of Object.keys(FORMATS) as (keyof typeof FORMATS)[]) for (const [concept, make] of Object.entries(CONCEPTS)) {
    const { w, h } = FORMATS[f];
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    // Loaded from a file (not setContent) so the page may read the local photo and font.
    const tmp = resolve(out, `.bf_${concept}_${loc}_${f}.html`);
    writeFileSync(tmp, make(COPY[loc], f));
    await page.goto(`file://${tmp}`, { waitUntil: "load" });
    await page.waitForTimeout(300);
    const png = concept === "frame";
    const buf = await page.screenshot(png ? { type: "png", omitBackground: true } : { type: "jpeg", quality: 90 });
    const name = `bf_${concept}_${loc}_${f}.${png ? "png" : "jpg"}`;
    writeFileSync(resolve(out, name), buf);
    console.log(name);
    await page.close();
    rmSync(tmp);
  }
}
await browser.close();
