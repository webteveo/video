// 03 3D / LOOKDEV (4.0s – 6.0s)
// The flat dot gains light — the key light's terminator sweeps across it, revealing a glossy,
// iridescent 3D form. It melts into a noise-displaced blob, sheds liquid satellites that orbit and
// re-merge, a chrome ring trims itself on around it, then everything charges up to burst.
import { C, lin } from '../palette.js';
import * as K from '../engine/ease.js';
import { orbit, lookAt, rotX, rotY, rotZ, mul3 } from '../engine/cam.js';

export const BLOB_FOCAL = 1.6;
// Distance at which a unit sphere projects to a 300px radius disc at 1080p.
const D0 = Math.sqrt(Math.pow(BLOB_FOCAL / (300 / 1080), 2) + 1);

export function blobCamera(t) {
  const T = t - 4.0;
  const e = K.inOutCubic(K.clamp(T / 2.0));
  const az = 0.78 * e + 0.12 * K.inCubic(K.clamp((T - 1.5) / 0.5));
  const el = 0.3 * K.inOutQuad(K.clamp(T / 1.8));
  const dist = K.lerp(D0, 5.55, e) - 0.15 * K.inQuad(K.clamp((T - 1.5) / 0.5));
  const eye = orbit([0, 0, 0], az, el, dist);
  return lookAt(eye, [0, 0, 0], 0.05 * Math.sin(T * 1.3) * e);
}

const FS = `
in vec2 vUv; out vec4 o;
uniform vec2 uRes, uJitter;
uniform float uT, uFocal, uReveal, uMorph, uCharge, uRadius, uPulse, uRingSweep, uRingWidth, uBgGlow;
uniform vec3 uEye; uniform mat3 uCam; uniform mat3 uRingRot;
uniform vec4 uSat[3];
uniform vec3 uBase, uInk;

float sdCappedTorus(vec3 p, vec2 sc, float ra, float rb){
  p.x = abs(p.x);
  float k = (sc.y * p.x > sc.x * p.y) ? dot(p.xy, sc) : length(p.xy);
  return sqrt(max(dot(p, p) + ra * ra - 2.0 * ra * k, 0.0)) - rb;
}
float blob(vec3 p){
  float n = 0.0;
  if (uMorph > 0.001) n = (snoise(p * 1.05 + vec3(0.0, uT * 0.55, uT * 0.2)) * 0.78 + snoise(p * 2.0 - vec3(uT * 0.7, 0.0, uT * 0.3)) * 0.16) * uMorph;
  float d = length(p) - uRadius * (1.0 + 0.07 * uPulse + 0.26 * n);
  if (uCharge > 0.001) d -= snoise(p * 6.0 + vec3(uT * 40.0)) * 0.035 * uCharge;
  for (int i = 0; i < 3; i++) if (uSat[i].w > 0.0) d = smin(d, length(p - uSat[i].xyz) - uSat[i].w, 0.55);
  return d;
}
float ring(vec3 p){
  if (uRingSweep <= 0.0) return 1e3;
  vec3 q = uRingRot * p;
  float a = uRingSweep * PI;
  return sdCappedTorus(q, vec2(sin(a), cos(a)), 1.85, uRingWidth);
}
float map(vec3 p, out float m){
  float b = blob(p) * 0.62;
  float r = ring(p);
  m = r < b ? 1.0 : 0.0;
  return min(b, r);
}
vec3 calcNormal(vec3 p){
  const vec2 k = vec2(1, -1); const float h = 0.0015; float m;
  return normalize(k.xyy * map(p + k.xyy * h, m) + k.yyx * map(p + k.yyx * h, m) + k.yxy * map(p + k.yxy * h, m) + k.xxx * map(p + k.xxx * h, m));
}
float calcAO(vec3 p, vec3 n){
  float occ = 0.0, sca = 1.0, m;
  for (int i = 0; i < 4; i++){ float h = 0.03 + 0.12 * float(i); occ += (h - map(p + h * n, m)) * sca; sca *= 0.8; }
  return clamp(1.0 - 1.6 * occ, 0.0, 1.0);
}
// Studio environment: key softbox, cool rim strip, warm kicker, dark cyc.
vec3 env(vec3 d){
  vec3 c = mix(vec3(0.004, 0.004, 0.006), vec3(0.03, 0.03, 0.045), smoothstep(-0.4, 0.8, d.y));
  vec3 a = normalize(vec3(-0.55, 0.7, 0.45)); vec3 at = normalize(cross(a, vec3(0, 1, 0))); vec3 ab = cross(at, a);
  float u = dot(d, at), v = dot(d, ab), w = dot(d, a);
  c += vec3(1.0, 0.96, 0.9) * 6.0 * smoothstep(0.04, 0.0, abs(u) - 0.34) * smoothstep(0.04, 0.0, abs(v) - 0.22) * step(0.0, w);
  vec3 b = normalize(vec3(0.95, 0.15, -0.35)); vec3 bt = normalize(cross(b, vec3(0, 1, 0)));
  float ub = dot(d, bt), wb = dot(d, b);
  c += vec3(0.35, 0.5, 1.0) * 4.0 * smoothstep(0.03, 0.0, abs(ub) - 0.06) * smoothstep(0.1, 0.0, abs(d.y - 0.1) - 0.55) * step(0.0, wb);
  vec3 k = normalize(vec3(-0.9, -0.1, -0.5)); vec3 kt = normalize(cross(k, vec3(0, 1, 0)));
  c += vec3(1.0, 0.45, 0.35) * 1.6 * smoothstep(0.03, 0.0, abs(dot(d, kt)) - 0.04) * smoothstep(0.1, 0.0, abs(d.y) - 0.4) * step(0.0, dot(d, k));
  return c;
}
float ggx(vec3 n, vec3 v, vec3 l, float r){
  vec3 h = normalize(v + l); float nh = max(dot(n, h), 0.0); float a2 = r * r * r * r;
  float d = nh * nh * (a2 - 1.0) + 1.0; return a2 / (PI * d * d);
}
void main(){
  vec2 p = (gl_FragCoord.xy + uJitter - 0.5 * uRes) / uRes.y;
  vec3 ro = uEye;
  vec3 rd = normalize(uCam * vec3(p, -uFocal));
  float r = length(p);
  vec3 bg = uInk + vec3(0.018, 0.012, 0.03) * uBgGlow * exp(-r * r * 3.5) + vec3(0.03, 0.006, 0.0) * uBgGlow * exp(-r * r * 12.0);
  vec3 col = bg;
  // Bounding sphere
  float bR = 2.3;
  float b = dot(ro, rd), c = dot(ro, ro) - bR * bR, h = b * b - c;
  if (h > 0.0) {
    float t = max(-b - sqrt(h), 0.0), tmax = -b + sqrt(h);
    float m = 0.0; bool hit = false;
    for (int i = 0; i < 110; i++) {
      float d = map(ro + rd * t, m);
      if (d < 0.0008 * t) { hit = true; break; }
      t += d;
      if (t > tmax) break;
    }
    if (hit) {
      vec3 pos = ro + rd * t, n = calcNormal(pos), v = -rd;
      float nv = max(dot(n, v), 0.0);
      vec3 R = reflect(rd, n);
      float F = 0.04 + 0.96 * pow(1.0 - nv, 5.0);
      vec3 Lk = normalize(vec3(-0.55, 0.7, 0.45));
      vec3 Lr = normalize(vec3(0.95, 0.15, -0.35));
      float ao = calcAO(pos, n);
      if (m < 0.5) {
        float wrap = clamp((dot(n, Lk) + 0.35) / 1.35, 0.0, 1.0);
        vec3 diff = uBase * (vec3(1.0, 0.95, 0.9) * 1.25 * wrap + vec3(0.9, 0.35, 0.2) * 0.12 * clamp(-n.y * 0.5 + 0.5, 0.0, 1.0) + 0.03) * ao;
        // Translucent core: warmer, brighter where the surface faces us (fake SSS)
        diff += uBase * vec3(1.0, 0.6, 0.25) * 0.18 * pow(nv, 2.0) * ao;
        vec3 irid = pal(nv * 1.4 + 0.15 + 0.2 * n.y, vec3(0.6), vec3(0.4), vec3(1.0), vec3(0.0, 0.33, 0.67));
        vec3 refl = env(R) * mix(vec3(1.0), irid, 0.7);
        vec3 spec = vec3(1.0, 0.95, 0.9) * ggx(n, v, Lk, 0.32) * 0.35 * max(dot(n, Lk), 0.0);
        float rim = pow(1.0 - nv, 3.0) * clamp(dot(n, Lr) * 0.6 + 0.4, 0.0, 1.0);
        vec3 shaded = diff * (1.0 - F) + refl * F * ao + spec + vec3(0.25, 0.42, 1.0) * rim * 1.1;
        shaded += (uBase * 2.2 + vec3(1.0, 0.75, 0.4) * 2.5 * uCharge) * uCharge * uCharge * (0.4 + 0.6 * nv);
        // Reveal: the key light's terminator sweeps across the flat disc.
        float lit = smoothstep(uReveal - 0.35, uReveal + 0.35, dot(n, Lk));
        col = mix(uBase, shaded, lit);
      } else {
        vec3 chrome = env(R) * 1.2 + vec3(1.0) * ggx(n, v, Lk, 0.2) * 0.6 * max(dot(n, Lk), 0.0);
        col = chrome * (0.35 + 0.65 * ao) + vec3(0.08, 0.08, 0.1);
      }
    }
  }
  o = vec4(col, 1.0);
}`;

export class Blob {
  constructor(engine) {
    this.E = engine;
    this.prog = engine.r.program(FS);
    this.base = lin(C.SIGNAL);
    this.ink = lin(C.INK);
  }

  params(t) {
    const T = t - 4.0;
    const reveal = K.lerp(1.4, -1.6, K.outCubic(K.clamp((T - 0.02) / 0.42)));
    const morph = K.smoothstep(0.15, 0.9, T) * (1 - 0.95 * K.smoothstep(1.35, 1.8, T));
    const charge = K.inQuad(K.clamp((T - 1.5) / 0.5));
    const radius = 1.0 - 0.28 * K.anticipate(K.clamp((T - 1.45) / 0.55));
    const pulse = K.hit(T, 0.0, 0.1) * 0 + K.hit(T, 0.5, 0.12) + K.hit(T, 1.0, 0.12) + 0.7 * K.hit(T, 1.5, 0.1);
    // Satellites: bud off the surface, orbit on tilted planes, get pulled back in for the charge.
    const sats = [];
    for (let i = 0; i < 3; i++) {
      const out = K.smoothstep(0.45 + i * 0.08, 1.0 + i * 0.08, T) * (1 - K.inOutCubic(K.clamp((T - 1.3 - i * 0.04) / 0.3)));
      const ang = T * (1.3 + 0.35 * i) + i * 2.1;
      const tilt = 0.6 + i * 0.7;
      const absorb = K.smoothstep(1.42, 1.72, T);                 // swallowed by the charging core
      const rr = (0.85 + 0.72 * out) * (1 - 0.9 * absorb);
      let x = Math.cos(ang) * rr, y = 0, z = Math.sin(ang) * rr;
      const cy = Math.cos(tilt), sy = Math.sin(tilt);
      [y, z] = [y * cy - z * sy, y * sy + z * cy];
      const rad = (0.2 + 0.07 * (2 - i)) * K.smoothstep(0.35, 0.6, T + i * 0.03) * (1 - absorb);
      sats.push(x, y, z, T > 0.35 ? rad : 0);
    }
    const ringSweep = K.snap(K.clamp((T - 0.22) / 0.55)) * (1 - K.inOutCubic(K.clamp((T - 1.35) / 0.35)));
    const ringRot = mul3(rotZ(0.35 + T * 0.15), mul3(rotX(1.2 + 0.25 * Math.sin(T * 1.1)), rotY(T * 1.4)));
    return {
      uT: T, uReveal: reveal, uMorph: morph, uCharge: charge, uRadius: radius, uPulse: pulse,
      uSat: sats, uRingSweep: ringSweep, uRingWidth: 0.024 + 0.01 * K.hit(T, 0.5, 0.15), uRingRot: ringRot,
      uBgGlow: K.smoothstep(0.0, 0.6, T),
    };
  }

  draw(t, cam) {
    const E = this.E;
    const c = cam || blobCamera(t);
    E.r.pass(this.prog, {
      ...this.params(t),
      uRes: [E.W, E.H], uJitter: E.jitter, uFocal: BLOB_FOCAL,
      uEye: c.eye, uCam: c.mat, uBase: this.base, uInk: this.ink,
    }, E.stage, 'none');
  }
}
