#!/usr/bin/env bash

set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"

# Environments: clean | black-room | white-room | night-sky | snowy-field
# Allow overriding environment via ENV or first arg; default to snowy-field
ENVIRONMENT_ARG="${1:-${ENVIRONMENT:-snowy-field}}"

/Applications/Blender.app/Contents/MacOS/Blender -b -P "$DIR/batch_render.py" -- --in_dir "$DIR/shop_preview_models" --out_dir "$DIR/videos" --environment "$ENVIRONMENT_ARG"

# Run Safari-compatible processing inside the videos directory so the script finds *.mov
pushd "$DIR/videos" >/dev/null
"$DIR/process_movs_for_safari.sh"
popd >/dev/null


