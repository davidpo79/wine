# Original Christmas music bed for the video ads (music box arpeggios, warm pad, bass, glockenspiel, sleigh bells),
# synthesised from scratch so there is no licence to clear. Usage: python3 scripts/ads/music.py out.wav [seconds]
import sys
import wave

import numpy as np

SR = 44100
BPM = 96
BEAT = 60 / BPM
out = sys.argv[1] if len(sys.argv) > 1 else "music.wav"
total = float(sys.argv[2]) if len(sys.argv) > 2 else 18.5
n = int(total * SR)
rng = np.random.default_rng(2160)

# D major, one chord per bar (4 beats); the last bar resolves A -> D and rings out.
D, Bm, G, A = [62, 66, 69], [59, 62, 66], [55, 59, 62], [57, 61, 64]
BARS = [D, Bm, G, A, D, G, A]


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def env(length, attack, decay):
    t = np.arange(length) / SR
    e = np.exp(-t / decay)
    a = int(attack * SR)
    if a:
        e[:a] *= np.linspace(0, 1, a)
    return e


def add(buf, start, sig, gain=1.0):
    i = int(start * SR)
    if i >= len(buf):
        return
    sig = sig[: len(buf) - i]
    buf[i : i + len(sig)] += sig * gain


def music_box(m, dur=1.6):
    k = int(dur * SR)
    t = np.arange(k) / SR
    f = hz(m)
    s = np.sin(2 * np.pi * f * t) + 0.32 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / 0.25) + 0.08 * np.sin(2 * np.pi * 5.4 * f * t) * np.exp(-t / 0.06)
    return s * env(k, 0.002, 0.55)


def glock(m, dur=2.5):
    k = int(dur * SR)
    t = np.arange(k) / SR
    f = hz(m)
    s = np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 2.76 * f * t) * np.exp(-t / 0.3)
    return s * env(k, 0.001, 0.9)


def pad(notes, dur):
    k = int(dur * SR)
    t = np.arange(k) / SR
    s = np.zeros(k)
    for m in notes:
        for det in (-0.12, 0.0, 0.12):
            f = hz(m) * 2 ** (det / 12)
            for h in range(1, 6):
                s += np.sin(2 * np.pi * f * h * t + rng.uniform(0, 6.28)) / (h * h)
    a, r = int(0.6 * SR), int(0.8 * SR)
    e = np.ones(k)
    e[:a] = np.linspace(0, 1, a)
    e[-r:] *= np.linspace(1, 0, r)
    return s * e / (len(notes) * 3)


def bass(m, dur):
    k = int(dur * SR)
    t = np.arange(k) / SR
    f = hz(m - 24)
    return (np.sin(2 * np.pi * f * t) + 0.2 * np.sin(2 * np.pi * 2 * f * t)) * env(k, 0.01, 1.2)


def bell_hit(dur=0.12):
    k = int(dur * SR)
    noise = rng.standard_normal(k)
    hp = np.diff(np.diff(noise, prepend=0), prepend=0)  # crude high-pass: sleigh bells live up high
    t = np.arange(k) / SR
    ring = np.sin(2 * np.pi * 6200 * t) * 0.3 + np.sin(2 * np.pi * 7900 * t) * 0.2
    return (hp * 0.25 + ring) * env(k, 0.001, 0.035)


mix = np.zeros(n)
ARP = [0, 1, 2, 3, 2, 1, 0, 1]  # indexes into the voiced chord, eighth notes
for b, chord in enumerate(BARS):
    t0 = b * 4 * BEAT
    last = b == len(BARS) - 1
    voiced = [chord[0] + 12, chord[1] + 12, chord[2] + 12, chord[0] + 24]
    if last:
        # A for two beats, then D rings out to the end
        for j in range(4):
            add(mix, t0 + j * BEAT / 2, music_box([A[0] + 12, A[1] + 12, A[2] + 12, A[0] + 24][ARP[j]]), 0.22)
        tD = t0 + 2 * BEAT
        for j, m in enumerate([62 + 12, 66 + 12, 69 + 12, 62 + 24, 66 + 24]):
            add(mix, tD + j * 0.09, glock(m, 3.5), 0.16)
        add(mix, tD, pad(D, total - tD), 0.16)
        add(mix, tD, bass(D[0], total - tD), 0.22)
        add(mix, t0, pad(A, 2 * BEAT + 0.6), 0.16)
        add(mix, t0, bass(A[0], 2 * BEAT), 0.22)
        continue
    for j in range(8):
        add(mix, t0 + j * BEAT / 2, music_box(voiced[ARP[j]]), 0.22 if j % 2 == 0 else 0.16)
    add(mix, t0, pad(chord, 4 * BEAT + 0.8), 0.16)
    add(mix, t0, bass(chord[0], 4 * BEAT), 0.22)
    add(mix, t0, glock(chord[0] + 24), 0.07)
    if b >= 1:  # sleigh bells from bar 2, accents on 2 and 4
        for j in range(16):
            acc = 1.0 if j in (4, 12) else 0.45
            add(mix, t0 + j * BEAT / 4 + rng.uniform(-0.006, 0.006), bell_hit(), 0.05 * acc)


def reverb(x, seed):
    r = np.random.default_rng(seed)
    k = int(1.8 * SR)
    ir = r.standard_normal(k) * np.exp(-np.arange(k) / SR / 0.45)
    ir[0] = 0
    L = len(x) + k
    size = 1 << (L - 1).bit_length()
    y = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[: len(x)]
    return y / np.max(np.abs(y)) * np.max(np.abs(x))


left = mix + 0.35 * reverb(mix, 1)
right = mix + 0.35 * reverb(mix, 2)
fade = int(1.2 * SR)
for ch in (left, right):
    ch[:int(0.05 * SR)] *= np.linspace(0, 1, int(0.05 * SR))
    ch[-fade:] *= np.linspace(1, 0, fade) ** 2
st = np.stack([left, right], axis=1)
st = st / np.max(np.abs(st)) * 0.89
with wave.open(out, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((st * 32767).astype("<i2").tobytes())
print("wrote", out, f"{total}s")
