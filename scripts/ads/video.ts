// Short silent videos for Meta awareness (15 s, 9:16 and 4:5), rendered frame by frame from an animated HTML page and
// encoded to MP4 with ffmpeg. Text on screen doubles as captions (most people watch without sound).
// Usage: tsx scripts/ads/video.ts <outDir> [videoKey...]   (needs: pip install imageio-ffmpeg)
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
const FPS = 30;
const SECONDS = 15;
const FORMATS = { "9x16": { w: 1080, h: 1920 }, "4x5": { w: 1080, h: 1350 } } as const;

const logo = (h: number) =>
  `<svg height="${h}" viewBox="${LOGO_VIEWBOX}" style="display:block"><defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f8ecc8"/><stop offset="1" stop-color="#d2ae66"/></linearGradient></defs><path fill="url(#lg)" fill-rule="evenodd" d="${LOGO_PATH}"/></svg>`;

const CSS = `
@font-face{font-family:Inter;src:url(${font("inter-latin-wght-normal.woff2")}) format("woff2");font-weight:100 900}
@font-face{font-family:Caveat;src:url(${font("caveat-latin-600-normal.woff2")});font-weight:600}
@font-face{font-family:Cormorant;src:url(${font("cormorant-garamond-latin-700-normal.woff2")});font-weight:700}
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
        <div class="h" style="font-size:${tall ? 84 : 72}px;${anim("up", 0.6, from + 0.4)}">Desde 39,02 €<br>por caixa</div>
        <div class="s" style="${anim("up", 0.6, from + 0.7)}">Portes grátis a partir de 2 caixas</div>
        <div class="chip" style="${anim("pop", 0.6, from + 1.0)}">Encomende até 30/11</div>
        <div class="s" style="font-size:34px;opacity:.85;${anim("up", 0.6, from + 1.3)}">Entrega antes do Natal · Portugal Continental</div>
      </div>`,
  });

const VIDEOS: Record<string, (tall: boolean) => string> = {
  // Three gifts in one order, price per gift, printed card, deadline.
  tres_prendas_video: (tall) =>
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
          <div class="h" style="font-size:${tall ? 100 : 86}px;${anim("up", 0.6, 3.3)}">3 prendas.<br>1 encomenda.</div>
          <div style="display:flex;align-items:flex-end">
            <img class="box" src="${img("box-cutout.webp")}" style="width:${tall ? 360 : 300}px;margin-right:-60px;${anim("slideL", 0.7, 3.6)}">
            <img class="box" src="${img("box-cutout.webp")}" style="width:${tall ? 400 : 330}px;position:relative;z-index:2;${anim("pop", 0.7, 3.9)}">
            <img class="box" src="${img("box-cutout.webp")}" style="width:${tall ? 360 : 300}px;margin-left:-60px;${anim("slideR", 0.7, 4.2)}">
          </div></div>`,
      }),
      scene({
        from: 6.6,
        to: 9.6,
        cls: "red",
        html: `<div class="spark"></div><div style="position:relative;display:flex;flex-direction:column;align-items:center;gap:26px">
          <div class="k" style="${anim("up", 0.5, 6.7)}">Na compra de 3 caixas</div>
          <div class="h" style="font-size:${tall ? 170 : 150}px;${anim("pop", 0.7, 6.9)}">39,02 €</div>
          <div class="s" style="font-size:52px;${anim("up", 0.5, 7.4)}">por caixa · <span class="strike">45,90 €</span></div>
          <div class="chip" style="${anim("pop", 0.6, 7.9)}">Portes grátis</div></div>`,
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
    const frames = `${out}/.frames_${key}_${fmt}`;
    rmSync(frames, { recursive: true, force: true });
    mkdirSync(frames, { recursive: true });
    const file = `${out}/${key}_${fmt}.html`;
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
    execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", `${frames}/%04d.jpg`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "19", "-movflags", "+faststart", `${out}/${key}_${fmt}.mp4`]);
    rmSync(frames, { recursive: true, force: true });
    console.log("rendered", key, fmt);
  }
}
await b.close();
