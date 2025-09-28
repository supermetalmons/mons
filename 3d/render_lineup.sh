#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

BLEND_PY="$SCRIPT_DIR/lineup_render.py"

IN_DIR="${1:-$SCRIPT_DIR/shop_preview_models}"
OUT_DIR="${2:-$SCRIPT_DIR}"
CAMERA_SIDE="${3:-right}"

SECONDS_LEN="${SECONDS_LEN:-7}"
FPS="${FPS:-30}"
SIZE="${SIZE:-1024}"
EXPOSURE="${EXPOSURE:--0.55}"
WORLD_STRENGTH="${WORLD_STRENGTH:-0.42}"
LIGHT_ENERGY="${LIGHT_ENERGY:-777}"
GAP_MULTIPLIER="${GAP_MULTIPLIER:-2.3}"

mkdir -p "$OUT_DIR"

# Runs headless Blender to render lineup video
/Applications/Blender.app/Contents/MacOS/Blender -b -P "$BLEND_PY" -- \
  --in_dir "$IN_DIR" \
  --out_dir "$OUT_DIR" \
  --seconds "$SECONDS_LEN" \
  --fps "$FPS" \
  --size "$SIZE" \
  --exposure "$EXPOSURE" \
  --world_strength "$WORLD_STRENGTH" \
  --light_energy "$LIGHT_ENERGY" \
  --gap_multiplier "$GAP_MULTIPLIER" \
  --camera_side "$CAMERA_SIDE"

echo "Lineup render complete: $OUT_DIR/lineup.(webm|mov)"

# Produce Safari-compatible .mov in a sibling "output" folder inside OUT_DIR
pushd "$OUT_DIR" >/dev/null
"$SCRIPT_DIR/process_movs_for_safari.sh"
popd >/dev/null


