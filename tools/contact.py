#!/usr/bin/env python3
"""Tile rendered stills into a labelled contact sheet for review.

  python3 tools/contact.py out/stills out/contact.png [--cols 4] [--width 480]
"""
import sys, os, glob, argparse
from PIL import Image, ImageDraw, ImageFont

ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('dst')
ap.add_argument('--cols', type=int, default=4)
ap.add_argument('--width', type=int, default=480)
ap.add_argument('--frames', default='')
a = ap.parse_args()

files = sorted(glob.glob(os.path.join(a.src, 'f*.png')))
if a.frames:
    want = {int(x) for x in a.frames.split(',')}
    files = [f for f in files if int(os.path.basename(f)[1:5]) in want]
w = a.width; h = int(w * 9 / 16); pad = 4; lab = 18
rows = (len(files) + a.cols - 1) // a.cols
sheet = Image.new('RGB', (a.cols * (w + pad) + pad, rows * (h + pad + lab) + pad), (40, 40, 44))
d = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', 13)
except Exception:
    font = ImageFont.load_default()
for i, f in enumerate(files):
    im = Image.open(f).convert('RGB').resize((w, h), Image.LANCZOS)
    x = pad + (i % a.cols) * (w + pad); y = pad + (i // a.cols) * (h + pad + lab)
    sheet.paste(im, (x, y + lab))
    fr = int(os.path.basename(f)[1:5])
    d.text((x + 2, y + 2), f'f{fr}  t={fr/60:.3f}s', fill=(220, 220, 220), font=font)
sheet.save(a.dst)
print(a.dst, sheet.size)
