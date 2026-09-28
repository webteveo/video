#!/usr/bin/env python3
"""Render a log-frequency spectrogram + waveform of a WAV with the reel's cue marks (for review)."""
import sys, json, wave, numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import signal
src = sys.argv[1] if len(sys.argv) > 1 else 'out/score.wav'
dst = sys.argv[2] if len(sys.argv) > 2 else 'out/spectrogram.png'
w = wave.open(src); sr = w.getframerate(); n = w.getnframes(); sw = w.getsampwidth()
raw = np.frombuffer(w.readframes(n), dtype=np.uint8).reshape(-1, sw)
if sw == 3:
    x = (raw[:, 0].astype(np.int32) | (raw[:, 1].astype(np.int32) << 8) | (raw[:, 2].astype(np.int32) << 16))
    x = np.where(x >= 2**23, x - 2**24, x) / 2**23
else:
    x = np.frombuffer(raw.tobytes(), dtype=np.int16) / 32768
x = x.reshape(-1, 2).mean(axis=1)
f, t, S = signal.stft(x, sr, nperseg=2048, noverlap=2048 - 256)
S = 20 * np.log10(np.abs(S) + 1e-9)
W, H = 1800, 520
fl = np.geomspace(30, 20000, H)
img = np.zeros((H, W))
ti = np.linspace(0, S.shape[1] - 1, W).astype(int)
for i, fr in enumerate(fl[::-1]):
    k = np.searchsorted(f, fr)
    img[i] = S[min(k, len(f) - 1), ti]
img = np.clip((img + 90) / 90, 0, 1)
rgb = np.stack([img ** 0.8, img ** 1.6 * 0.8, (1 - img) * img * 2.2], -1)
im = Image.fromarray((rgb * 255).astype(np.uint8)).resize((W, H))
canvas = Image.new('RGB', (W, H + 160), (15, 15, 18)); canvas.paste(im, (0, 0))
d = ImageDraw.Draw(canvas)
env = np.array([np.max(np.abs(x[int(a):int(b)])) for a, b in zip(np.linspace(0, len(x), W + 1)[:-1], np.linspace(0, len(x), W + 1)[1:])])
for i, e in enumerate(env):
    d.line([(i, H + 80 - e * 70), (i, H + 80 + e * 70)], fill=(255, 120, 60))
cues = json.load(open(sys.argv[3] if len(sys.argv) > 3 else 'src/data/cues.json'))
dur = len(x) / sr
for tt, name in [(v, k) for k, v in cues['t'].items()]:
    X = tt / dur * W
    d.line([(X, 0), (X, H + 160)], fill=(90, 90, 110))
    d.text((X + 2, 2 + (hash(name) % 6) * 12), name, fill=(220, 220, 230))
for fr in [100, 1000, 10000]:
    Y = H - (np.log(fr / 30) / np.log(20000 / 30)) * H
    d.text((4, Y), f'{fr}Hz', fill=(160, 255, 160))
canvas.save(dst); print(dst)
