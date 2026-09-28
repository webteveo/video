#!/usr/bin/env python3
"""Extract every Nth frame of the final video into per-range contact sheets for a review pass.

  python3 tools/review.py out/showreel.mp4 out/review --step 4 --per 36
"""
import os, sys, subprocess, glob, argparse
from PIL import Image, ImageDraw, ImageFont
ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('dst')
ap.add_argument('--step', type=int, default=4)
ap.add_argument('--per', type=int, default=36)
ap.add_argument('--cols', type=int, default=6)
ap.add_argument('--width', type=int, default=320)
a = ap.parse_args()
FF = os.environ.get('FFMPEG', 'ffmpeg')
fr = os.path.join(a.dst, 'frames'); os.makedirs(fr, exist_ok=True)
for f in glob.glob(os.path.join(fr, '*.png')): os.remove(f)
subprocess.run([FF, '-y', '-loglevel', 'error', '-i', a.src, '-vf', f"select='not(mod(n\\,{a.step}))',scale={a.width}:-1",
                '-vsync', '0', os.path.join(fr, '%04d.png')], check=True)
files = sorted(glob.glob(os.path.join(fr, '*.png')))
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', 12)
w = a.width; h = int(w * 9 / 16); lab = 15; pad = 3
for s in range(0, len(files), a.per):
    chunk = files[s:s + a.per]
    rows = (len(chunk) + a.cols - 1) // a.cols
    sheet = Image.new('RGB', (a.cols * (w + pad) + pad, rows * (h + lab + pad) + pad), (40, 40, 44))
    d = ImageDraw.Draw(sheet)
    for i, f in enumerate(chunk):
        n = (s + i) * a.step
        x = pad + (i % a.cols) * (w + pad); y = pad + (i // a.cols) * (h + lab + pad)
        sheet.paste(Image.open(f).convert('RGB'), (x, y + lab))
        d.text((x + 2, y + 1), f'f{n} {n/60:.2f}s', fill=(230, 230, 230), font=font)
    out = os.path.join(a.dst, f'sheet_{s * a.step:04d}.png')
    sheet.save(out); print(out)
