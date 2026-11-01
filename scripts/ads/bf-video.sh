#!/usr/bin/env bash
# Black Friday harvest video: the footage of the winning vineyard ad (public/ads/vinha_oferta_4x5.mp4, its left
# window 576x1022 at 44,170) under the Black Friday frame from render-bf.ts (window positions in WINDOW there).
# Only the first 12.5 s of that ad are clean footage (its logo and Christmas end card follow), so the video cuts
# there and ends on the Black Friday box ad (bf_box_*) as its own end card.
# Usage: scripts/ads/bf-video.sh <frames dir> <out dir>
set -euo pipefail
FR=${1:?frames dir}; OUT=${2:?out dir}
SRC="$(dirname "$0")/../../public/ads/vinha_oferta_4x5.mp4"
CUT=12.5; END=3; TOTAL=15.5
for loc in de es; do
  for f in 4x5 9x16; do
    if [ "$f" = 4x5 ]; then W=1080; H=1350; X=44; Y=170; WW=576; WH=1022; else W=1080; H=1920; X=180; Y=400; WW=720; WH=1278; fi
    ffmpeg -v error -y -t "$CUT" -i "$SRC" -loop 1 -t "$CUT" -i "$FR/bf_frame_${loc}_${f}.png" -loop 1 -t "$END" -i "$FR/bf_box_${loc}_${f}.jpg" -i "$SRC" -filter_complex \
      "[0:v]crop=576:1022:44:170,scale=${WW}:${WH}:flags=lanczos,setsar=1,fps=30[clip];color=c=0x0b0b0b:s=${W}x${H}:r=30:d=${CUT}[bg];[bg][clip]overlay=${X}:${Y}:shortest=1[v];[1:v]fps=30[fr];[v][fr]overlay=0:0:shortest=1,format=yuv420p,fade=t=out:st=$(echo "$CUT-0.35" | bc):d=0.35[a1];
       [2:v]scale=${W}:${H},fps=30,format=yuv420p,setsar=1,fade=t=in:st=0:d=0.35[a2];[a1][a2]concat=n=2:v=1:a=0[o];
       [3:a]atrim=0:${TOTAL},asetpts=PTS-STARTPTS,afade=t=out:st=$(echo "$TOTAL-1" | bc):d=1[au]" \
      -map "[o]" -map "[au]" -c:v libx264 -crf 21 -preset medium -profile:v high -c:a aac -b:a 128k -movflags +faststart -t "$TOTAL" "$OUT/bf_video_${loc}_${f}.mp4"
    ffmpeg -v error -y -ss 4 -i "$OUT/bf_video_${loc}_${f}.mp4" -frames:v 1 -q:v 3 "$OUT/bf_video_${loc}_${f}.jpg"
    echo "$OUT/bf_video_${loc}_${f}.mp4"
  done
done
