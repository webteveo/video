#!/usr/bin/env python3
"""Score for the CA Containers UY spot: a warm 120 BPM house groove in D major (I–vi–IV–V–I),
bars anchored on the first container's landing, with sound design placed on every visual event.
Writes out/cacontainers.wav (48 kHz, 24-bit stereo, −14 LUFS).
"""
import json, os, sys, wave
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from synth import *  # noqa

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DUR = 10.0
N = secs(DUR + 3.0)
R = np.random.default_rng(19)
BAR0 = 0.5                                   # downbeat of bar 1 = the first landing
beat = lambda b: BAR0 + 0.5 * b              # beat index → seconds


class Mix:
    def __init__(self):
        self.bus = {k: np.zeros((2, N)) for k in ('drums', 'bass', 'music', 'fx', 'send')}
        self.kicks = []

    def add(self, bus, x, at, gain=1.0, p=0.0, send=0.0):
        x = np.asarray(x, dtype=float)
        if x.ndim == 1:
            x = pan(x, p)
        s = secs(at)
        if s < 0:
            x = x[:, -s:]; s = 0
        e = min(N, s + x.shape[1])
        if e <= s:
            return
        self.bus[bus][:, s:e] += x[:, : e - s] * gain
        if send:
            self.bus['send'][:, s:e] += x[:, : e - s] * gain * send

    def kick(self, at, punch=1.0, gain=1.0):
        self.add('drums', kick(punch, 0.45, 50, 1.5), at, gain * 0.9)
        self.kicks.append((at, 0.5 * gain))


# ------------------------------------------------------------------ instruments & sfx
def ep(m, dur=1.1, level=0.16):
    """Electric piano: 1:1 FM with a decaying index (tine attack), tremolo, soft saturation."""
    n = secs(dur); t = tt(n); f = midi(m)
    idx = 1.6 * np.exp(-t / 0.1) + 0.22
    mod = sine(f, n, R.random()) * idx
    x = np.sin(2 * np.pi * phase(f, n) + mod) + 0.18 * np.sin(2 * np.pi * phase(2 * f, n) + 0.5 * mod) * np.exp(-t / 0.3)
    env = np.minimum(1, t / 0.003) * (0.7 * np.exp(-t / 0.85) + 0.3 * np.exp(-t / 0.1))
    return sat(x * env * (1 + 0.1 * np.sin(2 * np.pi * 4.6 * t)), 1.2) * level


def chord(notes, at, dur=0.9, level=0.16, send=0.3):
    for i, m in enumerate(notes):
        M.add('music', ep(m, dur, level / np.sqrt(len(notes)) * 1.6), at + i * 0.004, p=-0.35 + 0.7 * i / max(1, len(notes) - 1), send=send)


def container_thud(level=1.0, size=1.0):
    n = secs(2.4); t = tt(n)
    f = 36 + 44 * np.exp(-t / 0.18)
    boom = sine(f / size, n) * np.exp(-t / 0.6)
    ring = np.zeros(n)
    for fr, a, d in [(63, 1.0, 0.7), (97, 0.7, 0.55), (151, 0.5, 0.42), (233, 0.34, 0.3), (347, 0.24, 0.22), (512, 0.16, 0.14), (781, 0.1, 0.09), (1190, 0.06, 0.06)]:
        fr = fr / size
        ring += a * np.sin(2 * np.pi * fr * t * (1 + 0.004 * np.sin(2 * np.pi * 3 * t)) + R.random() * 6) * np.exp(-t / d)
    nz = filt(noise(n), 'lp', 1600) * np.exp(-t / 0.05) * 0.7
    clk = filt(noise(n), 'hp', 2500) * np.exp(-t / 0.004) * 0.4
    x = sat((boom * 1.1 + ring * 0.45 + nz + clk) * level, 1.5)
    return np.stack([x, filt(x, 'lp', 9000)])


def creak(dur=0.4, f0=70, f1=150, level=0.14):
    n = secs(dur); t = tt(n)
    rate = f0 + (f1 - f0) * (t / dur) + 25 * np.sin(2 * np.pi * 3.3 * t)
    ph = np.cumsum(rate / SR)
    pulses = (np.diff(np.floor(ph), prepend=0) > 0).astype(float) * (0.5 + 0.5 * R.random(n))
    x = sum(filt(pulses, 'bp', fr, 14.0) * g for fr, g in [(640, 1.0), (1480, 0.8), (2950, 0.5)])
    return x * np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 0.6 * level * 6


def chain(dur=0.36, level=0.05):
    n = secs(dur); x = np.zeros(n)
    for _ in range(22):
        s = R.integers(0, n - secs(0.03)); m = secs(0.02)
        x[s:s + m] += filt(noise(m), 'bp', R.uniform(2500, 6000), 6.0) * np.exp(-tt(m) / 0.004)
    return x * level * 4


def pop(f0=900, f1=420, level=0.16):
    n = secs(0.12); t = tt(n)
    f = f1 + (f0 - f1) * np.exp(-t / 0.018)
    return (sine(f, n) * np.exp(-t / 0.05) + filt(noise(n), 'bp', 2500, 2.0) * np.exp(-t / 0.003) * 0.3) * level


def tick(level=0.08, fc=4200):
    n = secs(0.03); t = tt(n)
    return (filt(noise(n), 'bp', fc, 3.0) * np.exp(-t / 0.003) + sine(2100, n) * np.exp(-t / 0.006) * 0.3) * level


# ------------------------------------------------------------------ arrangement
M = Mix()
jit = lambda s=0.003: R.uniform(-s, s)
ROOTS = {0: 38, 1: 35, 2: 31, 3: 33, 4: 38}                    # D2 Bm(B1) G1 A1 D2
CHORDS = {0: [62, 66, 69, 73], 1: [59, 62, 66, 69], 2: [55, 59, 62, 66], 3: [57, 61, 64, 67], 4: [62, 66, 69, 73, 76]}

# Pickup: crane chain + the drop
M.add('music', pad([50, 57, 62, 66], 0.62, cutoff=(250, 700), a=0.3, r=0.1, level=0.06), 0.0, send=0.4)
M.add('fx', chain(0.34, 0.14), 0.0, p=0.3, send=0.2)
M.add('fx', whoosh(0.47, 150, 2200, 0.36, curve=2.0, p0=0.25, p1=0.0, q=0.8), 0.04)
M.add('fx', reverse_swell(0.32, 0.22), 0.18)
n_ = secs(0.5)                                                  # heavy air rumble as it comes down
M.add('fx', pan(filt(noise(n_), 'lp', 260) * np.linspace(0, 1, n_) ** 2 * 0.5), 0.0)

# Landing: the groove starts on the thud
M.add('fx', container_thud(0.95), 0.5, send=0.25)
M.kick(0.5, punch=1.4, gain=1.1)
M.add('drums', crash(1.6, 0.9), 0.5, 0.35, send=0.2)
for i in range(13):                                             # stencil letters clack down
    if i == 2: continue
    M.add('fx', tick(0.05, 3000 + 150 * i), 0.44 + i * 0.022 + 0.12, p=-0.6 + 0.08 * i)

# Groove bars (bar k starts at BAR0 + 2k)
for b in range(19):                                             # kicks on every beat to 9.5
    tb = beat(b)
    if tb in (0.5,): continue
    if 7.52 < tb < 8.45: continue                               # breath for the end-card hit
    M.kick(tb, punch=0.95 if tb < 7.5 else 0.7, gain=1.0 if tb < 7.5 else 0.75)
for b in range(1, 14, 2):
    tb = beat(b)
    if tb < 7.5: M.add('drums', clap(), tb, 0.55, send=0.25)
for b in range(19):
    tb = beat(b) + 0.25
    if tb < 9.8 and not (7.52 < tb < 8.45):
        M.add('drums', hat(), tb, 0.42, p=0.25)
for tb in np.arange(5.0, 7.5, 0.125):                           # 16ths lift the proof section
    M.add('drums', hat(), tb + 0.0625 * 0, 0.14 + 0.1 * ((tb * 4) % 1 > 0.4), p=-0.3)

# Bass: sub + octave-bounce pluck per bar
for k in range(5):
    t0 = BAR0 + 2 * k
    if t0 >= 9.8: break
    L = min(2.0, 9.9 - t0)
    M.add('bass', 0.7 * sub(ROOTS[k] - 12 if ROOTS[k] > 36 else ROOTS[k], L, 0.34), t0)
    for j in range(int(L / 0.25)):
        tj = t0 + j * 0.25
        if 7.52 < tj < 8.45: continue
        note = ROOTS[k] + (12 if j % 2 else 0)
        M.add('bass', pluck(note, 0.22, 0.13, 1100), tj)

# Chords: held EP at each bar + offbeat stabs, pads underneath
for k in range(5):
    t0 = BAR0 + 2 * k
    if t0 >= 9.8: break
    if k == 3: chord(CHORDS[k], t0, 1.0, 0.15)
    elif k != 4: chord(CHORDS[k], t0, 1.4, 0.16)
    if k < 4:
        M.add('music', pad(CHORDS[k], 2.05, cutoff=(700, 2200), a=0.25, r=0.3, detune=0.12, level=0.09), t0, send=0.4)
        for s in (0.75, 1.75):
            if not (7.52 < t0 + s < 8.45): chord(CHORDS[k], t0 + s, 0.28, 0.1, send=0.25)

# Hinge creak → the wall falls → the deck bangs down
M.add('fx', creak(0.36, 60, 140, 0.16), 1.0, p=0.2, send=0.25)
M.add('fx', whoosh(0.22, 250, 1200, 0.12, p0=0.3, p1=0.1), 1.24)
M.add('fx', container_thud(0.5, 0.7), 1.45, send=0.2)
M.add('fx', tick(0.12, 1800), 1.47)                              # light switch
for i, n in enumerate([86, 90, 93, 98]):                        # "a tu casa." — warm shimmer
    M.add('music', bell(n, 1.3, 0.05, 2.0, 1.4), 1.48 + i * 0.035, p=-0.4 + 0.25 * i, send=0.55)
for tp, n in [(1.62, 74), (1.66, 76), (1.74, 78), (1.86, 81), (1.92, 83), (1.98, 86), (2.02, 88), (2.1, 90)]:   # furnishing pops
    f = float(midi(n))
    M.add('fx', pop(f * 1.6, f, 0.13), tp, p=R.uniform(-0.5, 0.5), send=0.2)

# Second container drops across the first
M.add('fx', whoosh(0.4, 150, 2000, 0.16, curve=2.4, p0=-0.2, p1=0.0, q=0.9), 2.1)
M.add('fx', container_thud(1.0, 1.05), 2.5, send=0.25)
M.add('drums', crash(1.8, 0.9), 2.5, 0.4, send=0.25)
M.add('fx', tick(0.1, 1900), 2.6)
M.add('music', bell(86, 1.2, 0.05, 2.0, 1.3), 2.62, p=0.3, send=0.5)

# Ticker: HACEMOS → CASAS / OFICINAS / TINY HOUSES / DEPÓSITOS / BARBACOAS / A MEDIDA.
for k, n in enumerate([74, 78, 81, 83, 86]):
    tk = 2.62 + k * 0.3
    M.add('fx', tick(0.09, 3500), tk, p=-0.4)
    M.add('music', pluck(n, 0.3, 0.1, 4500), tk, p=-0.3, send=0.3)
M.add('fx', tick(0.1, 3500), 4.12, p=-0.4)
chord([66, 69, 74, 78], 4.12, 0.6, 0.14, send=0.35)             # "A MEDIDA."

# Push into the glass → iris into the blueprint
M.add('fx', whoosh(0.56, 200, 6000, 0.2, curve=2.2, p0=-0.1, p1=0.1), 4.45)
M.add('fx', riser(0.5, 200, 1800, 0.1), 4.5)
M.add('fx', reverse_swell(0.4, 0.2, 7000), 4.6)
M.add('fx', boom(1.2, 0.35, 70, 38), 5.0, send=0.2)
M.add('fx', whoosh(0.25, 2500, 500, 0.1, p0=0, p1=0), 5.0)

# 30 días: counter ticks follow the eased roll, the keys ding on day 30
ts = np.linspace(0, 0.7, 2000)
vals = np.round(1 + 29 * (1 - (1 - ts / 0.7) ** 3))
prev = 1
for tt_, v in zip(ts, vals):
    if v > prev:
        M.add('fx', tick(0.045, 3800 + 20 * v), 5.1 + tt_, p=0.35)
        prev = v
M.add('music', bell(86, 1.4, 0.11, 3.5, 2.2), 5.8, p=0.2, send=0.5)
M.add('music', bell(93, 1.4, 0.07, 3.5, 2.2), 5.81, p=0.35, send=0.5)
M.add('fx', whoosh(0.2, 2500, 700, 0.1, p0=0.2, p1=-0.5), 6.14)

# Map: the country draws, the workshop ships to all 19 departments
M.add('fx', sweep(noise(secs(0.45)), 'bp', lambda tt: 900 + 2600 * tt / 0.45, 4.0) * 0.04 * np.sin(np.pi * np.linspace(0, 1, secs(0.45))), 6.25, p=0.3)
M.add('music', marimba(62, 0.6, 0.2), 6.43, p=0.1, send=0.3)
penta = [74, 76, 78, 81, 83, 86, 88, 90, 93, 95, 98]
for r in range(18):
    M.add('music', marimba(penta[min(len(penta) - 1, r * len(penta) // 18)], 0.35, 0.13), 6.648 + r * 0.028, p=R.uniform(-0.2, 0.7), send=0.3)

# End card: iris, impact, the final chord, the call to action
M.add('fx', whoosh(0.25, 400, 5000, 0.14, p0=0.3, p1=-0.3), 7.45)
M.add('fx', boom(2.4, 0.7, 70, 36), 7.6, send=0.35)
M.add('drums', crash(2.4, 0.85), 7.6, 0.45, send=0.35)
chord([50, 57, 62, 66, 69, 76], 7.6, 2.4, 0.2, send=0.45)
M.add('music', pad([50, 57, 62, 66, 69, 76], 2.35, cutoff=(900, 3400), a=0.15, r=0.5, detune=0.14, level=0.12), 7.6, send=0.5)
for i in range(16):                                             # wordmark letters rising
    if i in (2, 13): continue
    M.add('fx', tick(0.03, 2600 + 90 * i), 7.72 + i * 0.02, p=-0.5 + 0.05 * i)
M.add('fx', pop(1400, 520, 0.2), 8.15, p=-0.2, send=0.3)       # CTA
for i, n in enumerate([81, 86, 90, 93, 98]):                    # shine sweep
    M.add('music', bell(n, 0.9, 0.035, 2.0, 1.0), 8.85 + i * 0.05, p=-0.5 + 0.25 * i, send=0.6)
chord(CHORDS[4], 8.5, 1.5, 0.12, send=0.45)
M.kick(8.5, punch=0.8, gain=0.8)
M.add('bass', 0.7 * sub(26, 1.45, 0.3), 8.5)

# ------------------------------------------------------------------ mix & master
t = tt(N)
duck = np.ones(N)
for (tk, depth) in M.kicks:
    s = secs(tk); seg = t[s:] - tk
    duck[s:] = np.minimum(duck[s:], 1 - depth * np.exp(-seg / 0.12) * np.minimum(1, seg / 0.004))
b = M.bus
wet = convolve(filt(b['send'], 'hp', 250), reverb_ir(2.2)) * 0.3
mix = b['drums'] * 0.85 + b['bass'] * duck * 0.72 + b['music'] * (0.45 + 0.55 * duck) * 1.5 + b['fx'] * 1.05 + wet * (0.6 + 0.4 * duck)
mix = filt(filt(mix, 'hp', 34), 'hp', 34)
mix = filt(mix, 'peak', 180, 0.9, 1.5)
mix = filt(mix, 'highshelf', 3000, 0.7, 2.0)
mix = filt(mix, 'highshelf', 6500, 0.7, 1.5)
mix = mix[:, :secs(DUR)]
tail = secs(0.3)
mix[:, -tail:] *= np.linspace(1, 0, tail) ** 1.5
for _ in range(3):
    mix *= 10 ** ((-14.0 - lufs(mix)) / 20)
    mix = limiter(mix, 0.89)
mix = np.clip(mix, -0.95, 0.95)

out = os.path.join(ROOT, 'out/cacontainers.wav')
os.makedirs(os.path.dirname(out), exist_ok=True)
pcm = (mix.T * (2 ** 23 - 1)).astype(np.int32)
b24 = np.frombuffer(pcm.astype('<i4').tobytes(), dtype=np.uint8).reshape(-1, 4)[:, :3].tobytes()
with wave.open(out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(3); w.setframerate(SR); w.writeframes(b24)
rms = lambda x: 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-12)
print(out, f'{mix.shape[1] / SR:.2f}s  peak {20 * np.log10(np.max(np.abs(mix))):.2f} dBFS  {lufs(mix):.1f} LUFS')
for a, bb, name in [(0, 0.5, 'drop'), (0.5, 2.5, 'casa'), (2.5, 4.5, 'stack'), (4.5, 6.25, '30 dias'), (6.25, 7.6, 'mapa'), (7.6, 10, 'cierre')]:
    print(f'  {name:8s} rms {rms(mix[:, secs(a):secs(bb)]):6.1f} dBFS')
