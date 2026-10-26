// Short silent videos for Meta awareness (15 s, 9:16 and 4:5), rendered frame by frame from an animated HTML page and
// encoded to MP4 with ffmpeg. Text on screen doubles as captions (most people watch without sound).
// Usage: [ADS_LOCALE=pt|ru|de] tsx scripts/ads/video.ts <outDir> [videoKey...]   (needs: pip install imageio-ffmpeg)
// Only duas_prendas_video is localized (ru/de files get a _ru/_de suffix); the music bed is added afterwards.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { LOGO_PATH, LOGO_VIEWBOX } from "../../src/lib/logo-path";

const ROOT = resolve(import.meta.dirname, "../..");
const out = resolve(process.argv[2] ?? "ads-out");
const only = process.argv.slice(3);
const img = (n: string) => `file://${ROOT}/public/lp/${n}`;
const font = (n: string) => `file://${ROOT}/src/fonts/${n}`;
const LOCALE = (process.env.ADS_LOCALE ?? "pt") as "pt" | "ru" | "de" | "nl" | "fr";
const suffix = LOCALE === "pt" ? "" : `_${LOCALE}`;
const CYR = "U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116";
// The recipe guide exists in Portuguese only, so ru/de do not promise it.
// Copy of the 2-box Reel per language (ru: Russian speakers in Portugal; de: German market, Belgian warehouse).
const DUAS = {
  pt: { foot: "18+ · Beba com moderação", s1: "Duas prendas de Natal resolvidas 🎁", s2: "Branco · Rosé · Tinto", k: "2 caixas · 6 garrafas", price: "89,90€", save: "Poupe 9,90€", ship: "Envio grátis", guide: "+ Guia digital de receitas e harmonizações de oferta", cta: "Encomende em vinho.prendadenatal.com" },
  ru: { foot: "18+ · Пейте умеренно", s1: "Два рождественских подарка готовы 🎁", s2: "Белое · Розовое · Красное", k: "2 коробки · 6 бутылок", price: "89,90 €", save: "Экономия 9,90 €", ship: "Доставка бесплатно", guide: "Белое, розовое и красное в праздничной коробке", cta: "Заказ на vinho.prendadenatal.com/ru" },
  de: { foot: "18+ · Bitte genießen Sie verantwortungsvoll", s1: "Zwei Weihnachtsgeschenke erledigt 🎁", s2: "Weiß · Rosé · Rot", k: "2 Boxen · 6 Flaschen", price: "89,90 €", save: "Sie sparen 9,90 €", ship: "Kostenloser Versand", guide: "Weiß, Rosé und Rot in einer Weihnachtsbox", cta: "Bestellen auf vinho.prendadenatal.com/de" },
  fr: { foot: "18+ · L'abus d'alcool est dangereux pour la santé", s1: "Deux cadeaux de Noël réglés 🎁", s2: "Blanc · Rosé · Rouge", k: "2 coffrets · 6 bouteilles", price: "89,90 €", save: "Vous économisez 9,90 €", ship: "Livraison gratuite", guide: "Blanc, rosé et rouge dans un coffret de Noël", cta: "Commandez sur vinho.prendadenatal.com/fr" },
  nl: { foot: "18+ · Geniet, maar drink met mate", s1: "Twee kerstcadeaus geregeld 🎁", s2: "Wit · Rosé · Rood", k: "2 dozen · 6 flessen", price: "89,90 €", save: "U bespaart 9,90 €", ship: "Gratis verzending", guide: "Wit, rosé en rood in een kerstdoos", cta: "Bestel op vinho.prendadenatal.com/nl" },
}[LOCALE];
const FPS = 30;
const SECONDS = 15;
const FORMATS = { "9x16": { w: 1080, h: 1920 }, "4x5": { w: 1080, h: 1350 } } as const;

const logo = (h: number) =>
  `<svg height="${h}" viewBox="${LOGO_VIEWBOX}" style="display:block"><defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f8ecc8"/><stop offset="1" stop-color="#d2ae66"/></linearGradient></defs><path fill="url(#lg)" fill-rule="evenodd" d="${LOGO_PATH}"/></svg>`;

const CSS = `
@font-face{font-family:Inter;src:url(${font("inter-latin-wght-normal.woff2")}) format("woff2");font-weight:100 900}
@font-face{font-family:Caveat;src:url(${font("caveat-latin-600-normal.woff2")});font-weight:600}
@font-face{font-family:Cormorant;src:url(${font("cormorant-garamond-latin-700-normal.woff2")});font-weight:700}
@font-face{font-family:Inter;src:url(${font("inter-cyrillic-wght-normal.woff2")}) format("woff2");font-weight:100 900;unicode-range:${CYR}}
@font-face{font-family:Caveat;src:url(${font("caveat-cyrillic-600-normal.woff2")});font-weight:600;unicode-range:${CYR}}
@font-face{font-family:Cormorant;src:url(${font("cormorant-garamond-cyrillic-700-normal.woff2")});font-weight:700;unicode-range:${CYR}}
*{box-sizing:border-box;margin:0;padding:0}
body{width:var(--w);height:var(--h);overflow:hidden;font-family:Inter,sans-serif;background:#4a1219;color:#fff}
.scene{position:absolute;inset:0;opacity:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 70px}
.red{background:radial-gradient(120% 80% at 50% 40%,#b8323f 0%,#a72d39 35%,#71202b 75%,#4a1219 100%)}
.spark{position:absolute;inset:0;background-image:radial-gradient(circle,rgba(233,217,176,.55) 1.5px,transparent 2px),radial-gradient(circle,rgba(233,217,176,.35) 1px,transparent 1.5px);background-size:140px 140px,90px 90px;opacity:.6}
.photo{position:absolute;inset:-6%;background-size:cover;background-position:center}
.shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.15) 0%,rgba(0,0,0,.05) 40%,rgba(0,0,0,.65) 100%)}
.h{font-weight:850;letter-spacing:-.02em;line-height:1.04;text-shadow:0 4px 18px rgba(0,0,0,.35)}
.k{font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#e9d9b0;font-size:34px}
.s{font-weight:600;font-size:40px;line-height:1.25}
.chip{display:inline-block;background:#c19d55;color:#4a1219;font-weight:850;border-radius:999px;padding:14px 34px;font-size:40px}
.box{filter:drop-shadow(0 30px 40px rgba(0,0,0,.45))}
.card{background:#fffdf7;color:#2a2a2a;border-radius:10px;box-shadow:0 24px 60px rgba(0,0,0,.45);padding:50px 56px;border:10px solid #a72d39;outline:3px solid #c19d55;outline-offset:-22px;transform:rotate(-3deg);width:760px}
.card .t{font-family:Cormorant,serif;color:#a72d39;font-size:62px}
.card .m{font-family:Caveat,cursive;font-weight:600;font-size:58px;line-height:1.15;margin-top:22px}
.strike{position:relative;color:rgba(255,255,255,.8)}
.strike:after{content:"";position:absolute;left:-4%;right:-4%;top:52%;height:5px;background:currentColor;transform:rotate(-8deg)}
@keyframes fade{0%{opacity:0}8%{opacity:1}92%{opacity:1}100%{opacity:0}}
@keyframes fadeLast{0%{opacity:0}10%{opacity:1}100%{opacity:1}}
@keyframes up{0%{transform:translateY(60px);opacity:0}100%{transform:none;opacity:1}}
@keyframes zoom{0%{transform:scale(1)}100%{transform:scale(1.12)}}
@keyframes pop{0%{transform:scale(.6);opacity:0}70%{transform:scale(1.06);opacity:1}100%{transform:scale(1)}}
@keyframes slideL{0%{transform:translateX(-500px);opacity:0}100%{transform:none;opacity:1}}
@keyframes slideR{0%{transform:translateX(500px);opacity:0}100%{transform:none;opacity:1}}
`;

type Scene = { from: number; to: number; html: string; last?: boolean; cls?: string };
const scene = (s: Scene) =>
  `<div class="scene ${s.cls ?? ""}" style="animation:${s.last ? "fadeLast" : "fade"} ${s.to - s.from}s linear ${s.from}s both">${s.html}</div>`;
const anim = (name: string, dur: number, delay: number, extra = "") => `animation:${name} ${dur}s cubic-bezier(.2,.8,.2,1) ${delay}s both;${extra}`;

const endCard = (from: number, tall: boolean) =>
  scene({
    from,
    to: 15,
    last: true,
    cls: "red",
    html: `<div class="spark"></div>
      <div style="position:relative;display:flex;flex-direction:column;align-items:center;gap:${tall ? 40 : 28}px">
        <div style="${anim("pop", 0.6, from + 0.1)}">${logo(tall ? 150 : 120)}</div>
        <div class="h" style="font-size:${tall ? 84 : 72}px;${anim("up", 0.6, from + 0.4)}">Pague 3,<br>leve 4</div>
        <div class="s" style="${anim("up", 0.6, from + 0.7)}">Envio incluído · desde 49,90 €</div>
        <div class="chip" style="${anim("pop", 0.6, from + 1.0)}">Encomende até 30/11</div>
        <div class="s" style="font-size:34px;opacity:.85;${anim("up", 0.6, from + 1.3)}">Entrega antes do Natal · Portugal Continental</div>
      </div>`,
  });

const VIDEOS: Record<string, (tall: boolean) => string> = {
  // Four gifts in one order for the price of three, printed card, deadline.
  quatro_prendas_video: (tall) =>
    [
      scene({
        from: 0,
        to: 3.2,
        cls: "red",
        html: `<div class="spark"></div><div style="position:relative;display:flex;flex-direction:column;align-items:center;gap:30px">
          <div style="${anim("pop", 0.5, 0.1)}">${logo(tall ? 120 : 100)}</div>
          <div class="h" style="font-size:${tall ? 104 : 88}px;${anim("up", 0.6, 0.4)}">Prendas de Natal<br>por resolver?</div>
          <img class="box" src="${img("box-cutout.webp")}" style="width:${tall ? 600 : 470}px;${anim("pop", 0.8, 0.9)}"></div>`,
      }),
      scene({
        from: 3.2,
        to: 6.6,
        cls: "red",
        html: `<div class="spark"></div><div style="position:relative;display:flex;flex-direction:column;align-items:center;gap:40px">
          <div class="h" style="font-size:${tall ? 100 : 86}px;${anim("up", 0.6, 3.3)}">4 prendas.<br>Paga 3.</div>
          <div style="display:flex;align-items:flex-end">
            <img class="box" src="${img("box-cutout.webp")}" style="width:${tall ? 300 : 250}px;margin-right:-50px;${anim("slideL", 0.7, 3.6)}">
            <img class="box" src="${img("box-cutout.webp")}" style="width:${tall ? 330 : 275}px;position:relative;z-index:2;${anim("pop", 0.7, 3.8)}">
            <img class="box" src="${img("box-cutout.webp")}" style="width:${tall ? 330 : 275}px;margin-left:-50px;position:relative;z-index:2;${anim("pop", 0.7, 4.0)}">
            <img class="box" src="${img("box-cutout.webp")}" style="width:${tall ? 300 : 250}px;margin-left:-50px;${anim("slideR", 0.7, 4.2)}">
          </div></div>`,
      }),
      scene({
        from: 6.6,
        to: 9.6,
        cls: "red",
        html: `<div class="spark"></div><div style="position:relative;display:flex;flex-direction:column;align-items:center;gap:26px">
          <div class="k" style="${anim("up", 0.5, 6.7)}">4 caixas, paga 3</div>
          <div class="h" style="font-size:${tall ? 170 : 150}px;${anim("pop", 0.7, 6.9)}">149,70 €</div>
          <div class="s" style="font-size:52px;${anim("up", 0.5, 7.4)}">as 4 · <span class="strike">199,60 €</span></div>
          <div class="chip" style="${anim("pop", 0.6, 7.9)}">Envio incluído</div></div>`,
      }),
      scene({
        from: 9.6,
        to: 12.4,
        html: `<div class="photo" style="background-image:url(${img("unboxing.webp")});filter:blur(3px) brightness(.5);${anim("zoom", 3, 9.6)}"></div>
          <div style="position:relative;display:flex;flex-direction:column;align-items:center;gap:44px">
          <div class="h" style="font-size:${tall ? 84 : 72}px;${anim("up", 0.6, 9.7)}">Com a sua mensagem</div>
          <div class="card" style="${anim("pop", 0.7, 10.1, "transform:rotate(-3deg)")}"><div class="t">Feliz Natal</div><div class="m">Querida Mãe,<br>um brinde a nós!<br>Beijinhos, Ana</div></div>
          <div class="s" style="${anim("up", 0.5, 10.8)}">Cartão impresso, +3,90 €</div></div>`,
      }),
      endCard(12.4, tall),
    ].join(""),
  // Two boxes for 89,90 €: two Christmas gifts sorted (Reel brief, 24/10). 9:16 text stays inside the Reels safe zone
  // (top 14 % and bottom 35 % free); the 18+ footer sits just above the bottom zone in every scene.
  duas_prendas_video: (tall) => {
    const top = tall ? 300 : 90; // first text line, below the Reels header
    const foot = `<div style="position:absolute;left:0;right:0;top:${tall ? 1190 : 1290}px;text-align:center;font-size:${tall ? 28 : 24}px;font-weight:600;color:rgba(255,255,255,.88);text-shadow:0 2px 8px rgba(0,0,0,.6);z-index:5">${DUAS.foot}</div>`;
    return [
      scene({
        from: 0,
        to: 3,
        html: `<div class="photo" style="background-image:url(${img("unboxing.webp")});background-position:42% center;${anim("zoom", 3, 0)}"></div><div class="shade" style="background:linear-gradient(180deg,rgba(0,0,0,.55) 0%,rgba(0,0,0,.1) 45%,rgba(0,0,0,.35) 100%)"></div>
          <div style="position:absolute;left:70px;right:70px;top:${top}px">
          <div class="h" style="font-size:${tall ? 96 : 80}px;${anim("up", 0.6, 0.2)}">${DUAS.s1}</div></div>`,
      }),
      scene({
        from: 3,
        to: 7,
        html: `<div class="photo" style="background-image:url(${img("table.webp")});background-position:center 30%;${anim("zoom", 4, 3)}"></div><div class="shade" style="background:linear-gradient(180deg,rgba(0,0,0,.6) 0%,rgba(0,0,0,.1) 40%,rgba(0,0,0,.3) 100%)"></div>
          <div style="position:absolute;left:70px;right:70px;top:${top}px">
          <div class="h" style="font-size:${tall ? 88 : 74}px;${anim("up", 0.6, 3.2)}">Trilogia 2160 · Douro&nbsp;DOC</div>
          <div class="s" style="font-size:${tall ? 54 : 46}px;margin-top:22px;${anim("up", 0.5, 3.7)}">${DUAS.s2}</div></div>`,
      }),
      scene({
        from: 7,
        to: 11,
        cls: "red",
        html: `<div class="spark"></div><div style="position:absolute;left:0;right:0;top:${top}px;display:flex;flex-direction:column;align-items:center;gap:${tall ? 26 : 16}px">
          <div class="k" style="font-size:${tall ? 44 : 36}px;${anim("up", 0.5, 7.1)}">${DUAS.k}</div>
          <div style="display:flex;align-items:flex-end">
            <img class="box" src="${img("box-cutout.webp")}" style="width:${tall ? 420 : 330}px;margin-right:-70px;${anim("slideL", 0.7, 7.3)}">
            <img class="box" src="${img("box-cutout.webp")}" style="width:${tall ? 420 : 330}px;position:relative;z-index:2;${anim("slideR", 0.7, 7.5)}">
          </div>
          <div class="h" style="font-size:${tall ? 150 : 120}px;${anim("pop", 0.7, 8.0)}">${DUAS.price}</div>
          <div class="chip" style="font-size:${tall ? 46 : 40}px;${anim("pop", 0.6, 8.5)}">${DUAS.save}</div></div>`,
      }),
      scene({
        from: 11,
        to: 15,
        last: true,
        cls: "red",
        html: `<div class="spark"></div><div style="position:absolute;left:0;right:0;top:${tall ? 280 : 70}px;display:flex;flex-direction:column;align-items:center;gap:${tall ? 24 : 14}px;padding:0 70px">
          <div style="${anim("pop", 0.5, 11.1)}">${logo(tall ? 110 : 90)}</div>
          <img class="box" src="${img("box-cutout.webp")}" style="width:${tall ? 400 : 300}px;${anim("pop", 0.7, 11.3)}">
          <div class="h" style="font-size:${tall ? 76 : 64}px;${anim("up", 0.5, 11.7)}">${DUAS.ship}</div>
          <div class="s" style="font-size:${tall ? 38 : 32}px;${anim("up", 0.5, 12.0)}">${DUAS.guide}</div>
          <div class="chip" style="font-size:${tall ? 40 : 34}px;${anim("pop", 0.6, 12.4)}">${DUAS.cta}</div></div>`,
      }),
      foot,
    ].join("");
  },
  // Consoada: who brings the wine.
  consoada_video: (tall) =>
    [
      scene({
        from: 0,
        to: 4,
        html: `<div class="photo" style="background-image:url(${img("pouring.webp")});${anim("zoom", 4, 0)}"></div><div class="shade"></div>
          <div style="position:absolute;left:70px;right:70px;bottom:${tall ? 520 : 200}px">
          <div class="k" style="${anim("up", 0.5, 0.2)}">Consoada</div>
          <div class="h" style="font-size:${tall ? 110 : 92}px;margin-top:16px;${anim("up", 0.6, 0.5)}">O vinho fica<br>por sua conta?</div></div>`,
      }),
      scene({
        from: 4,
        to: 8,
        html: `<div class="photo" style="background-image:url(${img("arrival.webp")});background-position:center 35%;${anim("zoom", 4, 4)}"></div><div class="shade"></div>
          <div style="position:absolute;left:70px;right:70px;bottom:${tall ? 520 : 200}px">
          <div class="h" style="font-size:${tall ? 110 : 92}px;${anim("up", 0.6, 4.2)}">Leve o vinho todo<br>numa caixa.</div></div>`,
      }),
      scene({
        from: 8,
        to: 11.6,
        html: `<div class="photo" style="background-image:url(${img("giftbox.webp")});background-position:center 30%;${anim("zoom", 3.6, 8)}"></div><div class="shade"></div>
          <div style="position:absolute;left:70px;right:70px;bottom:${tall ? 520 : 200}px">
          <div class="h" style="font-size:${tall ? 92 : 78}px;${anim("up", 0.6, 8.2)}">Branco, tinto e rosé<br>do Douro.</div>
          <div class="s" style="margin-top:20px;${anim("up", 0.5, 8.7)}">Pronta a oferecer. Entregue em casa.</div></div>`,
      }),
      endCard(11.6, tall),
    ].join(""),
};

const html = (body: string, w: number, h: number) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>:root{--w:${w}px;--h:${h}px}${CSS}</style></head><body>${body}</body></html>`;

const ffmpeg = execFileSync("python3", ["-c", "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"]).toString().trim();
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const [key, build] of Object.entries(VIDEOS).filter(([k]) => !only.length || only.includes(k))) {
  for (const [fmt, { w, h }] of Object.entries(FORMATS)) {
    const frames = `${out}/.frames_${key}${suffix}_${fmt}`;
    rmSync(frames, { recursive: true, force: true });
    mkdirSync(frames, { recursive: true });
    const file = `${out}/${key}${suffix}_${fmt}.html`;
    writeFileSync(file, html(build(fmt === "9x16"), w, h));
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.goto(`file://${file}`);
    await p.evaluate("document.fonts.ready");
    await p.waitForTimeout(300);
    await p.evaluate("document.getAnimations().forEach(a => a.pause())");
    for (let i = 0; i < FPS * SECONDS; i++) {
      await p.evaluate(`document.getAnimations().forEach(a => { a.currentTime = ${(i * 1000) / FPS}; })`);
      await p.screenshot({ path: `${frames}/${String(i).padStart(4, "0")}.jpg`, type: "jpeg", quality: 92 });
    }
    await p.close();
    execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", `${frames}/%04d.jpg`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "19", "-movflags", "+faststart", `${out}/${key}${suffix}_${fmt}.mp4`]);
    rmSync(frames, { recursive: true, force: true });
    console.log("rendered", key, fmt);
  }
}
await b.close();
