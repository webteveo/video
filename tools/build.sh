#!/usr/bin/env bash
# Full pipeline: fonts → glyphs → timings → score → frames → dist/showreel.mp4 (H.264 + AAC).
set -euo pipefail
cd "$(dirname "$0")/.."
FF=${FFMPEG:-ffmpeg}
JOBS=${JOBS:-2}
python3 tools/fetch_fonts.py
[ -f src/data/glyphs.json ] || python3 tools/glyphs.py
node tools/render.mjs timings
python3 audio/score.py
node tools/render.mjs video --jobs "$JOBS" --out out/master.mkv
mkdir -p dist
$FF -y -loglevel error -i out/master.mkv -i out/score.wav \
  -map 0:v -map 1:a \
  -vf "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p" \
  -c:v libx264 -preset slow -crf 21 -profile:v high -tune film -g 60 \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv \
  -c:a aac -b:a 256k -ar 48000 -shortest -movflags +faststart \
  dist/showreel.mp4
echo "wrote dist/showreel.mp4"
