#!/usr/bin/env bash

shopt -s nullglob
mkdir -p output

for f in ./*.mov; do
  base="${f##*/}"
  name="${base%.*}"
  out="output/$name.mov"
  tmpdir="$(mktemp -d)"
  ffmpeg -y -i "$f" \
    -vf "scale=231:231:flags=lanczos+accurate_rnd+full_chroma_int,format=yuva444p10le" \
    -c:v prores_ks -profile:v 4 -pix_fmt yuva444p10le -an \
    -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
    "$tmpdir/resized.mov" && \
  avconvert -s "$tmpdir/resized.mov" -o "$out" -p PresetHEVCHighestQualityWithAlpha --replace --progress
  rm -rf "$tmpdir"
done
