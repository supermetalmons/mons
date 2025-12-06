#!/usr/bin/env bash

set -euo pipefail

shopt -s nullglob
if [[ $# -gt 0 ]]; then
  targets=("$@")
  shopt -u nullglob
else
  targets=(./*.mov)
  shopt -u nullglob
fi

for f in "${targets[@]}"; do
  [[ -f "$f" ]] || continue
  dir="$(cd "$(dirname "$f")" && pwd)"
  base="$(basename "$f")"
  name="${base%.*}"
  out_dir="$dir/output"
  out="$out_dir/$name.mov"
  mkdir -p "$out_dir"
  tmpdir="$(mktemp -d)"
  ffmpeg -y -i "$dir/$base" \
    -c:v prores_ks -profile:v 4 -pix_fmt yuva444p10le -an \
    -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range pc \
    "$tmpdir/original.mov"
  avconvert -s "$tmpdir/original.mov" -o "$out" -p PresetHEVCHighestQualityWithAlpha --replace --progress
  rm -rf "$tmpdir"
done
