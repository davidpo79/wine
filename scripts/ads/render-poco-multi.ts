// Black Friday weekend multi-box ads for Poço do Canto (26/11/2026, prices approved by Amir to clear the stock): the
// render-poco-eu.ts layout with 2 and 3 boxes instead of 1 and 2. Germany/Belgium 99 € and 135 € (usual 240/360 €),
// Spain 95 € and 125 € (usual 180/270 €). Dutch: no crossed-out price and no "-x%" (Dutch Alcohol Act caps advertised
// alcohol discounts at 25 %), the price per bottle instead. No end date on the image: David ends the offer himself.
// Usage: tsx scripts/ads/render-poco-multi.ts [outDir] -> bfm_poco_<de|nl|fr|es>_<4x5|9x16>.jpg
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";

const ROOT = resolve(import.meta.dirname, "../..");
const out = resolve(process.argv[2] ?? "public/ads");
const file = (p: string) => `file://${ROOT}/${p}`;

type Copy = { was: [string, string]; now: [string, string]; per?: [string, string]; ribbon: string; sub: string; box1: string; box2: string; usual: string; save1: string; save2: string; vat: string; days: string; ship: string; tag: string; cta: string; foot: string };
const COPY: Record<"de" | "nl" | "fr" | "es", Copy> = {
  de: { was: ["240€", "360€"], now: ["99€", "135€"], ribbon: "Black-Friday-Wochenende", sub: "Poço do Canto · Palhete 2019 · Rotwein aus dem Douro", box1: "2 Boxen · 12 Flaschen", box2: "3 Boxen · 18 Flaschen", usual: "Normalpreis", save1: "Sie sparen 59%", save2: "Sie sparen 62%", vat: "Inkl.<br>MwSt.", days: "Lieferung in<br>2 Werktagen", ship: "Versand<br>inklusive", tag: "Jetzt für Weihnachten eindecken", cta: "Jetzt kaufen", foot: "Kein Verkauf von Alkohol an Personen unter 18 Jahren." },
  nl: { was: ["", ""], now: ["99€", "135€"], per: ["€8,25 per fles", "€7,50 per fles"], ribbon: "Black Friday weekend", sub: "Poço do Canto · Palhete 2019 · rode wijn uit de Douro", box1: "2 dozen · 12 flessen", box2: "3 dozen · 18 flessen", usual: "", save1: "€49,50 per doos", save2: "€45 per doos", vat: "Incl.<br>btw", days: "Levering in<br>2 werkdagen", ship: "Verzending<br>inbegrepen", tag: "Sla nu in voor de feestdagen", cta: "Nu kopen", foot: "Geen verkoop van alcohol aan personen onder 18 jaar." },
  fr: { was: ["240€", "360€"], now: ["99€", "135€"], ribbon: "Week-end Black Friday", sub: "Poço do Canto · Palhete 2019 · vin rouge du Douro", box1: "2 caisses · 12 bouteilles", box2: "3 caisses · 18 bouteilles", usual: "Prix habituel", save1: "Économisez 59%", save2: "Économisez 62%", vat: "TVA<br>comprise", days: "Livraison en<br>2 jours ouvrables", ship: "Transport<br>inclus", tag: "Faites le plein pour Noël", cta: "Acheter", foot: "Vente d'alcool interdite aux moins de 18 ans. À consommer avec modération." },
  es: { was: ["180€", "270€"], now: ["95€", "125€"], ribbon: "Fin de semana Black Friday", sub: "Poço do Canto · Palhete 2019 · tinto del Douro", box1: "2 cajas · 12 botellas", box2: "3 cajas · 18 botellas", usual: "Precio habitual", save1: "Ahorra 47%", save2: "Ahorra 54%", vat: "IVA<br>incluido", days: "Entrega en<br>2 días laborables", ship: "Envío<br>gratis", tag: "Prepárate para la Navidad", cta: "Comprar", foot: "Venta de alcohol prohibida a menores de 18 años. Bebe con moderación." },
};

const FONT = `@font-face{font-family:Inter;src:url(${file("src/fonts/inter-latin-wght-normal.woff2")}) format("woff2");font-weight:100 900}
@font-face{font-family:Corm;src:url(${file("src/fonts/cormorant-garamond-latin-500-italic.woff2")}) format("woff2");font-style:italic}`;

/** The 1080x1350 ad: the source photo, with its Spanish lines covered and rewritten. */
const ad = (c: Copy) => `<div class="ad">
  <div class="ribbon">${c.ribbon}</div>
  <div class="subband"><span class="ln"></span><span>${c.sub}</span><span class="ln"></span></div>
  <div class="bottom">
    <div class="boxes">
      ${[[c.box1, c.was[0], c.now[0], c.save1, c.per?.[0]], [c.box2, c.was[1], c.now[1], c.save2, c.per?.[1]]].map(([t, was, now, save, per]) => `<div class="box"><div class="bt">${t}</div><div class="cols">${was ? `<div><div class="lab">${c.usual}</div><div class="was">${was}</div></div>` : ""}<div><div class="lab w">Black Friday</div><div class="now">${now}</div>${per ? `<div class="lab w per">${per}</div>` : ""}</div></div><div class="save">${save}</div></div>`).join("")}
    </div>
    <div class="row"><div>${c.vat}</div><span class="sep"></span><div class="pill">${c.days}<svg viewBox="0 0 64 40" width="64"><path d="M2 6h36v24H2zM38 14h14l10 10v6H38z" fill="#111"/><circle cx="14" cy="32" r="6" fill="#111" stroke="#fff" stroke-width="3"/><circle cx="50" cy="32" r="6" fill="#111" stroke="#fff" stroke-width="3"/></svg></div><span class="sep"></span><div>${c.ship}</div></div>
    <div class="tag"><span class="ln"></span><em>${c.tag}</em><span class="ln"></span></div>
    <div class="cta">${c.cta}</div>
    <div class="foot">WINE-PORTUGAL.COM &nbsp;·&nbsp; ${c.foot}</div>
  </div>
</div>`;

const CSS = `${FONT}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Inter,sans-serif;color:#fff;background:#0b0b0b;overflow:hidden}
.ad{position:relative;width:1080px;height:1350px;background:url(${file("scripts/ads/assets/poco-ad-es-source.jpg")}) 0 0/1080px 1350px no-repeat;text-transform:uppercase}
.ribbon{position:absolute;right:0;top:0;height:42px;padding:0 18px 0 24px;background:#e11d2a;font-weight:800;font-size:19px;letter-spacing:.12em;display:flex;align-items:center;min-width:290px;justify-content:center}
.subband{position:absolute;left:0;right:0;top:206px;height:48px;display:flex;align-items:center;justify-content:center;gap:18px;backdrop-filter:blur(16px) brightness(.55);-webkit-mask-image:linear-gradient(90deg,transparent,#000 6%,#000 94%,transparent);font-weight:700;font-size:21px;letter-spacing:.16em}
.ln{display:inline-block;width:70px;height:3px;background:#e11d2a}
.bottom{position:absolute;left:0;right:0;top:790px;bottom:0;background:linear-gradient(rgba(10,6,5,.0),rgba(10,6,5,.9) 2%,rgba(10,6,5,.96));backdrop-filter:blur(10px);display:flex;flex-direction:column;align-items:center;padding-top:14px}
.boxes{display:flex;gap:30px;width:1016px}
.box{flex:1;position:relative;border:3px solid #e11d2a;border-radius:18px;background:rgba(0,0,0,.55);padding:14px 10px 40px;text-align:center}
.bt{font-weight:900;font-size:28px;letter-spacing:.01em}
.cols{display:flex;justify-content:space-around;margin-top:8px}
.lab{font-weight:700;font-size:15px;letter-spacing:.12em;color:#bdbdbd}.lab.w{color:#fff}
.was{font-weight:900;font-size:58px;letter-spacing:-.04em;margin-top:2px;position:relative;display:inline-block}
.was:after{content:"";position:absolute;left:-6px;right:-6px;top:52%;height:5px;background:#e11d2a;transform:rotate(-8deg)}
.now{font-weight:900;font-size:84px;line-height:.95;letter-spacing:-.05em;color:#e11d2a}
.per{margin-top:4px;font-size:18px;text-transform:none}
.save{position:absolute;left:50%;bottom:-24px;transform:translateX(-50%) skewX(-12deg);background:#e11d2a;padding:6px 26px;font-weight:900;font-style:italic;font-size:28px;white-space:nowrap}
.row{display:flex;align-items:center;justify-content:center;gap:26px;margin-top:44px;font-weight:900;font-size:26px;line-height:1.15;text-align:center}
.sep{width:3px;height:70px;background:#e11d2a}
.pill{display:flex;align-items:center;gap:14px;background:#fff;color:#111;border-radius:12px;padding:12px 22px;font-size:22px;text-align:left}
.tag{display:flex;align-items:center;gap:22px;margin-top:22px;text-transform:none}
.tag em{font-family:Corm,serif;font-size:38px;font-style:italic}
.tag .ln{width:100px;height:2px}
.cta{margin-top:18px;background:#e11d2a;border-radius:999px;padding:14px 64px;font-weight:900;font-size:34px;letter-spacing:.06em;box-shadow:0 10px 30px rgba(225,29,42,.45)}
.foot{margin-top:auto;padding-bottom:22px;font-size:15px;color:#bdbdbd;text-transform:none;letter-spacing:.02em}
.story{position:relative;width:1080px;height:1920px;overflow:hidden}
.story .bg{position:absolute;inset:-40px;background:url(${file("scripts/ads/assets/poco-ad-es-source.jpg")}) center 30%/cover;filter:blur(30px) brightness(.45)}
.story .ad{position:absolute;left:0;top:285px}`;

const page = (body: string, w: number, h: number) => `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}body{width:${w}px;height:${h}px}</style></head><body>${body}</body></html>`;

mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium" }).catch(() => chromium.launch());
for (const loc of ["de", "nl", "fr", "es"] as const) {
  for (const [f, w, h, body] of [["4x5", 1080, 1350, ad(COPY[loc])], ["9x16", 1080, 1920, `<div class="story"><div class="bg"></div>${ad(COPY[loc])}</div>`]] as const) {
    const tmp = resolve(out, `.pocom_${loc}_${f}.html`);
    writeFileSync(tmp, page(body, w, h));
    const p = await browser.newPage({ viewport: { width: w, height: h } });
    await p.goto(`file://${tmp}`, { waitUntil: "load" });
    await p.waitForTimeout(300);
    writeFileSync(resolve(out, `bfm_poco_${loc}_${f}.jpg`), await p.screenshot({ type: "jpeg", quality: 90 }));
    console.log(`bfm_poco_${loc}_${f}.jpg`);
    await p.close();
    rmSync(tmp);
  }
}
await browser.close();
