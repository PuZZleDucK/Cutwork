#!/usr/bin/env bash
# Keep normal HOME/config/tools; prepend only this application's pinned executables.
set -euo pipefail
repo="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
root="${STUDIO_DATA_ROOT:-${XDG_DATA_HOME:-$HOME/.local/share}/music-video-studio}"
provider="${1:-}"
case "$provider" in codex|claude) shift;; *) echo 'Usage: provider.sh codex|claude [CLI arguments...]' >&2; exit 2;; esac
readarray -t pin < <(python3 - "$repo/integrations/tool-manifest.json" <<'PY'
import json,sys
m=json.load(open(sys.argv[1]));print(m['node']['version']);print(m['providers']['codex']['version']);print(m['providers']['claude']['version'])
PY
)
[[ ${#pin[@]} == 3 ]] || { echo 'Incomplete runtime manifest' >&2; exit 2; }
export PATH="$root/tools/runtime/node-v${pin[0]}-linux-x64/bin:$root/tools/provider-cli/codex-${pin[1]}_claude-${pin[2]}/node_modules/.bin:$PATH"
binary="$root/tools/provider-cli/codex-${pin[1]}_claude-${pin[2]}/node_modules/.bin/$provider"
[[ -x "$binary" ]] || { echo 'Pinned provider runtime is not installed; run prepare-runtime.sh first' >&2; exit 2; }
exec "$binary" "$@"
