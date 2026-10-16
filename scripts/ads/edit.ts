// Edits AI-animated clips (16:9) into a Meta video ad in 9:16 and 4:5: each clip sits in a band with a headline above
// and the offer below, cross-fades to the next, and ends on the offer card. Overlays are rendered from HTML (same
// fonts and logo as the static ads), then composed with ffmpeg.
// Usage: tsx scripts/ads/edit.ts <outDir> <clip1.mp4> <clip2.mp4> <clip3.mp4>   (needs: pip install imageio-ffmpeg)
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { LOGO_PATH, LOGO_VIEWBOX } from "../../src/lib/logo-path";

const ROOT = resolve(import.meta.dirname, "../..");
const [outArg, ...clipArgs] = process.argv.slice(2);
const out = resolve(outArg ?? "ads-out");
const clips = clipArgs.map((c) => resolve(c));
const font = (n: string) => `file://${ROOT}/src/fonts/${n}`;
const CLIP = 5; // seconds per clip
const FADE = 0.5;
const END = 4; // end card

const SCENES = [
  { title: "A prenda está escolhida.", sub: "Agora, só falta o abraço." },
  { title: "A prenda que acerta no coração.", sub: "O sorriso é deles. O orgulho é seu." },
  { title: "O Natal é para se partilhar.", sub: "Uma prenda. Um brinde. Uma boa escolha." },
];

const FORMATS = {
  // zoom: the clip is scaled to this width and centre-cropped to the canvas width (bigger picture on vertical screens)
  "9x16": { w: 1080, h: 1920, band: 520, zoom: 1300 },
  "4x5": { w: 1080, h: 1350, band: 330, zoom: 1080 },
} as const;

const logo = (h: number) =>
  `<svg height="${h}" viewBox="${LOGO_VIEWBOX}" style="display:block"><defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f8ecc8"/><stop offset="1" stop-color="#d2ae66"/></linearGradient></defs><path fill="url(#lg)" fill-rule="evenodd" d="${LOGO_PATH}"/></svg>`;

const CSS = (w: number, h: number) => `
@font-face{font-family:Inter;src:url(${font("inter-latin-wght-normal.woff2")}) format("woff2");font-weight:100 900}
@font-face{font-family:Cormorant;src:url(${font("cormorant-garamond-latin-700-normal.woff2")});font-weight:700}
@font-face{font-family:CormorantI;src:url(${font("cormorant-garamond-latin-500-italic.woff2")})}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${w}px;height:${h}px;overflow:hidden;background:transparent;font-family:Inter,sans-serif;color:#fff}
.bg{position:absolute;left:0;right:0;background:radial-gradient(120% 90% at 50% 30%,#a72d39 0%,#71202b 60%,#4a1219 100%)}
.spark{position:absolute;inset:0;background-image:radial-gradient(circle,rgba(233,217,176,.5) 1.5px,transparent 2px);background-size:120px 120px;opacity:.5}
.t{font-family:Cormorant,serif;font-weight:700;line-height:1.02;text-align:center;color:#f6e7bd;text-shadow:0 3px 14px rgba(0,0,0,.35)}
.s{font-family:CormorantI,serif;text-align:center;color:#fff}
.offer{font-weight:850;text-align:center}
.chip{display:inline-block;background:#c19d55;color:#4a1219;font-weight:850;border-radius:999px;padding:14px 34px}
`;

function overlay(i: number, fmt: keyof typeof FORMATS) {
  const { w, h, band, zoom } = FORMATS[fmt];
  const bandH = Math.round((zoom * 9) / 16);
  const tall = fmt === "9x16";
  const s = SCENES[i];
  const below = band + bandH;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS(w, h)}</style></head><body>
  <div class="bg" style="top:0;height:${band}px"><div class="spark"></div></div>
  <div class="bg" style="top:${below}px;bottom:0"><div class="spark"></div></div>
  <div style="position:absolute;left:0;right:0;top:${tall ? 230 : 30}px;display:flex;flex-direction:column;align-items:center;gap:${tall ? 26 : 14}px;padding:0 60px">
    ${logo(tall ? 70 : 52)}
    <div class="t" style="font-size:${tall ? 84 : 62}px">${s.title}</div>
  </div>
  <div style="position:absolute;left:0;right:0;top:${below + (tall ? 50 : 26)}px;display:flex;flex-direction:column;align-items:center;gap:${tall ? 22 : 12}px;padding:0 60px">
    <div class="s" style="font-size:${tall ? 50 : 40}px">${s.sub}</div>
    <div class="offer" style="font-size:${tall ? 54 : 40}px;margin-top:${tall ? 18 : 4}px">Desde 39,02 € por caixa</div>
    <div style="font-size:${tall ? 32 : 26}px;font-weight:600;opacity:.92">Portes grátis a partir de 2 caixas · Encomende até 30/11</div>
  </div></body></html>`;
}

function endCard(fmt: keyof typeof FORMATS) {
  const { w, h } = FORMATS[fmt];
  const tall = fmt === "9x16";
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS(w, h)}html,body{background:#4a1219}</style></head><body>
  <div class="bg" style="top:0;bottom:0"><div class="spark"></div></div>
  <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${tall ? 34 : 24}px;padding:0 70px;${tall ? "padding-bottom:200px" : ""}">
    ${logo(tall ? 140 : 110)}
    <div class="t" style="font-size:${tall ? 92 : 74}px">Trilogia 2160</div>
    <div style="font-size:${tall ? 38 : 32}px;font-weight:600;text-align:center">Branco, tinto e rosé do Douro<br>numa caixa de Natal</div>
    <div class="offer" style="font-size:${tall ? 84 : 68}px;line-height:1">Desde 39,02 €<br><span style="font-size:.55em">por caixa</span></div>
    <div style="font-size:${tall ? 32 : 28}px;font-weight:600">Portes grátis a partir de 2 caixas</div>
    <div class="chip" style="font-size:${tall ? 40 : 34}px">Encomende até 30/11</div>
    <div style="font-size:${tall ? 26 : 22}px;opacity:.8">Entrega antes do Natal · Portugal Continental</div>
  </div></body></html>`;
}

const ffmpeg = execFileSync("python3", ["-c", "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"]).toString().trim();
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
for (const fmt of Object.keys(FORMATS) as (keyof typeof FORMATS)[]) {
  const { w, h, band, zoom } = FORMATS[fmt];
  const bandH = Math.round((zoom * 9) / 16);
  const pngs: string[] = [];
  for (const [i, html] of [...SCENES.map((_, i) => overlay(i, fmt)), endCard(fmt)].entries()) {
    const file = `${out}/ov_${fmt}_${i}.html`;
    writeFileSync(file, html);
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.goto(`file://${file}`);
    await p.evaluate("document.fonts.ready");
    await p.waitForTimeout(200);
    const png = `${out}/ov_${fmt}_${i}.png`;
    await p.screenshot({ path: png, omitBackground: true });
    pngs.push(png);
    await p.close();
  }
  // Each segment: clip scaled to the band, on the canvas, overlay on top. Then cross-fade the segments and the end card.
  const args = ["-y", "-loglevel", "error"];
  clips.forEach((c) => args.push("-i", c));
  pngs.forEach((p, i) => args.push(...(i === pngs.length - 1 ? ["-loop", "1", "-t", String(END), "-i", p] : ["-i", p])));
  const n = clips.length;
  const f: string[] = [];
  for (let i = 0; i < n; i++) {
    f.push(`[${i}:v]trim=0:${CLIP},setpts=PTS-STARTPTS,fps=30,scale=${zoom}:${bandH},crop=${w}:${bandH},pad=${w}:${h}:0:${band}:black[c${i}]`);
    f.push(`[c${i}][${n + i}:v]overlay=0:0,format=yuv420p,setsar=1[s${i}]`);
  }
  f.push(`[${n + n}:v]fps=30,scale=${w}:${h},format=yuv420p,setsar=1[s${n}]`);
  let prev = "s0";
  let t = CLIP - FADE;
  for (let i = 1; i <= n; i++) {
    const outLabel = i === n ? "v" : `x${i}`;
    f.push(`[${prev}][s${i}]xfade=transition=fade:duration=${FADE}:offset=${t.toFixed(2)}[${outLabel}]`);
    prev = outLabel;
    t += CLIP - FADE;
  }
  args.push("-filter_complex", f.join(";"), "-map", "[v]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "19", "-movflags", "+faststart", `${out}/momento_prenda_${fmt}.mp4`);
  execFileSync(ffmpeg, args);
  console.log("rendered", fmt);
}
await b.close();
