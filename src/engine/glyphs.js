// Variable-font glyph outlines rendered as Path2D at arbitrary axis values (bilinear over the
// precomputed grid from tools/glyphs.py — exact for gvar-style interpolation).

export class VarFont {
  constructor(data) {
    this.d = data;
    this.upm = data.upm;
    this.cap = data.cap;
    this.ax0 = data.axes[data.order[0]];
    this.ax1 = data.axes[data.order[1]];
  }

  _seg(axis, v) {
    if (v <= axis[0]) return [0, 0];
    for (let i = 0; i < axis.length - 1; i++) {
      if (v <= axis[i + 1]) return [i, (v - axis[i]) / (axis[i + 1] - axis[i])];
    }
    return [axis.length - 2, 1];
  }

  // Returns { cmds, pts (Float32Array, font units, y-up), adv }.
  outline(ch, a0, a1) {
    const g = this.d.glyphs[ch];
    if (!g) return null;
    const [i, u] = this._seg(this.ax0, a0);
    const [j, v] = this._seg(this.ax1, a1);
    const n1 = this.ax1.length;
    const k00 = i * n1 + j, k01 = i * n1 + j + 1, k10 = (i + 1) * n1 + j, k11 = (i + 1) * n1 + j + 1;
    const w00 = (1 - u) * (1 - v), w01 = (1 - u) * v, w10 = u * (1 - v), w11 = u * v;
    const P = g.pts, len = P[0].length, out = new Float32Array(len);
    for (let q = 0; q < len; q++) out[q] = P[k00][q] * w00 + P[k01][q] * w01 + P[k10][q] * w10 + P[k11][q] * w11;
    const A = g.adv;
    const adv = A[k00] * w00 + A[k01] * w01 + A[k10] * w10 + A[k11] * w11;
    return { cmds: g.cmds, pts: out, adv };
  }

  // Append glyph to a Path2D (or ctx) at origin (x, baseline y), scaled so 1 unit = size/upm px.
  trace(target, o, x, y, size) {
    const s = size / this.upm, p = o.pts;
    let q = 0;
    for (const c of o.cmds) {
      switch (c) {
        case 'M': target.moveTo(x + p[q] * s, y - p[q + 1] * s); q += 2; break;
        case 'L': target.lineTo(x + p[q] * s, y - p[q + 1] * s); q += 2; break;
        case 'Q': target.quadraticCurveTo(x + p[q] * s, y - p[q + 1] * s, x + p[q + 2] * s, y - p[q + 3] * s); q += 4; break;
        case 'C': target.bezierCurveTo(x + p[q] * s, y - p[q + 1] * s, x + p[q + 2] * s, y - p[q + 3] * s, x + p[q + 4] * s, y - p[q + 5] * s); q += 6; break;
        case 'Z': target.closePath(); break;
      }
    }
  }

  path(ch, a0, a1, x, y, size) {
    const o = this.outline(ch, a0, a1);
    const path = new Path2D();
    if (o) this.trace(path, o, x, y, size);
    return { path, adv: o ? (o.adv * size) / this.upm : 0 };
  }

  // Width of a string (px) with per-letter axis functions.
  measure(str, size, axesAt, tracking = 0) {
    let w = 0;
    for (let i = 0; i < str.length; i++) {
      const [a0, a1] = axesAt(i);
      const o = this.outline(str[i], a0, a1);
      w += (o ? (o.adv * size) / this.upm : size * 0.3) + (i < str.length - 1 ? tracking : 0);
    }
    return w;
  }
}
