// Static Meta ads (feed 4:5 1080x1350 and story 9:16 1080x1920) rendered from HTML with the real product photos.
// Usage: ADS_LOCALE=pt|ru|de tsx scripts/ads/render.ts [outDir] [conceptKey...]   (ru/de files get a _ru/_de suffix)
// Copy rules: pt-PT, no em-dashes, only true claims (prices, -15% on 3 boxes, free shipping from 2 boxes, card +3,90 €,
// orders until 30/11 for delivery before Christmas, CTT 2 to 4 working days, mainland Portugal).
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { CONCEPTS, type Concept } from "./concepts";
import { AD_LOCALES, AD_STRINGS, localizedConcepts, type AdLocale } from "./i18n";
import { LOGO_PATH, LOGO_VIEWBOX } from "../../src/lib/logo-path";

const ROOT = resolve(import.meta.dirname, "../..");
const out = resolve(process.argv[2] ?? "ads-out");
const only = process.argv.slice(3);
const img = (n: string) => `file://${ROOT}/public/lp/${n}`;
const font = (n: string) => `file://${ROOT}/src/fonts/${n}`;
const LOCALE = (process.env.ADS_LOCALE ?? "pt") as AdLocale;
if (!AD_LOCALES.includes(LOCALE)) throw new Error(`ADS_LOCALE must be one of ${AD_LOCALES.join(", ")}`);
const T = AD_STRINGS[LOCALE];
const suffix = LOCALE === "pt" ? "" : `_${LOCALE}`;
const CYR = "U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116";

// Story: Meta puts the profile on top and the CTA at the bottom; keep this much clear.
const SAFE_BOTTOM = 300;
const FORMATS = { feed: { w: 1080, h: 1350 }, story: { w: 1080, h: 1920 } } as const;
type Format = keyof typeof FORMATS;

const CSS = `
@font-face{font-family:Inter;src:url(${font("inter-latin-wght-normal.woff2")}) format("woff2");font-weight:100 900}
@font-face{font-family:Cormorant;src:url(${font("cormorant-garamond-latin-600-normal.woff2")});font-weight:600}
@font-face{font-family:Cormorant;src:url(${font("cormorant-garamond-latin-700-normal.woff2")});font-weight:700}
@font-face{font-family:Cormorant;src:url(${font("cormorant-garamond-latin-500-italic.woff2")});font-style:italic;font-weight:500}
@font-face{font-family:Caveat;src:url(${font("caveat-latin-600-normal.woff2")});font-weight:600}
@font-face{font-family:Inter;src:url(${font("inter-cyrillic-wght-normal.woff2")}) format("woff2");font-weight:100 900;unicode-range:${CYR}}
@font-face{font-family:Cormorant;src:url(${font("cormorant-garamond-cyrillic-600-normal.woff2")});font-weight:600;unicode-range:${CYR}}
@font-face{font-family:Cormorant;src:url(${font("cormorant-garamond-cyrillic-700-normal.woff2")});font-weight:700;unicode-range:${CYR}}
@font-face{font-family:Cormorant;src:url(${font("cormorant-garamond-cyrillic-500-italic.woff2")});font-style:italic;font-weight:500;unicode-range:${CYR}}
@font-face{font-family:Caveat;src:url(${font("caveat-cyrillic-600-normal.woff2")});font-weight:600;unicode-range:${CYR}}
*{box-sizing:border-box;margin:0;padding:0}
:root{--red:#a72d39;--red2:#71202b;--deep:#4a1219;--gold:#c19d55;--gold2:#e9d9b0;--cream:#fbf7ee;--ink:#202b25;--green:#102d21}
body{width:var(--w);height:var(--h);overflow:hidden;font-family:Inter,sans-serif;color:var(--ink);background:var(--cream)}
.ad{position:relative;width:100%;height:100%;overflow:hidden}
.serif{font-family:Cormorant,serif}
.bgimg{position:absolute;inset:0;background-size:cover;background-position:center}
.shade{position:absolute;inset:0}
.redbg{background:radial-gradient(120% 80% at 50% 35%,#b8323f 0%,var(--red) 35%,var(--red2) 75%,var(--deep) 100%)}
.sparkles{position:absolute;inset:0;background-image:radial-gradient(circle,rgba(233,217,176,.55) 1.5px,transparent 2px),radial-gradient(circle,rgba(233,217,176,.35) 1px,transparent 1.5px);background-size:140px 140px,90px 90px;background-position:20px 30px,60px 80px;opacity:.6}
.kicker{display:inline-block;font-weight:800;letter-spacing:.12em;text-transform:uppercase;font-size:30px}
.h1{font-weight:850;line-height:1.02;letter-spacing:-.02em}
.sub{font-weight:500;line-height:1.25}
.ticks{list-style:none;display:grid;gap:14px}
.ticks li{display:flex;align-items:center;gap:16px;font-weight:650;font-size:36px;line-height:1.15}
.small .ticks{gap:10px}.small .ticks li{font-size:31px}.small .ticks li:before{flex-basis:34px;height:34px;background-size:22px}
.ticks li:before{content:"";flex:0 0 40px;height:40px;border-radius:50%;background:var(--gold) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M5 12.5l4.2 4.2L19 7' fill='none' stroke='%23fff' stroke-width='3.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/26px no-repeat}
.sticker{position:absolute;width:300px;height:300px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#f3e6c2,var(--gold) 55%,#a8843f);color:var(--deep);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;box-shadow:0 18px 40px rgba(0,0,0,.35);transform:rotate(-8deg);border:6px solid rgba(255,255,255,.55)}
.sticker .s1{font-weight:800;font-size:28px;text-transform:uppercase;letter-spacing:.06em}
.sticker .s2{font-weight:900;font-size:86px;line-height:.95;letter-spacing:-.03em}
.sticker .s2 small{font-size:44px}
.sticker .s3{font-weight:750;font-size:26px}
.chip{display:inline-flex;align-items:center;gap:10px;background:var(--gold);color:var(--deep);font-weight:850;border-radius:999px;padding:10px 24px;font-size:32px}
.strip{position:absolute;left:0;right:0;display:flex;align-items:center;justify-content:center;gap:18px;background:var(--green);color:var(--cream);font-weight:750;font-size:34px;letter-spacing:.01em}
.strip b{color:var(--gold2)}
.cta{display:inline-flex;align-items:center;gap:14px;background:var(--gold);color:var(--deep);font-weight:900;font-size:40px;border-radius:16px;padding:22px 44px;box-shadow:0 10px 24px rgba(0,0,0,.25)}
.logo{font-family:Cormorant,serif;font-weight:700;letter-spacing:.18em;text-transform:uppercase;font-size:30px}
.card{position:absolute;background:#fffdf7;border-radius:10px;box-shadow:0 24px 60px rgba(0,0,0,.45);padding:52px 56px;border:10px solid var(--red);outline:3px solid var(--gold);outline-offset:-22px}
.card .t{font-family:Cormorant,serif;font-weight:700;color:var(--red);text-align:center;font-size:58px}
.card .t2{font-family:Cormorant,serif;font-style:italic;color:var(--gold);text-align:center;font-size:30px;margin-top:-4px}
.card .msg{font-family:Caveat,cursive;font-weight:600;color:#2a2a2a;font-size:54px;line-height:1.15;margin-top:26px;text-align:center}
.strike{position:relative;color:rgba(255,255,255,.75)}
.strike:after{content:"";position:absolute;left:-4%;right:-4%;top:52%;height:4px;background:currentColor;transform:rotate(-8deg)}
`;

// Official Wine Portugal logo (vector), in gold for dark and photo backgrounds.
const logo = (h: number) =>
  `<svg height="${h}" viewBox="${LOGO_VIEWBOX}" style="display:block" aria-label="Wine Portugal"><defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f8ecc8"/><stop offset="1" stop-color="#d2ae66"/></linearGradient></defs><path fill="url(#lg)" fill-rule="evenodd" d="${LOGO_PATH}"/></svg>`;
const ticks = (items: string[]) => `<ul class="ticks">${items.map((t) => `<li>${t}</li>`).join("")}</ul>`;
// Trust (research: buying from a new shop seen on social media is the main barrier in Portugal).
const trust = (color: string) => `<div style="margin-top:26px;font-weight:650;font-size:30px;color:${color}">${T.trust}</div>`;
const sticker = (pos: string, [top, price, bottom] = T.sticker) =>
  `<div class="sticker" style="${pos}"><div class="s1">${top}</div><div class="s2">${price}</div><div class="s3">${bottom}</div></div>`;

function layout(c: Concept, f: Format) {
  const story = f === "story";
  // Story: keep key content out of the top ~250px and the bottom ~400px (Instagram UI).
  const top = story ? 360 : 130; // below the logo
  const logoTop = story ? 250 : 36;
  const centeredLogo = `<div style="position:absolute;left:0;right:0;top:${logoTop}px;display:flex;justify-content:center;filter:drop-shadow(0 3px 8px rgba(0,0,0,.35))">${logo(story ? 92 : 78)}</div>`;
  const stripH = story ? 0 : 92;
  const deadline = T.deadlineStrip;
  const stripHtml = story
    ? `<div class="strip" style="bottom:${SAFE_BOTTOM}px;left:60px;right:60px;border-radius:18px;height:96px">${deadline}</div>`
    : `<div class="strip" style="bottom:0;height:${stripH}px">${deadline}</div>`;

  switch (c.layout) {
    case "photo": {
      // Lifestyle photo on top, cream panel with the message below.
      const photoH = story ? 860 : 640;
      return `
      <div class="bgimg" style="height:${photoH}px;background-image:url(${img(c.photo!)});background-position:${c.photoPos ?? "center"}"></div>
      <div class="shade" style="height:${photoH}px;background:linear-gradient(180deg,rgba(0,0,0,.45) 0%,rgba(0,0,0,0) 30%,rgba(0,0,0,0) 70%,rgba(251,247,238,1) 100%)"></div>
      ${c.logoRight && story ? "" /* the box logo fills the narrow story photo; a second one would sit next to it */ : `<div style="position:absolute;${c.logoRight ? "right" : "left"}:56px;top:${logoTop}px;filter:drop-shadow(0 3px 10px rgba(0,0,0,.55))">${logo(story ? 92 : 78)}</div>`}
      ${sticker(`right:50px;top:${photoH - 300}px`)}
      <div style="position:absolute;left:60px;right:60px;top:${photoH + (story ? 30 : 10)}px">
        <div class="kicker" style="color:var(--red)">${c.kicker}</div>
        <div class="h1" style="font-size:${story ? 90 : 78}px;margin-top:12px;color:var(--deep)">${c.headline}</div>
        <div class="sub" style="font-size:${story ? 38 : 33}px;margin-top:14px;color:#3d463f">${c.sub}</div>
        <div style="margin-top:${story ? 30 : 22}px" class="${story ? "" : "small"}">${ticks(c.ticks)}</div>
        ${story ? trust("#5f6a60") : ""}
      </div>
      ${stripHtml}`;
    }
    case "cutout": {
      // The box on a red Christmas background.
      const boxW = story ? 680 : 560;
      const boxTop = story ? 730 : 340;
      return `
      <div class="shade redbg"></div><div class="sparkles"></div>${centeredLogo}
      <div style="position:absolute;left:0;right:0;top:${top}px;text-align:center;color:#fff;padding:0 60px">
        <div class="kicker" style="color:var(--gold2)">${c.kicker}</div>
        <div class="h1" style="font-size:${story ? 96 : 82}px;margin-top:12px">${c.headline}</div>
        ${story ? `<div class="sub" style="font-size:40px;margin-top:18px;color:#f6e9e9">${c.sub}</div>` : ""}
      </div>
      <img src="${img("box-cutout.webp")}" style="position:absolute;left:${story ? 70 : 40}px;top:${boxTop}px;width:${boxW}px;filter:drop-shadow(0 30px 40px rgba(0,0,0,.45))">
      ${sticker(story ? "right:50px;top:840px" : "right:46px;top:370px")}
      <div style="position:absolute;right:60px;left:${story ? 600 : 610}px;top:${story ? 1160 : 710}px;color:#fff">${ticks(c.ticks).replace('class="ticks"', 'class="ticks" style="gap:18px"')}</div>
      ${story ? `<div style="position:absolute;left:60px;right:60px;top:1458px;text-align:center">${trust("#f3dede")}</div>` : ""}
      ${stripHtml}`;
    }
    case "card": {
      // A mock of the printed card with a handwritten message, on a warm photo.
      return `
      <div class="bgimg" style="background-image:url(${img(c.photo!)});background-position:${c.photoPos ?? "center"};filter:blur(2px) brightness(.55)"></div>${centeredLogo}
      <div style="position:absolute;left:0;right:0;top:${top}px;text-align:center;color:#fff;padding:0 60px">
        <div class="kicker" style="color:var(--gold2)">${c.kicker}</div>
        <div class="h1" style="font-size:${story ? 88 : 76}px;margin-top:12px">${c.headline}</div>
      </div>
      <div class="card" style="left:${story ? 130 : 150}px;right:${story ? 130 : 150}px;top:${story ? 690 : 410}px;transform:rotate(-3deg)">
        <div class="t">${T.cardTitle}</div><div class="t2">${T.cardSubtitle}</div>
        <div class="msg">${c.cardMessage}</div>
      </div>
      <div style="position:absolute;left:60px;right:60px;top:${story ? 1260 : 1010}px;text-align:center;color:#fff">
        <div class="sub" style="font-size:${story ? 40 : 36}px">${c.sub}</div>
        <div class="chip" style="margin-top:22px">${c.chip}</div>
      </div>
      ${stripHtml}`;
    }
    case "trio": {
      // Four boxes: four gifts in one order, one of them offered.
      const w = story ? 330 : 300;
      const y = story ? 800 : 490;
      const step = (1040 - w) / 3;
      return `
      <div class="shade redbg"></div><div class="sparkles"></div>${centeredLogo}
      <div style="position:absolute;left:0;right:0;top:${top}px;text-align:center;color:#fff;padding:0 60px">
        <div class="kicker" style="color:var(--gold2)">${c.kicker}</div>
        <div class="h1" style="font-size:${story ? 96 : 84}px;margin-top:12px">${c.headline}</div>
      </div>
      ${[0, 1, 2, 3].map((i) => `<img src="${img("box-cutout.webp")}" style="position:absolute;top:${y + (i === 1 || i === 2 ? 0 : 50)}px;left:${20 + i * step}px;width:${w}px;z-index:${i === 1 || i === 2 ? 2 : 1};filter:drop-shadow(0 24px 30px rgba(0,0,0,.45))">`).join("")}
      <div style="position:absolute;left:60px;right:60px;top:${story ? 1230 : 860}px;text-align:center;color:#fff;z-index:3">
        <div style="font-weight:900;font-size:${story ? 120 : 104}px;letter-spacing:-.03em;line-height:1">149,70 € <span style="font-size:.45em;font-weight:750">${T.forFour}</span></div>
        <div class="sub" style="font-size:${story ? 40 : 36}px;margin-top:14px"><span class="strike">199,60 €</span> &nbsp;·&nbsp; ${c.sub}</div>
      </div>
      ${stripHtml}`;
    }
    case "deadline": {
      return `
      <div class="bgimg" style="background-image:url(${img(c.photo!)});background-position:${c.photoPos ?? "center"};filter:brightness(.5)"></div>${centeredLogo}
      <div style="position:absolute;left:0;right:0;top:${top}px;text-align:center;color:#fff;padding:0 60px">
        <div class="kicker" style="color:var(--gold2)">${c.kicker}</div>
        <div class="h1" style="font-size:${story ? 100 : 90}px;margin-top:12px">${c.headline}</div>
      </div>
      <div style="position:absolute;left:50%;top:${story ? 720 : 400}px;transform:translateX(-50%);width:${story ? 520 : 460}px;background:#fff;border-radius:28px;overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.5);text-align:center">
        <div style="background:var(--red);color:#fff;font-weight:850;font-size:40px;padding:18px 0;letter-spacing:.1em">${T.month}</div>
        <div style="font-weight:900;font-size:${story ? 230 : 200}px;line-height:1.05;color:var(--deep);letter-spacing:-.04em">30</div>
        <div style="font-weight:700;font-size:32px;color:#555;padding-bottom:22px">${T.lastDay}</div>
      </div>
      <div style="position:absolute;left:60px;right:60px;top:${story ? 1270 : 890}px;color:#fff;display:flex;justify-content:center">${ticks(c.ticks)}</div>
      ${story ? "" : `<div class="strip" style="bottom:0;height:${stripH}px">${T.deadlineFeedStrip}</div>`}
      ${story ? `<div class="strip" style="bottom:${SAFE_BOTTOM}px;left:60px;right:60px;border-radius:18px;height:96px">${T.deadlineStoryStrip}</div>` : ""}`;
    }
  }
}

function html(c: Concept, f: Format) {
  const { w, h } = FORMATS[f];
  return `<!doctype html><html lang="${LOCALE}"><head><meta charset="utf-8"><style>:root{--w:${w}px;--h:${h}px}${CSS}</style></head><body><div class="ad">${layout(c, f)}</div></body></html>`;
}

mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const c of localizedConcepts(CONCEPTS, LOCALE).filter((x) => !only.length || only.includes(x.key))) {
  for (const f of Object.keys(FORMATS) as Format[]) {
    const { w, h } = FORMATS[f];
    const p = await b.newPage({ viewport: { width: w, height: h } });
    const file = `${out}/${c.key}${suffix}_${f}.html`;
    writeFileSync(file, html(c, f));
    await p.goto(`file://${file}`);
    await p.evaluate("document.fonts.ready");
    await p.waitForTimeout(200);
    await p.screenshot({ path: `${out}/${c.key}${suffix}_${f === "feed" ? "4x5" : "9x16"}.png` });
    await p.close();
  }
  console.log("rendered", c.key, LOCALE);
}
await b.close();
