// Master timeline: decides which scene renders at time t, the camera (shake), sampling (motion
// blur), post-processing per moment, and the HUD overlay.
import { C, lin } from './palette.js';
import * as K from './engine/ease.js';
import { noise } from './engine/noise.js';
import { Intro } from './scenes/intro.js';
import { Blob } from './scenes/blob.js';
import { Particles } from './scenes/particles.js';
import { Bauhaus } from './scenes/bauhaus.js';
import { Pillars } from './scenes/pillars.js';
import { Rewind, RW_START, RW_END } from './scenes/rewind.js';
import { EndCard } from './scenes/endcard.js';
import { HUD } from './hud.js';

export class Reel {
  constructor(engine, assets) {
    this.E = engine;
    this.A = assets;
    this.cues = assets.cues;
    this.T = assets.cues.t;
    this.intro = new Intro(engine, assets);
    this.blob = new Blob(engine);
    this.particles = new Particles(engine);
    this.bauhaus = new Bauhaus(engine);
    this.pillars = new Pillars(engine);
    this.rewind = new Rewind(engine);
    this.endcard = new EndCard(engine, assets);
    this.hud = new HUD(assets.cues);
    this.bgInk = lin(C.INK);
  }

  trauma(t) {
    let tr = 0;
    for (const [t0, s] of this.cues.impacts) if (t >= t0) tr = Math.max(tr, s * Math.exp(-(t - t0) / 0.16));
    return tr;
  }

  sampling(t) {
    if (t >= RW_START && t < RW_END) return { S: 1, shutter: 0 };   // crisp scrub
    // Extra sub-frames right after impacts, where things move fastest.
    let S = 8;
    for (const [t0] of this.cues.impacts) if (t >= t0 - 0.02 && t < t0 + 0.12) S = 16;
    return { S, shutter: 0.5 };
  }

  // The linear reel.
  renderScene(t) {
    const E = this.E;
    E.beginSubframe(this.bgInk);
    if (t < 4.0) {
      this.intro.draw(t);
      E.flush2D();
    } else if (t < 6.0) {
      this.blob.draw(t);
    } else if (t < 8.0) {
      this.particles.draw(t);
      this.particles.drawOverlay(t);
      E.flush2D();
    } else if (t < 10.0) {
      this.bauhaus.draw(t);
    } else {
      this.pillars.draw(t);
    }
  }

  renderStage(t) {
    const E = this.E;
    if (t >= RW_START && t < RW_END) {
      const src = this.rewind.src(t);
      this.renderScene(src);
      this.rewind.glitch(t);
      this.rewind.drawUI(E.ctx, t, src);
      E.flush2D();
      return;
    }
    if (t >= RW_END) {
      E.beginSubframe(this.bgInk);
      this.endcard.draw(t);
      E.flush2D();
      return;
    }
    this.renderScene(t);
  }

  camera(t) {
    const tr = this.trauma(t), s = tr * tr;
    return {
      x: 30 * s * noise.n2(t * 26, 1.3),
      y: 30 * s * noise.n2(t * 26, 7.7),
      rot: 0.02 * s * noise.n2(t * 19, 4.1),
      zoom: 1 + 0.02 * tr,
    };
  }

  // Section weights for look changes (flat graphics want less bloom/CA/vignette than 3D).
  flatness(t) { return K.smoothstep(8.02, 8.2, t) * (1 - K.smoothstep(9.55, 9.75, t)); }

  post(t) {
    const tr = this.trauma(t);
    const flat = this.flatness(t);
    const part = K.smoothstep(6.0, 6.1, t) * (1 - K.smoothstep(7.75, 8.0, t));
    const drop = K.smoothstep(10.0, 10.05, t) * (1 - K.smoothstep(11.9, 12.0, t));
    return {
      bloom: K.lerp(0.22, 0.04, flat) + 0.13 * part + 0.18 * drop,
      bloomThreshold: K.lerp(0.9, 1.1, flat),
      ca: K.lerp(0.0016, 0.0004, flat) + 0.009 * tr * tr,
      vignette: K.lerp(0.32, 0.1, flat), grain: 0.035,
      barrel: 0.04 * tr * tr,
      flash: 0.1 * K.hit(t, 10.0, 0.025),
      exposure: (1 + 1.4 * K.hit(t, 10.0, 0.06) + 0.7 * K.hit(t, 6.0, 0.07) + 0.35 * K.hit(t, 1.0, 0.05)) * (1 - K.smoothstep(14.8, 14.99, t)),
      flashColor: [1, 0.97, 0.92],
    };
  }

  // Derived event times the soundtrack syncs to (exported by `render.mjs timings`).
  timings() {
    const tiles = [], flips = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) {
      tiles.push({ c, r, t: this.bauhaus.activation(c, r) });
      if (c === 2 && r === 1) continue;
      for (let t = 9.5; t < 10; t += 0.001) if (this.bauhaus.flipAngle(c, r, t) >= Math.PI / 2) { flips.push(+t.toFixed(4)); break; }
    }
    return { letterPops: this.endcard.popT, tiles, flips: flips.sort((a, b) => a - b), endcard: { J0: 13.05, J1: 13.21, S1: 13.47, H1: 13.76 } };
  }

  overlay(ctx, t, frame) {
    const rw = t >= RW_START && t < RW_END;
    this.hud.draw(ctx, t, frame, { textAlpha: 1 - this.flatness(t), rewind: rw ? 1 : 0, tcTime: rw ? this.rewind.src(t) : t });
  }
}
