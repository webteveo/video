// 2D layers for the CA spot: Spanish kinetic type over the 3D, landing dust, and (later) the proof
// section + end card.
import * as K from '../../engine/ease.js';
import { rgba } from '../../palette.js';
import { project } from '../../engine/cam.js';
import { mulberry32 } from '../../engine/noise.js';
import { P } from './palette.js';
import { houseCamera, L, W, H, BASE, B_OFF } from './house.js';
import { roundRect } from '../../engine/draw.js';

const X0 = 112;

export class Graphics {
  constructor(engine, uruguay) {
    this.E = engine;
    this.setupMap(uruguay);
    const r = mulberry32(99);
    // Dust puffs along the landing edges of both containers.
    this.dust = [];
    for (let i = 0; i < 70; i++) {
      const side = i % 4, u = r() * 2 - 1;
      const onX = side < 2;
      const p = onX ? [u * L / 2, 0.05, (side ? 1 : -1) * W / 2] : [(side === 2 ? 1 : -1) * L / 2, 0.05, u * W / 2];
      const out = onX ? [0, 0, side ? 1 : -1] : [side === 2 ? 1 : -1, 0, 0];
      this.dust.push({ p, out, sp: 0.8 + 2.2 * r(), up: 0.2 + 0.8 * r(), size: 0.18 + 0.35 * r(), life: 0.6 + 0.7 * r(), a: 0.05 + 0.08 * r() });
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
    ctx.font = '900 132px "Big Shoulders Stencil"';
    ctx.letterSpacing = '3px';
    let x = X0;
    const y = 300;
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
      ctx.font = 'italic 400 150px "Instrument Serif"';
      ctx.letterSpacing = '0px';
      ctx.shadowColor = rgba(P.WARM, 0.8 * on);
      ctx.shadowBlur = 40;
      ctx.fillStyle = rgba(P.GLOW, on * (1 - out));
      ctx.fillText('a tu casa.', X0 - 4, 448 + (1 - rise) * 24 + out * 40);
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
    // Slot window: its top edge sits just under the HACEMOS baseline (384) and above the Ó accent
    // (~399), so outgoing words slide under the label instead of across it.
    const yb = 548, hBand = 190, top = 392;
    ctx.beginPath(); ctx.rect(X0 - 20, top, 1100, yb + 14 - top); ctx.clip();
    ctx.font = '900 152px "Big Shoulders"';
    ctx.letterSpacing = '2px';
    const f = (t - T0) / STEP;
    const k = Math.max(0, Math.min(words.length - 1, Math.floor(f)));
    const frac = f - Math.floor(f);
    // No roll before the first word has landed (f < 0 would otherwise pre-roll word 1).
    const roll = f >= 0 && k < words.length - 1 ? K.snap(K.clamp((frac - 0.62) / 0.38)) : 0;
    const drawWord = (i, dy) => {
      if (i < 0 || i >= words.length) return;
      ctx.fillStyle = i === words.length - 1 ? rgba(P.WARM, 1 - outA) : rgba(P.CREAM, 1 - outA);
      ctx.fillText(words[i], X0 - 4, yb + dy);
    };
    const enter = K.glide(K.clamp((t - T0) / 0.22));
    drawWord(k, (k === 0 ? (1 - enter) * hBand : 0) - roll * hBand);
    if (roll > 0) drawWord(k + 1, (1 - roll) * hBand);
    ctx.restore();
    // Underline that tracks the current word's width
    ctx.save();
    ctx.font = '900 152px "Big Shoulders"'; ctx.letterSpacing = '2px';
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

  // ------------------------------------------------------------------ proof section (5.0 – 7.6)
  setupMap(uy) {
    const lat0 = -32.5, k = Math.cos((lat0 * Math.PI) / 180);
    const proj = ([lon, lat]) => [lon * k, -lat];
    const pts = uy.outline.map(proj);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const s = Math.min(640 / (maxX - minX), 700 / (maxY - minY));
    const ox = 1170 - minX * s, oy = 196 - minY * s;
    const to = ([x, y]) => [ox + x * s, oy + y * s];
    this.map = pts.map(to);
    let len = 0;
    this.mapLen = [0];
    for (let i = 1; i < this.map.length; i++) { len += Math.hypot(this.map[i][0] - this.map[i - 1][0], this.map[i][1] - this.map[i - 1][1]); this.mapLen.push(len); }
    this.mapTotal = len;
    this.pins = uy.capitals.map((c) => ({ name: c.name, p: to(proj([c.lon, c.lat])) }));
    const home = this.pins.find((p) => p.name === 'Canelones');
    this.home = home;
    this.pins.forEach((p) => { p.d = Math.hypot(p.p[0] - home.p[0], p.p[1] - home.p[1]); });
    const order = [...this.pins].sort((a, b) => a.d - b.d);
    order.forEach((p, i) => { p.rank = i; });
  }

  drawBlueprint(ctx, t) {
    ctx.fillStyle = P.NAVY;
    ctx.fillRect(0, 0, 1920, 1080);
    const g = ctx.createRadialGradient(1300, 520, 100, 1300, 520, 1300);
    g.addColorStop(0, 'rgba(40,74,110,0.35)'); g.addColorStop(1, 'rgba(8,16,28,0.4)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 1920, 1080);
    const off = (t * 14) % 48;
    for (let i = -1; i < 44; i++) {
      const x = i * 48 + off, strong = (i % 4 + 4) % 4 === 0;
      ctx.fillStyle = `rgba(170,200,230,${strong ? 0.1 : 0.045})`;
      ctx.fillRect(x, 0, 1, 1080);
    }
    for (let j = -1; j < 25; j++) {
      const y = j * 48 + off * 0.5, strong = (j % 4 + 4) % 4 === 0;
      ctx.fillStyle = `rgba(170,200,230,${strong ? 0.1 : 0.045})`;
      ctx.fillRect(0, y, 1920, 1);
    }
    // Drawing title block, bottom right — plans, not slides.
    ctx.strokeStyle = 'rgba(210,225,240,0.28)'; ctx.lineWidth = 1.5;
    ctx.strokeRect(1500, 978, 360, 58);
    ctx.fillStyle = 'rgba(210,225,240,0.45)';
    ctx.font = '600 17px "Big Shoulders"'; ctx.letterSpacing = '4px'; ctx.textBaseline = 'middle';
    ctx.fillText('CA CONTAINERS UY', 1516, 996);
    ctx.fillText('LÁMINA 01  ·  ESC 1:50', 1516, 1019);
    ctx.textBaseline = 'alphabetic'; ctx.letterSpacing = '0px';
  }

  keyIcon(ctx, x, y, s, a) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.strokeStyle = `rgba(11,22,38,${a})`; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(-14, 0, 11, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-3, 0); ctx.lineTo(22, 0); ctx.moveTo(14, 0); ctx.lineTo(14, 8); ctx.moveTo(20, 0); ctx.lineTo(20, 6); ctx.stroke();
    ctx.restore();
  }

  drawThirty(ctx, t) {
    const T = t - 5.0;
    const exit = K.inCubic(K.clamp((T - 1.15) / 0.18));
    if (exit >= 1) return;
    ctx.save();
    ctx.translate(-exit * 220, 0);
    ctx.globalAlpha = 1 - exit;
    const x0 = X0;
    ctx.textBaseline = 'alphabetic';
    const k1 = K.glide(K.clamp((T - 0.04) / 0.3));
    ctx.font = '700 46px "Big Shoulders"'; ctx.letterSpacing = '12px';
    ctx.fillStyle = rgba(P.WARM, k1);
    ctx.fillText('LLAVE EN MANO', x0, 300 + (1 - k1) * 24);
    const k2 = K.glide(K.clamp((T - 0.1) / 0.3));
    ctx.font = '600 64px "Big Shoulders"'; ctx.letterSpacing = '6px';
    ctx.fillStyle = rgba(P.CREAM, 0.8 * k2);
    ctx.fillText('DESDE', x0, 404 + (1 - k2) * 24);
    const prog = K.outCubic(K.clamp((T - 0.1) / 0.7));
    const n = Math.max(1, Math.round(1 + 29 * prog));
    const k3 = K.glide(K.clamp((T - 0.08) / 0.3));
    ctx.font = '900 420px "Big Shoulders"'; ctx.letterSpacing = '0px';
    ctx.fillStyle = rgba(P.CREAM, k3);
    const num = String(n).padStart(2, '0');
    ctx.fillText(num, x0 - 10, 790 + (1 - k3) * 40);
    const wNum = ctx.measureText('30').width;
    const k4 = K.glide(K.clamp((T - 0.18) / 0.3));
    ctx.font = '800 170px "Big Shoulders"'; ctx.letterSpacing = '4px';
    ctx.fillStyle = rgba(P.WARM, k4);
    ctx.fillText('DÍAS', x0 + wNum + 26, 790 + (1 - k4) * 40);
    ctx.restore();
    // Calendar: 30 cells fill as the counter advances; day 30 hands over the keys.
    const cw = 92, gap = 14, gx = 1180, gy = 282;
    for (let i = 0; i < 30; i++) {
      const c = i % 6, r = Math.floor(i / 6);
      const x = gx + c * (cw + gap), y = gy + r * (cw + gap);
      const appear = K.spring(T - 0.02 - (c + r) * 0.018, 3.2, 0.55);
      const filled = n > i;
      const fillT = 0.1 + 0.7 * (i / 29);
      const pop = filled ? 1 + 0.18 * Math.exp(-Math.max(0, T - fillT) * 14) : 1;
      const sc = Math.max(0, appear) * pop * (1 - exit * 0.9);
      if (sc <= 0.01) continue;
      ctx.save();
      ctx.translate(x + cw / 2 - exit * 120, y + cw / 2);
      ctx.scale(sc, sc);
      roundRect(ctx, -cw / 2, -cw / 2, cw, cw, 12);
      ctx.globalAlpha = 1 - exit;
      if (filled) { ctx.fillStyle = i === 29 ? P.WARM : rgba(P.RUST, 0.95); ctx.fill(); }
      else { ctx.strokeStyle = 'rgba(210,225,240,0.3)'; ctx.lineWidth = 2; ctx.stroke(); }
      ctx.font = '600 22px "Big Shoulders"'; ctx.letterSpacing = '0px';
      ctx.fillStyle = filled ? (i === 29 ? 'rgba(11,22,38,0.75)' : 'rgba(244,237,225,0.85)') : 'rgba(210,225,240,0.45)';
      ctx.fillText(String(i + 1), -cw / 2 + 10, -cw / 2 + 26);
      if (i === 29 && filled) this.keyIcon(ctx, 4, 10, 1.25 * K.clamp(K.spring(T - 0.8, 3, 0.45)), 1);
      ctx.restore();
    }
  }

  drawMap(ctx, t) {
    const T = t - 6.25;
    if (T < -0.05) return;
    // Left: +50 proyectos · 19 departamentos
    const x0 = X0;
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    const k1 = K.glide(K.clamp((T - 0.02) / 0.3));
    ctx.font = '700 46px "Big Shoulders"'; ctx.letterSpacing = '12px';
    ctx.fillStyle = rgba(P.WARM, k1);
    ctx.fillText('EN TODO URUGUAY', x0, 300 + (1 - k1) * 24);
    const k2 = K.glide(K.clamp((T - 0.06) / 0.3));
    const c50 = Math.round(50 * K.outCubic(K.clamp((T - 0.06) / 0.6)));
    ctx.font = '900 300px "Big Shoulders"'; ctx.letterSpacing = '0px';
    ctx.fillStyle = rgba(P.CREAM, k2);
    ctx.fillText(`+${c50}`, x0 - 6, 590 + (1 - k2) * 40);
    ctx.font = '800 96px "Big Shoulders"'; ctx.letterSpacing = '3px';
    ctx.fillText('PROYECTOS', x0, 690 + (1 - k2) * 40);
    const k3 = K.glide(K.clamp((T - 0.26) / 0.3));
    const c19 = Math.min(19, this.pins.filter((p) => T > 0.25 + p.rank * 0.028).length);
    ctx.font = '900 118px "Big Shoulders"'; ctx.letterSpacing = '0px';
    ctx.fillStyle = rgba(P.WARM, k3);
    ctx.fillText(String(c19).padStart(2, '0'), x0 - 4, 842 + (1 - k3) * 30);
    ctx.font = '800 72px "Big Shoulders"'; ctx.letterSpacing = '3px';
    ctx.fillStyle = rgba(P.CREAM, k3);
    ctx.fillText('DEPARTAMENTOS', x0 + 140, 836 + (1 - k3) * 30);
    ctx.restore();
    // Right: the country draws itself, then the workshop ships to every department.
    const trim = K.inOutCubic(K.clamp(T / 0.45));
    const fillA = K.clamp((T - 0.2) / 0.3);
    ctx.save();
    ctx.beginPath();
    this.map.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = `rgba(30,58,90,${0.55 * fillA})`;
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = rgba(P.CREAM, 0.9); ctx.lineWidth = 3; ctx.lineJoin = 'round';
    ctx.beginPath();
    const target = trim * this.mapTotal;
    for (let i = 0; i < this.map.length; i++) {
      if (this.mapLen[i] > target) {
        const a = this.map[i - 1], b = this.map[i], u = (target - this.mapLen[i - 1]) / (this.mapLen[i] - this.mapLen[i - 1]);
        ctx.lineTo(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u);
        break;
      }
      i ? ctx.lineTo(...this.map[i]) : ctx.moveTo(...this.map[i]);
    }
    ctx.stroke();
    ctx.restore();
    const H0 = this.home.p;
    // Delivery arcs from Canelones
    ctx.save();
    ctx.setLineDash([7, 9]);
    ctx.lineWidth = 2;
    for (const p of this.pins) {
      if (p === this.home) continue;
      const t0 = 0.25 + p.rank * 0.028;
      const u = K.outCubic(K.clamp((T - t0 + 0.12) / 0.3));
      if (u <= 0) continue;
      const mx = (H0[0] + p.p[0]) / 2, my = (H0[1] + p.p[1]) / 2 - p.d * 0.28;
      ctx.strokeStyle = rgba(P.WARM, 0.55);
      ctx.beginPath(); ctx.moveTo(H0[0], H0[1]);
      const N = 24, upto = Math.round(N * u);
      for (let k = 1; k <= upto; k++) { const s = k / N; ctx.lineTo((1 - s) * (1 - s) * H0[0] + 2 * (1 - s) * s * mx + s * s * p.p[0], (1 - s) * (1 - s) * H0[1] + 2 * (1 - s) * s * my + s * s * p.p[1]); }
      ctx.stroke();
    }
    ctx.restore();
    // Pins
    for (const p of this.pins) {
      const t0 = p === this.home ? 0.18 : 0.25 + p.rank * 0.028 + 0.12;
      const tau = T - t0;
      if (tau < 0) continue;
      const drop = (1 - K.outBounce(K.clamp(tau / 0.3))) * 26;
      const r = (p === this.home ? 13 : 8.5) * Math.min(1, K.spring(tau, 3.5, 0.5));
      const ring = K.clamp(tau / 0.6);
      ctx.strokeStyle = rgba(P.WARM, 0.8 * (1 - ring)); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.p[0], p.p[1], r + 34 * K.outCubic(ring), 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = p === this.home ? P.WARM : rgba(P.GLOW, 1);
      ctx.beginPath(); ctx.arc(p.p[0], p.p[1] - drop, Math.max(0, r), 0, Math.PI * 2); ctx.fill();
    }
    // Workshop label
    const lk = K.glide(K.clamp((T - 0.3) / 0.3));
    if (lk > 0) {
      ctx.save();
      ctx.globalAlpha = lk;
      ctx.strokeStyle = rgba(P.CREAM, 0.7); ctx.lineWidth = 1.5;
      const lx = H0[0] - 70, ly = H0[1] + 78;
      ctx.beginPath(); ctx.moveTo(H0[0] - 8, H0[1] + 12); ctx.lineTo(lx, ly); ctx.lineTo(lx - 250 * lk, ly); ctx.stroke();
      ctx.font = '700 24px "Big Shoulders"'; ctx.letterSpacing = '5px';
      ctx.fillStyle = P.CREAM; ctx.textAlign = 'right';
      ctx.fillText('TALLER · CANELONES', lx - 8, ly - 10);
      ctx.textAlign = 'left';
      ctx.restore();
    }
  }

  // ------------------------------------------------------------------ end card (7.6 – 10.0)
  containerIcon(ctx, x, y, s, p) {
    // Isometric container wireframe drawn with a trim path.
    const pts = [[0, 30], [110, -20], [150, 0], [40, 50], [0, 30], [0, 80], [40, 100], [150, 50], [150, 0], [40, 50], [40, 100]];
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.strokeStyle = P.CREAM; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    let total = 0; const seg = [];
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); total += l; }
    let acc = 0; const target = p * total;
    ctx.beginPath(); ctx.moveTo(...pts[0]);
    for (let i = 1; i < pts.length && acc < target; i++) {
      const l = seg[i - 1], u = Math.min(1, (target - acc) / l);
      ctx.lineTo(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u);
      acc += l;
    }
    ctx.stroke();
    // corrugation ticks on the long face
    if (p > 0.85) {
      ctx.globalAlpha = (p - 0.85) / 0.15; ctx.lineWidth = 2.5;
      for (let k = 1; k < 7; k++) { const u = k / 7; ctx.beginPath(); ctx.moveTo(40 + 110 * u, 50 - 50 * u + 8); ctx.lineTo(40 + 110 * u, 100 - 50 * u - 8); ctx.stroke(); }
    }
    ctx.restore();
  }

  drawEnd(ctx, t) {
    const T = t - 7.6;
    const x0 = X0;
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    // Legibility scrim over the plate
    const g = ctx.createLinearGradient(0, 0, 1300, 0);
    g.addColorStop(0, 'rgba(8,15,26,0.9)'); g.addColorStop(0.55, 'rgba(8,15,26,0.6)'); g.addColorStop(1, 'rgba(8,15,26,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 1920, 1080);
    this.containerIcon(ctx, x0 + 4, 196, 0.95, K.inOutCubic(K.clamp((T - 0.02) / 0.5)));
    // Wordmark rises out of a mask, letter by letter
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 320, 1920, 170); ctx.clip();
    ctx.font = '900 122px "Big Shoulders Stencil"'; ctx.letterSpacing = '3px';
    const word = 'CA CONTAINERS UY';
    let x = x0;
    for (let i = 0; i < word.length; i++) {
      const ch = word[i], w = ctx.measureText(ch).width + 3;
      const u = K.glide(K.clamp((T - 0.08 - i * 0.02) / 0.4));
      ctx.fillStyle = i >= 14 ? P.WARM : P.CREAM;
      if (ch !== ' ') ctx.fillText(ch, x, 470 + (1 - u) * 160);
      x += w;
    }
    ctx.restore();
    const kt = K.glide(K.clamp((T - 0.32) / 0.4));
    ctx.font = 'italic 400 62px "Instrument Serif"'; ctx.letterSpacing = '0px';
    ctx.fillStyle = rgba(P.GLOW, kt);
    ctx.fillText('Casas contenedor llave en mano', x0, 552 + (1 - kt) * 20);
    // CTA pill
    const kp = K.spring(T - 0.55, 2.8, 0.5);
    if (kp > 0.01) {
      ctx.font = '800 40px "Big Shoulders"'; ctx.letterSpacing = '4px';
      const label = 'PEDÍ TU COTIZACIÓN  →';
      const w = ctx.measureText(label).width + 64, h = 78;
      ctx.save();
      ctx.translate(x0 + w / 2, 646);
      ctx.scale(kp, kp);
      roundRect(ctx, -w / 2, -h / 2, w, h, h / 2);
      ctx.fillStyle = P.WARM; ctx.fill();
      // shine sweep
      const sh = K.clamp((T - 1.25) / 0.45);
      if (sh > 0 && sh < 1) {
        ctx.save(); ctx.clip();
        const sx = -w / 2 - 80 + (w + 160) * K.inOutCubic(sh);
        const sg = ctx.createLinearGradient(sx - 60, 0, sx + 60, 0);
        sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,250,235,0.65)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = sg; ctx.fillRect(-w / 2, -h / 2, w, h);
        ctx.restore();
      }
      ctx.fillStyle = P.NIGHT; ctx.textBaseline = 'middle';
      ctx.fillText(label, -w / 2 + 32, 3);
      ctx.restore();
    }
    const ku = K.glide(K.clamp((T - 0.72) / 0.4));
    ctx.font = '700 62px "Big Shoulders"'; ctx.letterSpacing = '2px'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = rgba(P.CREAM, ku);
    ctx.fillText('cacontainersuy.com', x0, 790 + (1 - ku) * 20);
    const kf = K.glide(K.clamp((T - 0.95) / 0.5));
    ctx.font = '600 25px "Big Shoulders"'; ctx.letterSpacing = '5px';
    ctx.fillStyle = rgba(P.CREAM, 0.62 * kf);
    ctx.fillText('+10 AÑOS DE EXPERIENCIA   ·   FINANCIACIÓN EN CUOTAS   ·   ENVÍOS A TODO EL PAÍS', x0, 958);
    ctx.restore();
  }
}
