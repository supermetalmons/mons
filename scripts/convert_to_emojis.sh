#!/usr/bin/env bash
set -euo pipefail

target_size=65536
tolerance=1024
min_crf=10
max_crf=63
crop_filter="crop=iw-6:ih-6:3:3"
scale_filter="format=yuva444p,unpremultiply=inplace=1,scale=100:100:flags=bilinear,premultiply=inplace=1,lut=a='if(gt(val,4),val,0)',format=yuva420p"

for f in *.mov; do
  [ -f "$f" ] || continue
  echo "=== Processing: $f ==="

  dur=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$f" || echo "")
  [ -z "$dur" ] && { echo "Could not get duration for $f, skipping"; continue; }

  sample_seconds=$(awk -v d="$dur" 'BEGIN{
    s = (d < 2.0 ? d*0.90 : 1.50);
    if (s > 1.75) s = 1.75;
    if (s < 0.25) s = 0.25;
    printf "%.2f", s
  }')

  factor=$(awk -v d="$dur" 'BEGIN{printf "%.6f", 3/d}')
  outdur=3

  stem="${f%.*}"
  outfile="${stem}.webm"
  underfile="${outfile}.under"
  passlog="__vp9_${stem}"
  temp="__temp_${stem}.webm"

  sample_target=$(awk -v t="$target_size" -v s="$sample_seconds" -v o="$outdur" 'BEGIN{printf "%d", t*(s/o)}')
  echo "Target size: $target_size bytes, sample target: $sample_target bytes, sample_seconds: $sample_seconds"

  probe_encode() {
    local crf="$1"
    echo "  [Sample] CRF=$crf (pass 1)" >&2
    ffmpeg -v error -y -i "$f" \
      -vf "${crop_filter},${scale_filter},setpts=${factor}*PTS" -an -t "$sample_seconds" \
      -c:v libvpx-vp9 -pix_fmt yuva420p -crf "$crf" -b:v 0 \
      -quality good -speed 8 \
      -tile-columns 2 -frame-parallel 1 -row-mt 1 -threads 8 \
      -pass 1 -passlogfile "$passlog" -f webm /dev/null

    echo "  [Sample] CRF=$crf (pass 2)" >&2
    ffmpeg -v error -y -i "$f" \
      -vf "${crop_filter},${scale_filter},setpts=${factor}*PTS" -an -t "$sample_seconds" \
      -c:v libvpx-vp9 -pix_fmt yuva420p -crf "$crf" -b:v 0 \
      -quality good -speed 8 \
      -tile-columns 2 -frame-parallel 1 -row-mt 1 -threads 8 \
      -pass 2 -passlogfile "$passlog" "$temp"

    local sz
    sz=$(wc -c < "$temp" | tr -d ' ')
    rm -f "$temp" "${passlog}-0.log" "${passlog}-0.log.mbtree"
    echo "  [Sample] CRF=$crf -> ${sz} bytes" >&2
    echo "$sz"
  }

  encode_full() {
    local crf="$1"
    echo "  [Full] CRF=$crf (pass 1)" >&2
    ffmpeg -v error -y -i "$f" \
      -vf "${crop_filter},${scale_filter},setpts=${factor}*PTS" -an \
      -c:v libvpx-vp9 -pix_fmt yuva420p -crf "$crf" -b:v 0 \
      -quality best -speed 0 \
      -tile-columns 2 -frame-parallel 1 -row-mt 1 -threads 8 \
      -pass 1 -passlogfile "$passlog" -f webm /dev/null

    echo "  [Full] CRF=$crf (pass 2)" >&2
    ffmpeg -v error -y -i "$f" \
      -vf "${crop_filter},${scale_filter},setpts=${factor}*PTS" -an \
      -c:v libvpx-vp9 -pix_fmt yuva420p -crf "$crf" -b:v 0 \
      -quality best -speed 0 \
      -tile-columns 2 -frame-parallel 1 -row-mt 1 -threads 8 \
      -pass 2 -passlogfile "$passlog" "$outfile"

    rm -f "${passlog}-0.log" "${passlog}-0.log.mbtree"
    local sz
    sz=$(wc -c < "$outfile" | tr -d ' ')
    echo "  [Full] Result size: ${sz} bytes" >&2
    echo "$sz"
  }

  low=$min_crf
  high=$max_crf
  best_crf=$max_crf

  echo "Starting binary search on samples..."
  iter=0
  while [ $low -le $high ] && [ $iter -lt 7 ]; do
    iter=$((iter+1))
    mid=$(( (low + high) / 2 ))
    psz=$(probe_encode "$mid")
    [[ "$psz" =~ ^[0-9]+$ ]] || { echo "  [Sample] Non-numeric size, retry iteration" >&2; continue; }
    if [ "$psz" -le "$sample_target" ]; then
      best_crf="$mid"
      high=$(( mid - 1 ))
    else
      low=$(( mid + 1 ))
    fi
    echo "  Search range: $low - $high (best_crf: $best_crf)" >&2
  done

  start_crf="$best_crf"
  if [ "$start_crf" -gt "$min_crf" ]; then
    start_crf=$(( start_crf - 1 ))
  fi
  echo "Sample search complete. Starting CRF: $start_crf"

  final_size=$(encode_full "$start_crf")
  best_under_crf=-1
  best_under_size=0

  if [ "$final_size" -le "$target_size" ]; then
    best_under_crf="$start_crf"
    best_under_size="$final_size"
    cp -f "$outfile" "$underfile"
  fi

  current_crf="$start_crf"

  if [ "$final_size" -gt "$target_size" ]; then
    echo "Final size over target, increasing CRF..." >&2
    while [ "$final_size" -gt "$target_size" ] && [ "$current_crf" -lt "$max_crf" ]; do
      current_crf=$(( current_crf + 1 ))
      final_size=$(encode_full "$current_crf")
      if [ "$final_size" -le "$target_size" ]; then
        best_under_crf="$current_crf"
        best_under_size="$final_size"
        cp -f "$outfile" "$underfile"
      fi
    done
  fi

  if [ "$best_under_crf" -ne -1 ]; then
    echo "Under target at CRF=$best_under_crf ($best_under_size bytes). Refining for more quality..." >&2
    while [ "$best_under_crf" -gt "$min_crf" ]; do
      try_crf=$(( best_under_crf - 1 ))
      cp -f "$underfile" "$outfile"
      echo "  [Refine] Try CRF=$try_crf" >&2
      try_size=$(encode_full "$try_crf")
      if [ "$try_size" -le "$target_size" ]; then
        best_under_crf="$try_crf"
        best_under_size="$try_size"
        cp -f "$outfile" "$underfile"
        if [ $((target_size - try_size)) -le "$tolerance" ]; then
          break
        fi
      else
        echo "  [Refine] Overshoot at CRF=$try_crf, keeping CRF=$best_under_crf" >&2
        mv -f "$underfile" "$outfile"
        break
      fi
    done
  fi

  if [ -f "$underfile" ]; then rm -f "$underfile"; fi
  echo "=== Done: $f -> $outfile @ ${best_under_size:-$final_size} bytes (CRF ${best_under_crf:-$current_crf}, limit ${target_size} bytes) ==="
done
