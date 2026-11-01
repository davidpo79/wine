#!/usr/bin/env bash
# Black Friday harvest video: the footage of the winning vineyard ad (public/ads/vinha_oferta_4x5.mp4, its left
# window 576x1022 at 44,170) under the Black Friday frame from render-bf.ts (window positions in WINDOW there).
# Usage: scripts/ads/bf-video.sh <frames dir> <out dir>
set -euo pipefail
FR=${1:?frames dir}; OUT=${2:?out dir}
SRC="$(dirname "$0")/../../public/ads/vinha_oferta_4x5.mp4"
for loc in de es; do
  for f in 4x5 9x16; do
    if [ "$f" = 4x5 ]; then W=1080; H=1350; X=44; Y=170; WW=576; WH=1022; else W=1080; H=1920; X=180; Y=400; WW=720; WH=1278; fi
    ffmpeg -v error -y -i "$SRC" -loop 1 -i "$FR/bf_frame_${loc}_${f}.png" -filter_complex \
      "[0:v]crop=576:1022:44:170,scale=${WW}:${WH}:flags=lanczos,setsar=1[clip];color=c=0x0b0b0b:s=${W}x${H}:r=30[bg];[bg][clip]overlay=${X}:${Y}:shortest=1[v];[v][1:v]overlay=0:0:shortest=1,format=yuv420p[o]" \
      -map "[o]" -map 0:a -c:v libx264 -crf 21 -preset medium -profile:v high -c:a aac -b:a 128k -movflags +faststart -shortest "$OUT/bf_video_${loc}_${f}.mp4"
    ffmpeg -v error -y -ss 4 -i "$OUT/bf_video_${loc}_${f}.mp4" -frames:v 1 -q:v 3 "$OUT/bf_video_${loc}_${f}.jpg"
    echo "$OUT/bf_video_${loc}_${f}.mp4"
  done
done
