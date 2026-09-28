// The hero: a 20' HC container that lands, lowers its long wall into a deck, lights up as a home,
// gets furnished, and has a second container stacked across it (cantilevered porch roof).
// Analytic ray tracer (oriented boxes + spheres in AABB clusters), corrugation via bump mapping,
// stencil branding from canvas textures, blue-hour sky with a sunset rim light, and warm interior
// area lights sampled with per-sub-frame stratification, so the motion-blur accumulation converges
// them into soft shadows.
import * as K from '../../engine/ease.js';
import { lin } from '../../palette.js';
import { mulberry32 } from '../../engine/noise.js';
import { P } from './palette.js';

export const L = 6.058, W = 2.438, H = 2.896, BASE = 0.15;   // 20' high-cube, on concrete blocks
const HX = L / 2, HZ = W / 2, HY = H / 2;
export const B_OFF = 1.05;                                      // cantilever of the top box over the deck

const f3 = (x) => x.toFixed(4);

// Materials
const M = {
  GROUND: 0, WALL: 1, FLOOR: 3, ROOF: 4, PANEL: 5, POST: 6, SOFA: 7, RUG: 8, POT: 9, LEAF: 10,
  LAMP: 11, BOX_B: 12, COUNTER: 13, RAIL: 14, BLOCK: 15, STRIP: 16, ART: 17, SLATS: 18, CORD: 19, DOOR: 20,
  BUSH: 21, CUSHION: 23,
};

// Fixed object slots → the shader is generated with fully unrolled, constant-index tests (SwiftShader
// is ~4× faster that way than looping over uniform arrays). Inactive slots are parked far away.
const SLOTS = [
  ['block0', 'BLOCKS'], ['block1', 'BLOCKS'], ['block2', 'BLOCKS'], ['block3', 'BLOCKS'],
  ['floor', 'SHELL'], ['roof', 'SHELL'], ['back', 'SHELL'], ['endL', 'SHELL'], ['door', 'SHELL'],
  ['post0', 'SHELL'], ['post1', 'SHELL'], ['post2', 'SHELL'], ['post3', 'SHELL'], ['topRail', 'SHELL'], ['sill', 'SHELL'],
  ['panel', 'DECK', 'rbox'], ['leg0', 'DECK'], ['leg1', 'DECK'], ['railTop', 'DECK'],
  ['rp0', 'DECK'], ['rp1', 'DECK'], ['rp2', 'DECK'], ['rp3', 'DECK'], ['rp4', 'DECK'], ['rs0', 'DECK'], ['rs1', 'DECK'],
  ['slats', 'INT'], ['strip', 'INT', 'emit'], ['rug', 'INT'], ['sofaSeat', 'INT'], ['sofaBack', 'INT'], ['arm0', 'INT'], ['arm1', 'INT'],
  ['cush0', 'INT'], ['cush1', 'INT'], ['counter', 'INT'], ['art', 'INT'], ['pot', 'INT'], ['cord', 'INT'],
  ['leaf0', 'INT', 'sph'], ['leaf1', 'INT', 'sph'], ['leaf2', 'INT', 'sph'], ['lamp', 'INT', 'sphEmit'],
  ['boxB', 'TOP'],
  ['bush0', 'BUSH', 'sph'], ['bush1', 'BUSH', 'sph'], ['bush2', 'BUSH', 'sph'], ['bush3', 'BUSH', 'sph'],
];
const CLUSTERS = ['BLOCKS', 'SHELL', 'DECK', 'INT', 'TOP', 'BUSH'];
const BOX_SLOTS = [], SPH_SLOTS = [];
for (const [name, cl, kind = 'box'] of SLOTS) (kind.startsWith('sph') ? SPH_SLOTS : BOX_SLOTS).push({ name, cl, kind });
const BOX_INDEX = Object.fromEntries(BOX_SLOTS.map((b, i) => [b.name, i]));
const SPH_INDEX = Object.fromEntries(SPH_SLOTS.map((b, i) => [b.name, i]));

function genTraceGLSL() {
  // Compact loops with compile-time cluster ranges (SwiftShader runs these far faster than unrolled code).
  let tr = '', oc = '';
  CLUSTERS.forEach((cl, c) => {
    const idx = BOX_SLOTS.map((b, i) => [b, i]).filter(([b]) => b.cl === cl && b.kind !== 'rbox');
    const rb = BOX_SLOTS.map((b, i) => [b, i]).filter(([b]) => b.cl === cl && b.kind === 'rbox');
    const sp = SPH_SLOTS.map((b, j) => [b, j]).filter(([b]) => b.cl === cl);
    tr += `  if (iAABB(ro, inv, uCMin[${c}].xyz, uCMax[${c}].xyz, h.t)) {\n`;
    oc += `  if (iAABB(ro, inv, uCMin[${c}].xyz, uCMax[${c}].xyz, tmax)) {\n`;
    if (idx.length) {
      const a = idx[0][1], b = idx[idx.length - 1][1] + 1;
      tr += `    for (int i = ${a}; i < ${b}; i++) ABOX(i);\n`;
      const emit = idx.filter(([s]) => s.kind === 'emit').map(([, i]) => i);
      oc += `    for (int i = ${a}; i < ${b}; i++) { ${emit.map((e) => `if (i == ${e}) continue; `).join('')}OABOX(i); }\n`;
    }
    for (const [, i] of rb) { tr += `    RBOX(${i});\n`; oc += `    ORBOX(${i});\n`; }
    if (sp.length) {
      const a = sp[0][1], b = sp[sp.length - 1][1] + 1;
      tr += `    for (int j = ${a}; j < ${b}; j++) SPH(j);\n`;
      const emit = sp.filter(([s]) => s.kind === 'sphEmit').map(([, j]) => j);
      oc += `    for (int j = ${a}; j < ${b}; j++) { ${emit.map((e) => `if (j == ${e}) continue; `).join('')}OSPH(j); }\n`;
    }
    tr += '  }\n'; oc += '  }\n';
  });
  return `
float iBoxM(vec3 ro, vec3 m, vec3 h, out vec3 n){
  vec3 k = abs(m) * h;
  vec3 a = -m * ro - k, b = -m * ro + k;
  float tN = max(max(a.x, a.y), a.z), tF = min(min(b.x, b.y), b.z);
  if (tN > tF || tF < 0.0) return -1.0;
  n = -sign(m) * step(a.yzx, a.xyz) * step(a.zxy, a.xyz);
  return tN;
}
#define ABOX(I) { vec3 nl_; vec3 o_ = ro - uBP[I].xyz; float t_ = iBoxM(o_, inv, uBS[I].xyz, nl_); if (t_ > 1e-4 && t_ < h.t) { h.t = t_; h.ln = nl_; h.n = nl_; h.lp = o_ + rd * t_; h.lh = uBS[I].xyz; h.mat = uBP[I].w; h.id = I; any = true; } }
#define RBOX(I) { vec3 nl_; vec3 o_ = uPanelR * (ro - uBP[I].xyz); vec3 d_ = fixDir(uPanelR * rd); float t_ = iBoxM(o_, 1.0 / d_, uBS[I].xyz, nl_); if (t_ > 1e-4 && t_ < h.t) { h.t = t_; h.ln = nl_; h.n = transpose(uPanelR) * nl_; h.lp = o_ + d_ * t_; h.lh = uBS[I].xyz; h.mat = uBP[I].w; h.id = I; any = true; } }
#define SPH(J) { float t_ = iSph(ro, rd, uSP[J]); if (t_ > 1e-4 && t_ < h.t) { vec3 p_ = ro + rd * t_; h.t = t_; h.n = normalize(p_ - uSP[J].xyz); h.ln = h.n; h.lp = p_ - uSP[J].xyz; h.lh = vec3(uSP[J].w); h.mat = uSM[J]; h.id = 100 + J; any = true; } }
#define OABOX(I) { vec3 nl_; float t_ = iBoxM(ro - uBP[I].xyz, inv, uBS[I].xyz, nl_); if (t_ > 1e-4 && t_ < tmax) return true; }
#define ORBOX(I) { vec3 nl_; vec3 d_ = fixDir(uPanelR * rd); float t_ = iBoxM(uPanelR * (ro - uBP[I].xyz), 1.0 / d_, uBS[I].xyz, nl_); if (t_ > 1e-4 && t_ < tmax) return true; }
#define OSPH(J) { float t_ = iSph(ro, rd, uSP[J]); if (t_ > 1e-4 && t_ < tmax) return true; }
bool trace(vec3 ro, vec3 rd, out Hit h){
  rd = fixDir(rd);
  vec3 inv = 1.0 / rd;
  h.t = 1e4; h.mat = -1.0; h.id = -1; bool any = false;
  if (rd.y < 0.0) { float tg = -ro.y / rd.y; h.t = tg; h.n = vec3(0, 1, 0); h.ln = h.n; h.lp = ro + rd * tg; h.lh = vec3(0); h.mat = 0.0; any = true; }
${tr}  return any;
}
bool occluded(vec3 ro, vec3 rd, float tmax){
#ifdef NOSHADOW
  return false;
#endif
  rd = fixDir(rd);
  vec3 inv = 1.0 / rd;
${oc}  return false;
}`;
}

const NB = BOX_SLOTS.length, NS = SPH_SLOTS.length, NC = CLUSTERS.length;
const FS = `
#define NB ${NB}
#define NS ${NS}
#define NC ${NC}
in vec2 vUv; out vec4 o;
uniform vec2 uRes, uJitter; uniform float uFocal, uSeed, uSub, uSubN;
uniform vec3 uEye; uniform mat3 uCam;
uniform vec4 uBP[NB]; uniform vec4 uBS[NB]; uniform mat3 uPanelR;
uniform vec4 uCMin[NC]; uniform vec4 uCMax[NC];                  // cluster AABBs
uniform vec4 uSP[NS]; uniform float uSM[NS];
uniform vec3 uCA, uCB;
uniform sampler2D uTexA, uTexB, uTexDoor, uNoise;
uniform float uStripI, uLampI, uGlassI, uDeckDown;
uniform vec3 uStripA, uStripB, uLampP, uGlassC;
uniform vec3 uRust, uGraphite, uCream, uWood, uTeal, uWarm;
const vec3 LKEY = normalize(vec3(-0.55, 0.30, -0.78));

vec4 nz(vec2 p){ return textureLod(uNoise, p, 0.0); }
vec3 hash33(vec3 p){ p = fract(p * vec3(.1031, .1030, .0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }

float iBox(vec3 ro, vec3 rd, vec3 h, out vec3 n){
  vec3 m = 1.0 / rd;
  vec3 k = abs(m) * h;
  vec3 a = -m * ro - k, b = -m * ro + k;
  float tN = max(max(a.x, a.y), a.z), tF = min(min(b.x, b.y), b.z);
  if (tN > tF || tF < 0.0) return -1.0;
  n = -sign(rd) * step(a.yzx, a.xyz) * step(a.zxy, a.xyz);
  return tN;
}
float iSph(vec3 ro, vec3 rd, vec4 s){
  vec3 oc = ro - s.xyz; float b = dot(oc, rd); float c = dot(oc, oc) - s.w * s.w; float h = b * b - c;
  if (h < 0.0) return -1.0; return -b - sqrt(h);
}
bool iAABB(vec3 ro, vec3 inv, vec3 lo3, vec3 hi3, float tmax){
  vec3 a = (lo3 - ro) * inv, b = (hi3 - ro) * inv;
  vec3 lo = min(a, b), hi = max(a, b);
  float tN = max(max(lo.x, lo.y), lo.z), tF = min(min(hi.x, hi.y), hi.z);
  return tN <= tF && tF > 0.0 && tN < tmax;
}
vec3 fixDir(vec3 d){ return mix(d, vec3(1e-6), step(abs(d), vec3(1e-6))); }

struct Hit { float t; vec3 n; vec3 ln; vec3 lp; vec3 lh; float mat; int id; };

${genTraceGLSL()}
vec3 sky(vec3 rd){
  float h = max(rd.y, 0.0);
  vec3 col = mix(vec3(0.045, 0.07, 0.125), vec3(0.004, 0.009, 0.024), pow(h, 0.5));
  vec2 kd = normalize(LKEY.xz);
  vec2 rh = normalize(rd.xz + 1e-5);
  float g = max(dot(rh, kd), 0.0);
  col += vec3(1.0, 0.4, 0.16) * 0.32 * pow(g, 4.0) * exp(-h * 9.0);
  col += vec3(0.5, 0.25, 0.2) * 0.035 * exp(-h * 4.0);
  vec2 sp = rd.xz / max(rd.y, 0.05) * 60.0;
  vec3 hs = hash33(vec3(floor(sp), 7.0));
  float st = step(0.987, hs.x) * smoothstep(0.09, 0.0, length(fract(sp) - hs.yz)) * smoothstep(0.12, 0.45, h);
  return col + vec3(0.75, 0.82, 1.0) * st * 0.5;
}

float corr(float u){ float f = fract(u); return smoothstep(0.08, 0.2, f) - smoothstep(0.58, 0.7, f); }
float corrD(float u){ return (corr(u + 0.01) - corr(u - 0.01)) / 0.02; }
float ggx(vec3 n, vec3 v, vec3 l, float r){
  vec3 hh = normalize(v + l); float nh = max(dot(n, hh), 0.0); float a2 = r * r * r * r;
  float d = nh * nh * (a2 - 1.0) + 1.0; return a2 / (PI * d * d);
}
float roomAO(vec3 p){
  vec3 q = p - uCA;
  float dx = ${f3(HX)} - abs(q.x), dzb = q.z + ${f3(HZ)};
  float dy0 = q.y - 0.16, dy1 = ${f3(H - 0.09)} - q.y;
  float ao = 1.0;
  ao *= 1.0 - 0.45 * exp(-max(dx, 0.0) * 5.0);
  ao *= 1.0 - 0.5 * exp(-max(dzb, 0.0) * 5.0);
  ao *= 1.0 - 0.35 * exp(-max(dy0, 0.0) * 6.0);
  ao *= 1.0 - 0.3 * exp(-max(dy1, 0.0) * 6.0);
  return ao;
}
float rectDist(vec2 p, vec2 c, vec2 h){ vec2 d = abs(p - c) - h; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }

struct Mat { vec3 alb; vec3 emit; float rough; float spec; vec3 n; float ao; };

Mat material(Hit h, vec3 P, vec3 rd){
  Mat m; m.alb = vec3(0.5); m.emit = vec3(0); m.rough = 0.8; m.spec = 0.0; m.n = h.n; m.ao = 1.0;
  float id = h.mat;
  vec3 lp = h.lp, lh = h.lh, ln = h.ln;
  if (id == ${M.GROUND}.0){
    vec2 q = P.xz;
    float pad = rectDist(q, vec2(0.0, 1.35), vec2(4.6, 3.3));
    vec4 nA = nz(q * 0.06), nB = nz(q * 0.5);
    vec3 grass = mix(vec3(0.022, 0.035, 0.024), vec3(0.045, 0.062, 0.036), nA.r * 0.7 + nB.g * 0.3);
    vec3 conc = vec3(0.17, 0.17, 0.18) * (0.88 + 0.14 * nA.b + 0.08 * nB.a);
    vec2 g = abs(fract(q / 1.2) - 0.5);
    conc *= 0.8 + 0.2 * smoothstep(0.0, 0.025, 0.5 - max(g.x, g.y));
    m.alb = mix(conc, grass, smoothstep(-0.05, 0.1, pad));
    float dA = rectDist(q, uCA.xz, vec2(${f3(HX)}, ${f3(HZ)}));
    m.ao = 1.0 - 0.72 * exp(-max(dA, 0.0) * 6.0);
    if (uDeckDown > 0.5) m.ao *= 1.0 - 0.45 * exp(-max(rectDist(q, uCA.xz + vec2(0.0, ${f3(HZ + (H - 0.4) / 2)}), vec2(${f3(HX - 0.16)}, ${f3((H - 0.4) / 2)})), 0.0) * 4.0);
    m.rough = 0.9;
  } else if (id == ${M.WALL}.0 || id == ${M.PANEL}.0 || id == ${M.DOOR}.0 || id == ${M.BOX_B}.0){
    bool isB = id == ${M.BOX_B}.0;
    vec3 c = isB ? uCB : uCA + vec3(0, ${f3(HY)}, 0);
    bool deckTop = id == ${M.PANEL}.0 && ln.z < -0.5;
    bool ext = isB || dot(h.n, P - c) > 0.0;
    if (id == ${M.PANEL}.0) ext = !deckTop;
    if (deckTop){
      float plank = floor((lp.y + lh.y) / 0.145);
      float hv = fract(sin(plank * 91.7) * 43758.5);
      float grain = nz(vec2(lp.x * 0.12, plank * 0.31)).g;
      m.alb = uWood * (0.7 + 0.36 * hv) * (0.8 + 0.3 * grain);
      m.alb *= 0.7 + 0.3 * smoothstep(0.0, 0.03, fract((lp.y + lh.y) / 0.145));
      m.rough = 0.65; m.spec = 0.03;
    } else if (!ext){
      m.alb = vec3(0.8, 0.76, 0.7);
      m.ao = roomAO(P);
    } else {
      vec3 base = isB ? uGraphite : uRust;
      vec3 an = abs(ln);
      float u = an.x > 0.5 ? lp.z : lp.x;
      float v = lp.y + lh.y;
      bool top = an.y > 0.5;
      float amp = top ? 0.0 : (id == ${M.DOOR}.0 ? 0.0 : 1.0);
      float d = corrD(u / 0.28) * amp;
      vec3 tangent = id == ${M.PANEL}.0 ? vec3(1, 0, 0) : (an.x > 0.5 ? vec3(0, 0, 1) : vec3(1, 0, 0));
      m.n = normalize(h.n + tangent * d * 0.3);
      float rib = corr(u / 0.28) * amp;
      vec4 nn = nz(vec2(u * 0.09, v * 0.05) + (isB ? 0.37 : 0.0));
      float dirt = nn.b, streak = nz(vec2(u * 0.35, v * 0.02)).a;
      m.alb = base * (0.84 + 0.14 * rib) * (0.82 + 0.3 * dirt) * (0.9 + 0.12 * streak);
      m.alb *= 0.82 + 0.18 * smoothstep(0.0, 0.3, v);
      m.rough = 0.48; m.spec = 0.05;
      float paint = 0.0;
      if (id == ${M.PANEL}.0){ paint = texture(uTexA, vec2(0.5 + lp.x / (2.0 * lh.x), (lp.y + lh.y) / (2.0 * lh.y))).a; }
      if (isB && abs(h.n.x) > 0.5){
        vec3 q = P - uCB;
        paint = texture(uTexB, vec2(0.5 - sign(h.n.x) * q.z / ${f3(2 * HX)}, (q.y + ${f3(HY)}) / ${f3(H)})).a;
      }
      if (id == ${M.DOOR}.0 && h.n.x > 0.5){
        vec3 q = P - uCA;
        vec4 tx = texture(uTexDoor, vec2(0.5 - q.z / ${f3(W)}, q.y / ${f3(H)}));
        m.alb = mix(m.alb, m.alb * 0.3, tx.r * tx.a);
        paint = tx.g * tx.a;
      }
      m.alb = mix(m.alb, uCream * 0.75, paint * (0.75 + 0.25 * dirt));
      if (isB && h.n.z > 0.5){
        // Glass end of the top box: warm interior behind black-framed glazing.
        vec3 q = P - uCB;
        vec2 gv = vec2(q.x / ${f3(HZ)}, (q.y + ${f3(HY)}) / ${f3(H)} * 2.0 - 1.0);
        float frame = step(0.9, abs(gv.x)) + step(0.92, abs(gv.y)) + step(abs(gv.x - 0.3), 0.022) + step(abs(gv.x + 0.3), 0.022);
        vec3 inside = uWarm * (0.5 + 0.9 * smoothstep(0.95, -0.85, gv.y));
        inside *= 0.8 + 0.3 * exp(-pow(gv.x + 0.4, 2.0) * 3.0);
        float curtain = smoothstep(-0.55, -0.7, gv.x);
        inside *= mix(1.0, 0.8 + 0.2 * sin(gv.x * 70.0 + sin(gv.y * 3.0)), curtain);
        inside *= 1.0 - 0.35 * smoothstep(0.03, 0.0, abs(gv.y + 0.8));
        inside *= 0.62;
        m.alb = vec3(0.015);
        m.emit = frame > 0.5 ? vec3(0) : inside * uGlassI;
        m.spec = frame > 0.5 ? 0.05 : 1.0; m.rough = frame > 0.5 ? 0.4 : 0.05;
      }
    }
  } else if (id == ${M.FLOOR}.0){
    if (ln.y > 0.5){
      float plank = floor((lp.z + lh.z) / 0.16);
      float off = fract(sin(plank * 12.9) * 437.5) * 1.3;
      float seg = floor((lp.x + off) / 1.3);
      float hv = fract(sin((plank * 7.0 + seg) * 91.7) * 43758.5);
      float grain = nz(vec2(lp.x * 0.1, plank * 0.29)).g;
      m.alb = uWood * (0.78 + 0.32 * hv) * (0.8 + 0.3 * grain);
      m.alb *= 0.78 + 0.22 * smoothstep(0.0, 0.03, fract((lp.z + lh.z) / 0.16));
      m.rough = 0.5; m.spec = 0.04;
      m.ao = roomAO(P);
    } else { m.alb = vec3(0.035); }
  } else if (id == ${M.ROOF}.0){
    bool ceil = ln.y < -0.5;
    m.alb = ceil ? vec3(0.84, 0.82, 0.78) : uRust * 0.7;
    if (ceil) m.ao = roomAO(P);
  } else if (id == ${M.POST}.0){ m.alb = uRust * 0.72; m.rough = 0.5; m.spec = 0.04; }
  else if (id == ${M.SOFA}.0){ m.alb = uTeal * (0.9 + 0.2 * nz(P.xy * 2.0).r); m.rough = 0.95; m.ao = 0.9; }
  else if (id == ${M.CUSHION}.0){ m.alb = vec3(0.7, 0.48, 0.26); m.rough = 0.95; }
  else if (id == ${M.RUG}.0){ m.alb = vec3(0.6, 0.54, 0.45) * (0.88 + 0.12 * step(0.5, fract((lp.x + lp.z) * 4.0))); m.rough = 1.0; }
  else if (id == ${M.POT}.0){ m.alb = vec3(0.42, 0.18, 0.1); }
  else if (id == ${M.LEAF}.0 || id == ${M.BUSH}.0){
    float nn = nz(P.xz * 0.7 + P.y * 0.3).r * 0.6 + nz(P.xy * 2.5).g * 0.4;
    m.alb = (id == ${M.LEAF}.0 ? vec3(0.06, 0.19, 0.075) : vec3(0.022, 0.06, 0.028)) * (0.6 + 0.8 * nn);
    m.rough = 0.85;
  }
  else if (id == ${M.LAMP}.0){ m.alb = vec3(0); m.emit = uWarm * 5.0 * uLampI; }
  else if (id == ${M.STRIP}.0){ m.alb = vec3(0); m.emit = uWarm * 8.0 * uStripI + vec3(0.02); }
  else if (id == ${M.COUNTER}.0){ m.alb = ln.y > 0.5 ? vec3(0.8, 0.78, 0.74) : uWood * 0.85; m.rough = 0.4; m.spec = 0.03; }
  else if (id == ${M.RAIL}.0 || id == ${M.CORD}.0){ m.alb = vec3(0.014); m.rough = 0.35; m.spec = 0.06; }
  else if (id == ${M.BLOCK}.0){ m.alb = vec3(0.15); m.rough = 0.9; }
  else if (id == ${M.SLATS}.0){
    float s = fract((lp.x + lh.x) / 0.08);
    m.alb = uWood * (0.85 + 0.25 * nz(vec2(lp.x * 0.8, lp.y * 0.05)).g);
    m.alb *= 0.5 + 0.5 * step(0.14, s);
    m.ao = roomAO(P);
  } else if (id == ${M.ART}.0){
    vec2 a = vec2(lp.x / lh.x, lp.y / lh.y);
    vec3 col = mix(vec3(0.85, 0.8, 0.72), uRust, step(length(a - vec2(-0.15, 0.1)), 0.42));
    col = mix(col, uTeal, step(abs(a.y + 0.45), 0.08) * step(abs(a.x - 0.2), 0.5));
    m.alb = mix(col, vec3(0.03), step(0.86, max(abs(a.x), abs(a.y))));
  }
  return m;
}

vec3 lightStrip(vec3 P, vec3 n, float s){
  if (uStripI <= 0.001) return vec3(0);
  vec3 lpnt = mix(uStripA, uStripB, s);
  vec3 d = lpnt - P; float dist = length(d); vec3 l = d / dist;
  float ndl = max(dot(n, l), 0.0);
  if (ndl <= 0.0) return vec3(0);
  float emitCos = max(l.y, 0.0) * 0.85 + 0.15;
  if (occluded(P + n * 0.004, l, dist - 0.05)) return vec3(0);
  return uWarm * uStripI * 6.0 * ndl * emitCos / (dist * dist + 0.35);
}
vec3 lightLamp(vec3 P, vec3 n, vec3 r3){
  if (uLampI <= 0.001) return vec3(0);
  vec3 lpnt = uLampP + (r3 - 0.5) * 0.18;
  vec3 d = lpnt - P; float dist = length(d); vec3 l = d / dist;
  float ndl = max(dot(n, l), 0.0);
  if (ndl <= 0.0) return vec3(0);
  return uWarm * uLampI * 1.3 * ndl / (dist * dist + 0.05);
}
vec3 lightGlass(vec3 P, vec3 n, vec2 r2){
  if (uGlassI <= 0.001) return vec3(0);
  vec3 lpnt = uGlassC + vec3((r2.x - 0.5) * ${f3(W * 0.9)}, (r2.y - 0.5) * ${f3(H * 0.9)}, 0.02);
  vec3 d = lpnt - P; float dist = length(d); vec3 l = d / dist;
  float emitCos = max(-l.z, 0.0);
  float ndl = max(dot(n, l), 0.0);
  if (ndl * emitCos <= 0.0) return vec3(0);
  return uWarm * uGlassI * 7.0 * ndl * emitCos / (dist * dist + 0.8);
}

void main(){
  vec2 p = (gl_FragCoord.xy + uJitter - 0.5 * uRes) / uRes.y;
  vec3 ro = uEye, rd = normalize(uCam * vec3(p, -uFocal));
  vec3 rnd = hash33(vec3(gl_FragCoord.xy, uSeed * 17.0 + 3.0));
  vec3 rot = hash33(vec3(gl_FragCoord.xy, 91.0));              // per-pixel Cranley-Patterson rotation
  float strat = (uSub + rnd.x) / uSubN;                         // stratified across the sub-frames
  Hit h;
  vec3 col;
  if (!trace(ro, rd, h)) { o = vec4(sky(rd), 1.0); return; }
  vec3 Pw = ro + rd * h.t;
#ifdef PRIMARYONLY
  o = vec4(h.n * 0.5 + 0.5, 1.0); return;
#endif
  Mat m = material(h, Pw, rd);
  vec3 n = m.n;
  if (dot(n, rd) > 0.0 && h.mat != 0.0) n = -n;
  vec3 v = -rd;
  vec2 kj = vec2(fract(strat + rot.x), fract(rnd.y + rot.y)) - 0.5;
  vec3 lk = normalize(LKEY + vec3(kj.x, 0.0, kj.y) * 0.06);
  float ndk = max(dot(n, lk), 0.0);
  float vis = ndk > 0.0 && !occluded(Pw + n * 0.004, lk, 60.0) ? 1.0 : 0.0;
  vec3 keyC = vec3(1.0, 0.5, 0.26) * 1.4;
  vec3 direct = keyC * ndk * vis;
  direct += lightStrip(Pw, n, fract(strat + rot.z));
  direct += lightLamp(Pw, n, rnd) + lightGlass(Pw, n, vec2(fract(strat + rot.y), rnd.z));
  vec3 amb = mix(vec3(0.01, 0.01, 0.012), vec3(0.08, 0.11, 0.19), n.y * 0.5 + 0.5) * m.ao;
  col = m.alb * (direct + amb) + m.emit;
  float F = 0.04 + 0.96 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  if (m.spec > 0.0){
    col += keyC * vis * ggx(n, v, lk, m.rough) * ndk * m.spec * 4.0;
    col += sky(reflect(rd, n)) * F * m.spec * (m.rough < 0.1 ? 1.0 : 0.35);
  }
  float fog = 1.0 - exp(-max(h.t - 16.0, 0.0) * 0.03);
  if (fog > 0.01) col = mix(col, sky(normalize(vec3(rd.x, 0.02, rd.z))), fog);
  o = vec4(col, 1.0);
}`;

function rotRows(ax, ay, az) { return [ax[0], ay[0], az[0], ax[1], ay[1], az[1], ax[2], ay[2], az[2]]; }
const IDENT = rotRows([1, 0, 0], [0, 1, 0], [0, 0, 1]);

// Tileable value-noise fbm, 4 independent channels (RGBA), for cheap texture detail in the shader.
function noiseTexture(r, N = 256) {
  const out = new Uint8Array(N * N * 4);
  for (let ch = 0; ch < 4; ch++) {
    const rnd = mulberry32(1000 + ch * 77);
    const octs = [[4, 0.45], [8, 0.3], [16, 0.17], [32, 0.08]];
    const grids = octs.map(([g]) => Float32Array.from({ length: g * g }, () => rnd()));
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let v = 0;
      octs.forEach(([g, w], k) => {
        const fx = (x / N) * g, fy = (y / N) * g, ix = Math.floor(fx), iy = Math.floor(fy);
        const tx = fx - ix, ty = fy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
        const G = grids[k], at = (i, j) => G[(j % g) * g + (i % g)];
        v += w * ((at(ix, iy) * (1 - sx) + at(ix + 1, iy) * sx) * (1 - sy) + (at(ix, iy + 1) * (1 - sx) + at(ix + 1, iy + 1) * sx) * sy);
      });
      out[(y * N + x) * 4 + ch] = Math.max(0, Math.min(255, Math.round(v * 255)));
    }
  }
  const gl = r.gl, tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, out);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  return tex;
}

// ---------------------------------------------------------------- camera: Hermite spline, time-scaled tangents
// [time, position, look-at target, framing offset (m) — shifts the subject right of centre while type is on screen]
export const CAM_KEYS = [
  [0.0, [8.4, 1.05, 10.0], [0.7, 1.95, 0.3], 1.3],
  [0.6, [7.7, 1.1, 9.4], [0.55, 1.75, 0.35], 1.5],
  [1.2, [6.3, 1.35, 10.1], [0.25, 1.55, 0.5], 1.6],
  [1.95, [4.1, 1.55, 10.4], [-0.05, 1.45, 0.7], 1.75],
  [2.3, [3.6, 1.85, 11.4], [-0.05, 1.8, 0.8], 1.8],
  [2.62, [5.3, 3.0, 14.8], [0.0, 2.85, 1.0], 3.1],
  [3.3, [9.5, 3.4, 13.1], [0.0, 2.9, 1.0], 3.2],
  [3.95, [5.8, 3.8, 15.5], [0.0, 3.0, 1.15], 3.3],
  [4.45, [0.5, 4.2, 15.0], [0.0, 3.4, 1.5], 2.6],
  [4.78, [-0.3, 4.42, 9.2], [0.0, 4.45, 4.08], 0.3],
  [5.04, [-0.02, 4.47, 4.55], [0.0, 4.47, 3.9], 0.0],
];
function hermite(k, t, idx) {
  let i = 0;
  while (i < k.length - 2 && t >= k[i + 1][0]) i++;
  const t0 = k[i][0], t1 = k[i + 1][0], dt = t1 - t0, u = K.clamp((t - t0) / dt);
  const tan = (j) => {
    const a = k[Math.max(0, j - 1)], b = k[Math.min(k.length - 1, j + 1)];
    if (typeof a[idx] === 'number') return [(b[idx] - a[idx]) / (b[0] - a[0])];
    return a[idx].map((v, c) => (b[idx][c] - v) / (b[0] - a[0]));
  };
  const m0 = tan(i), m1 = tan(i + 1);
  const p0 = [].concat(k[i][idx]), p1 = [].concat(k[i + 1][idx]);
  const u2 = u * u, u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
  return p0.map((_, c) => h00 * p0[c] + h10 * dt * m0[c] + h01 * p1[c] + h11 * dt * m1[c]);
}
export function houseCamera(t) {
  return cameraFrom(hermite(CAM_KEYS, t, 1), hermite(CAM_KEYS, t, 2), hermite(CAM_KEYS, t, 3)[0]);
}
export function cameraFrom(pos, tgt0, off = 0) {
  const r0 = norm(cross([0, 1, 0], norm(sub(pos, tgt0))));
  const tgt = tgt0.map((v, i) => v - r0[i] * off);
  const back = norm(sub(pos, tgt));
  const right = norm(cross([0, 1, 0], back));
  const up = cross(back, right);
  return { eye: pos, back, right, up, mat: [...right, ...up, ...back] };
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return a.map((x) => x / l); };

export class House {
  constructor(engine, params) {
    this.E = engine;
    const dbg = params && params.get('dbg');
    this.prog = engine.r.program(dbg ? dbg.split(',').map((d) => `#define ${d}\n`).join('') + FS : FS);
    this.col = { rust: lin(P.RUST), graphite: lin(P.GRAPHITE), cream: lin(P.CREAM), wood: lin(P.WOOD), teal: lin(P.TEAL), warm: lin(P.WARM) };
    this.texA = this.makeTexture(2048, 900, (c, w, h) => this.paintPanel(c, w, h));
    this.texB = this.makeTexture(2048, 980, (c, w, h) => this.paintSideB(c, w, h));
    this.texDoor = this.makeTexture(1024, 1216, (c, w, h) => this.paintDoor(c, w, h));
    this.noise = noiseTexture(engine.r);
  }

  makeTexture(w, h, paint) {
    const cv = new OffscreenCanvas(w, h), c = cv.getContext('2d');
    paint(c, w, h);
    const tex = this.E.r.texture(w, h, { float: false });
    this.E.r.uploadCanvas(tex, cv);
    const gl = this.E.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    return tex;
  }

  // Weathered stencil: knock tiny holes out of the paint.
  weather(c, w, h, n = 2600, seed = 1) {
    let s = seed;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    c.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < n; i++) {
      c.globalAlpha = 0.25 + 0.6 * r();
      c.beginPath(); c.arc(r() * w, r() * h, 0.6 + 2.6 * r() * r(), 0, Math.PI * 2); c.fill();
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  }

  paintPanel(c, w, h) {
    c.fillStyle = '#fff';
    c.font = '800 330px "Big Shoulders Stencil"';
    c.textBaseline = 'alphabetic'; c.textAlign = 'center';
    c.letterSpacing = '14px';
    c.fillText('CA CONTAINERS', w / 2, h * 0.64);
    c.font = '700 64px "Big Shoulders Stencil"';
    c.letterSpacing = '20px';
    c.fillText('URUGUAY', w / 2, h * 0.8);
    c.textAlign = 'right'; c.font = '600 54px "Big Shoulders Stencil"'; c.letterSpacing = '6px';
    c.fillText('CAUY 000019 3', w - 60, 90);
    this.weather(c, w, h, 3200, 7);
  }

  paintSideB(c, w, h) {
    c.fillStyle = '#fff';
    c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    c.font = '800 300px "Big Shoulders Stencil"'; c.letterSpacing = '12px';
    c.fillText('CA CONTAINERS', w / 2, h * 0.6);
    c.font = '800 150px "Big Shoulders Stencil"'; c.letterSpacing = '26px';
    c.fillText('UY', w / 2, h * 0.8);
    c.textAlign = 'left'; c.font = '600 50px "Big Shoulders Stencil"'; c.letterSpacing = '6px';
    c.fillText('CAUY 202610 7   22G1', 70, 100);
    this.weather(c, w, h, 3000, 11);
  }

  // R channel = dark hardware (bars, seams), G channel = cream stencil markings.
  paintDoor(c, w, h) {
    c.fillStyle = '#f00';
    c.fillRect(w / 2 - 3, 0, 6, h);
    for (const x of [0.12, 0.34, 0.66, 0.88]) {
      c.fillRect(x * w - 7, 30, 14, h - 60);
      c.fillRect(x * w - 20, h * 0.46, 40, 34);
      c.fillRect(x * w - 16, 40, 32, 22); c.fillRect(x * w - 16, h - 62, 32, 22);
    }
    c.fillStyle = '#0f0';
    c.font = '700 62px "Big Shoulders Stencil"'; c.letterSpacing = '5px'; c.textAlign = 'left';
    c.fillText('CAUY', 560, 170); c.fillText('000019 3', 560, 236);
    c.font = '700 44px "Big Shoulders Stencil"';
    c.fillText('22G1', 560, 300);
    c.font = '600 30px "Big Shoulders Stencil"';
    c.fillText('MAX GROSS 30.480 KG', 70, h - 180); c.fillText('TARE        2.200 KG', 70, h - 140);
    this.weather(c, w, h, 1800, 3);
  }

  // ---------------------------------------------------------------- choreography
  dropA(t) {
    if (t < 0.5) { const u = K.clamp(t / 0.5); return 5.6 * (1 - u * u); }
    const tau = t - 0.5;
    return 0.05 * Math.abs(Math.sin(tau * 22)) * Math.exp(-tau * 9);
  }
  hingeAngle(t) {
    const u = K.clamp((t - 1.0) / 0.45);
    const a = (Math.PI / 2) * K.inCubic(u);
    const settle = t > 1.45 ? 0.05 * Math.exp(-(t - 1.45) * 12) * Math.sin((t - 1.45) * 40) : 0;
    return Math.min(Math.PI / 2, a) - settle;
  }
  dropB(t) {
    if (t < 2.5) { const u = K.clamp((t - 2.1) / 0.4); return 7.5 * (1 - u * u); }
    const tau = t - 2.5;
    return 0.06 * Math.abs(Math.sin(tau * 20)) * Math.exp(-tau * 9);
  }
  pop(t, t0) { return Math.max(0, K.spring(t - t0, 2.6, 0.45)); }

  layout(t) {
    const box = {}, sph = {};
    const yA = this.dropA(t);
    const A = [0, BASE + yA, 0];
    const set = (name, c, h, mat, R) => { box[name] = { c, h, mat, R }; };
    const setA = (name, c, h, mat, R) => set(name, [A[0] + c[0], A[1] + c[1], A[2] + c[2]], h, mat, R);
    const popA = (name, c, h, mat, s) => { if (s > 0.01) setA(name, [c[0], c[1] - h[1] + h[1] * s, c[2]], [h[0] * Math.min(1.08, s), h[1] * s, h[2] * Math.min(1.08, s)], mat); };

    [[-2.75, -0.95], [-2.75, 0.95], [2.75, -0.95], [2.75, 0.95]].forEach(([x, z], i) => set(`block${i}`, [x, BASE / 2, z], [0.2, BASE / 2, 0.2], M.BLOCK));
    setA('floor', [0, 0.08, 0], [HX, 0.08, HZ], M.FLOOR);
    setA('roof', [0, H - 0.045, 0], [HX, 0.045, HZ], M.ROOF);
    setA('back', [0, HY, -HZ + 0.025], [HX, HY, 0.025], M.WALL);
    setA('endL', [-HX + 0.025, HY, 0], [0.025, HY, HZ], M.WALL);
    setA('door', [HX - 0.025, HY, 0], [0.025, HY, HZ], M.DOOR);
    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([sx, sz], i) => setA(`post${i}`, [sx * (HX - 0.08), HY, sz * (HZ - 0.08)], [0.08, HY, 0.08], M.POST));
    setA('topRail', [0, H - 0.13, HZ - 0.06], [HX, 0.085, 0.06], M.POST);
    setA('sill', [0, 0.1, HZ - 0.06], [HX, 0.1, 0.06], M.POST);
    // Hinged long wall → deck
    const th = this.hingeAngle(t);
    const ph = (H - 0.4) / 2, pt = 0.03, px = HX - 0.16;
    const u = [0, Math.cos(th), Math.sin(th)], w = [0, -Math.sin(th), Math.cos(th)];
    const hinge = [0, 0.2, HZ];
    setA('panel', [hinge[0] + u[0] * ph - w[0] * pt, hinge[1] + u[1] * ph - w[1] * pt, hinge[2] + u[2] * ph - w[2] * pt], [px, ph, pt], M.PANEL);
    this.panelR = rotRows([1, 0, 0], u, w);
    const deckY = 0.2, deckDown = th > Math.PI / 2 - 0.02;
    if (deckDown) [-1, 1].forEach((sx, i) => setA(`leg${i}`, [sx * (px - 0.1), (deckY - 0.03 - BASE - yA) / 2, HZ + 2 * ph - 0.12], [0.04, (deckY - 0.03 + BASE) / 2, 0.04], M.RAIL));
    const rail = this.pop(t, 1.62);
    if (rail > 0.01) {
      const rz = HZ + 2 * ph - 0.05, rh = 0.95 * rail;
      setA('railTop', [0, deckY + rh, rz], [px, 0.022, 0.022], M.RAIL);
      [-px + 0.02, -px / 2, 0, px / 2, px - 0.02].forEach((x, i) => setA(`rp${i}`, [x, deckY + rh / 2, rz], [0.02, rh / 2, 0.02], M.RAIL));
      [-px + 0.02, px - 0.02].forEach((x, i) => setA(`rs${i}`, [x, deckY + rh, HZ + ph], [0.022, 0.022, ph], M.RAIL));
    }
    // Interior, furnished beat by beat
    if (th > 0.15) {
      setA('slats', [0, 1.45, -HZ + 0.07], [1.35, 1.0, 0.02], M.SLATS);
      setA('strip', [0, H - 0.11, -0.45], [1.6, 0.012, 0.035], M.STRIP);
      popA('rug', [0.15, 0.168, 0.05], [1.35, 0.006, 0.72], M.RUG, this.pop(t, 1.66));
      const so = this.pop(t, 1.74);
      popA('sofaSeat', [0.2, 0.38, -0.72], [0.95, 0.22, 0.4], M.SOFA, so);
      popA('sofaBack', [0.2, 0.78, -1.02], [0.95, 0.3, 0.12], M.SOFA, so);
      [-0.82, 1.22].forEach((x, i) => popA(`arm${i}`, [x, 0.5, -0.72], [0.12, 0.34, 0.42], M.SOFA, so));
      const cu = this.pop(t, 1.86);
      [-0.25, 0.55].forEach((x, i) => popA(`cush${i}`, [x, 0.78, -0.84], [0.25, 0.2, 0.07], M.CUSHION, cu));
      popA('counter', [2.35, 0.62, -0.84], [0.55, 0.46, 0.3], M.COUNTER, this.pop(t, 1.98));
      popA('art', [0.2, 1.72, -HZ + 0.1], [0.42, 0.32, 0.015], M.ART, this.pop(t, 2.1));
      const pot = this.pop(t, 1.92);
      popA('pot', [-2.35, 0.38, -0.7], [0.19, 0.22, 0.19], M.POT, pot);
      if (pot > 0.05) [[0, 0.62, 0, 0.3], [-0.12, 0.88, 0.05, 0.22], [0.14, 0.8, -0.06, 0.2]].forEach(([dx, dy, dz, r], i) => {
        sph[`leaf${i}`] = { c: [A[0] - 2.35 + dx, A[1] + 0.16 + dy * pot, A[2] - 0.7 + dz], r: r * pot, mat: M.LEAF };
      });
      const lamp = this.pop(t, 2.02);
      if (lamp > 0.02) {
        const ly = H - 0.09 - 0.7 * lamp;
        setA('cord', [1.55, (H - 0.09 + ly) / 2, -0.2], [0.006, (H - 0.09 - ly) / 2, 0.006], M.CORD);
        sph.lamp = { c: [A[0] + 1.55, A[1] + ly - 0.1, A[2] - 0.2], r: 0.12 * Math.min(1, lamp), mat: M.LAMP };
      }
    }
    [[-4.2, 2.6, 0.55], [-4.9, 1.6, 0.4], [4.3, -2.3, 0.5], [4.9, 2.9, 0.38]].forEach(([x, z, r], i) => { sph[`bush${i}`] = { c: [x, r * 0.7, z], r, mat: M.BUSH }; });
    // Container B, stacked across A
    const yB = this.dropB(t);
    const cB = [0, BASE + H + HY + yB, B_OFF];
    if (yB < 7.4) set('boxB', cB, [HZ, HY, HX], M.BOX_B);

    const flick = (t0) => (t < t0 ? 0 : t < t0 + 0.03 ? 1 : t < t0 + 0.06 ? 0.15 : 1);
    const lp = this.pop(t, 2.02);
    return {
      box, sph, A, cB, deckDown,
      stripI: flick(1.47), lampI: Math.min(1, lp) * (lp > 0.3 ? 1 : 0),
      glassI: yB < 0.5 ? flick(2.6) : 0,
      stripA: [A[0] - 1.6, A[1] + H - 0.13, A[2] - 0.45], stripB: [A[0] + 1.6, A[1] + H - 0.13, A[2] - 0.45],
      lampP: [A[0] + 1.55, A[1] + H - 0.09 - 0.7 - 0.1, A[2] - 0.2],
      glassC: [cB[0], cB[1], cB[2] + HX + 0.01],
    };
  }

  draw(t, cam = null) {
    const E = this.E, c = cam || houseCamera(t), Lr = this.layout(t);
    const BP = new Float32Array(NB * 4), BS = new Float32Array(NB * 4);
    const CMin = new Float32Array(NC * 4).fill(1e9), CMax = new Float32Array(NC * 4).fill(-1e9);
    const grow = (cl, cc, e) => {
      const k = CLUSTERS.indexOf(cl) * 4;
      for (let a = 0; a < 3; a++) { CMin[k + a] = Math.min(CMin[k + a], cc[a] - e[a] - 1e-3); CMax[k + a] = Math.max(CMax[k + a], cc[a] + e[a] + 1e-3); }
    };
    BOX_SLOTS.forEach((slot, i) => {
      const b = Lr.box[slot.name];
      if (!b) { BP.set([0, -1e4, 0, 0], i * 4); BS.set([1e-3, 1e-3, 1e-3, 0], i * 4); return; }
      BP.set([...b.c, b.mat], i * 4); BS.set([...b.h, 0], i * 4);
      const e = slot.kind === 'rbox' ? [1, 1, 1].map(() => Math.hypot(...b.h)) : b.h;
      grow(slot.cl, b.c, e);
    });
    const SP = new Float32Array(NS * 4), SM = new Float32Array(NS);
    SPH_SLOTS.forEach((slot, j) => {
      const s = Lr.sph[slot.name];
      if (!s) { SP.set([0, -1e4, 0, 1e-3], j * 4); return; }
      SP.set([...s.c, s.r], j * 4); SM[j] = s.mat;
      grow(slot.cl, s.c, [s.r, s.r, s.r]);
    });
    E.r.pass(this.prog, {
      uRes: [E.W, E.H], uJitter: E.jitter, uFocal: 1.55, uSeed: (E.sub || 0) + t * 61.0,
      uSub: E.sub || 0, uSubN: E.subN || 1,
      uEye: c.eye, uCam: c.mat,
      uBP: BP, uBS: BS, uPanelR: this.panelR, uCMin: CMin, uCMax: CMax, uSP: SP, uSM: SM,
      uCA: Lr.A, uCB: Lr.cB, uDeckDown: Lr.deckDown ? 1 : 0,
      uTexA: this.texA, uTexB: this.texB, uTexDoor: this.texDoor, uNoise: this.noise,
      uStripI: Lr.stripI, uLampI: Lr.lampI, uGlassI: Lr.glassI,
      uStripA: Lr.stripA, uStripB: Lr.stripB, uLampP: Lr.lampP, uGlassC: Lr.glassC,
      uRust: this.col.rust, uGraphite: this.col.graphite, uCream: this.col.cream, uWood: this.col.wood,
      uTeal: this.col.teal, uWarm: this.col.warm,
    }, E.stage, 'none');
    return { cam: c, layout: Lr };
  }
}
