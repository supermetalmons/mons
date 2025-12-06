#!/usr/bin/env bash

set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
MODELS_DIR="$DIR/models"
VIDEOS_DIR="$DIR/videos"
SAFARI_SCRIPT="$DIR/process_movs_for_safari.sh"

# Environments: clean | black-room | white-room | night-sky | snowy-field | sky | meadow | country-club | desert | snowy-forest | desert-sky
# Args: ENVIRONMENT (or first arg), ORBIT (or second arg) -> true/false
# Default: ENVIRONMENT=snowy-forest, ORBIT=true
ENVIRONMENT_ARG="${1:-${ENVIRONMENT:-clean}}"
ORBIT_ARG_RAW="${2:-${ORBIT:-false}}"
# Normalize to lowercase without Bash 4+ syntax
ORBIT_ARG_NORM=$(printf '%s' "$ORBIT_ARG_RAW" | tr '[:upper:]' '[:lower:]')
case "$ORBIT_ARG_NORM" in
  1|true|t|yes|y) ORBIT_ARG=true ;;
  0|false|f|no|n) ORBIT_ARG=false ;;
  *) ORBIT_ARG=true ;;
esac

/Applications/Blender.app/Contents/MacOS/Blender -b -P "$DIR/batch_render.py" -- \
  --in_dir "$MODELS_DIR" \
  --out_dir "$VIDEOS_DIR" \
  --environment "$ENVIRONMENT_ARG" \
  --orbit_camera "$ORBIT_ARG" \
  --safari_script "$SAFARI_SCRIPT"


