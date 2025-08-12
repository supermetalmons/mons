#!/usr/bin/env bash

shopt -s nullglob
mkdir -p output

for f in ./*.mov; do
  base="${f##*/}"
  name="${base%.*}"
  out="output/$name.mov"
  tmpdir="$(mktemp -d)"
  ffmpeg -y -i "$f" -vf "scale=231:231:flags=bicubic" -c:v prores_ks -profile:v 4 -pix_fmt yuva444p10le -an "$tmpdir/resized.mov" && \
  avconvert -s "$tmpdir/resized.mov" -o "$out" -p PresetHEVCHighestQualityWithAlpha --replace --progress
  rm -rf "$tmpdir"
done
