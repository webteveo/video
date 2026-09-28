"""Small numpy synthesis toolkit for the reel's score: oscillators, filters, drums, FX, space."""
import numpy as np
from scipy import signal

SR = 48000
rng = np.random.default_rng(20260928)


def midi(m):
    return 440.0 * 2.0 ** ((np.asarray(m, dtype=float) - 69.0) / 12.0)


def tt(n):
    return np.arange(n) / SR


def secs(d):
    return int(round(d * SR))


# ---------------------------------------------------------------- oscillators
def phase(freq, n, ph0=0.0):
    f = np.broadcast_to(np.asarray(freq, dtype=float), (n,))
    return ph0 + np.cumsum(f) / SR


def sine(freq, n, ph0=0.0):
    return np.sin(2 * np.pi * phase(freq, n, ph0))


def _polyblep(t, dt):
    out = np.zeros_like(t)
    a = t < dt
    x = t[a] / dt[a]
    out[a] = x + x - x * x - 1.0
    b = t > 1.0 - dt
    x = (t[b] - 1.0) / dt[b]
    out[b] = x * x + x + x + 1.0
    return out


def saw(freq, n, ph0=0.0):
    f = np.broadcast_to(np.asarray(freq, dtype=float), (n,))
    dt = f / SR
    ph = (ph0 + np.cumsum(dt)) % 1.0
    return 2.0 * ph - 1.0 - _polyblep(ph, dt)


def square(freq, n, ph0=0.0):
    f = np.broadcast_to(np.asarray(freq, dtype=float), (n,))
    dt = f / SR
    ph = (ph0 + np.cumsum(dt)) % 1.0
    y = np.where(ph < 0.5, 1.0, -1.0)
    y += _polyblep(ph, dt)
    y -= _polyblep((ph + 0.5) % 1.0, dt)
    return y


def noise(n):
    return rng.standard_normal(n)


def supersaw(freq, n, voices=7, detune=0.16, stereo=True):
    """Detuned saw stack; returns (2, n)."""
    cents = np.linspace(-1, 1, voices) * 100 * detune
    out = np.zeros((2, n))
    for i, c in enumerate(cents):
        w = saw(np.asarray(freq) * 2 ** (c / 1200), n, rng.random())
        p = (i / (voices - 1)) * 2 - 1 if stereo else 0.0
        out[0] += w * np.cos((p + 1) * np.pi / 4)
        out[1] += w * np.sin((p + 1) * np.pi / 4)
    return out / np.sqrt(voices)


# ---------------------------------------------------------------- envelopes
def adsr(n, a=0.005, d=0.1, s=0.7, r=0.2, hold=None):
    """ADSR where the note is held for `hold` seconds (default: until release fits)."""
    t = tt(n)
    hold = (n / SR - r) if hold is None else hold
    e = np.where(t < a, t / max(a, 1e-6), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-6)))
    rel = t > hold
    lvl = np.interp(hold, t, e) if hold < n / SR else s
    e[rel] = lvl * np.exp(-(t[rel] - hold) / max(r / 4, 1e-6))
    return e


def expdec(n, decay, attack=0.001):
    t = tt(n)
    return np.minimum(1.0, t / attack) * np.exp(-t / decay)


# ---------------------------------------------------------------- filters
def biquad(kind, fc, q=0.707, gain_db=0.0):
    w0 = 2 * np.pi * min(fc, SR * 0.49) / SR
    cw, sw = np.cos(w0), np.sin(w0)
    al = sw / (2 * q)
    A = 10 ** (gain_db / 40)
    if kind == 'lp':
        b = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2]; a = [1 + al, -2 * cw, 1 - al]
    elif kind == 'hp':
        b = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2]; a = [1 + al, -2 * cw, 1 - al]
    elif kind == 'bp':
        b = [al, 0, -al]; a = [1 + al, -2 * cw, 1 - al]
    elif kind == 'peak':
        b = [1 + al * A, -2 * cw, 1 - al * A]; a = [1 + al / A, -2 * cw, 1 - al / A]
    elif kind == 'highshelf':
        sq = 2 * np.sqrt(A) * al
        b = [A * ((A + 1) + (A - 1) * cw + sq), -2 * A * ((A - 1) + (A + 1) * cw), A * ((A + 1) + (A - 1) * cw - sq)]
        a = [(A + 1) - (A - 1) * cw + sq, 2 * ((A - 1) - (A + 1) * cw), (A + 1) - (A - 1) * cw - sq]
    elif kind == 'lowshelf':
        sq = 2 * np.sqrt(A) * al
        b = [A * ((A + 1) - (A - 1) * cw + sq), 2 * A * ((A - 1) - (A + 1) * cw), A * ((A + 1) - (A - 1) * cw - sq)]
        a = [(A + 1) + (A - 1) * cw + sq, -2 * ((A - 1) + (A + 1) * cw), (A + 1) + (A - 1) * cw - sq]
    else:
        raise ValueError(kind)
    b = np.array(b) / a[0]; a = np.array(a) / a[0]
    return b, a


def filt(x, kind, fc, q=0.707, gain_db=0.0):
    b, a = biquad(kind, fc, q, gain_db)
    return signal.lfilter(b, a, x, axis=-1)


def sweep(x, kind, fc, q=0.707, block=64):
    """Time-varying biquad: fc is an array (per sample) or callable of time. Mono or (2, n)."""
    x = np.asarray(x, dtype=float)
    stereo = x.ndim == 2
    n = x.shape[-1]
    if callable(fc):
        fc = fc(tt(n))
    fc = np.broadcast_to(np.asarray(fc, dtype=float), (n,))
    out = np.zeros_like(x)
    zi = np.zeros((2, 2)) if stereo else np.zeros(2)
    for s in range(0, n, block):
        e = min(n, s + block)
        b, a = biquad(kind, float(fc[s]), q)
        if stereo:
            for ch in range(2):
                out[ch, s:e], zi[ch] = signal.lfilter(b, a, x[ch, s:e], zi=zi[ch])
        else:
            out[s:e], zi = signal.lfilter(b, a, x[s:e], zi=zi)
    return out


def sat(x, drive=1.0):
    return np.tanh(x * drive) / np.tanh(drive)


def pan(x, p=0.0):
    x = np.asarray(x)
    if x.ndim == 2:
        return x
    return np.stack([x * np.cos((p + 1) * np.pi / 4), x * np.sin((p + 1) * np.pi / 4)])


def autopan(x, p0, p1):
    n = x.shape[-1]
    p = np.linspace(p0, p1, n)
    return np.stack([x * np.cos((p + 1) * np.pi / 4), x * np.sin((p + 1) * np.pi / 4)])


# ---------------------------------------------------------------- drums
def kick(punch=1.0, dur=0.5, tone=46.0, drive=1.6):
    n = secs(dur)
    t = tt(n)
    f = tone + 120 * np.exp(-t / 0.028) + 60 * np.exp(-t / 0.004)
    body = sine(f, n) * np.exp(-t / (0.2 + 0.12 * punch)) * np.minimum(1, t / 0.0015)
    click = filt(noise(n), 'hp', 2500) * np.exp(-t / 0.003) * 0.35
    return sat(body * 1.1 + click * punch, drive) * 0.95


def clap(dur=0.45):
    n = secs(dur)
    t = tt(n)
    env = np.zeros(n)
    for k, off in enumerate([0.0, 0.009, 0.018, 0.029]):
        s = secs(off)
        env[s:] += np.exp(-(t[: n - s]) / (0.006 if k < 3 else 0.14)) * (1 if k < 3 else 1.2)
    x = filt(filt(noise(n), 'bp', 1400, 0.9), 'hp', 700) * env
    return x * 0.6


def snare(dur=0.3, tone=190.0):
    n = secs(dur)
    t = tt(n)
    body = sine(tone * (1 + 0.4 * np.exp(-t / 0.01)), n) * np.exp(-t / 0.045)
    nz = filt(filt(noise(n), 'hp', 900), 'lp', 9000) * np.exp(-t / 0.11)
    return (body * 0.5 + nz * 0.7) * 0.8


_HAT_F = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0]


def hat(open_=False, dur=None):
    dur = dur or (0.35 if open_ else 0.08)
    n = secs(dur)
    t = tt(n)
    m = sum(square(f * 1.6, n, rng.random()) for f in _HAT_F)
    x = filt(filt(m, 'bp', 9500, 0.9), 'hp', 7000) + filt(noise(n), 'hp', 9000) * 0.5
    return x * np.exp(-t / (0.12 if open_ else 0.022)) * 0.18


def crash(dur=2.2, bright=1.0):
    n = secs(dur)
    t = tt(n)
    m = sum(square(f * 2.3, n, rng.random()) for f in _HAT_F)
    x = filt(m, 'hp', 5000) * 0.4 + filt(noise(n), 'hp', 3500 * bright)
    x = x * (np.exp(-t / 0.55) * 0.8 + np.exp(-t / 0.08) * 0.6)
    return pan(x * 0.22, -0.2) + pan(filt(x, 'lp', 12000) * 0.22, 0.25)


# ---------------------------------------------------------------- tonal instruments
def pad(notes, dur, cutoff=(600, 2600), a=0.4, r=0.6, detune=0.18, level=0.2):
    n = secs(dur)
    out = np.zeros((2, n))
    for m in notes:
        out += supersaw(midi(m), n, 7, detune)
    fc = np.geomspace(cutoff[0], cutoff[1], n)
    out = sweep(out, 'lp', fc, 0.8, 128)
    env = adsr(n, a, 0.8, 0.85, r, hold=dur - r)
    return out * env * level / np.sqrt(len(notes))


def stab(notes, dur=0.45, bright=7000, level=0.28):
    n = secs(dur)
    t = tt(n)
    out = np.zeros((2, n))
    for m in notes:
        out += supersaw(midi(m), n, 5, 0.22)
    fc = 300 + bright * np.exp(-t / 0.07)
    out = sweep(out, 'lp', fc, 1.1, 32)
    return out * expdec(n, 0.2, 0.002) * level / np.sqrt(len(notes))


def marimba(m, dur=0.6, level=0.5):
    n = secs(dur)
    t = tt(n)
    f = midi(m)
    x = sine(f, n) * np.exp(-t / 0.28) + 0.35 * sine(f * 3.93, n) * np.exp(-t / 0.05) + 0.12 * sine(f * 9.2, n) * np.exp(-t / 0.012)
    return x * np.minimum(1, t / 0.0015) * level


def bell(m, dur=1.2, level=0.25, ratio=3.5, index=2.4):
    n = secs(dur)
    t = tt(n)
    f = midi(m)
    mod = sine(f * ratio, n) * index * np.exp(-t / 0.25)
    x = np.sin(2 * np.pi * phase(f, n) + mod)
    return x * np.exp(-t / 0.55) * np.minimum(1, t / 0.002) * level


def pluck(m, dur=0.5, level=0.3, bright=4000):
    n = secs(dur)
    t = tt(n)
    x = saw(midi(m), n) * 0.6 + square(midi(m) * 1.003, n) * 0.4
    x = sweep(x, 'lp', 200 + bright * np.exp(-t / 0.05), 1.3, 32)
    return x * expdec(n, 0.16, 0.001) * level


def sub(m, dur, level=0.5, glide_from=None, glide_t=0.08, a=0.004, r=0.08):
    n = secs(dur)
    t = tt(n)
    f = np.full(n, midi(m))
    if glide_from is not None:
        f = midi(m) + (midi(glide_from) - midi(m)) * np.exp(-t / glide_t)
    x = sine(f, n) + 0.25 * sine(2 * f, n)
    return sat(x * adsr(n, a, 0.2, 0.9, r, hold=dur - r) * 1.2, 1.3) * level


def reese(m, dur, level=0.3, cutoff=520):
    n = secs(dur)
    f = midi(m)
    x = saw(f * 1.004, n, rng.random()) + saw(f * 0.996, n, rng.random()) + 0.5 * saw(f * 2.001, n, rng.random())
    x = filt(sat(x * 0.6, 1.8), 'lp', cutoff, 1.0)
    return x * adsr(n, 0.004, 0.1, 0.9, 0.05, hold=dur - 0.05) * level


# ---------------------------------------------------------------- fx
def blip(f0=520, f1=1040, dur=0.09, level=0.35):
    n = secs(dur)
    t = tt(n)
    f = f0 * (f1 / f0) ** np.minimum(1, t / (dur * 0.5))
    return sine(f, n) * np.exp(-t / (dur * 0.35)) * np.minimum(1, t / 0.001) * level


def whoosh(dur, f0=400, f1=4000, level=0.3, curve=1.6, p0=-0.6, p1=0.6, q=1.2):
    n = secs(dur)
    t = tt(n) / dur
    fc = f0 * (f1 / f0) ** t
    x = sweep(noise(n), 'bp', fc, q, 64)
    env = np.sin(np.pi * np.clip(t, 0, 1)) ** curve
    return autopan(x * env * level, p0, p1)


def riser(dur, f0=180, f1=1600, level=0.22):
    n = secs(dur)
    t = tt(n) / dur
    f = f0 * (f1 / f0) ** (t ** 1.6)
    tone = saw(f, n) * 0.35 + saw(f * 1.5, n) * 0.2
    nz = sweep(noise(n), 'hp', 300 * (12 ** t), 0.8, 64) * 0.9
    x = sweep(tone, 'lp', 800 + 8000 * t ** 2, 0.9, 64) + nz
    return pan(x * (t ** 2.2) * level)


def boom(dur=2.4, level=0.9, f0=70, f1=28):
    n = secs(dur)
    t = tt(n)
    f1 = max(f1, 36)
    f = f1 + (f0 - f1) * np.exp(-t / 0.25)
    body = sine(f, n) * np.exp(-t / 0.9)
    nz = filt(noise(n), 'lp', 1800) * np.exp(-t / 0.18) * 0.5
    return pan(sat((body + nz) * level, 1.4))


def reverse_swell(dur=1.0, level=0.35, fc=6000):
    n = secs(dur)
    t = tt(n)
    x = filt(noise(n), 'lp', fc) * np.exp(-t / (dur * 0.28))
    x = x[::-1].copy()
    return pan(x * level * np.minimum(1, (n - np.arange(n)) / secs(0.004)))


def zip_(dur=0.2, f0=300, f1=1500, level=0.18):
    n = secs(dur)
    t = tt(n) / dur
    f = f0 * (f1 / f0) ** t
    x = sine(f + 25 * np.sin(2 * np.pi * 38 * tt(n)), n) * np.sin(np.pi * t) ** 0.6
    x += sweep(noise(n), 'bp', f * 3, 3.0, 64) * 0.3 * np.sin(np.pi * t)
    return x * level


def click(level=0.2, fc=3500, dur=0.03):
    n = secs(dur)
    return filt(noise(n), 'bp', fc, 1.5) * np.exp(-tt(n) / 0.004) * level


def chirp(level=0.08):
    n = secs(0.025)
    f = rng.choice([1760, 2093, 2349, 2637, 3136, 3520])
    return square(f, n) * np.exp(-tt(n) / 0.008) * level


# ---------------------------------------------------------------- space & dynamics
def reverb_ir(dur=2.6, predelay=0.018, bright=7000, seed=3):
    r = np.random.default_rng(seed)
    n = secs(dur)
    t = tt(n)
    ir = np.zeros((2, n + secs(predelay)))
    for ch in range(2):
        x = r.standard_normal(n) * np.exp(-t / (dur / 6.9))
        x = sweep(x, 'lp', bright * np.exp(-t / (dur * 0.45)) + 900, 0.7, 256)
        for k in range(10):
            d = secs(r.uniform(0.004, 0.07))
            x[d] += r.uniform(-0.8, 0.8) * (1 - k / 12)
        ir[ch, secs(predelay):] = x
    return ir / np.sqrt(np.sum(ir ** 2) / 2)


def convolve(x, ir):
    return np.stack([signal.fftconvolve(x[ch], ir[ch])[: x.shape[1]] for ch in range(2)])


def limiter(x, ceiling=0.93, look=0.003, release=0.06):
    from scipy.ndimage import maximum_filter1d, uniform_filter1d
    peak = np.max(np.abs(x), axis=0)
    w = secs(look) * 2 + 1
    peak = maximum_filter1d(peak, w)
    g = np.minimum(1.0, ceiling / np.maximum(peak, 1e-9))
    g = uniform_filter1d(g, secs(look))
    # release: smooth upward recovery
    b, a = signal.butter(1, 1 / (release * SR) * 2)
    g = np.minimum(g, signal.filtfilt(b, a, g))
    return x * g


def lufs(x):
    """Integrated loudness (BS.1770-4 gated) of a (2, n) float signal at 48 kHz."""
    b1, a1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1.0, -1.69065929318241, 0.73248077421585]
    b2, a2 = [1.0, -2.0, 1.0], [1.0, -1.99004745483398, 0.99007225036621]
    y = signal.lfilter(b2, a2, signal.lfilter(b1, a1, x, axis=1), axis=1)
    blk, hop = int(0.4 * SR), int(0.1 * SR)
    z = np.array([np.mean(y[:, i:i + blk] ** 2, axis=1).sum() for i in range(0, y.shape[1] - blk, hop)])
    L = -0.691 + 10 * np.log10(z + 1e-12)
    g = z[L > -70]
    lg = -0.691 + 10 * np.log10(g.mean())
    g2 = g[-0.691 + 10 * np.log10(g) > lg - 10]
    return -0.691 + 10 * np.log10(g2.mean())
