#!/usr/bin/env bash
# Full pipeline: fonts → glyphs → (timings) → score → frames → dist/<reel>.mp4 (H.264 + AAC).
#   bash tools/build.sh                     # the showreel
#   REEL=cacontainers bash tools/build.sh   # the CA Containers UY spot
set -euo pipefail
cd "$(dirname "$0")/.."
FF=${FFMPEG:-ffmpeg}
JOBS=${JOBS:-2}
REEL=${REEL:-showreel}
python3 tools/fetch_fonts.py
[ -f src/data/glyphs.json ] || python3 tools/glyphs.py
if [ "$REEL" = showreel ]; then
  node tools/render.mjs timings
  SCORE=audio/score.py; WAV=out/score.wav; MASTER=out/master.mkv
else
  SCORE=audio/$REEL.py; WAV=out/$REEL.wav; MASTER=out/${REEL}_master.mkv
fi
python3 "$SCORE"
node tools/render.mjs video --reel "$REEL" --jobs "$JOBS" --out "$MASTER"
mkdir -p dist
$FF -y -loglevel error -i "$MASTER" -i "$WAV" \
  -map 0:v -map 1:a \
  -vf "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p" \
  -c:v libx264 -preset slow -crf 21 -profile:v high -tune film -g 60 \
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv \
  -c:a aac -b:a 256k -ar 48000 -shortest -movflags +faststart \
  "dist/$REEL.mp4"
echo "wrote dist/$REEL.mp4"
