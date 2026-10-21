#!/usr/bin/env bash
# Slice-1 prerequisite recipe, NOT the complete release bootstrap or generator setup.
set -euo pipefail
umask 077
repo="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
root="${STUDIO_DATA_ROOT:-${XDG_DATA_HOME:-$HOME/.local/share}/music-video-studio}"
case "$root" in /*) ;; *) echo 'STUDIO_DATA_ROOT must be absolute' >&2; exit 2;; esac
for command in python3 curl sha256sum tar flock; do command -v "$command" >/dev/null || { echo "Missing prerequisite: $command" >&2; exit 2; }; done
readarray -t pin < <(python3 - "$repo/integrations/tool-manifest.json" <<'PY'
import json,sys
m=json.load(open(sys.argv[1])); n=m['node']
for v in (n['version'], n['archive'], n['url'], n['sha256'], m['providers']['codex']['version'], m['providers']['claude']['version']): print(v)
PY
)
[[ ${#pin[@]} == 6 ]] || { echo 'Incomplete runtime manifest' >&2; exit 2; }
node_dir="$root/tools/runtime/node-v${pin[0]}-linux-x64"
provider_dir="$root/tools/provider-cli/codex-${pin[4]}_claude-${pin[5]}"
printf 'Plan: Node %s and Codex %s / Claude %s under %s\n' "${pin[0]}" "${pin[4]}" "${pin[5]}" "$root"
printf '%s\n' 'No root packages, driver changes, Python installs, shell-profile edits, sign-in or agent tasks.'
if [[ "${1:-}" != '--install' || $# != 1 ]]; then
  echo 'Plan only. Use --install to execute this prerequisite recipe.'
  [[ $# == 0 ]] && exit 0 || exit 2
fi
# shellcheck disable=SC1091
source /etc/os-release
[[ "$ID" == ubuntu && "$VERSION_ID" == 26.04 && "$(uname -m)" == x86_64 ]] || {
  echo 'This recipe is verified only for the Ubuntu 26.04 x86_64 target.' >&2; exit 2;
}
mkdir -p "$root/tools/runtime" "$root/tools/provider-cli"
exec 9>"$root/tools/.runtime-install.lock"
flock -n 9 || { echo 'A runtime installation is already active' >&2; exit 2; }
available_kb="$(df -Pk "$root" | awk 'NR==2 {print $4}')"
(( available_kb >= 2 * 1024 * 1024 )) || { echo 'Need at least 2 GiB free for this runtime/CLI preparation, not a full model budget' >&2; exit 2; }
stage="$(mktemp -d "$root/tools/.runtime-stage.XXXXXX")"
trap 'rm -rf -- "$stage"' EXIT # only the unique directory this invocation created
if [[ ! -d "$node_dir" ]]; then
  curl --fail --location --proto '=https' --proto-redir '=https' --retry 2 "${pin[2]}" -o "$stage/${pin[1]}"
  (cd "$stage"; printf '%s  %s\n' "${pin[3]}" "${pin[1]}" | sha256sum --check --status)
  tar --extract --xz --file "$stage/${pin[1]}" --directory "$stage" --no-same-owner
  mv -T -- "$stage/node-v${pin[0]}-linux-x64" "$node_dir"
fi
[[ "$("$node_dir/bin/node" --version)" == "v${pin[0]}" ]] || { echo 'Installed Node pin mismatch' >&2; exit 2; }
export PATH="$node_dir/bin:$PATH"
if [[ ! -d "$provider_dir" ]]; then
  mkdir "$stage/providers"
  cp "$repo/integrations/provider-cli/package.json" "$repo/integrations/provider-cli/package-lock.json" "$stage/providers/"
  # Lockfile verifies package integrity; optional packages carry the native binaries.
  npm ci --prefix "$stage/providers" --ignore-scripts --include=optional --no-fund
  # Reviewed pinned upstream postinstall only links its installed platform binary.
  node "$stage/providers/node_modules/@anthropic-ai/claude-code/install.cjs"
  mv -T -- "$stage/providers" "$provider_dir"
fi
cmp "$repo/integrations/provider-cli/package-lock.json" "$provider_dir/package-lock.json" || {
  echo 'Existing provider directory has a different lockfile; investigate rather than overwrite' >&2; exit 2;
}
[[ "$("$provider_dir/node_modules/.bin/codex" --version)" == "codex-cli ${pin[4]}" ]] || { echo 'Codex version mismatch' >&2; exit 2; }
[[ "$("$provider_dir/node_modules/.bin/claude" --version)" == "${pin[5]} (Claude Code)" ]] || { echo 'Claude version mismatch' >&2; exit 2; }
printf '\nVerified executable versions. Authentication and model access are NOT yet verified.\n'
printf 'Use %s/scripts/provider.sh codex login --device-auth\n' "$repo"
printf 'Use %s/scripts/provider.sh claude auth login\n' "$repo"
