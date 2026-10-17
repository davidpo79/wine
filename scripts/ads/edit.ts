// Edits AI-animated clips (16:9) into a Meta video ad in 9:16 and 4:5: each clip sits in a band with a headline above
// and the offer below, cross-fades to the next, and ends on the offer card. Overlays are rendered from HTML (same
// fonts and logo as the static ads), then composed with ffmpeg.
// Sound: an original music bed (scripts/ads/music.py), ducked under an optional pt-PT voice-over, with burned-in
// subtitles (most people watch muted). The voice-over is one take of the VO lines below; it is split on its pauses and
// each line is placed on its scene (pauses under 0.7 s, like commas, stay inside a line). Without --vo the subtitles use the planned timings (preview of the layout).
// Usage: tsx scripts/ads/edit.ts <outDir> <clip1.mp4> <clip2.mp4> <clip3.mp4> [--vo voice.mp3]
//   (needs: pip install imageio-ffmpeg numpy)
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
import { LOGO_PATH, LOGO_VIEWBOX } from "../../src/lib/logo-path";

const ROOT = resolve(import.meta.dirname, "../..");
const argv = process.argv.slice(2);
const voIdx = argv.indexOf("--vo");
const vo = voIdx >= 0 ? resolve(argv.splice(voIdx, 2)[1]) : null;
const [outArg, ...clipArgs] = argv;
const out = resolve(outArg ?? "ads-out");
const clips = clipArgs.map((c) => resolve(c));
const font = (n: string) => `file://${ROOT}/src/fonts/${n}`;
const CLIP = 5; // seconds per clip
const FADE = 0.5;
const MIN_END = 5; // end card, longer if the voice-over needs it

// Voice-over lines (what the voice reads, with numbers spelled out) and the subtitle shown for each.
// at: planned start in seconds (scene starts are 0, 4.5, 9 and the end card 13.5).
const VO = [
  { at: 0.4, say: "A prenda de Natal está escolhida.", sub: "A prenda de Natal está escolhida." },
  { at: 4.9, say: "Três vinhos do Douro, numa caixa pronta a oferecer.", sub: "Três vinhos do Douro, numa caixa pronta a oferecer." },
  { at: 9.4, say: "Com o seu cartão de Natal, entregue à porta.", sub: "Com o seu cartão de Natal, entregue à porta." },
  { at: 13.9, say: "Pague três caixas e leve quatro, com envio incluído.", sub: "Pague 3, leve 4, com envio incluído." },
  { at: 16.6, say: "Encomende até trinta de novembro.", sub: "Encomende até 30 de novembro." },
];
const PLANNED_LEN = [2.4, 3.4, 3.0, 2.5, 1.9];

// The line under each scene now comes from the voice-over subtitles, so the overlay keeps headline + offer only.
const SCENES = [
  { title: "A prenda está escolhida." },
  { title: "A prenda que acerta no coração." },
  { title: "O Natal é para se partilhar." },
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
.cap{display:inline-block;max-width:100%;text-align:center;text-wrap:balance;font-weight:750;line-height:1.25;background:rgba(0,0,0,.3);border-radius:14px;padding:10px 24px;color:#fff}
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
  <div style="position:absolute;left:0;right:0;top:${below + (tall ? 230 : 128)}px;display:flex;flex-direction:column;align-items:center;gap:${tall ? 22 : 12}px;padding:0 60px">
    <div class="offer" style="font-size:${tall ? 58 : 44}px;margin-top:${tall ? 10 : 0}px">Pague 3, leve 4</div>
    <div style="font-size:${tall ? 32 : 26}px;font-weight:600;opacity:.92">Envio incluído · Encomende até 30/11</div>
  </div></body></html>`;
}

// Burned-in subtitle, just under the video band (on the picture it would hide the box), above the offer.
function caption(text: string, fmt: keyof typeof FORMATS) {
  const { w, h, band, zoom } = FORMATS[fmt];
  const bandH = Math.round((zoom * 9) / 16);
  const tall = fmt === "9x16";
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS(w, h)}</style></head><body>
  <div style="position:absolute;left:0;right:0;top:${band + bandH + (tall ? 40 : 18)}px;display:flex;justify-content:center;padding:0 ${tall ? 60 : 50}px">
    <div class="cap" style="font-size:${tall ? 48 : 34}px">${text}</div>
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
    <div class="offer" style="font-size:${tall ? 84 : 68}px;line-height:1">Pague 3,<br>leve 4</div>
    <div style="font-size:${tall ? 32 : 28}px;font-weight:600">Envio incluído · desde 49,90 €</div>
    <div class="chip" style="font-size:${tall ? 40 : 34}px">Encomende até 30/11</div>
    <div style="font-size:${tall ? 26 : 22}px;opacity:.8">Entrega antes do Natal · Portugal Continental</div>
  </div></body></html>`;
}

const ffmpeg = execFileSync("python3", ["-c", "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"]).toString().trim();
mkdirSync(out, { recursive: true });

// Speech segments of the voice-over take, from its pauses.
function speechSegments(file: string): [number, number][] {
  const log = spawnSync(ffmpeg, ["-hide_banner", "-i", file, "-af", "silencedetect=noise=-35dB:d=0.7", "-f", "null", "-"]).stderr.toString();
  const dur = Number(/Duration: (\d+):(\d+):([\d.]+)/.exec(log)!.slice(1).reduce((a, x) => a * 60 + Number(x), 0));
  const starts = [...log.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...log.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  const segs: [number, number][] = [];
  let cur = 0;
  starts.forEach((st, i) => {
    if (st - cur > 0.15) segs.push([cur, st]);
    cur = ends[i] ?? dur;
  });
  if (dur - cur > 0.15) segs.push([cur, dur]);
  return segs;
}

// Where each line plays in the video: its planned start, or later if the previous line runs long.
type Line = { at: number; len: number; src?: [number, number] };
let lines: Line[] = VO.map((l, i) => ({ at: l.at, len: PLANNED_LEN[i] }));
if (vo) {
  const segs = speechSegments(vo);
  if (segs.length !== VO.length) throw new Error(`voice-over has ${segs.length} phrases, expected ${VO.length}: ${JSON.stringify(segs)}`);
  let prevEnd = 0;
  lines = segs.map(([a, b], i) => {
    const at = Math.max(VO[i].at, prevEnd + 0.25);
    const src: [number, number] = [Math.max(0, a - 0.05), b + 0.12];
    prevEnd = at + (src[1] - src[0]);
    return { at, len: src[1] - src[0], src };
  });
}
const sceneEnd = clips.length * (CLIP - FADE); // end card starts here
const END = Math.max(MIN_END, lines[lines.length - 1].at + lines[lines.length - 1].len + 1 - sceneEnd);
const TOTAL = sceneEnd + END;
console.log("timeline", lines.map((l) => `${l.at.toFixed(2)}+${l.len.toFixed(2)}`).join(" "), "total", TOTAL.toFixed(2));

// Music bed for the full length, then the soundtrack: music ducked under the voice.
const music = `${out}/music.wav`;
execFileSync("python3", [resolve(import.meta.dirname, "music.py"), music, TOTAL.toFixed(2)]);
const soundtrack = `${out}/soundtrack.m4a`;
if (vo) {
  const a = ["-y", "-loglevel", "error", "-i", music, "-i", vo];
  const f: string[] = [];
  lines.forEach((l, i) => {
    const [s0, s1] = l.src!;
    f.push(`[1:a]atrim=${s0.toFixed(3)}:${s1.toFixed(3)},asetpts=PTS-STARTPTS,aformat=sample_rates=44100:channel_layouts=stereo,adelay=${Math.round(l.at * 1000)}:all=1[v${i}]`);
  });
  f.push(`${lines.map((_, i) => `[v${i}]`).join("")}amix=inputs=${lines.length}:normalize=0,apad=whole_dur=${TOTAL.toFixed(2)},volume=1.6,asplit[voice][key]`);
  f.push(`[0:a]volume=0.55[bed]`);
  f.push(`[bed][key]sidechaincompress=threshold=0.02:ratio=6:attack=30:release=400[ducked]`);
  f.push(`[ducked][voice]amix=inputs=2:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[mix]`);
  a.push("-filter_complex", f.join(";"), "-map", "[mix]", "-t", TOTAL.toFixed(2), "-c:a", "aac", "-b:a", "192k", "-ar", "48000", soundtrack);
  execFileSync(ffmpeg, a);
} else {
  execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-i", music, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", soundtrack]);
}

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
async function shot(html: string, name: string, w: number, h: number) {
  const file = `${out}/${name}.html`;
  writeFileSync(file, html);
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto(`file://${file}`);
  await p.evaluate("document.fonts.ready");
  await p.waitForTimeout(200);
  const png = `${out}/${name}.png`;
  await p.screenshot({ path: png, omitBackground: true });
  await p.close();
  return png;
}
// Subtitles cover the scene lines; the offer lines are already printed large on the end card.
const SUB_LINES = lines.map((l, i) => ({ ...l, text: VO[i].sub })).filter((l) => l.at < sceneEnd);
for (const fmt of Object.keys(FORMATS) as (keyof typeof FORMATS)[]) {
  const { w, h, band, zoom } = FORMATS[fmt];
  const bandH = Math.round((zoom * 9) / 16);
  const pngs: string[] = [];
  for (const [i, html] of [...SCENES.map((_, i) => overlay(i, fmt)), endCard(fmt)].entries()) pngs.push(await shot(html, `ov_${fmt}_${i}`, w, h));
  const caps: string[] = [];
  for (const [i, l] of SUB_LINES.entries()) caps.push(await shot(caption(l.text, fmt), `cap_${fmt}_${i}`, w, h));
  // Each segment: clip scaled to the band, on the canvas, overlay on top. Then cross-fade the segments and the end card,
  // lay the subtitles over the result and add the soundtrack.
  const args = ["-y", "-loglevel", "error"];
  clips.forEach((c) => args.push("-i", c));
  pngs.forEach((p, i) => args.push(...(i === pngs.length - 1 ? ["-loop", "1", "-t", String(END), "-i", p] : ["-i", p])));
  caps.forEach((p) => args.push("-i", p));
  args.push("-i", soundtrack);
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
    const outLabel = `x${i}`;
    f.push(`[${prev}][s${i}]xfade=transition=fade:duration=${FADE}:offset=${t.toFixed(2)}[${outLabel}]`);
    prev = outLabel;
    t += CLIP - FADE;
  }
  const capBase = 2 * n + 1;
  SUB_LINES.forEach((l, i) => {
    const outLabel = i === SUB_LINES.length - 1 ? "v" : `y${i}`;
    f.push(`[${prev}][${capBase + i}:v]overlay=0:0:enable='between(t,${l.at.toFixed(2)},${(l.at + l.len + 0.3).toFixed(2)})'[${outLabel}]`);
    prev = outLabel;
  });
  if (!SUB_LINES.length) f.push(`[${prev}]null[v]`);
  const audioIn = capBase + caps.length;
  args.push("-filter_complex", f.join(";"), "-map", "[v]", "-map", `${audioIn}:a`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "19", "-c:a", "copy", "-shortest", "-movflags", "+faststart", `${out}/momento_prenda_${fmt}.mp4`);
  execFileSync(ffmpeg, args);
  console.log("rendered", fmt);
}
await b.close();
