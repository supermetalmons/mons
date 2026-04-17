#!/usr/bin/env bash
set -euo pipefail

if command -v magick >/dev/null 2>&1; then
  IM="magick"
elif command -v convert >/dev/null 2>&1; then
  IM="convert"
else
  echo "ImageMagick (magick/convert) is required." >&2
  exit 1
fi

mkdir -p 420 64

shopt -s nullglob
for img in *.png *.PNG; do
  base="${img##*/}"
  base="${base%.*}"
  "$IM" "$img" -alpha on -background none -resize 420x420^ -gravity center -extent 420x420 -strip -quality 92 -define webp:alpha-quality=100 -define webp:method=6 -define webp:use-sharp-yuv=true -define webp:auto-filter=true "420/${base}.webp"
  "$IM" "$img" -alpha on -background none -resize 64x64^ -gravity center -extent 64x64 -define webp:lossless=true -quality 90 "64/${base}.webp"
done
