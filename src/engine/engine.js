// Frame pipeline: scenes draw into a linear-light HDR "stage"; sub-frames are accumulated for true
// motion blur (with sub-pixel jitter for free AA); the accumulated frame goes through bloom, lens
// and film post, then the HUD overlay is difference-blended on top.
import { Renderer } from './gl.js';

const COMPOSITE_FS = `
in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform float uOpacity;
void main(){ vec4 c = texture(uTex, vUv); o = vec4(srgb2lin(c.rgb) * c.a, c.a) * uOpacity; }`;

const ACCUM_FS = `
in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform float uWeight; uniform vec2 uRes; uniform mat3 uXform;
void main(){
  vec2 p = (uXform * vec3(vUv * uRes - 0.5 * uRes, 1.0)).xy;
  vec2 uv = p / uRes + 0.5;
  o = vec4(texture(uTex, uv).rgb * uWeight, uWeight);
}`;

// 13-tap downsample (Jimenez, "Next Generation Post Processing in Call of Duty: AW").
const DOWN_FS = `
in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform vec2 uTexel; uniform float uThreshold; uniform float uKnee; uniform int uPrefilter;
vec3 s(vec2 d){ return texture(uTex, vUv + d * uTexel).rgb; }
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 karis(vec3 a, vec3 b, vec3 c, vec3 d){
  float wa = 1.0/(1.0+luma(a)), wb = 1.0/(1.0+luma(b)), wc = 1.0/(1.0+luma(c)), wd = 1.0/(1.0+luma(d));
  return (a*wa + b*wb + c*wc + d*wd) / (wa+wb+wc+wd);
}
void main(){
  vec3 A = s(vec2(-2,-2)), B = s(vec2(0,-2)), C = s(vec2(2,-2));
  vec3 D = s(vec2(-1,-1)), E = s(vec2(1,-1));
  vec3 F = s(vec2(-2,0)), G = s(vec2(0,0)), H = s(vec2(2,0));
  vec3 I = s(vec2(-1,1)), J = s(vec2(1,1));
  vec3 K = s(vec2(-2,2)), L = s(vec2(0,2)), M = s(vec2(2,2));
  vec3 c;
  if (uPrefilter == 1) {
    c = karis(D,E,I,J) * 0.5 + karis(A,B,F,G) * 0.125 + karis(B,C,G,H) * 0.125 + karis(F,G,K,L) * 0.125 + karis(G,H,L,M) * 0.125;
    float br = max(c.r, max(c.g, c.b));
    float rq = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
    rq = rq * rq / (4.0 * uKnee + 1e-4);
    c *= max(rq, br - uThreshold) / max(br, 1e-4);
  } else {
    c = (D+E+I+J) * 0.125 + (A+B+F+G) * 0.03125 + (B+C+G+H) * 0.03125 + (F+G+K+L) * 0.03125 + (G+H+L+M) * 0.03125;
  }
  o = vec4(c, 1.0);
}`;

const UP_FS = `
in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform sampler2D uBase; uniform vec2 uTexel; uniform float uRadius;
void main(){
  vec2 d = uTexel * uRadius;
  vec3 c = texture(uTex, vUv + vec2(-d.x, -d.y)).rgb + texture(uTex, vUv + vec2(0, -d.y)).rgb * 2.0 + texture(uTex, vUv + vec2(d.x, -d.y)).rgb
         + texture(uTex, vUv + vec2(-d.x, 0)).rgb * 2.0 + texture(uTex, vUv).rgb * 4.0 + texture(uTex, vUv + vec2(d.x, 0)).rgb * 2.0
         + texture(uTex, vUv + vec2(-d.x, d.y)).rgb + texture(uTex, vUv + vec2(0, d.y)).rgb * 2.0 + texture(uTex, vUv + vec2(d.x, d.y)).rgb;
  o = vec4(texture(uBase, vUv).rgb + c / 16.0, 1.0);
}`;

const FINAL_FS = `
in vec2 vUv; out vec4 o;
uniform sampler2D uScene, uBloom, uOverlay;
uniform vec2 uRes; uniform float uFrame;
uniform float uBloomAmt, uCA, uVignette, uGrain, uExposure, uFlash, uSat, uContrast, uOverlayAmt, uBarrel;
uniform vec3 uFlashColor, uTint;
vec3 softclip(vec3 x){ const float k = 0.82; return mix(x, k + (1.0 - k) * (1.0 - exp(-(x - k) / (1.0 - k))), step(k, x)); }
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
void main(){
  vec2 d = vUv - 0.5;
  vec2 da = d * vec2(uRes.x / uRes.y, 1.0);
  float r2 = dot(da, da);
  vec2 uv = 0.5 + d * (1.0 + uBarrel * r2);
  vec2 dd = uv - 0.5;
  vec2 off = dd * uCA * (0.35 + 1.6 * r2);
  vec3 col = vec3(texture(uScene, uv - off).r, texture(uScene, uv).g, texture(uScene, uv + off).b);
  vec3 bl = vec3(texture(uBloom, uv - off * 1.5).r, texture(uBloom, uv).g, texture(uBloom, uv + off * 1.5).b);
  col = col + bl * uBloomAmt;
  col *= uExposure * uTint;
  col = softclip(col);
  vec3 s = lin2srgb(col);
  float l = luma(s);
  s = mix(vec3(l), s, uSat);
  s = mix(s, smoothstep(0.0, 1.0, s), uContrast);
  float vig = smoothstep(1.25, 0.25, length(da * vec2(0.9, 1.1)));
  s *= mix(1.0, vig, uVignette);
  s = mix(s, uFlashColor, uFlash);
  vec4 ov = texture(uOverlay, vec2(vUv.x, vUv.y));
  ov.a *= uOverlayAmt;
  s = mix(s, abs(s - ov.rgb), ov.a);
  // Film grain: two hashed octaves, strongest in the mids.
  vec2 fc = gl_FragCoord.xy;
  float g = hash12(fc + uFrame * 17.13) + hash12(fc * 0.5 + uFrame * 3.71) - 1.0;
  float lm = luma(s);
  s += g * uGrain * (0.55 + 0.9 * lm * (1.0 - lm));
  s += (hash12(fc + vec2(uFrame * 1.618, 7.0)) - 0.5) / 255.0; // dither
  o = vec4(clamp(s, 0.0, 1.0), 1.0);
}`;

export class Engine {
  constructor(canvas, W, H) {
    const r = (this.r = new Renderer(canvas, W, H));
    this.W = W; this.H = H;
    this.gl = r.gl;
    this.stage = r.target(W, H, { wrap: 'mirror' });
    this.accum = r.target(W, H);
    this.layerTex = r.texture(W, H, { float: false });
    this.overlayTex = r.texture(W, H, { float: false });
    this.canvas = new OffscreenCanvas(W, H);
    this.ctx = this.canvas.getContext('2d');
    this.ocanvas = new OffscreenCanvas(W, H);
    this.octx = this.ocanvas.getContext('2d');
    this.progs = {
      composite: r.program(COMPOSITE_FS),
      accum: r.program(ACCUM_FS),
      down: r.program(DOWN_FS),
      up: r.program(UP_FS),
      final: r.program(FINAL_FS),
    };
    this.down = []; this.up = [];
    let w = W >> 1, h = H >> 1;
    for (let i = 0; i < 6; i++) {
      this.down.push(r.target(w, h));
      this.up.push(r.target(w, h));
      w = Math.max(1, w >> 1); h = Math.max(1, h >> 1);
    }
    this.jitter = [0, 0];
    this.pixels = new Uint8Array(W * H * 4);
  }

  beginSubframe(bgLinear = [0, 0, 0]) {
    this.r.clear(this.stage, [bgLinear[0], bgLinear[1], bgLinear[2], 1]);
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.W, this.H);
  }

  // Upload whatever has been drawn to the 2D canvas and composite it over the stage.
  flush2D(opacity = 1) {
    const { r, ctx } = this;
    r.uploadCanvas(this.layerTex, this.canvas);
    r.pass(this.progs.composite, { uTex: this.layerTex, uOpacity: opacity }, this.stage, 'premul');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = 'none';
    ctx.clearRect(0, 0, this.W, this.H);
  }

  clearAccum() { this.r.clear(this.accum, [0, 0, 0, 0]); }

  // cam: {x, y, rot, zoom} in pixels / radians, applied as a 2D camera over the finished sub-frame.
  accumulate(weight, cam = {}) {
    const { x = 0, y = 0, rot = 0, zoom = 1 } = cam;
    const c = Math.cos(-rot) / zoom, s = Math.sin(-rot) / zoom;
    // column-major mat3: p_src = R(-rot)/zoom * (p_out - t)
    const m = [c, s, 0, -s, c, 0, -(c * x - s * y), -(s * x + c * y), 1];
    this.r.pass(this.progs.accum, { uTex: this.stage, uWeight: weight, uRes: [this.W, this.H], uXform: m }, this.accum, 'add');
  }

  post(p, frame) {
    const { r } = this;
    const levels = this.down.length;
    let src = this.accum;
    for (let i = 0; i < levels; i++) {
      r.pass(this.progs.down, {
        uTex: src, uTexel: [1 / src.w, 1 / src.h], uThreshold: p.bloomThreshold ?? 0.9,
        uKnee: 0.5, uPrefilter: i === 0 ? 1 : 0,
      }, this.down[i]);
      src = this.down[i];
    }
    // Upsample: up[i] = down[i] + blur(up[i+1])
    let prev = this.down[levels - 1];
    for (let i = levels - 2; i >= 0; i--) {
      r.pass(this.progs.up, { uTex: prev, uBase: this.down[i], uTexel: [1 / prev.w, 1 / prev.h], uRadius: 1.0 }, this.up[i]);
      prev = this.up[i];
    }
    r.uploadCanvas(this.overlayTex, this.ocanvas);
    r.pass(this.progs.final, {
      uScene: this.accum, uBloom: this.up[0], uOverlay: this.overlayTex,
      uRes: [this.W, this.H], uFrame: frame,
      uBloomAmt: p.bloom ?? 0.25, uCA: p.ca ?? 0.002, uVignette: p.vignette ?? 0.3,
      uGrain: p.grain ?? 0.04, uExposure: p.exposure ?? 1, uFlash: p.flash ?? 0,
      uFlashColor: p.flashColor ?? [1, 1, 1], uSat: p.sat ?? 1, uContrast: p.contrast ?? 0,
      uTint: p.tint ?? [1, 1, 1], uOverlayAmt: p.overlay ?? 1, uBarrel: p.barrel ?? 0,
    }, null);
  }

  read() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, this.W, this.H, gl.RGBA, gl.UNSIGNED_BYTE, this.pixels);
    return this.pixels;
  }
}
