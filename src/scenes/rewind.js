// 07 EDIT / RHYTHM (12.0s – 12.9s)
// The whole reel scrubs backwards at ~14× through a VHS-ish glitch, under an NLE timeline whose
// playhead races home — landing on frame one: the dot.
import { C, rgba } from '../palette.js';
import * as K from '../engine/ease.js';
import { roundRect } from '../engine/draw.js';

export const RW_START = 12.0, RW_END = 12.9, SRC_FROM = 11.95, SRC_TO = 0.2;

const GLITCH_FS = `
in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform float uAmt, uSeed, uTime; uniform vec2 uRes;
void main(){
  vec2 uv = vUv;
  float y = uv.y * uRes.y;
  float bh = 6.0 + 70.0 * hash12(vec2(floor(y / 64.0), uSeed));
  float band = floor(y / bh);
  float r = hash12(vec2(band, uSeed + 3.1));
  float shift = r > 0.72 ? (hash12(vec2(band, uSeed + 9.7)) - 0.5) * 0.14 : 0.0;
  uv.x += shift * uAmt;
  // Rolling tracking band
  float tb = fract(uv.y * 0.9 + uTime * 2.3);
  float track = smoothstep(0.06, 0.0, abs(tb - 0.5)) ;
  uv.x += track * 0.012 * uAmt * sin(y * 0.9 + uTime * 80.0);
  float ca = (0.004 + 0.01 * r * step(0.72, r)) * uAmt;
  vec3 c = vec3(texture(uTex, uv + vec2(ca, 0.0)).r, texture(uTex, uv).g, texture(uTex, uv - vec2(ca, 0.0)).b);
  c *= 1.0 - 0.18 * uAmt * step(0.5, fract(gl_FragCoord.y * 0.5));
  c += track * 0.06 * uAmt * vec3(0.8, 0.9, 1.0);
  c += (hash12(gl_FragCoord.xy + uSeed * 91.0) - 0.5) * 0.07 * uAmt;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(c, vec3(l) * vec3(0.8, 0.95, 1.15), 0.3 * uAmt);
  o = vec4(max(c, 0.0), 1.0);
}`;

const CLIPS = [
  [0, 2, C.SIGNAL, '01 PRINCIPLES'], [2, 4, C.PAPER, '02 KINETIC TYPE'], [4, 6, C.COBALT, '03 3D / LOOKDEV'],
  [6, 8, C.BLUSH, '04 PARTICLES'], [8, 10, C.ACID, '05 SHAPE LAYERS'], [10, 12, C.SIGNAL, '06 PROCEDURAL 3D'],
];
const scrub = K.bezier(0.33, 0, 0.3, 1);

export class Rewind {
  constructor(engine) {
    this.E = engine;
    this.prog = engine.r.program(GLITCH_FS);
    this.tmp = engine.r.target(engine.W, engine.H, { wrap: 'mirror' });
  }

  // Output time → source time, quantised to 30 fps so it reads as a scrub.
  src(t) {
    const tq = RW_START + Math.floor((t - RW_START) * 30 + 1e-4) / 30;
    const u = K.clamp((tq - RW_START) / (RW_END - 0.05 - RW_START));
    return K.lerp(SRC_FROM, SRC_TO, scrub(u));
  }

  amount(t) {
    const q = Math.floor((t - RW_START) * 30);
    const spike = (Math.sin(q * 12.9898) * 43758.5453) % 1;
    return (0.55 + 0.45 * Math.abs(spike)) * (1 - K.smoothstep(RW_END - 0.12, RW_END, t)) * K.smoothstep(RW_START - 0.01, RW_START + 0.03, t);
  }

  glitch(t) {
    const E = this.E;
    const q = Math.floor((t - RW_START) * 30);
    E.r.pass(this.prog, { uTex: E.stage, uAmt: this.amount(t), uSeed: q * 1.37 + 0.5, uTime: t, uRes: [E.W, E.H] }, this.tmp);
    [E.stage, this.tmp] = [this.tmp, E.stage];
  }

  // Non-linear editor timeline with a racing playhead.
  drawUI(ctx, t, src) {
    const inE = K.glide(K.clamp((t - RW_START) / 0.16));
    const outE = K.inExpo(K.clamp((t - (RW_END - 0.16)) / 0.14));
    if (inE <= 0 || outE >= 1) return;
    const X0 = 190, X1 = 1730, Y0 = 812 + (1 - inE) * 240 + outE * 260;
    const xOf = (s) => X0 + (s / 12) * (X1 - X0);
    ctx.save();
    // Panel
    ctx.fillStyle = 'rgba(11,11,14,0.86)';
    roundRect(ctx, 120, Y0, 1680, 196, 12); ctx.fill();
    ctx.strokeStyle = 'rgba(243,239,230,0.14)'; ctx.lineWidth = 1;
    roundRect(ctx, 120.5, Y0 + 0.5, 1679, 195, 12); ctx.stroke();
    ctx.font = '600 12px "JetBrains Mono"'; ctx.letterSpacing = '1px'; ctx.textBaseline = 'middle';
    // Ruler
    for (let s = 0; s <= 12.001; s += 0.25) {
      const x = xOf(s), major = Math.abs(s - Math.round(s)) < 1e-6;
      ctx.fillStyle = rgba(C.PAPER, major ? 0.55 : 0.22);
      ctx.fillRect(x, Y0 + 14, 1, major ? 14 : 7);
      if (major && s < 12) { ctx.fillStyle = rgba(C.PAPER, 0.45); ctx.fillText(`00:${String(Math.round(s)).padStart(2, '0')}`, x + 5, Y0 + 22); }
    }
    // Track labels
    ctx.fillStyle = rgba(C.PAPER, 0.5);
    ctx.fillText('V1', 140, Y0 + 66); ctx.fillText('A1', 140, Y0 + 138);
    // Clips
    for (const [a, b, col, label] of CLIPS) {
      const x = xOf(a) + 2, w = xOf(b) - xOf(a) - 4;
      ctx.fillStyle = rgba(col, 0.9);
      roundRect(ctx, x, Y0 + 44, w, 44, 6); ctx.fill();
      ctx.fillStyle = col === C.COBALT ? C.PAPER : C.INK;
      ctx.fillText(label, x + 10, Y0 + 66);
    }
    // Audio waveform
    ctx.fillStyle = rgba(C.PAPER, 0.42);
    for (let x = X0; x < X1; x += 4) {
      const s = ((x - X0) / (X1 - X0)) * 12;
      const beat = s % 0.5;
      const env = s < 2 ? 0.25 + 0.5 * Math.exp(-(s % 0.5) * 10) * (s > 0.9 ? 1 : 0.4) : 0.3 + 0.7 * Math.exp(-beat * 9);
      const drop = s > 9.75 && s < 10 ? 0.05 : 1;
      const a = (10 + 26 * env * (0.6 + 0.4 * Math.abs(Math.sin(s * 91.7)))) * drop;
      ctx.fillRect(x, Y0 + 138 - a, 2, a * 2);
    }
    // Playhead
    const px = xOf(src);
    ctx.fillStyle = C.SIGNAL;
    ctx.fillRect(px - 1, Y0 + 10, 2, 180);
    ctx.beginPath(); ctx.moveTo(px - 9, Y0 + 2); ctx.lineTo(px + 9, Y0 + 2); ctx.lineTo(px, Y0 + 14); ctx.closePath(); ctx.fill();
    roundRect(ctx, px - 58, Y0 - 30, 116, 24, 5); ctx.fill();
    ctx.fillStyle = C.INK; ctx.textAlign = 'center';
    const f = Math.round(src * 60);
    ctx.fillText(`◂◂ 00:${String(Math.floor(f / 60)).padStart(2, '0')}:${String(f % 60).padStart(2, '0')}`, px, Y0 - 18);
    ctx.textAlign = 'left';
    // Speed badge
    ctx.fillStyle = C.SIGNAL;
    ctx.fillText('◂◂ ×14', 136, Y0 + 22);
    ctx.restore();
    ctx.letterSpacing = '0px';
    ctx.textBaseline = 'alphabetic';
  }
}
