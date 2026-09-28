// 04 PARTICLES (6.0s – 8.0s)
// The charged blob bursts into ~60k embers that cool from white-hot into the palette, get caught in
// a differential-rotation vortex with two log-spiral arms, tighten into a perfect ring as the camera
// cranes overhead, then collapse into a solid disc — the next match cut. Fully analytic per particle
// (random access in time), rendered as additive point sprites with depth-of-field bokeh.
import { C, lin } from '../palette.js';
import * as K from '../engine/ease.js';
import { mulberry32 } from '../engine/noise.js';
import { orbit, lookAt } from '../engine/cam.js';
import { blobCamera, BLOB_FOCAL } from './blob.js';

export const N = 60000;
export const DISC_PX = 250;               // on-screen radius of the final disc (matches Bauhaus)
const TOP_DIST = 6.0;
const R_RING = 1.6;
export const R_DISC = (DISC_PX * TOP_DIST) / (BLOB_FOCAL * 1080);

const VS = `#version 300 es
layout(location=0) in vec4 aPos;
layout(location=1) in vec4 aCol;
uniform vec3 uEye; uniform mat3 uCam; uniform float uFocal; uniform vec2 uRes; uniform vec2 uJitter;
uniform float uFocusZ, uDof;
out vec4 vCol; out float vHard;
void main(){
  vec3 d = aPos.xyz - uEye;
  float z = -dot(d, uCam[2]);
  if (z < 0.2) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vCol = vec4(0.0); vHard = 0.0; return; }
  vec2 sp = vec2(dot(d, uCam[0]), dot(d, uCam[1])) / z * uFocal * uRes.y;
  gl_Position = vec4((sp + uJitter) * 2.0 / uRes, 0.0, 1.0);
  float px = aPos.w * uFocal * uRes.y / z;
  float coc = uDof * abs(z - uFocusZ) / z * uRes.y * 0.01;
  float size = max(px + coc, 1.2);
  gl_PointSize = size + 2.0;
  float energy = (px * px + 0.6) / (size * size + 0.6);
  vCol = vec4(aCol.rgb * aCol.a * energy * min(1.0, px / 1.2 + 0.25), 1.0);
  vHard = smoothstep(4.0, 12.0, size);
}`;

const FS = `#version 300 es
precision highp float;
in vec4 vCol; in float vHard; out vec4 o;
void main(){
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(q, q);
  if (r2 > 1.0) discard;
  float soft = exp(-r2 * 4.0);
  float disc = smoothstep(1.0, 0.72, sqrt(r2)) * (0.55 + 0.45 * smoothstep(0.5, 0.95, sqrt(r2)));
  float a = mix(soft, disc * 0.6, vHard);
  o = vec4(vCol.rgb * a, 0.0);
}`;

const HOT = [1.0, 0.72, 0.42];
const WHITE = [1.2, 1.1, 1.0];

export function particleCamera(t) {
  // Continues exactly from the blob camera at 6.0.
  const c0 = blobCamera(6.0);
  const T = t - 6.0;
  const e1 = K.inOutCubic(K.clamp(T / 0.9));
  const e2 = K.inOutCubic(K.clamp((T - 0.55) / 0.95));
  const az = 0.9 + 0.75 * e1 + 0.55 * e2;
  const el = K.lerp(0.3, 0.62, e1) + (1.52 - 0.62) * e2;
  const dist = K.lerp(5.4, 7.6, K.outCubic(K.clamp(T / 0.7))) + (TOP_DIST - 7.6) * K.inOutCubic(K.clamp((T - 0.7) / 0.85));
  if (T <= 0) return c0;
  const roll0 = 0.05 * Math.sin(2.0 * 1.3);
  const eye = orbit([0, 0, 0], az, el, dist);
  return lookAt(eye, [0, 0, 0], roll0 * (1 - e1));
}

export class Particles {
  constructor(engine) {
    this.E = engine;
    const gl = engine.gl;
    this.prog = engine.r.program(FS, VS);
    this.buf = gl.createBuffer();
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, N * 8 * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 32, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 32, 16);
    gl.bindVertexArray(null);
    this.data = new Float32Array(N * 8);

    // Per-particle constants
    const rnd = mulberry32(1234);
    const gauss = () => { let u = 0, v = 0; while (u === 0) u = rnd(); v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    this.P = new Float32Array(N * 16);
    const sig = lin(C.SIGNAL), blush = lin(C.BLUSH), cob = lin(C.COBALT);
    const grad = (u) => {
      const stops = [[0, HOT], [0.28, sig], [0.62, blush], [1.0, cob]];
      for (let i = 0; i < stops.length - 1; i++) {
        const [a, ca] = stops[i], [b, cb] = stops[i + 1];
        if (u <= b) { const k = (u - a) / (b - a); return ca.map((v, j) => v + (cb[j] - v) * k); }
      }
      return cob;
    };
    for (let i = 0; i < N; i++) {
      const o = i * 16;
      // Direction on sphere
      const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, s = Math.sqrt(1 - z * z);
      const dx = s * Math.cos(a), dy = z, dz = s * Math.sin(a);
      const spark = rnd() < 0.06;
      const dust = !spark && rnd() < 0.07;
      const reach = spark ? 2.6 + rnd() * 3.2 : 0.8 + Math.pow(rnd(), 1.5) * 2.3;
      const u = Math.pow(rnd(), 0.85);
      const rho = 0.32 + 2.7 * u;
      const arm = rnd() < 0.5 ? 0 : Math.PI;
      const theta0 = arm + 2.1 * Math.log(rho / 0.32) + gauss() * (0.22 + 0.25 * u);
      const h = gauss() * 0.05 * (1 + rho * 0.4);
      const col = grad(Math.min(1, Math.max(0, u + gauss() * 0.08)));
      const bright = (spark ? 1.8 : 0.55) * (0.55 + rnd() * 0.75) * (dust ? 0.5 : 1);
      this.P.set([dx, dy, dz, reach, rho, theta0, h, rnd(), col[0], col[1], col[2], bright,
        spark ? 1 : dust ? 2 : 0, Math.sqrt(rnd()), rnd(), 0.006 + 0.01 * Math.pow(rnd(), 3)], o);
    }
    this.sig = sig;
  }

  fill(t) {
    const T = t - 6.0, D = this.data, P = this.P;
    const cool = K.smoothstep(0.02, 0.5, T);
    const ringT = T - 1.0, discT = T - 1.45;
    const fadeOut = 1 - K.smoothstep(1.78, 1.95, T);
    for (let i = 0; i < N; i++) {
      const o = i * 16, q = i * 8;
      const dx = P[o], dy = P[o + 1], dz = P[o + 2], reach = P[o + 3];
      const rho = P[o + 4], th0 = P[o + 5], h = P[o + 6], rj = P[o + 7];
      const kind = P[o + 12], rdisc = P[o + 13], rj2 = P[o + 14];
      let size = P[o + 15];
      // Burst: exponential deceleration from the charged surface
      const travel = 0.72 + reach * (1 - Math.exp(-4.2 * Math.max(0, T)));
      let x = dx * travel, y = dy * travel, z = dz * travel;
      let bright = P[o + 11];
      let cr = P[o + 8], cg = P[o + 9], cb = P[o + 10];
      if (kind === 2) {
        // Dust: keeps drifting, never joins the vortex
        const drift = 1 + 0.25 * T;
        x *= drift * 1.6; y *= drift * 1.6; z *= drift * 1.6;
        size *= 2.2;
        bright *= 1 - K.smoothstep(1.0, 1.5, T);
      } else {
        // Vortex target: differential rotation (inner orbits faster)
        const w = 1.9 / Math.pow(rho, 0.75);
        const thG = th0 + w * T + 0.6 * T;
        const wBlend = K.smoothstep(0.1 + rj * 0.22, 0.62 + rj * 0.22, T);
        if (wBlend > 0) {
          const rB = Math.hypot(x, z), aB = Math.atan2(z, x);
          let dth = thG - aB;
          dth = dth - Math.floor(dth / (2 * Math.PI)) * 2 * Math.PI; // swirl forward, never backward
          let R = rB + (rho - rB) * wBlend;
          let A = aB + dth * wBlend;
          let Y = y + (h - y) * wBlend;
          // Ring: everything tightens onto one radius and flattens
          const wr = K.snap(K.clamp((ringT - rj2 * 0.12) / 0.42));
          if (wr > 0) {
            R = R + (R_RING + (rj - 0.5) * 0.06 - R) * wr;
            Y = Y * (1 - wr);
            // Even out the arm clumping: slide each particle toward a low-discrepancy slot.
            let dA = (((i * 0.6180339887) % 1) * 2 * Math.PI + 2.4 * T) - A;
            dA -= 2 * Math.PI * Math.round(dA / (2 * Math.PI));
            A += dA * wr + wr * 0.9;
          }
          // Disc: ring collapses inward into a solid disc
          const wd = K.snap(K.clamp((discT - (1 - rdisc) * 0.08) / 0.34));
          if (wd > 0) {
            R = R + (R_DISC * rdisc - R) * wd;
            A += wd * 0.6;
          }
          x = R * Math.cos(A); z = R * Math.sin(A); y = Y;
          // Colour drifts toward signal orange as the form resolves
          const toSig = Math.max(wr * 0.55, wd);
          cr += (this.sig[0] - cr) * toSig; cg += (this.sig[1] - cg) * toSig; cb += (this.sig[2] - cb) * toSig;
          bright *= 1 + 0.6 * wr - 0.45 * wd;
        }
      }
      // Cooling: white-hot → palette
      const hot = 1 - cool;
      cr = cr + (WHITE[0] - cr) * hot; cg = cg + (WHITE[1] - cg) * hot; cb = cb + (WHITE[2] - cb) * hot;
      bright *= (1 + 2.5 * hot) * fadeOut;
      D[q] = x; D[q + 1] = y; D[q + 2] = z; D[q + 3] = size;
      D[q + 4] = cr; D[q + 5] = cg; D[q + 6] = cb; D[q + 7] = bright;
    }
  }

  draw(t, cam) {
    const E = this.E, gl = E.gl;
    const c = cam || particleCamera(t);
    this.fill(t);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data);
    E.r.bind(E.stage);
    gl.useProgram(this.prog.p);
    const T = t - 6.0;
    const dist = Math.hypot(...c.eye);
    E.r.setUniforms(this.prog, {
      uEye: c.eye, uCam: c.mat, uFocal: BLOB_FOCAL, uRes: [E.W, E.H], uJitter: E.jitter,
      uFocusZ: dist, uDof: 1.1 * (1 - K.smoothstep(1.0, 1.4, T)),
    });
    E.r.blend('add');
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.POINTS, 0, N);
    gl.bindVertexArray(null);
    E.r.blend('none');
  }

  // Burst core flash + final flat disc handoff (2D, drawn after the points).
  drawOverlay(t) {
    const E = this.E, ctx = E.ctx, T = t - 6.0;
    const flash = K.hit(T, 0, 0.09);
    if (flash > 0.01) {
      const g = ctx.createRadialGradient(960, 540, 0, 960, 540, 380);
      g.addColorStop(0, `rgba(255,236,210,${flash})`);
      g.addColorStop(0.25, `rgba(255,140,60,${flash * 0.35})`);
      g.addColorStop(1, 'rgba(255,90,31,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 1920, 1080);
    }
    const d = K.smoothstep(1.72, 1.92, T);
    if (d > 0) {
      ctx.globalAlpha = d;
      ctx.fillStyle = C.SIGNAL;
      ctx.beginPath(); ctx.arc(960, 540, DISC_PX, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}
