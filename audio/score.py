#!/usr/bin/env python3
"""The reel's score: 120 BPM in F minor, arranged directly against the visual cue sheet.

Every hit, whoosh and pluck is placed on a visual event (cues.json + timings.json exported from the
renderer), so picture and sound share one timeline. Writes out/score.wav (48 kHz, 24-bit stereo).
"""
import json, os, sys, wave
import numpy as np
from scipy import signal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from synth import *  # noqa

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CUES = json.load(open(os.path.join(ROOT, 'src/data/cues.json')))
TM = json.load(open(os.path.join(ROOT, 'audio/timings.json')))
DUR = CUES['duration']
N = secs(DUR + 3.0)
R = np.random.default_rng(7)


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

    def kick(self, at, punch=1.0, gain=1.0, duck=True):
        self.add('drums', kick(punch), at, gain * 0.95)
        if duck:
            self.kicks.append((at, min(1.0, 0.55 * gain * punch)))


M = Mix()
beats = lambda a, b, step=0.5: list(np.arange(a, b - 1e-6, step))
jit = lambda s=0.004: R.uniform(-s, s)

# =========================================================== 0.0–2.0  PRINCIPLES
M.add('fx', blip(520, 1040, 0.1, 0.42), 0.0, send=0.25)                        # the dot pops into being
M.add('bass', 0.78 * sub(29, 0.25, 0.25), 0.0)
M.add('music', pad([53, 56, 60, 63, 67], 2.15, cutoff=(220, 1500), a=0.9, r=0.25, level=0.17), 0.0, send=0.35)
M.add('fx', sine(np.linspace(190, 140, secs(0.26)), secs(0.26)) * np.hanning(secs(0.26)) * 0.07, 0.23)  # anticipation creak
M.add('fx', blip(210, 820, 0.2, 0.3), 0.5, send=0.2)                          # launch
M.add('fx', whoosh(0.42, 300, 2600, 0.16, p0=0, p1=0.1), 0.48)
M.add('fx', blip(1100, 380, 0.16, 0.07), 0.84, send=0.3)                      # falling whistle
M.add('fx', reverse_swell(0.22, 0.18), 0.78)
M.kick(1.0, punch=1.3)                                                          # LAND
M.add('fx', boom(2.2, 0.75, 75, 30), 1.0, send=0.35)
M.add('drums', crash(1.8), 1.0, gain=0.55, send=0.2)
for i in range(11):
    M.add('fx', chirp(0.045), 1.06 + i * 0.034 + jit(0.006), p=R.uniform(-0.7, 0.7), send=0.15)
for i in range(8):
    M.add('drums', hat(), 1.0 + i * 0.125 + jit(0.002), gain=0.28 + 0.06 * i, p=0.25 * (-1) ** i)
M.add('fx', zip_(0.22, 260, 1450, 0.17), 1.48, send=0.2)                      # stretch into a line
for i, t in enumerate(np.arange(1.5, 2.0 - 1e-6, 0.0625)):
    M.add('drums', snare(0.2), t, gain=0.08 + 0.34 * (i / 7) ** 2, send=0.15)
M.add('fx', riser(0.5, 200, 1300, 0.15), 1.5)

# =========================================================== 2.0–4.0  KINETIC TYPE
for b in beats(2.0, 4.0):
    M.kick(b)
for c in (2.5, 3.5):
    M.add('drums', clap(), c, 0.8, send=0.25)
for h in beats(2.25, 4.0):
    M.add('drums', hat(), h, 0.55, p=0.2)
for h in beats(2.125, 4.0, 0.25):
    M.add('drums', hat(), h + 0.0, 0.18, p=-0.3)
chords = {2.0: [53, 56, 60, 65], 2.5: [49, 56, 61, 65], 3.0: [51, 58, 63, 67], 3.5: [53, 56, 60, 65]}
roots = {2.0: 29, 2.5: 25, 3.0: 27, 3.5: 29}
for t0, ch in chords.items():
    if t0 < 3.5:
        M.add('music', stab(ch, 0.5, 6500, 0.3), t0, send=0.3)
    M.add('bass', 0.78 * sub(roots[t0], 0.48, 0.42), t0)
    for k in range(2):
        M.add('bass', pluck(roots[t0] + 12, 0.22, 0.14, 1500), t0 + 0.25 * k + 0.125)
M.add('fx', zip_(0.3, 180, 900, 0.1), 2.5, send=0.2)                          # THINGS inflate
M.add('fx', blip(900, 180, 0.14, 0.12), 2.83)                                  # deflate
M.add('fx', whoosh(0.2, 3000, 500, 0.16, p0=0.3, p1=-0.1), 2.8)               # letters fall
M.add('fx', blip(260, 980, 0.22, 0.2), 3.0, send=0.25)                        # dot launched
M.add('fx', blip(720, 240, 0.13, 0.24), 3.25, send=0.2)                       # lands as the O
M.add('fx', whoosh(0.52, 180, 7000, 0.26, curve=2.2, p0=-0.2, p1=0.2), 3.48)  # dive into the dot
M.add('fx', reverse_swell(0.5, 0.26), 3.5)
M.add('fx', riser(0.5, 160, 1900, 0.13), 3.5)

# =========================================================== 4.0–6.0  3D / LOOKDEV
for b in beats(4.0, 5.51):
    M.kick(b, punch=0.9)
M.add('drums', clap(), 4.5, 0.75, send=0.3)
for h in beats(4.25, 5.5):
    M.add('drums', hat(), h, 0.5, p=0.25)
M.add('drums', crash(1.6, 0.8), 4.0, 0.35, send=0.3)
M.add('music', pad([49, 53, 56, 60, 63], 2.0, cutoff=(700, 3200), a=0.25, r=0.3, level=0.27), 4.0, send=0.45)
M.add('bass', 0.78 * sub(25, 1.5, 0.42), 4.0)
for i, n in enumerate([85, 89, 92, 96]):                                        # light turns on
    M.add('music', bell(n, 1.4, 0.07), 4.0 + i * 0.03, p=-0.3 + 0.2 * i, send=0.5)
arp = [73, 77, 80, 84, 87, 84, 80, 77]
for i, t in enumerate(np.arange(4.25, 5.5 - 1e-6, 0.125)):
    M.add('music', bell(arp[i % 8], 0.5, 0.06, 2.0, 1.2), t, p=0.5 * np.sin(i * 1.3), send=0.45)
    M.add('music', bell(arp[i % 8], 0.5, 0.025, 2.0, 1.2), t + 0.1875, p=-0.5 * np.sin(i * 1.3), send=0.5)  # dotted-8th echo
M.add('fx', whoosh(0.55, 700, 7500, 0.12, p0=-0.8, p1=0.8), 4.22)            # ring trims on
# Charge
for i, t in enumerate(np.concatenate([np.arange(5.5, 5.75, 0.0625), np.arange(5.75, 6.0 - 1e-6, 0.03125)])):
    M.add('drums', snare(0.18), t, 0.1 + 0.45 * (i / 11) ** 1.6, send=0.2)
M.add('fx', riser(0.5, 140, 2400, 0.24), 5.5)
M.add('fx', reverse_swell(0.5, 0.3, 8000), 5.5)
n = secs(0.5)
M.add('bass', sine(55 * (1 + 0.5 * tt(n)), n) * (0.5 + 0.5 * np.sin(2 * np.pi * (6 + 30 * tt(n)) * tt(n))) * np.linspace(0, 0.3, n), 5.5)

# =========================================================== 6.0–8.0  PARTICLES
M.kick(6.0, punch=1.5)
M.add('fx', boom(3.0, 1.0, 85, 26), 6.0, send=0.4)
M.add('drums', crash(2.6), 6.0, 0.7, send=0.3)
n = secs(1.2)
M.add('fx', np.stack([filt(noise(n), 'lp', 5200), filt(noise(n), 'lp', 5200)]) * expdec(n, 0.3) * 0.2, 6.0, send=0.5)
spark = [80, 82, 84, 87, 89, 92, 94, 96, 99]
for i in range(150):                                                            # embers
    u = R.random()
    t = 6.02 + 1.25 * u ** 2.2
    M.add('music', bell(int(R.choice(spark)), 0.25, 0.022 * (1 - 0.6 * u), R.uniform(2, 5), R.uniform(0.5, 2)), t,
          p=R.uniform(-0.9, 0.9), send=0.5)
M.add('music', pad([44, 51, 55, 58, 60], 1.85, cutoff=(1500, 4200), a=0.35, r=0.3, level=0.23), 6.15, send=0.5)
M.add('bass', 0.78 * sub(32, 1.9, 0.38, glide_from=25, glide_t=0.15), 6.05)
for b in (7.0, 7.5):
    M.kick(b)
M.add('drums', clap(), 7.5, 0.75, send=0.3)
for h in beats(7.0, 8.0, 0.125):
    M.add('drums', hat(), h, 0.2 + 0.15 * ((h * 8) % 2 < 1), p=0.3)
M.add('fx', whoosh(0.45, 300, 3200, 0.2, p0=0.7, p1=-0.7), 7.0)               # ring forms
M.add('fx', reverse_swell(0.5, 0.28), 7.5)                                     # disc collapses
M.add('fx', zip_(0.3, 1500, 220, 0.1), 7.55)

# =========================================================== 8.0–10.0  SHAPE LAYERS
M.kick(8.0, punch=1.1)
M.add('drums', clap(), 8.0, 0.5, send=0.2)
M.add('music', stab([51, 58, 63, 67, 70], 0.55, 8000, 0.3), 8.0, send=0.3)
M.add('drums', crash(1.4, 1.1), 8.0, 0.4, send=0.25)
M.add('fx', whoosh(0.55, 5000, 400, 0.14, p0=0, p1=0), 8.0)
ring_note = {0: 75, 1: 79, 2: 82}
for tile in TM['tiles']:
    d = max(abs(tile['c'] - 2), abs(tile['r'] - 1))
    note = ring_note[d] + (12 if (tile['c'] + tile['r']) % 2 else 0)
    M.add('music', marimba(note, 0.5, 0.2), tile['t'] + 0.02, p=(tile['c'] - 2) * 0.35, send=0.3)
for b in beats(8.5, 9.75):
    M.kick(b)
M.add('drums', clap(), 8.5, 0.8, send=0.25)
M.add('drums', clap(), 9.5, 0.6, send=0.25)
for h in beats(8.0, 9.75, 0.125):
    M.add('drums', hat(), h, 0.16 + 0.18 * ((h * 4) % 1 > 0.4), p=-0.2)
bassline = [39, 51, 39, 51, 39, 51, 46, 49] * 2
for i, t in enumerate(np.arange(8.0, 9.75 - 1e-6, 0.25)):
    M.add('bass', pluck(bassline[i], 0.24, 0.2, 1200), t)
    M.add('bass', 0.78 * sub(bassline[i] - 12 if bassline[i] > 45 else bassline[i], 0.22, 0.22), t)
mar = [75, 79, 82, 84, 87, 84, 82, 79]
for i, t in enumerate(np.arange(8.5, 9.5 - 1e-6, 0.125)):
    M.add('music', marimba(mar[i % 8] + (0 if i < 4 else 0), 0.35, 0.16), t, p=0.4 * np.sin(i), send=0.25)
M.add('fx', whoosh(0.32, 1200, 5500, 0.22, p0=-0.9, p1=0.9), 8.98)          # rows shuffle
for i, tf in enumerate(TM['flips']):                                            # card flips
    M.add('fx', click(0.2, 2600 + 600 * (i % 3)), tf + jit(0.006), p=R.uniform(-0.8, 0.8), send=0.2)
    M.add('fx', whoosh(0.09, 800, 2500, 0.05, p0=0, p1=0), tf - 0.06)
M.add('fx', riser(0.24, 300, 2400, 0.12), 9.51)
M.add('fx', reverse_swell(0.12, 0.22, 9000), 9.88)                             # breath → drop

# =========================================================== 10.0–12.0  THE DROP
M.kick(10.0, punch=1.6, gain=1.1)
M.add('fx', boom(2.8, 1.15, 95, 25), 10.0, send=0.35)
M.add('drums', crash(2.6, 1.1), 10.0, 0.75, send=0.3)
M.add('music', stab([53, 56, 60, 65, 68, 72], 0.7, 9000, 0.34), 10.0, send=0.35)
n = secs(0.8)
M.add('fx', np.stack([filt(noise(n), 'hp', 400), filt(noise(n), 'hp', 400)]) * expdec(n, 0.2) * 0.14, 10.0, send=0.3)
for b in beats(10.5, 12.0):
    M.kick(b, punch=1.2, gain=1.05)
for c in (10.5, 11.5):
    M.add('drums', clap(), c, 0.9, send=0.3)
    M.add('drums', snare(0.25), c, 0.35)
for h in beats(10.25, 12.0):
    M.add('drums', hat(True), h, 0.55, p=0.25)
for h in beats(10.0, 12.0, 0.125):
    M.add('drums', hat(), h, 0.14 + 0.12 * ((h * 4) % 1 > 0.4), p=-0.3)
M.add('drums', crash(1.8), 11.0, 0.45, send=0.3)
M.add('fx', boom(1.4, 0.45, 70, 30), 11.0, send=0.2)
M.add('bass', 0.78 * sub(29, 2.0, 0.5, glide_from=17, glide_t=0.06), 10.0)
pattern = [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0]
for i, on in enumerate(pattern):
    if on:
        M.add('bass', reese(41 + (3 if i in (6, 14) else 0), 0.12, 0.32, 900), 10.0 + i * 0.125)
M.add('music', pad([53, 56, 60, 63, 65, 72], 2.0, cutoff=(1800, 5200), a=0.01, r=0.15, detune=0.22, level=0.3), 10.0, send=0.25)
for s in (10.25, 10.75, 11.25, 11.75):
    M.add('music', stab([65, 68, 72, 77], 0.3, 7000, 0.18), s, send=0.3)
hook = [77, 80, 84, 87, 84, 80, 89, 87]
for i, t in enumerate(np.arange(11.0, 11.75 - 1e-6, 0.125)):
    M.add('music', pluck(hook[i], 0.3, 0.12, 5000), t, p=0.3 * np.sin(i * 2), send=0.35)
M.add('fx', whoosh(0.9, 120, 1600, 0.2, curve=1.2, p0=-0.5, p1=0.5, q=0.9), 10.26)   # camera swoop
M.add('fx', riser(0.22, 400, 3500, 0.2), 11.78)
M.add('fx', whoosh(0.22, 400, 9000, 0.25, curve=2.5, p0=-1, p1=1), 11.78)      # whip

# =========================================================== 12.9–15.0  IDENTITY
M.add('fx', blip(520, 1040, 0.1, 0.4), 13.0, send=0.3)                         # the same pop as frame one
M.kick(13.0, punch=0.6, gain=0.7)
M.add('music', pad([53, 56, 60], 1.1, cutoff=(400, 1600), a=0.3, r=0.2, level=0.1), 12.95, send=0.5)
M.add('fx', whoosh(0.18, 500, 3500, 0.14, p0=0.1, p1=-0.6), 13.04)
M.add('fx', zip_(0.28, 420, 1700, 0.12), 13.21)
for i, (tp, note) in enumerate(zip(TM['letterPops'], [65, 67, 68, 72, 75, 77])):
    M.add('music', marimba(note, 0.6, 0.22), tp, p=-0.6 + 0.24 * i, send=0.35)
    M.add('music', bell(note + 12, 0.8, 0.04), tp, p=-0.6 + 0.24 * i, send=0.5)
M.add('fx', whoosh(0.3, 3000, 600, 0.1, p0=0.5, p1=0.2), 13.47)
for i, note in enumerate([84, 87, 89, 91, 96]):                                 # tagline shimmer
    M.add('music', bell(note, 0.9, 0.03), 13.5 + i * 0.05, p=-0.4 + 0.2 * i, send=0.6)
M.add('fx', blip(820, 300, 0.13, 0.26), 13.76, send=0.25)                     # the period lands
M.add('music', bell(89, 1.6, 0.08), 13.76, send=0.5)
# Final chord
M.kick(14.0, punch=1.0, gain=0.9)
M.add('fx', boom(3.0, 0.8, 65, 27), 14.0, send=0.4)
M.add('drums', crash(3.0, 0.9), 14.0, 0.55, send=0.4)
M.add('music', pad([41, 48, 56, 63, 67, 72], 1.4, cutoff=(2400, 900), a=0.02, r=0.5, detune=0.2, level=0.3), 14.0, send=0.55)
M.add('bass', 0.78 * sub(29, 1.2, 0.45), 14.0)
M.add('music', bell(77, 2.0, 0.06), 14.0, p=-0.3, send=0.6)
M.add('music', bell(84, 2.0, 0.05), 14.02, p=0.3, send=0.6)
M.add('drums', kick(0.3, 0.3, 52, 1.2), 14.5, 0.35)                           # heartbeat of the period
M.add('fx', blip(400, 560, 0.08, 0.08), 14.5, send=0.4)

# =========================================================== mix
t = tt(N)
duck = np.ones(N)
for (tk, depth) in M.kicks:
    s = secs(tk)
    seg = t[s:] - tk
    env = depth * np.exp(-seg / 0.11) * np.minimum(1, seg / 0.004)
    duck[s:] = np.minimum(duck[s:], 1 - env)
bus = M.bus
ir = reverb_ir(2.6)
wet = convolve(filt(bus['send'], 'hp', 250), ir) * 0.32
mix = (bus['drums'] * 0.95 + bus['bass'] * duck * 0.9 + bus['music'] * (0.35 + 0.65 * duck) * 0.85
       + bus['fx'] * 0.8 + wet * (0.5 + 0.5 * duck))

# The breath before the drop: total silence, tails included.
g = np.ones(N)
a, b = secs(9.765), secs(9.885)
g[a:b] = 0.0
fade = secs(0.006)
g[a - fade:a] = np.linspace(1, 0, fade)
g[b:b + fade] = np.linspace(0, 1, fade)
mix *= g

# ---- 12.0–12.9 REWIND: the reel itself, reversed at ~14× (tape squeal → tape stop)
def bezier(x1, y1, x2, y2, x):
    u = np.array(x, dtype=float)
    for _ in range(30):
        cx = 3 * x1; bx = 3 * (x2 - x1) - cx; ax = 1 - cx - bx
        fx = ((ax * u + bx) * u + cx) * u - x
        dx = (3 * ax * u + 2 * bx) * u + cx
        u = np.clip(u - fx / np.where(np.abs(dx) < 1e-6, 1e-6, dx), 0, 1)
    cy = 3 * y1; by = 3 * (y2 - y1) - cy; ay = 1 - cy - by
    return ((ay * u + by) * u + cy) * u

rs, re = secs(12.0), secs(12.9)
tout = t[rs:re]
u = np.clip((tout - 12.0) / (12.9 - 0.05 - 12.0), 0, 1)
src = 11.95 + (0.2 - 11.95) * bezier(0.33, 0.0, 0.3, 1.0, u)
srcmix = filt(mix, 'lp', 2600)
rew = np.stack([np.interp(src * SR, np.arange(N), srcmix[ch]) for ch in range(2)])
rew = filt(rew, 'hp', 40)
rew = filt(rew, 'lp', 6500)
env = np.minimum(1, (tout - 12.0) / 0.006) * (1 - np.clip((tout - 12.78) / 0.12, 0, 1)) ** 1.5
rew *= env * 0.72
# glitch stutters: repeat short grains
for k in range(6):
    gs = secs(R.uniform(0.05, 0.75))
    gl = secs(R.uniform(0.012, 0.03))
    for rep in range(1, 3):
        d = gs + rep * gl
        if d + gl < rew.shape[1]:
            rew[:, d:d + gl] = rew[:, gs:gs + gl] * 0.9
mix[:, rs:re] = rew
xf = secs(0.004)
mix[:, re:re + xf] *= np.linspace(0, 1, xf)
# glitch hit on the cut
n = secs(0.25)
hitx = np.round(filt(noise(n), 'bp', 1800, 0.7) * 8) / 8 * expdec(n, 0.05) * 0.35
mix[:, rs:rs + n] += pan(hitx)
mix[:, rs:rs + secs(0.5)] += boom(0.5, 0.5, 60, 35)[:, :secs(0.5)]

# ---- master
mix = filt(filt(mix, 'hp', 34), 'hp', 34)
mix = filt(mix, 'peak', 160, 0.9, 2.0)          # body
mix = filt(mix, 'highshelf', 6500, 0.7, 1.5)    # air
end = secs(DUR)
mix = mix[:, :end]
tail = secs(0.22)
mix[:, -tail:] *= np.linspace(1, 0, tail) ** 1.6
for _ in range(3):                                # normalise to -14 LUFS under a -1 dBFS ceiling
    mix *= 10 ** ((-14.0 - lufs(mix)) / 20)
    mix = limiter(mix, 0.89)
mix = np.clip(mix, -0.95, 0.95)

out = os.path.join(ROOT, 'out/score.wav')
os.makedirs(os.path.dirname(out), exist_ok=True)
pcm = (mix.T * (2 ** 23 - 1)).astype(np.int32)
b24 = np.frombuffer(pcm.astype('<i4').tobytes(), dtype=np.uint8).reshape(-1, 4)[:, :3].tobytes()
with wave.open(out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(3); w.setframerate(SR); w.writeframes(b24)

rms = lambda x: 20 * np.log10(np.sqrt(np.mean(x ** 2)) + 1e-12)
print(out, f'{mix.shape[1] / SR:.2f}s  peak {20 * np.log10(np.max(np.abs(mix))):.2f} dBFS  rms {rms(mix):.1f} dBFS')
for a, b, name in [(0, 2, 'principles'), (2, 4, 'type'), (4, 6, '3d'), (6, 8, 'particles'), (8, 9.75, 'shapes'),
                   (10, 12, 'drop'), (12, 12.9, 'rewind'), (12.9, 15, 'identity')]:
    print(f'  {name:11s} rms {rms(mix[:, secs(a):secs(b)]):6.1f} dBFS')
