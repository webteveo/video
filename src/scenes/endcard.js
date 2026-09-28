// 08 IDENTITY (12.9s – 15.0s)
// The dot writes the name: it leaps to the baseline and races along it, each letter inflating
// (variable width + weight) as it passes; then it hops down to finish the tagline — as its period.
import { C, rgba } from '../palette.js';
import * as K from '../engine/ease.js';
import { ellipse, capsule, scramble, TAU } from '../engine/draw.js';

const CX = 960, YN = 598, YT = 722, YK = 368, R0 = 34;
const START = [960, 690 - R0 * 1.08];
const J0 = 13.05, J1 = 13.21, S1 = 13.47, H1 = 13.76;
const TAG = 'every frame, on purpose';
const KICKER = 'MOTION DESIGN  ·  SHOWREEL 2026';

export class EndCard {
  constructor(engine, assets) {
    this.E = engine;
    const f = (this.font = assets.archivo);
    this.axesF = [125, 860];
    this.size = 1180 / f.measure('CLAUDE', 1, () => this.axesF, 0);
    let x = 0;
    this.slots = [];
    for (const ch of 'CLAUDE') {
      const adv = (f.outline(ch, ...this.axesF).adv * this.size) / f.upm;
      this.slots.push({ ch, x, adv });
      x += adv;
    }
    this.nameW = x; this.xL = CX - x / 2; this.xR = CX + x / 2;
    this.lineY = YN + 30;
    const ctx = engine.ctx;
    ctx.font = 'italic 400 84px "Instrument Serif"';
    this.tagW = ctx.measureText(TAG).width;
    this.charX = [...TAG].map((_, i) => ctx.measureText(TAG.slice(0, i)).width);
    this.rP = 10.5;
    this.tagX = CX - (this.tagW + 7 + 2 * this.rP) / 2;
    this.P = [this.tagX + this.tagW + 7 + this.rP, YT - this.rP];
    this.popT = this.slots.map((s) => this.passTime(this.xL + s.x + s.adv * 0.45));
  }

  slideX(t) {
    const u = K.clamp((t - J1) / (S1 - J1));
    return K.lerp(this.xL - 26, this.xR + 26, K.swift(u));
  }

  passTime(x) {
    for (let t = J1; t <= S1; t += 0.001) if (this.slideX(t) >= x) return t;
    return S1;
  }

  dot(t) {
    if (t < J0) {
      const p = 1 + 0.32 * K.wobble(t - 13.0, 3.2, 0.3);
      return { x: START[0], y: START[1], rx: R0 * p, ry: R0 * p };
    }
    if (t < J1) {
      const u = (t - J0) / (J1 - J0);
      const e = K.inOutQuad(u);
      const x = K.lerp(START[0], this.xL - 26, e);
      const y = K.lerp(START[1], this.lineY, e) - 150 * 4 * u * (1 - u);
      const v = Math.abs(1 - 2 * u), s = 1 + 0.35 * v;
      return { x, y, rx: R0 / Math.sqrt(s), ry: R0 * s };
    }
    if (t < S1) {
      const x = this.slideX(t);
      const sp = (this.slideX(t + 0.004) - x) / 0.004;
      const s = 1 + Math.min(0.6, sp / 12000);
      return { x, y: this.lineY, rx: R0 * s, ry: R0 / s };
    }
    const r1 = this.rP;
    if (t < H1) {
      const u = (t - S1) / (H1 - S1);
      const e = K.inOutQuad(u);
      const x = K.lerp(this.xR + 26, this.P[0], e);
      const y = K.lerp(this.lineY, this.P[1], e) - 170 * 4 * u * (1 - u);
      const r = K.lerp(R0, r1, K.inOutCubic(u));
      const v = Math.abs(1 - 2 * u), s = 1 + 0.3 * v * v;
      return { x, y, rx: r / Math.sqrt(s), ry: r * s };
    }
    const tau = t - H1;
    const sq = 0.45 * Math.exp(-tau * 10) * Math.cos(tau * TAU * 4);
    const beat = 1 + 0.45 * Math.max(0, K.wobble(t - 14.5, 2.6, 0.35));
    return { x: this.P[0], y: this.P[1] + r1 * sq * 0.5, rx: r1 * (1 + sq * 0.8) * beat, ry: r1 * (1 - sq) * beat };
  }

  draw(t) {
    const E = this.E, ctx = E.ctx;
    const push = 1 + 0.03 * K.inOutQuad(K.clamp((t - 13.8) / 1.2));
    ctx.setTransform(push, 0, 0, push, CX - push * CX, 540 - push * 540);
    this.drawGrid(ctx, t);
    this.drawKicker(ctx, t);
    this.drawName(ctx, t);
    this.drawTagline(ctx, t);
    // Underline trail left by the dot
    if (t >= J1 && t < S1 + 0.2) {
      const x1 = t < S1 ? this.slideX(t) : this.xR + 26;
      const x0 = t < S1 ? this.xL - 26 : K.lerp(this.xL - 26, this.xR + 26, K.inExpo(K.clamp((t - S1) / 0.16)));
      if (x1 - x0 > 1) { ctx.fillStyle = C.SIGNAL; capsule(ctx, x0, x1, this.lineY, 8); ctx.fill(); }
    }
    // Rings on the key beats
    for (const [t0, x, y, r, reach] of [[13.0, START[0], START[1], R0, 70], [H1, this.P[0], this.P[1], this.rP, 34], [14.5, this.P[0], this.P[1], this.rP, 28]]) {
      const u = K.clamp((t - t0) / 0.32);
      if (u <= 0 || u >= 1) continue;
      ctx.strokeStyle = rgba(C.SIGNAL, 0.7 * Math.pow(1 - u, 2)); ctx.lineWidth = 2.5 * (1 - u) + 0.5;
      ctx.beginPath(); ctx.arc(x, y, r + reach * K.outExpo(u), 0, TAU); ctx.stroke();
    }
    const d = this.dot(t);
    ctx.fillStyle = C.SIGNAL;
    ellipse(ctx, d.x, d.y, d.rx, d.ry); ctx.fill();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  drawGrid(ctx, t) {
    const a = K.smoothstep(13.95, 14.5, t);
    if (a <= 0) return;
    const R = 1400 * K.outCubic(K.clamp((t - 13.95) / 0.8));
    for (let y = 20; y < 1080; y += 40) for (let x = 20; x < 1920; x += 40) {
      const d = Math.hypot(x - CX, y - 540);
      if (d > R) continue;
      const fall = Math.exp(-Math.pow(d / 900, 2));
      ctx.fillStyle = rgba('#8C8C99', 0.13 * a * fall);
      ctx.beginPath(); ctx.arc(x, y, 1.5, 0, TAU); ctx.fill();
    }
  }

  drawName(ctx, t) {
    const f = this.font;
    const sweep = K.clamp((t - 14.0) / 0.5);
    this.slots.forEach((s, i) => {
      const p = t - this.popT[i];
      if (p <= 0) return;
      const sy = K.spring(p, 3.0, 0.45);
      const wd = K.lerp(62, 125, K.clamp(K.spring(p, 2.4, 0.7)));
      const wg = K.lerp(250, 860, K.outCubic(K.clamp(p / 0.22)));
      const o = f.outline(s.ch, wd, wg);
      const adv = (o.adv * this.size) / f.upm;
      const x = this.xL + s.x + (s.adv - adv) / 2;
      ctx.save();
      ctx.translate(x + adv / 2, YN);
      ctx.scale(1, sy);
      ctx.beginPath();
      f.trace(ctx, o, -adv / 2, 0, this.size);
      ctx.fillStyle = C.PAPER;
      ctx.fill();
      if (sweep > 0 && sweep < 1) {
        // Iridescent light sweep, clipped to the glyph
        ctx.clip();
        const bx = K.lerp(this.xL - 400, this.xR + 400, K.inOutCubic(sweep)) - (x + adv / 2);
        const g = ctx.createLinearGradient(bx - 160, 0, bx + 160, 0);
        g.addColorStop(0, 'rgba(255,90,31,0)');
        g.addColorStop(0.35, 'rgba(255,90,31,0.9)');
        g.addColorStop(0.5, 'rgba(215,255,58,0.95)');
        g.addColorStop(0.65, 'rgba(35,64,255,0.9)');
        g.addColorStop(1, 'rgba(35,64,255,0)');
        ctx.setTransform(ctx.getTransform().multiply(new DOMMatrix([1, 0, -0.35, 1, 0, 0])));
        ctx.fillStyle = g;
        ctx.fillRect(bx - 200, -this.size, 400, this.size * 1.4);
      }
      ctx.restore();
    });
  }

  drawTagline(ctx, t) {
    if (t < S1 - 0.02) return;
    ctx.font = 'italic 400 84px "Instrument Serif"';
    ctx.textBaseline = 'alphabetic';
    for (let i = 0; i < TAG.length; i++) {
      const tc = S1 + (this.charX[i] / this.tagW) * 0.24;
      const u = K.clamp((t - tc) / 0.2);
      if (u <= 0) continue;
      ctx.fillStyle = rgba(C.PAPER, 0.9 * K.clamp(u * 2.5));
      ctx.fillText(TAG[i], this.tagX + this.charX[i], YT + (1 - K.glide(u)) * 18);
    }
  }

  drawKicker(ctx, t) {
    const u = K.clamp((t - 13.74) / 0.34);
    if (u <= 0) return;
    ctx.font = '600 19px "JetBrains Mono"';
    ctx.letterSpacing = '6px';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const frame = Math.floor(t * 30);
    ctx.fillStyle = rgba(C.PAPER, 0.8);
    ctx.fillText(scramble(KICKER, u * 1.15, 11, frame), CX, YK);
    const w = ctx.measureText(KICKER).width;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.letterSpacing = '0px';
    const L = 150 * K.glide(K.clamp((t - 13.82) / 0.4));
    ctx.fillStyle = rgba(C.PAPER, 0.4);
    ctx.fillRect(CX - w / 2 - 28 - L, YK - 1, L, 2);
    ctx.fillRect(CX + w / 2 + 28, YK - 1, L, 2);
  }
}
