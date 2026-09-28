// CA Containers UY — 10 s spot. Master timeline.
import * as K from '../../engine/ease.js';
import { lin } from '../../palette.js';
import { noise } from '../../engine/noise.js';
import { P } from './palette.js';
import { House } from './house.js';
import { Graphics } from './graphics.js';

export class Reel {
  constructor(engine, assets) {
    this.E = engine;
    this.cues = assets.cues;
    this.house = new House(engine, assets.params);
    this.gfx = new Graphics(engine);
    this.bg = lin(P.NIGHT);
  }
  trauma(t) {
    let tr = 0;
    for (const [t0, s] of this.cues.impacts) if (t >= t0) tr = Math.max(tr, s * Math.exp(-(t - t0) / 0.16));
    return tr;
  }
  sampling(t) { return { S: 8, shutter: 0.5 }; }
  renderStage(t, sub) {
    const E = this.E;
    E.beginSubframe(this.bg);
    this.house.draw(Math.min(t, 5.04));
    this.gfx.drawHouseOverlay(E.ctx, t);
    E.flush2D();
  }
  camera(t) {
    const tr = this.trauma(t), s = tr * tr;
    return { x: 26 * s * noise.n2(t * 26, 1.3), y: 26 * s * noise.n2(t * 26, 7.7), rot: 0.012 * s * noise.n2(t * 19, 4.1), zoom: 1 + 0.02 * tr };
  }
  post(t) {
    const tr = this.trauma(t);
    return { bloom: 0.3, bloomThreshold: 0.85, ca: 0.0012 + 0.006 * tr * tr, vignette: 0.35, grain: 0.03, barrel: 0.02 * tr * tr };
  }
  timings() { return {}; }
  overlay(ctx) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, 1920, 1080); }
}
