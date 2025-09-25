#!/usr/bin/env bash

shopt -s nullglob
mkdir -p output

for f in ./*.mov; do
  base="${f##*/}"
  name="${base%.*}"
  out="output/$name.mov"
  tmpdir="$(mktemp -d)"
  ffmpeg -y -i "$f" \
    -c:v prores_ks -profile:v 4 -pix_fmt yuva444p10le -an \
    -color_primaries bt709 -color_trc bt709 -colorspace bt709 \
    "$tmpdir/original.mov" && \
  avconvert -s "$tmpdir/original.mov" -o "$out" -p PresetHEVCHighestQualityWithAlpha --replace --progress
  rm -rf "$tmpdir"
done
