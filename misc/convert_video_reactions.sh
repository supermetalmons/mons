#!/bin/bash

# allow up to 5% over the 256KB budget for better quality
base_target=262144      # 256 KB
fudge=1.05              # 5% extra
# compute effective max size
target_size=$(awk "BEGIN{printf \"%d\", $base_target*$fudge}")

min_crf=20
max_crf=63

for f in *.mov; do
  # get duration and calculate factor for 3-second output
  duration=$(ffprobe -v error -show_entries format=duration \
    -of default=noprint_wrappers=1:nokey=1 "$f")
  factor=$(awk "BEGIN{printf \"%.6f\", 3/$duration}")

  outfile="${f%.*}.webm"
  temp="temp_${f%.*}.webm"

  low=$min_crf
  high=$max_crf
  best_crf=$max_crf

  # binary search CRF using fast tests (good/speed 2)
  while [ $low -le $high ]; do
    mid=$(( (low + high) / 2 ))

    ffmpeg -y -i "$f" \
      -vf "scale=512:512:flags=lanczos,setpts=${factor}*PTS" -an \
      -c:v libvpx-vp9 -pix_fmt yuva420p -crf $mid -b:v 0 \
      -quality good -speed 2 \
      -tile-columns 2 -frame-parallel 1 -row-mt 1 -threads 8 \
      -pass 1 -f webm /dev/null

    ffmpeg -y -i "$f" \
      -vf "scale=512:512:flags=lanczos,setpts=${factor}*PTS" -an \
      -c:v libvpx-vp9 -pix_fmt yuva420p -crf $mid -b:v 0 \
      -quality good -speed 2 \
      -tile-columns 2 -frame-parallel 1 -row-mt 1 -threads 8 \
      -pass 2 "$temp"

    size=$(wc -c < "$temp" | tr -d ' ')
    rm -f "$temp"

    if [ $size -le $target_size ]; then
      best_crf=$mid
      high=$(( mid - 1 ))
    else
      low=$(( mid + 1 ))
    fi
  done

  # final two-pass encode at best_crf (best/speed 0)
  ffmpeg -y -i "$f" \
    -vf "scale=512:512:flags=lanczos,setpts=${factor}*PTS" -an \
    -c:v libvpx-vp9 -pix_fmt yuva420p -crf $best_crf -b:v 0 \
    -quality best -speed 0 \
    -tile-columns 2 -frame-parallel 1 -row-mt 1 -threads 8 \
    -pass 1 -f webm /dev/null

  ffmpeg -y -i "$f" \
    -vf "scale=512:512:flags=lanczos,setpts=${factor}*PTS" -an \
    -c:v libvpx-vp9 -pix_fmt yuva420p -crf $best_crf -b:v 0 \
    -quality best -speed 0 \
    -tile-columns 2 -frame-parallel 1 -row-mt 1 -threads 8 \
    -pass 2 "$outfile"

  rm -f ffmpeg2pass-0.log ffmpeg2pass-0.log.mbtree
  final_size=$(wc -c < "$outfile" | tr -d ' ')
  echo "$f -> $outfile @ ${final_size} bytes (CRF $best_crf, limit ${target_size} bytes)"
done
