// Canvas2D drawing primitives shared across scenes.
export const TAU = Math.PI * 2;

export function ellipse(ctx, x, y, rx, ry, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), rot, 0, TAU);
}

// Horizontal capsule between x0..x1 centred on y with thickness th.
export function capsule(ctx, x0, x1, y, th) {
  const r = th / 2;
  ctx.beginPath();
  if (x1 - x0 < th) { const cx = (x0 + x1) / 2; ctx.ellipse(cx, y, Math.max(0, (x1 - x0) / 2), r, 0, 0, TAU); return; }
  ctx.moveTo(x0 + r, y - r);
  ctx.lineTo(x1 - r, y - r);
  ctx.arc(x1 - r, y, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(x0 + r, y + r);
  ctx.arc(x0 + r, y, r, Math.PI / 2, (3 * Math.PI) / 2);
  ctx.closePath();
}

export function roundRect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Polyline "trim path": draws the portion [a, b] (0..1) of the polyline pts.
export function trimPolyline(ctx, pts, a, b) {
  if (b <= a) return;
  const segs = []; let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    segs.push(l); total += l;
  }
  const s0 = a * total, s1 = b * total;
  let acc = 0, started = false;
  ctx.beginPath();
  for (let i = 1; i < pts.length; i++) {
    const l = segs[i - 1], p = pts[i - 1], q = pts[i];
    const e0 = acc, e1 = acc + l;
    if (e1 >= s0 && e0 <= s1 && l > 0) {
      const u0 = Math.max(0, (s0 - e0) / l), u1 = Math.min(1, (s1 - e0) / l);
      const x0 = p[0] + (q[0] - p[0]) * u0, y0 = p[1] + (q[1] - p[1]) * u0;
      const x1 = p[0] + (q[0] - p[0]) * u1, y1 = p[1] + (q[1] - p[1]) * u1;
      if (!started) { ctx.moveTo(x0, y0); started = true; }
      ctx.lineTo(x1, y1);
    }
    acc = e1;
  }
}

// Arc stroke from angle a0 to a1.
export function arcStroke(ctx, x, y, r, a0, a1) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0, r), a0, a1);
}

export function regularPoly(ctx, x, y, r, n, rot = 0) {
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU - Math.PI / 2;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
}

// Scramble/decode text: characters resolve left→right as p goes 0→1.
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=/<>';
export function scramble(str, p, seed = 0, frameSeed = 0) {
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    const th = i / Math.max(1, str.length);
    if (c === ' ' || p >= 1 || p > th + 0.18) out += c;
    else if (p > th) out += GLYPHS[(Math.abs(Math.sin((i + 1) * 91.7 + seed * 13.1 + frameSeed * 7.3)) * 1e4 | 0) % GLYPHS.length];
    else out += '';
  }
  return out;
}
