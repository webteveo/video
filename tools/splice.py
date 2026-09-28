#!/usr/bin/env python3
"""Replace frame ranges of a rendered master with re-rendered segments (no full re-render needed).

  python3 tools/splice.py out/master.mkv out/master2.mkv 58:121=out/fixA.mkv 320:386=out/fixB.mkv ...
  TOTAL=600 python3 tools/splice.py out/cacontainers_master.mkv ...     (frame count; default 900)

Each patch `a:b=file` must contain exactly frames [a, b) as rendered by `render.mjs video --from a --to b`.
"""
import os, subprocess, sys

FF = os.environ.get('FFMPEG', 'ffmpeg')
src, dst, *specs = sys.argv[1:]
TOTAL = int(os.environ.get('TOTAL', '900'))
patches = []
for s in specs:
    rng, f = s.split('=')
    a, b = map(int, rng.split(':'))
    patches.append((a, b, f))
patches.sort()

inputs = [src] + [p[2] for p in patches]
pieces, cur = [], 0
for k, (a, b, _) in enumerate(patches):
    if a > cur:
        pieces.append(('m', cur, a))
    pieces.append(('p', k + 1, b - a))
    cur = b
if cur < TOTAL:
    pieces.append(('m', cur, TOTAL))

nm = sum(1 for p in pieces if p[0] == 'm')
fc = [f"[0:v]split={nm}" + ''.join(f'[m{i}]' for i in range(nm))]
labels, mi = [], 0
for j, p in enumerate(pieces):
    if p[0] == 'm':
        fc.append(f"[m{mi}]trim=start_frame={p[1]}:end_frame={p[2]},setpts=PTS-STARTPTS[s{j}]"); mi += 1
    else:
        fc.append(f"[{p[1]}:v]trim=end_frame={p[2]},setpts=PTS-STARTPTS[s{j}]")
    labels.append(f'[s{j}]')
fc.append(''.join(labels) + f'concat=n={len(pieces)}:v=1:a=0[v]')

cmd = [FF, '-y', '-loglevel', 'error']
for i in inputs:
    cmd += ['-i', i]
cmd += ['-filter_complex', ';'.join(fc), '-map', '[v]', '-r', '60', '-c:v', 'libx264rgb', '-preset', 'veryfast', '-crf', '3', dst]
subprocess.run(cmd, check=True)
print('wrote', dst, 'from', len(pieces), 'pieces')
