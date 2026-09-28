// Easing, springs and keyframes — the vocabulary of every move in the reel.

export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, x) => clamp((x - a) / (b - a));
export const remap = (x, a, b, c, d, e = linear) => lerp(c, d, e(invLerp(a, b, x)));
export const smoothstep = (a, b, x) => { const t = invLerp(a, b, x); return t * t * (3 - 2 * t); };
export const fract = (x) => x - Math.floor(x);

export const linear = (t) => t;
export const inQuad = (t) => t * t;
export const outQuad = (t) => 1 - (1 - t) * (1 - t);
export const inOutQuad = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const inCubic = (t) => t * t * t;
export const outCubic = (t) => 1 - Math.pow(1 - t, 3);
export const inOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const inQuart = (t) => t * t * t * t;
export const outQuart = (t) => 1 - Math.pow(1 - t, 4);
export const inOutQuart = (t) => (t < 0.5 ? 8 * t ** 4 : 1 - Math.pow(-2 * t + 2, 4) / 2);
export const outQuint = (t) => 1 - Math.pow(1 - t, 5);
export const inOutQuint = (t) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2);
export const inExpo = (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10));
export const outExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const inOutExpo = (t) =>
  t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;
export const inCirc = (t) => 1 - Math.sqrt(1 - t * t);
export const outCirc = (t) => Math.sqrt(1 - Math.pow(t - 1, 2));
export const inBack = (t, s = 1.70158) => (s + 1) * t * t * t - s * t * t;
export const outBack = (t, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
export const inOutBack = (t, s = 1.70158 * 1.525) =>
  t < 0.5
    ? (Math.pow(2 * t, 2) * ((s + 1) * 2 * t - s)) / 2
    : (Math.pow(2 * t - 2, 2) * ((s + 1) * (t * 2 - 2) + s) + 2) / 2;
export const outElastic = (t) =>
  t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
export const outBounce = (t) => {
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
};

// CSS-style cubic-bezier timing function (Newton + bisection fallback).
export function bezier(x1, y1, x2, y2) {
  const A = (a, b) => 1 - 3 * b + 3 * a, B = (a, b) => 3 * b - 6 * a, C = (a) => 3 * a;
  const calc = (t, a, b) => ((A(a, b) * t + B(a, b)) * t + C(a)) * t;
  const slope = (t, a, b) => 3 * A(a, b) * t * t + 2 * B(a, b) * t + C(a);
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const s = slope(t, x1, x2);
      if (Math.abs(s) < 1e-6) break;
      const e = calc(t, x1, x2) - x;
      if (Math.abs(e) < 1e-7) return calc(t, y1, y2);
      t -= e / s;
    }
    let lo = 0, hi = 1; t = x;
    for (let i = 0; i < 40; i++) {
      const v = calc(t, x1, x2);
      if (Math.abs(v - x) < 1e-7) break;
      if (v < x) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
    return calc(t, y1, y2);
  };
}

// House curves.
export const snap = bezier(0.75, 0, 0.15, 1);      // hard in, silky out — the signature move
export const swift = bezier(0.55, 0, 0.1, 1);
export const glide = bezier(0.16, 1, 0.3, 1);      // expo-like out
export const punch = bezier(0.2, 1.6, 0.4, 1);     // overshooting out
export const anticipate = bezier(0.6, -0.35, 0.7, 0.05);
export const heavy = bezier(0.9, 0, 0.1, 1);

// Damped harmonic oscillator released from 0 toward 1. freq in Hz, damp = ratio ζ.
export function spring(t, freq = 3, damp = 0.35, v0 = 0) {
  if (t <= 0) return 0;
  const w0 = 2 * Math.PI * freq;
  if (damp >= 1) {
    const c = -1, d = v0 - w0 * c; // x = 1 + (c + d t) e^{-w0 t}
    return 1 + (c + d * t) * Math.exp(-w0 * t);
  }
  const wd = w0 * Math.sqrt(1 - damp * damp);
  const a = -1, b = (v0 + damp * w0 * a) / wd;
  return 1 + Math.exp(-damp * w0 * t) * (a * Math.cos(wd * t) + b * Math.sin(wd * t));
}

// Decaying oscillation around 0 (for wobbles / follow-through): starts at amp with given velocity sign.
export function wobble(t, freq = 4, damp = 0.25) {
  if (t < 0) return 0;
  const w = 2 * Math.PI * freq;
  return Math.exp(-damp * w * t) * Math.sin(w * t);
}

// Keyframe track: keys = [[time, value, ease?], ...]; ease applies to the segment starting at that key.
export function track(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, v0, e = linear] = keys[i];
    const [t1, v1] = keys[i + 1];
    if (t < t1) {
      const u = e((t - t0) / (t1 - t0));
      if (Array.isArray(v0)) return v0.map((v, k) => v + (v1[k] - v) * u);
      return v0 + (v1 - v0) * u;
    }
  }
  return keys[keys.length - 1][1];
}

// Envelope for a triggered hit: instant attack, exponential decay (seconds).
export const hit = (t, t0, decay = 0.25) => (t < t0 ? 0 : Math.exp(-(t - t0) / decay));
// Smooth attack/decay pulse centred on t0.
export const pulse = (t, t0, attack = 0.02, decay = 0.2) =>
  t < t0 - attack ? 0 : t < t0 ? smoothstep(t0 - attack, t0, t) : Math.exp(-(t - t0) / decay);

// Stagger helper: local progress for item i of n inside [t0, t0+dur] with per-item delay.
export const stagger = (t, t0, i, delay, dur) => clamp((t - t0 - i * delay) / dur);
