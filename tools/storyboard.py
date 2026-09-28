#!/usr/bin/env python3
"""Pull one key frame per section from the final video and tile them into a labelled storyboard."""
import os, subprocess, sys, tempfile
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FF = os.environ.get('FFMPEG', 'ffmpeg')
src = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'out/showreel.mp4')
dst = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'dist/storyboard.jpg')
reel = sys.argv[3] if len(sys.argv) > 3 else 'showreel'
SHOTS = {
    'showreel': [(1.07, '01  PRINCIPLES'), (3.38, '02  KINETIC TYPE'), (4.95, '03  3D / LOOKDEV'), (6.85, '04  PARTICLES'),
                 (8.85, '05  SHAPE LAYERS'), (11.1, '06  PROCEDURAL 3D'), (12.36, '07  EDIT / RHYTHM'), (14.4, '08  IDENTITY')],
    'cacontainers': [(0.75, 'EL CONTENEDOR'), (2.08, 'A TU CASA'), (3.33, 'HACEMOS…'), (4.2, 'A MEDIDA'),
                     (4.8, 'ENTRAMOS'), (5.85, 'DESDE 30 DÍAS'), (7.3, '19 DEPARTAMENTOS'), (9.5, 'LLAMADO A LA ACCIÓN')],
}[reel]
TW, TH, COLS, PAD, LAB = 640, 360, 4, 10, 34
rows = (len(SHOTS) + COLS - 1) // COLS
sheet = Image.new('RGB', (COLS * TW + (COLS + 1) * PAD, rows * (TH + LAB) + (rows + 1) * PAD), (11, 11, 14))
d = ImageDraw.Draw(sheet)
font_path = os.path.join(ROOT, 'assets/fonts/JetBrainsMono-normal.woff2')
try:
    font = ImageFont.truetype(font_path, 17)
except Exception:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', 16)
with tempfile.TemporaryDirectory() as tmp:
    for i, (t, label) in enumerate(SHOTS):
        png = os.path.join(tmp, f'{i}.png')
        subprocess.run([FF, '-y', '-loglevel', 'error', '-ss', f'{t:.3f}', '-i', src, '-frames:v', '1', png], check=True)
        im = Image.open(png).convert('RGB').resize((TW, TH), Image.LANCZOS)
        x = PAD + (i % COLS) * (TW + PAD)
        y = PAD + (i // COLS) * (TH + LAB + PAD)
        sheet.paste(im, (x, y + LAB))
        d.rectangle([x, y + 11, x + 9, y + 20], fill=(255, 90, 31))
        d.text((x + 18, y + 6), f'{label}   {t:05.2f}s', fill=(243, 239, 230), font=font)
os.makedirs(os.path.dirname(dst), exist_ok=True)
sheet.save(dst, quality=88)
print(dst, sheet.size)
