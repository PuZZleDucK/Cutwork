#!/usr/bin/env bash
# Dependency/import proof only. No models, inference, host pip or service changes.
set -euo pipefail
umask 077
repo="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
root="${STUDIO_DATA_ROOT:-${XDG_DATA_HOME:-$HOME/.local/share}/music-video-studio}"
case "$root" in /*) ;; *) echo 'STUDIO_DATA_ROOT must be absolute' >&2; exit 2;; esac
for command in /usr/bin/python3 curl sha256sum tar flock; do command -v "$command" >/dev/null || { echo "Missing prerequisite: $command" >&2; exit 2; }; done
recipe="$repo/integrations/yue2/recipe.json"
requirements="$repo/integrations/yue2/requirements.lock"
readarray -t pin < <(/usr/bin/python3 -I - "$recipe" <<'PY'
import json,sys
m=json.load(open(sys.argv[1])); p=m['python']; s=m['source']
for x in (p['version'], p['directory'], p['url'], p['sha256'], s['revision'], s['url'], s['sha256'], s['version'], m['minimumFreeGiB'], m['sourceDateEpoch']): print(x)
PY
)
[[ ${#pin[@]} == 10 && -s "$requirements" ]] || { echo 'Incomplete YuE2 recipe/lock' >&2; exit 2; }
tool="$root/tools/yue2"
python_home="$root/tools/runtime/${pin[1]}"
printf 'Plan: isolated YuE2 %s dependencies at %s/venv using managed Python %s\n' "${pin[7]}" "$tool" "${pin[0]}"
printf '%s\n' 'No host-Python changes, agent configuration changes, models, inference, APT, drivers or service management.'
if [[ "${1:-}" != '--install' || $# != 1 ]]; then
  echo 'Plan only. Use --install for the dependency/import proof.'
  [[ $# == 0 ]] && exit 0 || exit 2
fi
source /etc/os-release
[[ "$ID" == ubuntu && "$VERSION_ID" == 26.04 && "$(uname -m)" == x86_64 ]] || { echo 'Requires Ubuntu 26.04 x86_64' >&2; exit 2; }
# Installer-only: --isolated ignores user config/env, but global/site pip config
# can still redirect installs. Disable all pip config without editing the host.
export PIP_CONFIG_FILE=/dev/null
mkdir -p "$root/tools/runtime" "$root/downloads" "$root/setup-jobs"
exec 9>"$root/tools/.yue2-install.lock"
flock -n 9 || { echo 'YuE2 installation already active' >&2; exit 2; }
available_kb="$(df -Pk "$root" | awk 'NR==2 {print $4}')"
(( available_kb >= pin[8] * 1024 * 1024 )) || { echo 'Insufficient free space for dependency installation; models require a separate budget' >&2; exit 2; }
lock_hash="$(sha256sum "$requirements" | cut -d' ' -f1)"
recipe_hash="$(sha256sum "$recipe" | cut -d' ' -f1)"
expected="${pin[4]}:${pin[3]}:$lock_hash:$recipe_hash"
if [[ -e "$tool" ]]; then
  [[ -f "$tool/.studio-recipe" && "$(cat "$tool/.studio-recipe")" == "$expected" ]] || { echo 'Existing YuE2 directory is unowned or has a different recipe; refusing to overwrite' >&2; exit 2; }
else
  mkdir "$tool"
  printf '%s\n' "$expected" > "$tool/.studio-recipe"
fi
run="$(mktemp -d "$root/setup-jobs/yue2-dependencies.XXXXXX")"
stage="$(mktemp -d "$tool/.install-stage.XXXXXX")"
exec > >(tee "$run/install.log") 2>&1
/usr/bin/python3 -I "$repo/scripts/host-python-snapshot.py" > "$run/host-python-before.json"
finish() {
  status=$?
  trap - EXIT
  /usr/bin/python3 -I "$repo/scripts/host-python-snapshot.py" > "$run/host-python-after.json" || status=1
  if ! cmp -s "$run/host-python-before.json" "$run/host-python-after.json"; then
    echo 'Host Python observations changed; investigate before continuing.'
    status=1
  fi
  printf '%s\n' "$status" > "$run/exit-code.txt"
  rm -rf -- "$stage" # only this invocation's unique staging directory
  exit "$status"
}
trap finish EXIT
fetch() {
  local url="$1" digest="$2" target="$3"
  if [[ ! -f "$target" ]]; then
    curl --fail --location --proto '=https' --proto-redir '=https' --retry 2 --continue-at - "$url" -o "$target.part"
    if ! printf '%s  %s\n' "$digest" "$target.part" | sha256sum --check --status; then
      rm -f -- "$target.part" # this managed download is corrupt, not reusable
      echo 'Download checksum mismatch' >&2; return 1
    fi
    mv -- "$target.part" "$target"
  fi
  printf '%s  %s\n' "$digest" "$target" | sha256sum --check --status
}
fetch "${pin[2]}" "${pin[3]}" "$root/downloads/${pin[1]}.tar.gz"
if [[ ! -e "$python_home" ]]; then
  mkdir "$stage/python"
  tar -xzf "$root/downloads/${pin[1]}.tar.gz" --directory "$stage/python" --strip-components=1 --no-same-owner
  printf '%s\n' "${pin[3]}" > "$stage/python/.studio-archive-sha256"
  mv -T -- "$stage/python" "$python_home"
fi
[[ -f "$python_home/.studio-archive-sha256" && "$(cat "$python_home/.studio-archive-sha256")" == "${pin[3]}" ]] || { echo 'Managed interpreter ownership/pin mismatch' >&2; exit 2; }
[[ "$("$python_home/bin/python3" -I --version)" == "Python ${pin[0]}" ]] || { echo 'Python version mismatch' >&2; exit 2; }
if [[ ! -e "$tool/venv" ]]; then
  mkdir "$tool/venv"
  printf '%s\n' "$expected" > "$tool/venv/.studio-recipe"
fi
[[ -f "$tool/venv/.studio-recipe" && "$(cat "$tool/venv/.studio-recipe")" == "$expected" ]] || { echo 'Refusing to repair an unowned/different environment' >&2; exit 2; }
python="$tool/venv/bin/python"
check_venv() {
[[ -x "$python" ]] || return 1
"$python" -I - "$tool/venv" "$python_home" <<'PY'
import pathlib,sys
assert pathlib.Path(sys.prefix).resolve()==pathlib.Path(sys.argv[1]).resolve()
assert pathlib.Path(sys.base_prefix).resolve()==pathlib.Path(sys.argv[2]).resolve()
assert sys.prefix != sys.base_prefix
cfg=(pathlib.Path(sys.prefix)/'pyvenv.cfg').read_text().lower()
assert 'include-system-site-packages = false' in cfg
import pip
PY
}
if ! check_venv; then
  # Retry an interrupted creation only inside our marked directory; no --clear,
  # recursive deletion or substitution of a host interpreter.
  "$python_home/bin/python3" -I -m venv "$tool/venv"
fi
check_venv
"$python" -I -m pip --isolated --cache-dir "$root/downloads/pip-cache" install --require-hashes --only-binary=:all: --no-deps -r "$requirements"
fetch "${pin[5]}" "${pin[6]}" "$root/downloads/yue2-${pin[4]}.tar.gz"
mkdir "$stage/source" "$stage/wheels"
tar -xzf "$root/downloads/yue2-${pin[4]}.tar.gz" --directory "$stage/source" --strip-components=1 --no-same-owner
SOURCE_DATE_EPOCH="${pin[9]}" "$python" -I -m pip --isolated wheel --no-deps --no-build-isolation --wheel-dir "$stage/wheels" "$stage/source"
wheel="$stage/wheels/yue2_infer-${pin[7]}-py3-none-any.whl"
test -f "$wheel"
sha256sum "$wheel" > "$run/built-wheel.sha256"
"$python" -I -m pip --isolated install --no-deps --force-reinstall "$wheel"
"$python" -I -m pip --isolated check
"$python" -I - "$run/imports.json" <<'PY'
import importlib.metadata,json,pathlib,sys
import torch,transformers,numpy,soundfile
from yue2 import YuE2Pipeline
result={'prefix':sys.prefix,'basePrefix':sys.base_prefix,'python':sys.version,'versions':{n:importlib.metadata.version(n) for n in ['yue2-infer','torch','transformers','numpy','soundfile']},'pipelineImport':YuE2Pipeline.__name__,'torchCudaBuild':torch.version.cuda,'boundary':'Imports only; no GPU allocation, model load or generation was tested'}
pathlib.Path(sys.argv[1]).write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
PY
cp "$recipe" "$run/recipe.json"
cp "$requirements" "$run/requirements.lock"
printf '\nDependency/import proof passed. Models and 16 GB generation remain UNVERIFIED.\nEvidence: %s\n' "$run"
