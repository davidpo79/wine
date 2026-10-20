// Local call-progress tones in the browser (Web Audio, nothing sent over the line): a soft "connecting" pulse from
// the click until the other phone starts ringing (Telnyx then plays the real ringback), and a busy or error tone
// when a call does not go through. The AudioContext is created inside the Call/Connect click (browser autoplay rule).

let ctx: AudioContext | null = null;
let connecting: { stop: () => void } | null = null;

/** Call from a click handler: creates or resumes the audio context while the user gesture is still valid. */
export function unlockTones() {
  try {
    const AC = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  } catch {
    ctx = null;
  }
}

/** One beep at `at` seconds from now. */
function beep(freq: number, at: number, len: number, gain = 0.08) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.value = freq;
  const t = ctx.currentTime + at;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.setValueAtTime(gain, t + len - 0.01);
  g.gain.linearRampToValueAtTime(0, t + len);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + len + 0.02);
}

/** Soft 425 Hz pulse every second until stopped. */
export function startConnectingTone() {
  if (connecting || !ctx) return;
  beep(425, 0, 0.15);
  const id = setInterval(() => beep(425, 0, 0.15), 1000);
  connecting = { stop: () => clearInterval(id) };
}

export function stopConnectingTone() {
  connecting?.stop();
  connecting = null;
}

/** European busy tone: 425 Hz, 0.5 s on / 0.5 s off, three times. */
export function playBusyTone() {
  stopConnectingTone();
  for (let i = 0; i < 3; i++) beep(425, i, 0.5);
}

/** "The call did not go through": three falling tones. */
export function playErrorTone() {
  stopConnectingTone();
  [1400, 1000, 700].forEach((f, i) => beep(f, i * 0.3, 0.25, 0.06));
}
