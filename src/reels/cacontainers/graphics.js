// 2D layers for the CA spot: Spanish kinetic type over the 3D, landing dust, and (later) the proof
// section + end card.
import * as K from '../../engine/ease.js';
import { rgba } from '../../palette.js';
import { project } from '../../engine/cam.js';
import { mulberry32 } from '../../engine/noise.js';
import { P } from './palette.js';
import { houseCamera, L, W, H, BASE, B_OFF } from './house.js';

const X0 = 112;

export class Graphics {
  constructor(engine) {
    this.E = engine;
    const r = mulberry32(99);
    // Dust puffs along the landing edges of both containers.
    this.dust = [];
    for (let i = 0; i < 70; i++) {
      const side = i % 4, u = r() * 2 - 1;
      const onX = side < 2;
      const p = onX ? [u * L / 2, 0.05, (side ? 1 : -1) * W / 2] : [(side === 2 ? 1 : -1) * L / 2, 0.05, u * W / 2];
      const out = onX ? [0, 0, side ? 1 : -1] : [side === 2 ? 1 : -1, 0, 0];
      this.dust.push({ p, out, sp: 0.8 + 2.2 * r(), up: 0.2 + 0.8 * r(), size: 0.12 + 0.3 * r(), life: 0.5 + 0.6 * r(), a: 0.18 + 0.2 * r() });
    }
    this.dustB = this.dust.map((d) => ({ ...d, p: [d.p[2] * 0.4, BASE + H + 0.02, d.p[0] * 0.9 + B_OFF], out: [d.out[2], 0, d.out[0]] }));
  }

  drawDust(ctx, t, set, t0) {
    const tau = t - t0;
    if (tau < 0 || tau > 1.3) return;
    const cam = houseCamera(t);
    for (const d of set) {
      const u = tau / d.life;
      if (u >= 1) continue;
      const dist = d.sp * (1 - Math.exp(-tau * 4)) / 4 * 3;
      const p = [d.p[0] + d.out[0] * dist, d.p[1] + d.up * (1 - Math.exp(-tau * 3)) * 0.6, d.p[2] + d.out[2] * dist];
      const s = project(cam, p, 1.55);
      if (!s) continue;
      const rad = ((d.size * (1 + 2.5 * u)) / s[2]) * 1.55 * 1080;
      const g = ctx.createRadialGradient(s[0], s[1], 0, s[0], s[1], rad);
      const a = d.a * (1 - u) * (1 - u);
      g.addColorStop(0, `rgba(150,140,132,${a})`);
      g.addColorStop(1, 'rgba(150,140,132,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(s[0], s[1], rad, 0, Math.PI * 2); ctx.fill();
    }
  }

  // "DE CONTENEDOR" — stencil letters that land with the container; "a tu casa." lights up with the house.
  drawTitle(ctx, t) {
    const out = K.inCubic(K.clamp((t - 2.28) / 0.25));
    if (t < 0.42 || out >= 1) return;
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    const word = 'DE CONTENEDOR';
    ctx.font = '900 156px "Big Shoulders Stencil"';
    ctx.letterSpacing = '3px';
    let x = X0;
    const y = 318;
    for (let i = 0; i < word.length; i++) {
      const ch = word[i];
      const w = ctx.measureText(ch).width + 3;
      const ti = 0.44 + i * 0.022;
      const u = K.clamp((t - ti) / 0.12);
      if (u > 0 && ch !== ' ') {
        const fall = (1 - K.inQuad(u)) * -260;
        const land = t - ti - 0.12;
        const sq = land > 0 ? 0.18 * Math.exp(-land * 16) * Math.cos(land * 60) : 0;
        ctx.save();
        ctx.translate(x + w / 2, y + fall + out * 40);
        ctx.scale(1 + sq * 0.5, 1 - sq);
        ctx.fillStyle = rgba(P.CREAM, (1 - out) * Math.min(1, u * 3));
        ctx.fillText(ch, -w / 2 + 1.5, 0);
        ctx.restore();
      }
      x += w;
    }
    // Rust rule that draws under the word
    const rule = K.glide(K.clamp((t - 0.62) / 0.35));
    ctx.fillStyle = rgba(P.RUST, 1 - out);
    ctx.fillRect(X0, y + 22, (x - X0 - 6) * rule, 6);
    // "a tu casa." switches on with the lights (same flicker as the strip)
    const on = t < 1.47 ? 0 : t < 1.5 ? 1 : t < 1.53 ? 0.25 : 1;
    const rise = K.glide(K.clamp((t - 1.47) / 0.4));
    if (on > 0) {
      ctx.font = 'italic 400 170px "Instrument Serif"';
      ctx.letterSpacing = '0px';
      ctx.shadowColor = rgba(P.WARM, 0.8 * on);
      ctx.shadowBlur = 40;
      ctx.fillStyle = rgba(P.GLOW, on * (1 - out));
      ctx.fillText('a tu casa.', X0 - 6, 488 + (1 - rise) * 24 + out * 40);
    }
    ctx.restore();
  }

  // Slot-machine ticker: HACEMOS → CASAS / OFICINAS / TINY HOUSES / DEPÓSITOS / BARBACOAS / A MEDIDA.
  drawTicker(ctx, t) {
    const T0 = 2.62, STEP = 0.3;
    const words = ['CASAS', 'OFICINAS', 'TINY HOUSES', 'DEPÓSITOS', 'BARBACOAS', 'A MEDIDA.'];
    const inA = K.glide(K.clamp((t - T0 + 0.08) / 0.3));
    const outA = K.inCubic(K.clamp((t - 4.42) / 0.16));
    if (inA <= 0 || outA >= 1) return;
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    ctx.font = '600 44px "Big Shoulders"';
    ctx.letterSpacing = '11px';
    ctx.fillStyle = rgba(P.CREAM, 0.78 * inA * (1 - outA));
    ctx.fillText('HACEMOS', X0, 384 - (1 - inA) * 20);
    // Slot window
    const yb = 548, hBand = 170;
    ctx.beginPath(); ctx.rect(X0 - 20, yb - hBand + 16, 1000, hBand + 24); ctx.clip();
    ctx.font = '900 172px "Big Shoulders"';
    ctx.letterSpacing = '2px';
    const f = (t - T0) / STEP;
    const k = Math.max(0, Math.min(words.length - 1, Math.floor(f)));
    const frac = f - Math.floor(f);
    const roll = k < words.length - 1 ? K.snap(K.clamp((frac - 0.62) / 0.38)) : 0;
    const drawWord = (i, dy) => {
      if (i < 0 || i >= words.length) return;
      ctx.fillStyle = i === words.length - 1 ? rgba(P.WARM, 1 - outA) : rgba(P.CREAM, 1 - outA);
      ctx.fillText(words[i], X0 - 4, yb + dy);
    };
    const enter = K.glide(K.clamp((t - T0) / 0.22));
    if (t < T0 + STEP) drawWord(0, (1 - enter) * hBand);
    else drawWord(k, -roll * hBand);
    if (roll > 0) drawWord(k + 1, (1 - roll) * hBand);
    ctx.restore();
    // Underline that tracks the current word's width
    ctx.save();
    ctx.font = '900 172px "Big Shoulders"'; ctx.letterSpacing = '2px';
    const wNow = ctx.measureText(words[k]).width, wNext = ctx.measureText(words[Math.min(words.length - 1, k + 1)]).width;
    const wl = K.lerp(wNow, wNext, roll) * enter;
    ctx.fillStyle = rgba(P.RUST, 1 - outA);
    ctx.fillRect(X0, 578, wl, 6);
    ctx.restore();
  }

  drawHouseOverlay(ctx, t) {
    this.drawDust(ctx, t, this.dust, 0.5);
    this.drawDust(ctx, t, this.dustB, 2.5);
    this.drawTitle(ctx, t);
    this.drawTicker(ctx, t);
  }
}
