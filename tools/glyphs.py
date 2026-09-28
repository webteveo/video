#!/usr/bin/env python3
"""Extract variable-font glyph outlines on a grid of axis locations.

The browser bilinearly interpolates between grid samples, which is exact for
variable fonts when the grid includes every master / avar breakpoint (glyph
deltas are piecewise-multilinear in axis space). This lets the reel animate
true width/weight axes per letter, per sub-frame, in Canvas2D.
"""
import json, sys, os
from fontTools.ttLib import TTFont
from fontTools.pens.basePen import BasePen

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

class FlatPen(BasePen):
    """Records outlines as explicit M/L/Q/C/Z segments (implied on-curve points resolved)."""
    def __init__(self, glyphset):
        super().__init__(glyphset)
        self.cmds, self.pts = [], []
    def _moveTo(self, p):  self.cmds.append('M'); self.pts += p
    def _lineTo(self, p):  self.cmds.append('L'); self.pts += p
    def _qCurveToOne(self, a, b): self.cmds.append('Q'); self.pts += a + b
    def _curveToOne(self, a, b, c): self.cmds.append('C'); self.pts += a + b + c
    def _closePath(self):  self.cmds.append('Z')
    _endPath = _closePath

def extract(path, chars, axes):
    font = TTFont(path)
    cmap = font.getBestCmap()
    names = list(axes.keys())
    grid = [(a, b) for a in axes[names[0]] for b in axes[names[1]]]
    out = {"upm": font['head'].unitsPerEm, "axes": {n: axes[n] for n in names},
           "order": names, "cap": font['OS/2'].sCapHeight, "xh": font['OS/2'].sxHeight,
           "glyphs": {}}
    for ch in chars:
        gname = cmap[ord(ch)]
        cmds, samples, advs = None, [], []
        for loc in grid:
            gs = font.getGlyphSet(location=dict(zip(names, loc)))
            pen = FlatPen(gs); gs[gname].draw(pen)
            c = ''.join(pen.cmds)
            if cmds is None: cmds = c
            assert c == cmds, f"incompatible outlines for {ch!r} at {loc}"
            samples.append([round(v, 2) for v in pen.pts])
            advs.append(round(gs[gname].width, 2))
        out["glyphs"][ch] = {"cmds": cmds, "pts": samples, "adv": advs}
    return out

if __name__ == '__main__':
    chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-—/.,'’&!?:+"
    data = {
        "Archivo": extract(os.path.join(ROOT, 'assets/fonts/Archivo-normal.woff2'), chars,
                           {"wdth": [62, 100, 125], "wght": [100, 200, 300, 400, 500, 600, 700, 800, 900]}),
    }
    dst = os.path.join(ROOT, 'src/data/glyphs.json')
    with open(dst, 'w') as f: json.dump(data, f, separators=(',', ':'))
    print(dst, os.path.getsize(dst) // 1024, 'KB')
