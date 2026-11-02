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
# Balloons rise from the bottom through the whole clip with a slight sway, layered under the footage and the copy so they
# never cover the text: they rise in the side margins, behind the copy and the footage. Each entry: x, size (of the 160 px sprite), color, rise speed px/s, start offset px.
BALLOONS_4x5="1035 0.6 red 210 0|-45 0.55 black 180 700|1040 0.5 black 240 1150|-40 0.5 red 200 300|1035 0.55 black 190 1500|-50 0.6 red 230 1000"
BALLOONS_9x16="20 0.8 red 230 0|930 0.85 black 200 900|50 0.6 black 260 1500|950 0.65 red 220 400|0 0.55 red 250 1900|920 0.55 red 260 1300|40 0.65 black 210 700|940 0.6 black 240 1700"
for loc in de es; do
  for f in 4x5 9x16; do
    if [ "$f" = 4x5 ]; then W=1080; H=1350; X=44; Y=170; WW=576; WH=1022; LIST=$BALLOONS_4x5; else W=1080; H=1920; X=180; Y=400; WW=720; WH=1278; LIST=$BALLOONS_9x16; fi
    FC="color=c=0x0b0b0b:s=${W}x${H}:r=30:d=${CUT}[l0];[4:v]format=rgba,split=8[r0][r1][r2][r3][r4][r5][r6][r7];[5:v]format=rgba,split=8[k0][k1][k2][k3][k4][k5][k6][k7];"
    i=0; prev=l0
    IFS='|' read -ra BS <<< "$LIST"
    for bl in "${BS[@]}"; do
      read -r bx sc col spd off <<< "$bl"
      src=$([ "$col" = red ] && echo "r$i" || echo "k$i")
      BH=$(echo "406*$sc" | bc)
      FC+="[${src}]scale=iw*${sc}:-1[s$i];[$prev][s$i]overlay=x='${bx}+16*sin(1.2*t+${i})':y='${H}-mod(t*${spd}+${off}\,${H}+${BH})':eval=frame:shortest=1[l$((i+1))];"
      prev=l$((i+1)); i=$((i+1))
    done
    # unused sprite copies go to nullsink
    for j in $(seq 0 7); do FC+="[r$j]nullsink;[k$j]nullsink;" ; done
    FC=$(python3 - "$FC" <<'PY'
import sys,re
fc=sys.argv[1]
used=set(re.findall(r"\[([rk]\d)\]scale",fc))
fc=re.sub(r"\[([rk]\d)\]nullsink;",lambda m:"" if m.group(1) in used else m.group(0),fc)
print(fc,end="")
PY
)
    ffmpeg -v error -y -t "$CUT" -i "$SRC" -loop 1 -t "$CUT" -i "$FR/bf_frame_${loc}_${f}.png" -loop 1 -t "$END" -i "$FR/bf_box_${loc}_${f}.jpg" -i "$SRC" \
      -loop 1 -t "$CUT" -i "$FR/bf_balloon_red.png" -loop 1 -t "$CUT" -i "$FR/bf_balloon_black.png" -filter_complex \
      "${FC}[0:v]crop=576:1022:44:170,scale=${WW}:${WH}:flags=lanczos,setsar=1,fps=30[clip];[$prev][clip]overlay=${X}:${Y}:shortest=1[v];[1:v]fps=30[fr];[v][fr]overlay=0:0:shortest=1,format=yuv420p,fade=t=out:st=$(echo "$CUT-0.35" | bc):d=0.35[a1];
       [2:v]scale=${W}:${H},fps=30,format=yuv420p,setsar=1,fade=t=in:st=0:d=0.35[a2];[a1][a2]concat=n=2:v=1:a=0[o];
       [3:a]atrim=0:${TOTAL},asetpts=PTS-STARTPTS,afade=t=out:st=$(echo "$TOTAL-1" | bc):d=1[au]" \
      -map "[o]" -map "[au]" -c:v libx264 -crf 21 -preset medium -profile:v high -c:a aac -b:a 128k -movflags +faststart -t "$TOTAL" "$OUT/bf_video_${loc}_${f}.mp4"
    ffmpeg -v error -y -ss 4 -i "$OUT/bf_video_${loc}_${f}.mp4" -frames:v 1 -q:v 3 "$OUT/bf_video_${loc}_${f}.jpg"
    echo "$OUT/bf_video_${loc}_${f}.mp4"
  done
done
