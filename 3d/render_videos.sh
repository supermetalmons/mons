#!/usr/bin/env bash

set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"

/Applications/Blender.app/Contents/MacOS/Blender -b -P "$DIR/batch_render.py" -- --in_dir "$DIR/shop_preview_models" --out_dir "$DIR/videos"

# Run Safari-compatible processing inside the videos directory so the script finds *.mov
pushd "$DIR/videos" >/dev/null
"$DIR/process_movs_for_safari.sh"
popd >/dev/null


