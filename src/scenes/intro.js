// 01 PRINCIPLES + 02 KINETIC TYPE (0.0s – 4.0s)
// The orange dot is born, anticipates, leaps, lands (squash/stretch + shockwave), stretches into a
// baseline that presents "MAKE" and a variable-font "THINGS", collapses back into itself, gets
// launched by the landing letters of "M●VE" to become the O — then the camera dives into it.
import { C, rgba } from '../palette.js';
import * as K from '../engine/ease.js';
import { ellipse, capsule, trimPolyline, TAU } from '../engine/draw.js';

const CX = 960, FLOOR = 690, R0 = 34, HOP = 330;

export class Intro {
  constructor(engine, assets) {
    this.E = engine;
    this.font = assets.archivo;
    const f = this.font;
    this.cap = f.cap / f.upm;

    // MAKE — fixed axes.
    this.make = this.layout('MAKE', 1180, () => [100, 900], 6);
    // MOVE — the O slot is taken by the dot.
    this.move = this.layout('MOVE', 1300, () => [108, 900], 4);
    const o = this.move.letters[1];
    this.RO = (this.move.size * this.cap) / 2 * 1.04;
    this.O = { x: CX - this.move.width / 2 + o.x + o.adv / 2, y: FLOOR - this.RO };
    // THINGS — sized so the fully inflated word spans ~1540px.
    this.thingsSize = 1540 / f.measure('THINGS', 1, () => [125, 900], 0.0);
  }

  layout(str, targetW, axesAt, trackingPx = 0) {
    const f = this.font;
    const w1 = f.measure(str, 1, axesAt, 0);
    const size = (targetW - trackingPx * (str.length - 1)) / w1;
    const letters = [];
    let x = 0;
    for (let i = 0; i < str.length; i++) {
      const [a, b] = axesAt(i);
      const o = f.outline(str[i], a, b);
      const adv = (o.adv * size) / f.upm;
      letters.push({ ch: str[i], x, adv, axes: [a, b] });
      x += adv + trackingPx;
    }
    return { size, letters, width: x - trackingPx };
  }

  // ---------------------------------------------------------------- the dot's whole life, 0 → 3.5s
  dot(t) {
    if (t < 0.5) {
      const s = K.spring(t, 3.2, 0.38);
      const q = K.inOutCubic(K.clamp((t - 0.22) / 0.28));
      const sx = 1 + 0.3 * q, sy = 1 - 0.34 * q;
      return { k: 'e', x: CX, y: FLOOR - R0 * s * sy, rx: R0 * s * sx, ry: R0 * s * sy };
    }
    if (t < 1.0) {
      const u = (t - 0.5) / 0.5;
      const h = HOP * 4 * u * (1 - u);
      const v = Math.abs(1 - 2 * u);
      let sy = 1 + 0.62 * Math.pow(v, 1.6);
      sy = K.lerp(0.66, sy, K.outQuad(K.clamp((t - 0.5) / 0.045)));
      const sx = 1 / Math.pow(sy, 0.75);
      return { k: 'e', x: CX, y: FLOOR - h - R0 * sy, rx: R0 * sx, ry: R0 * sy };
    }
    if (t < 1.5) {
      const tau = t - 1.0;
      const sq = 0.58 * Math.exp(-tau * 8) * Math.cos(tau * TAU * 3.6);
      let sy = 1 - sq, sx = 1 + sq * 0.95;
      const g = K.inOutCubic(K.clamp((t - 1.3) / 0.2));
      sx *= 1 - 0.24 * g; sy *= 1 + 0.2 * g;
      return { k: 'e', x: CX, y: FLOOR - R0 * sy, rx: R0 * sx, ry: R0 * sy };
    }
    if (t < 3.0) {
      const tau = t - 1.5;
      const e = K.outExpo(K.clamp(tau / 0.22));
      let th = K.lerp(2 * R0 * 1.2, 10, e);
      const yc = K.lerp(FLOOR - R0 * 1.2, FLOOR + 5, e);
      const eL = K.spring(tau, 2.4, 0.62), eR = K.spring(tau - 0.03, 2.4, 0.62);
      const half = this.lineHalf(t);
      let x0 = CX - K.lerp(R0 * 0.76, half, eL), x1 = CX + K.lerp(R0 * 0.76, half, eR);
      // Beat kicks ripple the line's thickness.
      th *= 1 + 0.9 * K.hit(t, 2.0, 0.07) + 0.7 * K.hit(t, 2.5, 0.07);
      // Collapse back into the dot.
      const c = K.snap(K.clamp((t - 2.84) / 0.16));
      if (c > 0) {
        x0 = K.lerp(x0, CX - R0, c); x1 = K.lerp(x1, CX + R0, c);
        th = K.lerp(th, 2 * R0, c);
        return c >= 1 ? { k: 'e', x: CX, y: FLOOR - R0, rx: R0, ry: R0 } : { k: 'c', x0, x1, y: K.lerp(yc, FLOOR - R0, c), th };
      }
      return { k: 'c', x0, x1, y: yc, th };
    }
    if (t < 3.25) {
      // Launched by the landing letters: arc into the O slot, growing on the way.
      const u = (t - 3.0) / 0.25;
      const r = K.lerp(R0, this.RO, K.outCubic(u));
      const x = K.lerp(CX, this.O.x, K.inOutQuad(u));
      const yBase = K.lerp(FLOOR - R0, FLOOR - r, u);
      const h = 260 * 4 * u * (1 - u);
      const v = Math.abs(1 - 2 * u);
      const sy = 1 + 0.35 * v * v, sx = 1 / Math.pow(sy, 0.7);
      const pre = K.outQuad(K.clamp((t - 3.0) / 0.04));
      return { k: 'e', x, y: yBase - h, rx: r * K.lerp(1.25, sx, pre), ry: r * K.lerp(0.7, sy, pre) };
    }
    const tau = t - 3.25;
    const sq = 0.3 * Math.exp(-tau * 9) * Math.cos(tau * TAU * 3.4);
    const breathe = 1 + 0.012 * Math.sin((t - 3.25) * 9);
    const sy = (1 - sq) * breathe, sx = (1 + sq * 0.9) * breathe;
    return { k: 'e', x: this.O.x, y: FLOOR - this.RO * sy, rx: this.RO * sx, ry: this.RO * sy };
  }

  lineHalf(t) {
    const makeHalf = this.make.width / 2 + 34;
    if (t < 2.42) return makeHalf;
    const thingsHalf = this.thingsLayout(t).width / 2 + 34;
    const b = K.snap(K.clamp((t - 2.42) / 0.16));
    return K.lerp(makeHalf, thingsHalf, b);
  }

  thingsAxes(t, i, n) {
    const p = t - 2.5 - i * 0.03;
    if (p < 0) return { wd: 62, wg: 100, sy: 0 };
    const e = K.clamp(K.spring(p, 2.0, 0.72));
    let wd = K.lerp(62, 125, e);
    let wg = K.lerp(100, 900, K.outCubic(K.clamp(p / 0.28)));
    let sy = K.spring(p, 3.2, 0.42);
    const mid = (n - 1) / 2;
    const d = K.inCubic(K.clamp((t - 2.8 - Math.abs(i - mid) * 0.014) / 0.09));
    if (d > 0) { wd = K.lerp(wd, 62, d); wg = K.lerp(wg, 100, d); sy *= 1 - d; }
    return { wd, wg, sy };
  }

  thingsLayout(t) {
    const f = this.font, size = this.thingsSize, str = 'THINGS';
    const out = []; let x = 0;
    for (let i = 0; i < str.length; i++) {
      const a = this.thingsAxes(t, i, str.length);
      const o = f.outline(str[i], a.wd, a.wg);
      const adv = (o.adv * size) / f.upm;
      out.push({ o, x, adv, sy: a.sy });
      x += adv;
    }
    return { letters: out, width: x };
  }

  // ---------------------------------------------------------------- drawing
  draw(t) {
    const E = this.E, ctx = E.ctx;
    // Camera dive into the dot (3.5 → 4.0).
    const z = K.snap(K.clamp((t - 3.5) / 0.5));
    const Z = 300 / this.RO;
    const O = this.O;
    const cam = (depth) => {
      const zoom = Math.pow(Z * depth, z);
      const cx = K.lerp(O.x, CX, z), cy = K.lerp(O.y, 540, z);
      ctx.setTransform(zoom, 0, 0, zoom, cx - zoom * O.x, cy - zoom * O.y);
    };

    cam(0.55);
    this.drawGrid(ctx, t);
    cam(1);
    this.drawImpact(ctx, t);

    // Words
    ctx.fillStyle = C.PAPER;
    if (t >= 1.95 && t < 2.6) this.drawMake(ctx, t);
    if (t >= 2.45 && t < 3.0) this.drawThings(ctx, t);
    if (t >= 2.8) { cam(3.2); ctx.globalAlpha = 1 - K.inQuad(K.clamp((z - 0.45) / 0.55)); this.drawMove(ctx, t); ctx.globalAlpha = 1; }

    // The dot / line (always on top)
    cam(1);
    const d = this.dot(t);
    ctx.fillStyle = C.SIGNAL;
    if (d.k === 'e') ellipse(ctx, d.x, d.y, d.rx, d.ry); else capsule(ctx, d.x0, d.x1, d.y, d.th);
    ctx.fill();
    if (t >= 1.8 && t < 2.86) this.drawMeasure(ctx, t, d);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  drawGrid(ctx, t) {
    if (t < 0.98) return;
    const R = 1650 * K.outExpo(K.clamp((t - 1.0) / 1.1));
    const ix = CX, iy = FLOOR, sp = 40;
    const fade = 1 - K.smoothstep(3.7, 4.0, t);
    for (let gy = sp / 2 - 40; gy < 1080 + 40; gy += sp) {
      for (let gx = sp / 2 - 40; gx < 1920 + 40; gx += sp) {
        const dd = Math.hypot(gx - ix, gy - iy);
        if (dd > R + 40) continue;
        const b = Math.exp(-Math.pow((dd - R) / 70, 2));
        const base = 0.16 * fade;
        const a = Math.min(1, base + b * 0.9);
        const r = 1.5 + b * 3.2;
        ctx.fillStyle = b > 0.05 ? rgba(C.PAPER, a) : rgba('#8C8C99', base);
        ctx.beginPath(); ctx.arc(gx, gy, r, 0, TAU); ctx.fill();
      }
    }
  }

  drawImpact(ctx, t) {
    // Birth ripple
    if (t < 0.45) {
      const u = K.clamp(t / 0.45);
      ctx.strokeStyle = rgba(C.SIGNAL, 0.7 * (1 - u));
      ctx.lineWidth = 3 * (1 - u) + 0.5;
      ctx.beginPath(); ctx.arc(CX, FLOOR - R0, R0 * K.clamp(t / 0.08) + 110 * K.outExpo(u), 0, TAU); ctx.stroke();
    }
    const tau = t - 1.0;
    if (tau < 0 || tau > 1.2) return;
    // Shockwaves
    for (const [delay, col, w0, reach, dur] of [[0, C.PAPER, 9, 1350, 0.85], [0.1, C.SIGNAL, 3, 900, 0.6]]) {
      const u = K.clamp((tau - delay) / dur);
      if (u <= 0 || u >= 1) continue;
      ctx.strokeStyle = rgba(col, Math.pow(1 - u, 1.4));
      ctx.lineWidth = w0 * (1 - u) + 1;
      ctx.beginPath(); ctx.arc(CX, FLOOR, 40 + reach * K.outQuart(u), 0, TAU); ctx.stroke();
    }
    // Burst lines — trim-path "shoot out" in the upper hemisphere
    ctx.strokeStyle = C.PAPER; ctx.lineCap = 'round';
    const N = 11;
    for (let i = 0; i < N; i++) {
      const a = -Math.PI + (i + 0.5) / N * Math.PI;
      const long = i % 2 ? 1 : 0.7;
      const head = K.outExpo(K.clamp(tau / 0.32));
      const tail = K.inOutCubic(K.clamp((tau - 0.06) / 0.3));
      if (tail >= 1) continue;
      const r1 = 70 + 260 * long * head, r0 = 70 + 260 * long * tail;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(CX + Math.cos(a) * r0, FLOOR + Math.sin(a) * r0);
      ctx.lineTo(CX + Math.cos(a) * r1, FLOOR + Math.sin(a) * r1);
      ctx.stroke();
    }
    // Dust puffs sliding along the floor
    for (let i = 0; i < 10; i++) {
      const side = i % 2 ? 1 : -1, k = (i >> 1) / 5;
      const u = K.clamp(tau / (0.55 + 0.1 * k));
      if (u >= 1) continue;
      const x = CX + side * (60 + (160 + 240 * k) * K.outExpo(u));
      const r = (2.5 + 4.5 * (1 - k)) * (1 - u);
      ctx.fillStyle = rgba(C.PAPER, 0.85 * (1 - u));
      ctx.beginPath(); ctx.arc(x, FLOOR - r - 4 * Math.sin(u * Math.PI) * (1 + k * 4), r, 0, TAU); ctx.fill();
    }
    // Floor line flashes out from the impact then hands over to the capsule
    const fl = K.outExpo(K.clamp(tau / 0.4)), fo = 1 - K.smoothstep(0.35, 0.6, tau);
    if (fo > 0) {
      ctx.strokeStyle = rgba(C.PAPER, 0.4 * fo); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(CX - 620 * fl, FLOOR + 1); ctx.lineTo(CX + 620 * fl, FLOOR + 1); ctx.stroke();
    }
  }

  drawGlyph(ctx, o, x, y, size, sx = 1, sy = 1, ax = 0) {
    // Draw glyph outline o with origin (x, baseline y); scale about (x + ax, y).
    ctx.save();
    ctx.translate(x + ax, y);
    ctx.scale(sx, sy);
    ctx.beginPath();
    this.font.trace(ctx, o, -ax, 0, size);
    ctx.fill();
    ctx.restore();
  }

  drawMake(ctx, t) {
    const L = this.make, x0 = CX - L.width / 2, capPx = L.size * this.cap;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, 1920, FLOOR); ctx.clip();
    L.letters.forEach((l, i) => {
      const e = K.spring(t - 2.0 - i * 0.035, 3.0, 0.55);
      const out = K.inExpo(K.clamp((t - 2.36 - (3 - i) * 0.022) / 0.1));
      const dy = (1 - e) * (capPx + 40) + out * (capPx + 40);
      const o = this.font.outline(l.ch, ...l.axes);
      this.drawGlyph(ctx, o, x0 + l.x, FLOOR + dy, L.size);
    });
    ctx.restore();
  }

  drawThings(ctx, t) {
    const L = this.thingsLayout(t), x0 = CX - L.width / 2;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, 1920, FLOOR); ctx.clip();
    for (const l of L.letters) {
      if (l.sy <= 0.001) continue;
      this.drawGlyph(ctx, l.o, x0 + l.x, FLOOR, this.thingsSize, 1, l.sy, l.adv / 2);
    }
    ctx.restore();
  }

  drawMove(ctx, t) {
    const L = this.move, x0 = CX - L.width / 2;
    const fall = K.inQuad(K.clamp((t - 2.8) / 0.2));
    const dy = -(1 - fall) * 1000;
    const tau = t - 3.0;
    const w = tau > 0 ? Math.exp(-tau * 10) * Math.cos(tau * TAU * 4) : 0;
    const sy = 1 - 0.24 * w, sx = 1 + 0.16 * w;
    const stretch = tau < 0 ? 1 + 0.25 * fall * fall : 1;
    L.letters.forEach((l, i) => {
      if (l.ch === 'O') return;
      const o = this.font.outline(l.ch, ...l.axes);
      this.drawGlyph(ctx, o, x0 + l.x, FLOOR + dy, L.size, (tau < 0 ? 1 / Math.sqrt(stretch) : sx), (tau < 0 ? stretch : sy), l.adv / 2);
    });
  }

  // Figma-style measurement: end ticks + live width readout riding the baseline.
  drawMeasure(ctx, t, d) {
    if (d.k !== 'c') return;
    const a = K.smoothstep(1.8, 1.95, t) * (1 - K.smoothstep(2.78, 2.86, t));
    if (a <= 0) return;
    const y = FLOOR + 44;
    ctx.strokeStyle = rgba(C.PAPER, 0.45 * a); ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(d.x0, y - 8); ctx.lineTo(d.x0, y + 8);
    ctx.moveTo(d.x1, y - 8); ctx.lineTo(d.x1, y + 8);
    ctx.moveTo(d.x0, y); ctx.lineTo((d.x0 + d.x1) / 2 - 64, y);
    ctx.moveTo((d.x0 + d.x1) / 2 + 64, y); ctx.lineTo(d.x1, y);
    ctx.stroke();
    ctx.font = '500 17px "JetBrains Mono"';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = rgba(C.PAPER, 0.75 * a);
    ctx.fillText(`${Math.round(d.x1 - d.x0)} PX`, (d.x0 + d.x1) / 2, y + 1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  }
}
