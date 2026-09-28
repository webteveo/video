// 06 PROCEDURAL 3D (10.0s – 12.0s) — the drop.
// A MoGraph-style cloner field of cylinders. Heights are evaluated per sub-frame in JS (the
// "effector stack": ring waves on every kick, a cross wave on the half-bar, ambient noise) and
// uploaded as a texture; the shader ray-casts the grid exactly with a 2D DDA and analytic
// ray/cylinder hits, plus penumbra-approximated shadows and neighbourhood AO. Seen from straight
// above it's a halftone dot grid whose centre dot is our orange hero — then the camera cranes down.
import { C, lin } from '../palette.js';
import * as K from '../engine/ease.js';
import { hash2 } from '../engine/noise.js';

export const PILLAR_FOCAL = 1.6;
const TOP_H = 30.0;
const FIELD = 26, GN = FIELD * 2 + 1;

// Orbit camera whose up-vector is the elevation derivative — stable all the way to straight down.
export function pillarCamera(t) {
  const T = t - 10.0;
  const e1 = K.snap(K.clamp((T - 0.26) / 0.9));
  const e2 = K.inOutCubic(K.clamp((T - 1.0) / 1.0));
  const whip = K.inExpo(K.clamp((T - 1.8) / 0.2));
  const az = 0.75 * e1 + 0.75 * e2 + 1.1 * whip;
  const el = K.lerp(Math.PI / 2, 0.55, e1) - 0.1 * e2 - 0.1 * whip;
  const dist = K.lerp(TOP_H, 12.0, e1) - 2.6 * e2 - 2.0 * whip;
  const tgt = [0, K.lerp(0, 1.4, e1), 0];
  const ce = Math.cos(el), se = Math.sin(el), sa = Math.sin(az), ca = Math.cos(az);
  const back = [ce * sa, se, ce * ca];
  const eye = [tgt[0] + dist * back[0], tgt[1] + dist * back[1], tgt[2] + dist * back[2]];
  const up = [-se * sa, ce, -se * ca];
  const right = [ca, 0, -sa];
  const roll = 0.3 * whip + 0.035 * Math.sin(T * 2.2) * e1;
  const cr = Math.cos(roll), sr = Math.sin(roll);
  const r2 = right.map((v, i) => v * cr + up[i] * sr), u2 = up.map((v, i) => v * cr - right[i] * sr);
  return { eye, back, right: r2, up: u2, mat: [...r2, ...u2, ...back] };
}

const FS = `
in vec2 vUv; out vec4 o;
uniform vec2 uRes, uJitter;
uniform float uT, uFocal, uGlow;
uniform vec3 uEye; uniform mat3 uCam;
uniform vec3 uInk, uSig, uCob, uAcid;
uniform sampler2D uH;
const float R = 0.34;
const int FIELD = ${FIELD};
const float HMAX = 7.0;

float H(ivec2 c){
  if (abs(c.x) > FIELD || abs(c.y) > FIELD) return 0.0;
  return texelFetch(uH, c + FIELD, 0).r;
}
vec3 heat(float v){
  vec3 c = mix(vec3(0.05, 0.05, 0.06), uCob * 0.9, smoothstep(0.0, 0.28, v));
  c = mix(c, uSig, smoothstep(0.25, 0.62, v));
  c = mix(c, uAcid * 1.15, smoothstep(0.64, 1.0, v));
  return c;
}
// Ray vs cylinder at cell c (axis at xz=c, y in [0,h]). Returns t (or -1) and normal.
float cyl(vec3 ro, vec3 rd, vec2 c, float h, out vec3 n){
  if (h <= 0.0) return -1.0;
  vec2 oc = ro.xz - c;
  float a = dot(rd.xz, rd.xz), b = dot(oc, rd.xz), cc = dot(oc, oc) - R * R;
  float disc = b * b - a * cc;
  if (disc < 0.0) return -1.0;
  float t1 = (-b - sqrt(disc)) / max(a, 1e-9);
  float y1 = ro.y + rd.y * t1;
  if (t1 > 0.0 && y1 >= 0.0 && y1 <= h) { n = vec3(normalize(oc + rd.xz * t1), 0.0).xzy; return t1; }
  if (rd.y < 0.0) {
    float tc = (h - ro.y) / rd.y;
    vec2 q = oc + rd.xz * tc;
    if (tc > 0.0 && dot(q, q) <= R * R) { n = vec3(0, 1, 0); return tc; }
  }
  return -1.0;
}
// Soft shadow: closest approach of the light ray to each pillar axis it passes, penumbra widens with distance.
float shadow(vec3 p, vec3 L, bool skipOwn){
  float res = 1.0;
  vec2 pos = p.xz; ivec2 cell = ivec2(floor(pos + 0.5));
  vec2 d = L.xz; vec2 dd = vec2(abs(d.x) < 1e-6 ? 1e-6 : d.x, abs(d.y) < 1e-6 ? 1e-6 : d.y);
  ivec2 st = ivec2(sign(dd));
  vec2 tD = abs(1.0 / dd);
  vec2 tM = ((vec2(cell) + 0.5 * vec2(st)) - pos) / dd;
  for (int i = 0; i < 14; i++){
    float h = (skipOwn && i == 0) ? 0.0 : H(cell);
    if (h > 0.0) {
      vec2 oc = pos - vec2(cell);
      float tca = max(-dot(oc, d) / max(dot(d, d), 1e-9), 0.0);
      float dist = length(oc + d * tca) - R;
      float y = p.y + L.y * tca;
      if (y < h + 0.05 && tca > 0.02) res = min(res, smoothstep(-0.03, 0.05 + 0.12 * tca, dist) + smoothstep(h - 0.1, h + 0.15, y));
    }
    float tn = min(tM.x, tM.y);
    if (p.y + L.y * tn > HMAX) break;
    if (tM.x < tM.y) { tM.x += tD.x; cell.x += st.x; } else { tM.y += tD.y; cell.y += st.y; }
  }
  return clamp(res, 0.0, 1.0);
}
float groundAO(vec2 q){
  ivec2 c0 = ivec2(floor(q + 0.5)); float ao = 1.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){
    ivec2 c = c0 + ivec2(i, j); float h = H(c);
    if (h <= 0.0) continue;
    float d = max(length(q - vec2(c)) - R, 0.0);
    ao *= 1.0 - 0.55 * exp(-d * 5.0) * min(h, 1.5) / 1.5;
  }
  return ao;
}
void main(){
  vec2 p = (gl_FragCoord.xy + uJitter - 0.5 * uRes) / uRes.y;
  vec3 ro = uEye, rd = normalize(uCam * vec3(p, -uFocal));
  vec3 col = uInk;
  float tS = 0.0, tE = 1e4;
  if (ro.y > HMAX) { if (rd.y >= 0.0) { o = vec4(col, 1.0); return; } tS = (HMAX - ro.y) / rd.y; }
  if (rd.y < 0.0) tE = -ro.y / rd.y;
  vec2 pos = ro.xz + rd.xz * tS;
  ivec2 cell = ivec2(floor(pos + 0.5));
  vec2 d = rd.xz; vec2 dd = vec2(abs(d.x) < 1e-6 ? 1e-6 : d.x, abs(d.y) < 1e-6 ? 1e-6 : d.y);
  ivec2 st = ivec2(sign(dd));
  vec2 tD = abs(1.0 / dd);
  vec2 tM = tS + ((vec2(cell) + 0.5 * vec2(st)) - pos) / dd;
  float tHit = -1.0; vec3 n = vec3(0, 1, 0); ivec2 hc = ivec2(99999); float hh = 0.0;
  for (int i = 0; i < 90; i++){
    float h = H(cell);
    vec3 nn;
    float th = cyl(ro, rd, vec2(cell), h, nn);
    if (th > 0.0) { tHit = th; n = nn; hc = cell; hh = h; break; }
    float tn = min(tM.x, tM.y);
    if (tn > tE) break;
    if (tM.x < tM.y) { tM.x += tD.x; cell.x += st.x; } else { tM.y += tD.y; cell.y += st.y; }
  }
  vec3 L = normalize(vec3(-0.45, 0.85, -0.25));
  float tt;
  if (tHit > 0.0) {
    tt = tHit;
    vec3 P = ro + rd * tHit;
    bool hero = hc == ivec2(0);
    float hv = clamp((hh - 0.3) / 4.2, 0.0, 1.0);
    float sh = shadow(P + n * 0.01, L, true);
    float dif = max(dot(n, L), 0.0);
    if (n.y > 0.5) {
      vec3 top = hero ? uSig * 1.7 : heat(hv);
      float emit = hero ? 1.1 : smoothstep(0.06, 0.5, hv);
      float rr = length(P.xz - vec2(hc));
      float bevel = smoothstep(R - 0.035, R, rr);
      col = top * (0.35 + 0.65 * dif * sh) + top * emit * uGlow * 0.9 + vec3(0.6) * bevel * (0.2 + emit * 0.6);
    } else {
      float aoS = mix(0.3, 1.0, smoothstep(0.0, 0.9, P.y));
      vec3 side = hero ? uSig * 0.9 : vec3(0.022, 0.022, 0.03);
      col = side * (0.25 + 0.95 * dif * sh) * aoS;
      float band = exp(-max(hh - P.y, 0.0) * 4.0);
      col += (hero ? uSig * 1.5 : heat(hv)) * band * (hero ? 1.0 : smoothstep(0.05, 0.5, hv)) * 0.5 * uGlow;
      col += (hero ? uSig * 0.6 * (0.4 + 0.6 * P.y / max(hh, 0.1)) : vec3(0.0));
      col += vec3(0.12, 0.16, 0.34) * pow(1.0 - max(dot(n, -rd), 0.0), 4.0) * 0.3;
      col += vec3(0.8) * smoothstep(0.035, 0.0, hh - P.y) * (0.15 + 0.5 * smoothstep(0.06, 0.5, hv));
    }
  } else if (rd.y < 0.0) {
    tt = tE;
    vec3 P = ro + rd * tE;
    col = vec3(0.012, 0.012, 0.016) * (0.3 + 0.7 * shadow(P + vec3(0, 0.01, 0), L, false)) * groundAO(P.xz);
  } else { tt = 1e4; }
  float fog = 1.0 - exp(-max(tt - 8.0, 0.0) * 0.05);
  col = mix(col, uInk, fog);
  vec3 P = ro + rd * min(tt, 500.0);
  col = mix(col, uInk, smoothstep(float(FIELD) - 9.0, float(FIELD), max(abs(P.x), abs(P.z))));
  o = vec4(col, 1.0);
}`;

export class Pillars {
  constructor(engine) {
    this.E = engine;
    const gl = engine.gl;
    this.prog = engine.r.program(FS);
    this.c = { ink: lin(C.INK), sig: lin(C.SIGNAL), cob: lin(C.COBALT), acid: lin(C.ACID) };
    this.hTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.hTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.h = new Float32Array(GN * GN);
    this.rnd = new Float32Array(GN * GN);
    for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) this.rnd[j * GN + i] = hash2(i * 7 + 3, j * 13 + 5);
  }

  hero(T) {
    let h = 0.25 + 4.6 * K.spring(T - 0.02, 1.7, 0.45);
    for (const k of [0.5, 1.0, 1.5]) if (T > k) h += 0.7 * Math.exp(-(T - k) * 6);
    return h;
  }

  // The effector stack.
  heights(T) {
    const out = this.h;
    const amb = K.smoothstep(0.1, 0.8, T);
    const waves = [[0, 4.2], [0.5, 2.4], [1.0, 3.4], [1.5, 2.4]];
    const tc = T - 1.0;
    for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) {
      const x = i - FIELD, z = j - FIELD;
      const d = Math.hypot(x, z);
      let h = 0.12 + 0.12 * this.rnd[j * GN + i];
      h += amb * 0.55 * (0.5 + 0.5 * Math.sin(x * 0.42 + T * 2.3) * Math.sin(z * 0.37 - T * 1.7));
      for (const [k, A] of waves) {
        const tk = T - k;
        if (tk < 0) continue;
        const r = tk * 12 + 1;
        const w = Math.exp(-Math.pow((d - r) / (1.3 + tk * 1.2), 2));
        h += A * w * Math.exp(-tk * 0.8);
      }
      if (tc > 0) h += 1.6 * Math.exp(-tc * 1.4) * (Math.exp(-x * x * 0.6) + Math.exp(-z * z * 0.6)) * (0.6 + 0.4 * Math.sin(d * 0.9 - tc * 10));
      out[j * GN + i] = Math.min(h, 6.8);
    }
    out[FIELD * GN + FIELD] = this.hero(T);
    return out;
  }

  draw(t) {
    const E = this.E, gl = E.gl, T = t - 10.0, c = pillarCamera(t);
    gl.bindTexture(gl.TEXTURE_2D, this.hTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, GN, GN, 0, gl.RED, gl.FLOAT, this.heights(T));
    E.r.pass(this.prog, {
      uRes: [E.W, E.H], uJitter: E.jitter, uT: T, uFocal: PILLAR_FOCAL, uH: this.hTex,
      uGlow: 0.35 + 0.65 * K.smoothstep(0.0, 0.3, T),
      uEye: c.eye, uCam: c.mat, uInk: this.c.ink, uSig: this.c.sig, uCob: this.c.cob, uAcid: this.c.acid,
    }, E.stage, 'none');
  }
}
