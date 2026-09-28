// Broadcast-style HUD, drawn once per frame into the overlay (difference-blended in post so it
// reads on both ink and paper). Boots with the first shockwave; tracks section, timecode, beat.
import * as K from './engine/ease.js';
import { scramble } from './engine/draw.js';

const M = 44;

function tc(t, fps = 60) {
  const f = Math.max(0, Math.round(t * fps));
  const s = Math.floor(f / fps), fr = f % fps;
  return `00:00:${String(s).padStart(2, '0')}:${String(fr).padStart(2, '0')}`;
}

export class HUD {
  constructor(cues) {
    this.cues = cues;
    this.sections = cues.sections;
  }

  section(t) {
    let s = this.sections[0], start = 0, next = 15;
    for (let i = 0; i < this.sections.length; i++) {
      if (t >= this.sections[i][0]) { s = this.sections[i]; start = s[0]; next = this.sections[i + 1] ? this.sections[i + 1][0] : 15; }
    }
    return { id: s[1], name: s[2], start, next };
  }

  // tcTime: the time shown on the timecode (differs from t during the rewind).
  draw(ctx, t, frame, { tcTime = t, rewind = 0, alpha = 1, textAlpha = 1 } = {}) {
    const W = 1920, H = 1080;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const boot = K.clamp((t - 1.0) / 0.45);
    const out = 1 - K.smoothstep(14.72, 14.92, t);
    const A = alpha * out;
    if (boot <= 0 || A <= 0) return;
    ctx.globalAlpha = A;
    ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff';
    ctx.lineWidth = 2; ctx.lineCap = 'butt';

    // Corner crop marks grow in, staggered clockwise.
    const arm = 26;
    const corners = [[M, M, 1, 1], [W - M, M, -1, 1], [W - M, H - M, -1, -1], [M, H - M, 1, -1]];
    corners.forEach(([x, y, sx, sy], i) => {
      const g = K.outExpo(K.clamp((t - 1.0 - i * 0.05) / 0.3));
      if (g <= 0) return;
      ctx.beginPath();
      ctx.moveTo(x + sx * arm * g, y); ctx.lineTo(x, y); ctx.lineTo(x, y + sy * arm * g);
      ctx.stroke();
    });

    const txt = K.clamp((t - 1.08) / 0.4);
    if (textAlpha <= 0.001) { ctx.globalAlpha = 1; return; }
    const TA = A * textAlpha;
    ctx.globalAlpha = TA;
    ctx.textBaseline = 'middle';
    ctx.letterSpacing = '2.5px';
    // Top-left: identity
    ctx.font = '800 17px Archivo';
    ctx.fillText(scramble('CLAUDE', txt * 1.3, 1, frame >> 1), M + 40, M + 1);
    ctx.font = '500 15px "JetBrains Mono"';
    ctx.globalAlpha = TA * 0.7;
    ctx.fillText(scramble('/  MOTION DESIGN REEL  ’26', txt, 2, frame >> 1), M + 136, M + 1);
    // Top-right: timecode
    ctx.globalAlpha = TA * (rewind > 0 ? 1 : 0.85);
    ctx.textAlign = 'right';
    const tcs = (rewind > 0 ? '◂◂ ' : 'TC ') + tc(tcTime);
    ctx.fillText(scramble(tcs, txt * 1.2, 3, frame >> 1), W - M - 40, M + 1);
    ctx.textAlign = 'left';

    // Bottom-left: section id/name with a scramble on every change + progress hairline.
    const st = rewind > 0 ? tcTime : t;
    const s = this.section(st);
    const since = rewind > 0 ? 1 : t - s.start;
    const sp = K.clamp(since / 0.28);
    ctx.globalAlpha = TA;
    ctx.font = '600 15px "JetBrains Mono"';
    const label = `${s.id} — ${s.name}`;
    ctx.fillText(scramble(label, Math.min(txt, sp), 4 + +s.id, frame >> 1), M + 40, H - M - 1);
    const prog = K.clamp((st - s.start) / (s.next - s.start));
    ctx.globalAlpha = TA * 0.35;
    ctx.fillRect(M + 40, H - M + 14, 220, 1.5);
    ctx.globalAlpha = TA * 0.9;
    ctx.fillRect(M + 40, H - M + 14, 220 * prog * txt, 1.5);

    // Bottom-right: tempo + beat pips.
    ctx.globalAlpha = TA * 0.85;
    ctx.textAlign = 'right';
    ctx.font = '500 15px "JetBrains Mono"';
    ctx.fillText(scramble('120 BPM', txt, 5, frame >> 1), W - M - 40 - 4 * 15 - 14, H - M - 1);
    ctx.textAlign = 'left';
    const beat = Math.floor(t * 2) % 4;
    for (let i = 0; i < 4; i++) {
      const x = W - M - 40 - (4 - i) * 15 + 4, y = H - M - 6;
      const on = i === beat;
      const flash = on ? K.hit(t, Math.floor(t * 2) / 2, 0.12) : 0;
      ctx.globalAlpha = TA * (on ? 0.95 : 0.3) * txt;
      const g = 10 + 3 * flash;
      ctx.fillRect(x - (g - 10) / 2, y - (g - 10) / 2, g, g);
    }
    ctx.globalAlpha = 1;
    ctx.letterSpacing = '0px';
    ctx.textBaseline = 'alphabetic';
  }
}
