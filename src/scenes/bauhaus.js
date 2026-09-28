// 05 SHAPE LAYERS (8.0s – 10.0s)
// The particle disc is the hero of a 5×3 Bauhaus poster grid. The camera pulls back as tiles light
// up from the centre; every tile loops a different motion principle on the beat, annotated like a
// spec sheet. Rows shuffle on the downbeat, then the cards flip away in 3D (true perspective quads)
// leaving only the dot — which becomes the top of a pillar when the drop hits.
import { C, lin, rgba } from '../palette.js';
import * as K from '../engine/ease.js';
import { ellipse, roundRect, trimPolyline, regularPoly, TAU } from '../engine/draw.js';

const TW = 384, TH = 360, HX = TW / 2, HY = TH / 2;
const HERO_R = 110;
export const DOT_END_PX = 20;
const Z0 = 250 / HERO_R;

const FLIP_VS = `#version 300 es
layout(location=0) in vec2 aPos;
uniform vec2 uCenter, uSize, uRes; uniform float uAngle, uF; uniform vec4 uUV;
out vec2 vUv;
void main(){
  vec2 c = aPos;                         // corners in -0.5..0.5
  vec2 d = c * uSize;
  float x = d.x * cos(uAngle), z = d.x * sin(uAngle);
  float w = (uF + z) / uF;
  vec2 ndcC = vec2(uCenter.x / uRes.x * 2.0 - 1.0, 1.0 - uCenter.y / uRes.y * 2.0);
  vec2 off = vec2(x, -d.y) * 2.0 / uRes;
  gl_Position = vec4(ndcC * w + off, 0.0, w);
  vUv = vec2(mix(uUV.x, uUV.z, c.x + 0.5), mix(uUV.y, uUV.w, c.y + 0.5));
}`;
const FLIP_FS = `
in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform float uAngle; uniform vec3 uBack;
void main(){
  float ca = cos(uAngle);
  vec3 col = ca > 0.0 ? srgb2lin(texture(uTex, vUv).rgb) : uBack;
  col *= 0.45 + 0.55 * pow(abs(ca), 0.7);
  o = vec4(col, 1.0);
}`;

// [bg, fg, label]
const TILES = [
  [C.PAPER, C.COBALT, 'TRUCHET  ROT 90°'], [C.SIGNAL, C.PAPER, 'EQ  NOISE 8TH'], [C.PAPER, C.INK, 'SNAP  .75 0 .15 1'], [C.ACID, C.INK, 'OPEN / CLOSE'], [C.COBALT, C.PAPER, 'RIPPLE  1/8'],
  [C.INK, C.ACID, 'SQUASH & STRETCH'], [C.COBALT, C.PAPER, 'FLIP  SCALE-Y'], [C.INK, C.SIGNAL, 'HERO'], [C.PAPER, C.SIGNAL, 'MORPH  RADIUS'], [C.SIGNAL, C.INK, 'WAVE  45°'],
  [C.SIGNAL, C.PAPER, 'TRIM PATH'], [C.PAPER, C.INK, 'OVERSHOOT  2.5'], [C.COBALT, C.ACID, 'SIN(ωt − kx)'], [C.INK, C.PAPER, 'STAGGER  60MS'], [C.ACID, C.COBALT, 'WRITE-ON'],
];

export class Bauhaus {
  constructor(engine) {
    this.E = engine;
    const r = engine.r, gl = engine.gl;
    this.flip = r.program(FLIP_FS, FLIP_VS);
    this.tex = r.texture(1920, 1080, { float: false });
    this.quad = gl.createVertexArray();
    gl.bindVertexArray(this.quad);
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.back = lin(C.INK2);
    this.ink = lin(C.INK);
  }

  // Grid position of tile (c, r) at time t (after row shuffles), in screen px (top-left).
  pos(c, r, t) {
    const shift = r === 0 ? -1 : r === 2 ? 1 : 0;
    const e = K.snap(K.clamp((t - 9.0) / 0.32));
    let x = c * TW + shift * TW * e;
    x = ((x % 1920) + 1920) % 1920;
    return [x, r * TH];
  }

  activation(c, r) {
    const d = Math.max(Math.abs(c - 2), Math.abs(r - 1));
    return 8.0 + (d === 0 ? 0 : 0.06 + (d - 1) * 0.1 + (c + r * 5) % 3 * 0.02);
  }

  flipAngle(c, r, t) {
    if (c === 2 && r === 1) return 0;
    const [x, y] = this.pos(c, r, t);
    const d = Math.abs(x / TW - 2) + Math.abs(y / TH - 1);
    return Math.PI * K.snap(K.clamp((t - 9.5 - d * 0.04) / 0.26));
  }

  // --------------------------------------------------------------- tile programs (local coords)
  tile(ctx, i, t, p) {
    const [bg, fg] = TILES[i];
    const tau = t - 8.0;
    const b = tau * 2, n = Math.floor(b), f = b - n;       // beat index / fraction
    const e8 = tau * 4, f8 = e8 - Math.floor(e8);           // eighth-note fraction
    ctx.fillStyle = fg; ctx.strokeStyle = fg;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const pop = K.spring(t - this._act - 0.08, 3.4, 0.45);
    ctx.save();
    ctx.translate(HX, HY);
    ctx.scale(pop, pop);
    switch (i) {
      case 0: { // Truchet quarter-discs, each cell turning 90° per beat, staggered
        for (let k = 0; k < 4; k++) {
          const cx = (k % 2 ? 1 : -1) * 72, cy = (k > 1 ? 1 : -1) * 72;
          const turn = n + K.outBack(K.clamp((f - k * 0.08) / 0.42), 2.2);
          ctx.save(); ctx.translate(cx, cy); ctx.rotate((k * 1 + turn) * Math.PI / 2);
          ctx.beginPath(); ctx.moveTo(-66, -66); ctx.arc(-66, -66, 132, 0, Math.PI / 2); ctx.closePath(); ctx.fill();
          ctx.restore();
        }
        break;
      }
      case 1: { // EQ bars on eighth notes
        const N = 7;
        for (let k = 0; k < N; k++) {
          const x = (k - (N - 1) / 2) * 38;
          const lvl = 0.35 + 0.65 * Math.abs(Math.sin(k * 1.7 + Math.floor(e8) * 2.3)) * Math.exp(-f8 * 2.2);
          const h = 40 + 190 * lvl;
          ctx.lineWidth = 24;
          ctx.beginPath(); ctx.moveTo(x, 95); ctx.lineTo(x, 95 - h); ctx.stroke();
        }
        break;
      }
      case 2: { // Snap-rotating square with counter-rotating core
        const e = K.snap(K.clamp(f / 0.5));
        ctx.save(); ctx.rotate((n + e) * Math.PI / 2);
        ctx.fillRect(-82, -82, 164, 164); ctx.restore();
        ctx.save(); ctx.rotate(-(n + e) * Math.PI); ctx.fillStyle = C.SIGNAL; ctx.fillRect(-30, -30, 60, 60); ctx.restore();
        break;
      }
      case 3: { // Chomping semicircles
        const m = 0.62 * Math.pow(Math.sin(Math.PI * K.clamp(f / 0.7)), 2);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 108, m, TAU - m); ctx.closePath(); ctx.fill();
        const px = 150 - 150 * f;
        if (px > 30) { ctx.beginPath(); ctx.arc(px, 0, 14, 0, TAU); ctx.fill(); }
        break;
      }
      case 4: { // Ripples every eighth
        ctx.lineWidth = 8;
        for (let k = 0; k < 4; k++) {
          const age = (e8 - Math.floor(e8)) + k;
          const u = age / 3.2;
          if (u > 1) continue;
          ctx.globalAlpha = 1 - u;
          ctx.lineWidth = 10 * (1 - u) + 1;
          ctx.beginPath(); ctx.arc(0, 0, 18 + 190 * K.outCubic(u), 0, TAU); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(0, 0, 16, 0, TAU); ctx.fill();
        break;
      }
      case 5: { // Bouncing ball, squash & stretch
        const floor = 92, R = 30, h = 190 * 4 * f * (1 - f);
        const v = Math.abs(1 - 2 * f);
        let sy = 1 + 0.45 * v * v, sx = 1 / Math.sqrt(sy);
        const sq = Math.min(f, 1 - f);
        if (sq < 0.07) { const q = 1 - sq / 0.07; sy = K.lerp(sy, 0.55, q); sx = K.lerp(sx, 1.5, q); }
        ctx.fillStyle = C.PAPER; ctx.globalAlpha = 0.35; ctx.fillRect(-120, floor, 240, 3); ctx.globalAlpha = 1;
        ctx.fillStyle = fg;
        ellipse(ctx, 0, floor - h - R * sy, R * sx, R * sy); ctx.fill();
        break;
      }
      case 6: { // Triangle flip (scale-Y through zero)
        const e = K.snap(K.clamp(f / 0.55));
        const s = Math.cos(Math.PI * (n + e));
        ctx.save(); ctx.scale(1, s); ctx.fillStyle = s > 0 ? fg : C.ACID;
        regularPoly(ctx, 0, 14, 118, 3); ctx.fill(); ctx.restore();
        break;
      }
      case 7: { // Hero: disc + orbiting satellite (drawn separately at the end of the scene)
        ctx.strokeStyle = rgba(C.PAPER, 0.18); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, 150, 0, TAU); ctx.stroke();
        const a = tau * Math.PI * 2 * 0.9 - Math.PI / 2;
        ctx.fillStyle = C.PAPER;
        ctx.beginPath(); ctx.arc(Math.cos(a) * 150, Math.sin(a) * 150, 11, 0, TAU); ctx.fill();
        break;
      }
      case 8: { // Shape morph through keyed radii
        const keys = [[200, 200, 100], [176, 176, 14], [270, 112, 56], [112, 240, 56]];
        const a = keys[((n % 4) + 4) % 4], bb = keys[(((n + 1) % 4) + 4) % 4];
        const e = K.snap(K.clamp((f - 0.1) / 0.5));
        const w = K.lerp(a[0], bb[0], e), h = K.lerp(a[1], bb[1], e), rr = K.lerp(a[2], bb[2], e);
        roundRect(ctx, -w / 2, -h / 2, w, h, rr); ctx.fill();
        break;
      }
      case 9: { // Dot-matrix diagonal wave
        for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
          const r = 5 + 17 * Math.pow(0.5 + 0.5 * Math.sin(tau * 9 - (x + y) * 0.75), 2);
          ctx.beginPath(); ctx.arc((x - 2) * 58, (y - 2) * 58, r, 0, TAU); ctx.fill();
        }
        break;
      }
      case 10: { // Material-style arc spinner
        const head = tau * 7.5 + 1.2 * Math.sin(tau * 5);
        const len = 0.35 + 1.9 * (0.5 + 0.5 * Math.sin(tau * 6.3));
        ctx.lineWidth = 24;
        ctx.beginPath(); ctx.arc(0, 0, 100, head - len, head); ctx.stroke();
        break;
      }
      case 11: { // Plus → X with elastic overshoot
        const e = K.outBack(K.clamp(f / 0.5), 2.5);
        ctx.save(); ctx.rotate((n + e) * Math.PI / 4);
        roundRect(ctx, -115, -24, 230, 48, 24); ctx.fill();
        roundRect(ctx, -24, -115, 48, 230, 24); ctx.fill();
        ctx.restore();
        break;
      }
      case 12: { // Travelling sine
        const A = 62 * (0.75 + 0.25 * K.hit(tau % 0.5, 0, 0.2));
        const pts = [];
        for (let x = -150; x <= 150; x += 6) pts.push([x, Math.sin(x * 0.035 - tau * 11) * A * Math.sin((x + 150) / 300 * Math.PI)]);
        ctx.lineWidth = 16;
        trimPolyline(ctx, pts, 0, 1); ctx.stroke();
        break;
      }
      case 13: { // Checker flip with stagger
        for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
          const e = K.snap(K.clamp((f - (x + y) * 0.06) / 0.4));
          const s = Math.cos(Math.PI * (n + e));
          const on = ((x + y) % 2 === 0) !== (s < 0);
          ctx.save(); ctx.translate((x - 1) * 92, (y - 1) * 92); ctx.scale(s, 1);
          ctx.fillStyle = on ? C.SIGNAL : C.PAPER;
          ctx.fillRect(-38, -38, 76, 76); ctx.restore();
        }
        break;
      }
      case 14: { // Zigzag write-on / write-off
        const pts = [[-150, 60], [-90, -60], [-30, 60], [30, -60], [90, 60], [150, -60]];
        const a = K.inOutCubic(K.clamp((f - 0.42) / 0.5)), bb = K.glide(K.clamp(f / 0.5));
        ctx.lineWidth = 20;
        trimPolyline(ctx, pts, a, bb); ctx.stroke();
        break;
      }
    }
    ctx.restore();
  }

  drawTiles(ctx, t, withHeroDisc = true) {
    const tau = t - 8.0;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) {
      const i = r * 5 + c;
      const [bg, fg, label] = TILES[i];
      const act = this.activation(c, r);
      this._act = act;
      const p = K.clamp((t - act) / 0.3);
      const [x, y] = this.pos(c, r, t);
      for (const ox of x > 1920 - TW ? [x, x - 1920] : [x]) {
        ctx.save();
        ctx.translate(ox, y);
        ctx.beginPath(); ctx.rect(0, 0, TW, TH); ctx.clip();
        ctx.fillStyle = C.INK; ctx.fillRect(0, 0, TW, TH);
        if (p > 0) {
          // Iris-in of the tile colour from its centre
          const rr = Math.hypot(HX, HY) * K.outExpo(p);
          ctx.fillStyle = bg;
          ctx.beginPath(); ctx.arc(HX, HY, rr, 0, TAU); ctx.fill();
          this.tile(ctx, i, t, p);
          // Spec-sheet annotations
          const la = K.clamp((t - act - 0.15) / 0.2);
          if (la > 0) {
            ctx.globalAlpha = 0.62 * la;
            ctx.fillStyle = bg === C.PAPER || bg === C.ACID ? C.INK : C.PAPER;
            ctx.font = '600 13px "JetBrains Mono"';
            ctx.letterSpacing = '1.5px';
            ctx.fillText(String(i + 1).padStart(2, '0'), 16, 28);
            ctx.textAlign = 'right';
            ctx.fillText(label, TW - 16, TH - 16);
            ctx.textAlign = 'left';
            ctx.letterSpacing = '0px';
            ctx.globalAlpha = 1;
          }
        }
        ctx.restore();
      }
    }
    if (withHeroDisc) this.drawHero(ctx, t);
  }

  heroRadius(t) {
    const tau = t - 8.0;
    let r = HERO_R * (1 + 0.07 * K.hit(tau % 0.5, 0, 0.12) * (t < 9.5 ? 1 : 0) * K.smoothstep(8.02, 8.1, t));
    // Exit: shrink to the pillar-top dot (anticipation → snap)
    const e = K.clamp((t - 9.55) / 0.25);
    if (e > 0) r = K.lerp(r, DOT_END_PX, K.anticipate(e));
    return r;
  }

  drawHero(ctx, t) {
    ctx.fillStyle = C.SIGNAL;
    ctx.beginPath(); ctx.arc(960, 540, this.heroRadius(t), 0, TAU); ctx.fill();
  }

  draw(t) {
    const E = this.E, ctx = E.ctx;
    const z = K.heavy(K.clamp((t - 8.0) / 0.55));
    const Z = K.lerp(Z0, 1, z);
    if (t < 9.5) {
      ctx.setTransform(Z, 0, 0, Z, 960 - Z * 960, 540 - Z * 540);
      this.drawTiles(ctx, t);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      E.flush2D();
      return;
    }
    // Card-flip exit: render the flat grid to a texture, then draw each tile as a 3D quad.
    this.drawTiles(ctx, t, false);
    E.r.uploadCanvas(this.tex, E.canvas);
    ctx.clearRect(0, 0, 1920, 1080);
    const gl = E.gl;
    E.r.bind(E.stage);
    gl.useProgram(this.flip.p);
    gl.bindVertexArray(this.quad);
    E.r.blend('none');
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) {
      if (c === 2 && r === 1) continue;
      const a = this.flipAngle(c, r, t);
      if (Math.abs(Math.cos(a)) < 0.02 && a > Math.PI / 2) continue;
      if (a >= Math.PI - 1e-3) continue;
      const [x, y] = this.pos(c, r, t);
      E.r.setUniforms(this.flip, {
        uCenter: [x + HX, y + HY], uSize: [TW, TH], uRes: [1920, 1080], uAngle: a, uF: 1600,
        uUV: [x / 1920, 1 - y / 1080, (x + TW) / 1920, 1 - (y + TH) / 1080],
        uTex: this.tex, uBack: this.back.map((v, k) => K.lerp(v, this.ink[k], K.smoothstep(0.6 * Math.PI, Math.PI, a))),
      });
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    gl.bindVertexArray(null);
    // Hero tile stays flat; its contents fade, the disc shrinks to the pillar dot.
    const heroFade = 1 - K.smoothstep(9.5, 9.62, t);
    ctx.save();
    ctx.translate(2 * TW, TH);
    ctx.globalAlpha = heroFade;
    this._act = this.activation(2, 1);
    this.tile(ctx, 7, t, 1);
    ctx.restore();
    ctx.globalAlpha = 1;
    this.drawHero(ctx, t);
    E.flush2D();
  }
}
