#!/usr/bin/env python3
"""Integrated loudness (ITU-R BS.1770-4, gated) + octave-band balance for a 24-bit stereo WAV."""
import sys, wave, numpy as np
from scipy import signal
w = wave.open(sys.argv[1]); sr = w.getframerate(); n = w.getnframes()
raw = np.frombuffer(w.readframes(n), dtype=np.uint8).reshape(-1, 3)
x = (raw[:, 0].astype(np.int32) | (raw[:, 1].astype(np.int32) << 8) | (raw[:, 2].astype(np.int32) << 16))
x = (np.where(x >= 2**23, x - 2**24, x) / 2**23).reshape(-1, 2).T
# K-weighting (48 kHz coefficients from the spec)
b1, a1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1.0, -1.69065929318241, 0.73248077421585]
b2, a2 = [1.0, -2.0, 1.0], [1.0, -1.99004745483398, 0.99007225036621]
y = signal.lfilter(b2, a2, signal.lfilter(b1, a1, x, axis=1), axis=1)
blk, hop = int(0.4 * sr), int(0.1 * sr)
z = np.array([np.mean(y[:, i:i + blk] ** 2, axis=1).sum() for i in range(0, y.shape[1] - blk, hop)])
L = -0.691 + 10 * np.log10(z + 1e-12)
g = z[L > -70]; lg = -0.691 + 10 * np.log10(g.mean())
g2 = g[-0.691 + 10 * np.log10(g) > lg - 10]
print(f'integrated {(-0.691 + 10 * np.log10(g2.mean())):.1f} LUFS   true-ish peak {20*np.log10(np.abs(x).max()):.2f} dBFS')
f, P = signal.welch(x.mean(0), sr, nperseg=8192)
for lo in [31, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]:
    m = (f >= lo / 1.414) & (f < lo * 1.414)
    print(f'  {lo:>5} Hz  {10*np.log10(P[m].sum() + 1e-15):7.1f} dB')
