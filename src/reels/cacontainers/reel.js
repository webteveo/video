// CA Containers UY — 10 s spot, en español. Master timeline:
//   0.0–5.0  3D: de contenedor… a tu casa (drop, deck, lights, furnish, stack, ticker, push into the glass)
//   5.0–7.6  blueprint proof: llave en mano desde 30 días → +50 proyectos en los 19 departamentos
//   7.6–10   end card over a hero plate of the house: marca, llamado a la acción, web
import * as K from '../../engine/ease.js';
import { lin } from '../../palette.js';
import { noise } from '../../engine/noise.js';
import { P } from './palette.js';
import { House, cameraFrom } from './house.js';
import { Graphics } from './graphics.js';

const PLATE_FS = `
in vec2 vUv; out vec4 o;
uniform sampler2D uTex; uniform float uZoom; uniform vec2 uFocus;
void main(){ vec2 uv = (vUv - uFocus) / uZoom + uFocus; o = vec4(texture(uTex, uv).rgb, 1.0); }`;

export class Reel {
  constructor(engine, assets) {
    this.E = engine;
    this.cues = assets.cues;
    this.house = new House(engine, assets.params);
    this.bg = lin(P.NIGHT);
    this.plateProg = engine.r.program(PLATE_FS);
    this.plate = null;
  }

  async init() {
    const uy = await (await fetch('./reels/cacontainers/uruguay.json')).json();
    this.gfx = new Graphics(this.E, uy);
  }

  // Hero still of the finished house for the end card: 24 jittered samples, rendered once, lazily.
  renderPlate() {
    const E = this.E, N = 24;
    const saved = { jitter: E.jitter, sub: E.sub, subN: E.subN };
    this.plate = E.r.target(E.W, E.H);
    E.r.clear(this.plate, [0, 0, 0, 0]);
    const cam = cameraFrom([-8.0, 3.2, 14.6], [0.0, 2.7, 1.2], 4.6);
    for (let j = 0; j < N; j++) {
      E.jitter = [((j * 0.618) % 1) - 0.5, ((j * 0.7549) % 1) - 0.5];
      E.sub = j; E.subN = N;
      E.beginSubframe(this.bg);
      this.house.draw(4.4, cam);
      E.r.pass(E.progs.accum, { uTex: E.stage, uWeight: 1 / N, uRes: [E.W, E.H], uXform: [1, 0, 0, 0, 1, 0, 0, 0, 1] }, this.plate, 'add');
    }
    Object.assign(E, saved);
  }

  trauma(t) {
    let tr = 0;
    for (const [t0, s] of this.cues.impacts) if (t >= t0) tr = Math.max(tr, s * Math.exp(-(t - t0) / 0.16));
    return tr;
  }

  sampling(t) {
    // The ray-traced house is the expensive part: 6 sub-frames (12 around the landings); 2D gets 8.
    let S = t < 5.24 ? 6 : 8;
    for (const [t0] of this.cues.impacts) if (t >= t0 - 0.02 && t < t0 + 0.1 && t < 5) S = 12;
    return { S, shutter: 0.5 };
  }

  drawPlate(t) {
    const E = this.E;
    if (!this.plate) this.renderPlate();
    E.beginSubframe(this.bg);
    const z = 1.0 + 0.045 * K.inOutQuad(K.clamp((t - 7.5) / 2.5));
    E.r.pass(this.plateProg, { uTex: this.plate, uZoom: z, uFocus: [0.68, 0.45] }, E.stage, 'none');
  }

  renderStage(t) {
    const E = this.E, ctx = E.ctx, g = this.gfx;
    if (t < 5.0) {
      E.beginSubframe(this.bg);
      this.house.draw(Math.min(t, 5.04));
      g.drawHouseOverlay(ctx, t);
      E.flush2D();
      return;
    }
    if (t < 7.5) {
      if (t < 5.24) {
        // Iris from the warm glass into the blueprint.
        E.beginSubframe(this.bg);
        this.house.draw(5.04);
        const R = 1150 * K.inOutCubic(K.clamp((t - 5.0) / 0.22));
        ctx.save(); ctx.beginPath(); ctx.arc(960, 540, Math.max(0.1, R), 0, Math.PI * 2); ctx.clip();
        g.drawBlueprint(ctx, t); g.drawThirty(ctx, t);
        ctx.restore();
        ctx.strokeStyle = 'rgba(255,217,160,0.9)'; ctx.lineWidth = 6;
        ctx.beginPath(); ctx.arc(960, 540, Math.max(0.1, R), 0, Math.PI * 2); ctx.stroke();
      } else {
        E.beginSubframe(this.bg);
        g.drawBlueprint(ctx, t); g.drawThirty(ctx, t); g.drawMap(ctx, t);
      }
      E.flush2D();
      return;
    }
    // End card; the map irises open from the Canelones workshop onto the house.
    this.drawPlate(t);
    const irisT = K.inOutCubic(K.clamp((t - 7.5) / 0.2));
    if (irisT < 1) {
      const [hx, hy] = g.home.p;
      const R = 2300 * irisT;
      ctx.save();
      g.drawBlueprint(ctx, t); g.drawThirty(ctx, t); g.drawMap(ctx, t);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath(); ctx.arc(hx, hy, Math.max(0.1, R), 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,184,92,0.95)'; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.arc(hx, hy, Math.max(0.1, R), 0, Math.PI * 2); ctx.stroke();
    }
    g.drawEnd(ctx, t);
    E.flush2D();
  }

  camera(t) {
    const tr = this.trauma(t), s = tr * tr;
    return { x: 26 * s * noise.n2(t * 26, 1.3), y: 26 * s * noise.n2(t * 26, 7.7), rot: 0.012 * s * noise.n2(t * 19, 4.1), zoom: 1 + 0.02 * tr };
  }

  post(t) {
    const tr = this.trauma(t);
    const flat = K.smoothstep(5.0, 5.2, t) * (1 - K.smoothstep(7.5, 7.7, t));
    const end = K.smoothstep(7.5, 7.7, t);
    return {
      bloom: K.lerp(0.3, 0.07, flat) - 0.08 * end,
      bloomThreshold: K.lerp(0.85, 1.05, flat),
      ca: K.lerp(0.0012, 0.0006, flat) + 0.006 * tr * tr,
      vignette: K.lerp(0.36, 0.22, flat), grain: 0.03,
      barrel: 0.02 * tr * tr,
      exposure: 1 + 0.35 * K.smoothstep(4.8, 5.0, t) * (1 - K.smoothstep(5.0, 5.12, t)),
    };
  }

  timings() { return {}; }

  overlay(ctx) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, 1920, 1080); }
}
