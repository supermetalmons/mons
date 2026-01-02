#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

timestamp="$(date +%Y%m%d_%H%M%S)"
random_suffix="$(printf "%04d" $((RANDOM % 10000)))"
DEFAULT_OUTPUT="$ROOT_DIR/drops/lsb/figures_grid_${timestamp}_${random_suffix}.mp4"

INPUT_DIR="${1:-$ROOT_DIR/drops/lsb/figures/small-rotating}"
OUTPUT_PATH="${2:-$DEFAULT_OUTPUT}"

COUNT="${COUNT:-24}"
COLS="${COLS:-6}"
ROWS="${ROWS:-4}"
SIZE="${SIZE:-1920x1080}"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg is required but not found in PATH." >&2
  exit 1
fi

if ! command -v ffprobe >/dev/null 2>&1; then
  echo "ffprobe is required but not found in PATH." >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required but not found in PATH." >&2
  exit 1
fi

if [[ ! -d "$INPUT_DIR" ]]; then
  echo "Input directory not found: $INPUT_DIR" >&2
  exit 1
fi

if ! [[ "$COUNT" =~ ^[0-9]+$ ]]; then
  echo "COUNT must be an integer, got: $COUNT" >&2
  exit 1
fi

IFS='x' read -r WIDTH HEIGHT <<< "$SIZE"
if ! [[ "$WIDTH" =~ ^[0-9]+$ && "$HEIGHT" =~ ^[0-9]+$ ]]; then
  echo "SIZE must be in WxH format (example: 1080x1920), got: $SIZE" >&2
  exit 1
fi

if (( WIDTH % COLS != 0 || HEIGHT % ROWS != 0 )); then
  echo "SIZE $SIZE is not divisible by grid ${COLS}x${ROWS}." >&2
  exit 1
fi

if (( COUNT != COLS * ROWS )); then
  echo "COUNT ($COUNT) must equal COLS*ROWS ($((COLS * ROWS))) for a full grid." >&2
  exit 1
fi

TILE_W=$((WIDTH / COLS))
TILE_H=$((HEIGHT / ROWS))

selection_lines=()
while IFS= read -r line; do
  selection_lines+=("$line")
done < <(python3 - "$INPUT_DIR" "$COUNT" <<'PY'
import glob
import os
import random
import subprocess
import sys

input_dir = sys.argv[1]
count = int(sys.argv[2])

files = []
for ext in ("*.mov", "*.webm"):
    files.extend(glob.glob(os.path.join(input_dir, ext)))
files = sorted(files)
if len(files) < count:
    sys.stderr.write(
        f"Need at least {count} mp4 files in {input_dir}, found {len(files)}.\n"
    )
    sys.exit(1)

sample = random.sample(files, count)

def duration(path: str) -> float:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            path,
        ],
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    value = result.stdout.strip()
    return float(value) if value else 0.0

durations = [duration(path) for path in sample]
max_duration = max(durations) if durations else 0.0

for path, dur in zip(sample, durations):
    pad = max(0.0, max_duration - dur)
    print(f"{path}\t{pad:.6f}")

print(f"MAX\t{max_duration:.6f}")
PY
)

files=()
pad_durations=()
max_duration=""
for line in "${selection_lines[@]}"; do
  IFS=$'\t' read -r path pad <<< "$line"
  if [[ "$path" == "MAX" ]]; then
    max_duration="$pad"
    continue
  fi
  files+=("$path")
  pad_durations+=("$pad")
done

if [[ -z "$max_duration" ]]; then
  echo "Failed to determine max duration." >&2
  exit 1
fi

if (( ${#files[@]} != COUNT )); then
  echo "Expected $COUNT input files, got ${#files[@]}." >&2
  exit 1
fi

layout=""
for ((i=0; i<COUNT; i++)); do
  row=$((i / COLS))
  col=$((i % COLS))
  x=$((col * TILE_W))
  y=$((row * TILE_H))
  layout+="${x}_${y}|"
done
layout="${layout%|}"

filter_complex=""
for ((i=0; i<COUNT; i++)); do
  pad="${pad_durations[$i]}"
  filter_complex+="[$i:v]setpts=PTS-STARTPTS,scale=${TILE_W}:${TILE_H}:force_original_aspect_ratio=decrease,"
  filter_complex+="pad=${TILE_W}:${TILE_H}:(ow-iw)/2:(oh-ih)/2:color=black,"
  filter_complex+="tpad=stop_mode=clone:stop_duration=${pad},setsar=1[v${i}];"
done

for ((i=0; i<COUNT; i++)); do
  filter_complex+="[v${i}]"
done
filter_complex+="xstack=inputs=${COUNT}:layout=${layout}:fill=black[stacked];"
filter_complex+="[stacked]hflip[outv]"

ffmpeg_cmd=(ffmpeg -v error)
for file in "${files[@]}"; do
  ffmpeg_cmd+=(-i "$file")
done
ffmpeg_cmd+=(
  -filter_complex "$filter_complex"
  -map "[outv]"
  -t "$max_duration"
  -an
  -c:v libx264
  -preset medium
  -crf 20
  -pix_fmt yuv420p
  -movflags +faststart
  "$OUTPUT_PATH"
)

"${ffmpeg_cmd[@]}"

echo "Wrote grid video to: $OUTPUT_PATH"
