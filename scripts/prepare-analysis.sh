#!/usr/bin/env bash
# Isolated CPU analysis only. Never modifies host Python, APT or GPU services.
set -euo pipefail
umask 077
repo="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
root="${STUDIO_DATA_ROOT:-${XDG_DATA_HOME:-$HOME/.local/share}/music-video-studio}"
case "$root" in /*) ;; *) echo 'STUDIO_DATA_ROOT must be absolute' >&2; exit 2;; esac
tool="$root/tools/audio-analysis"
printf 'Plan: isolated Audio analysis at %s/venv; shared /usr/bin/ffmpeg and /usr/bin/ffprobe.\n' "$tool"
printf '%s\n' 'No host pip, APT, agent configuration, models, GPU or service changes.'
if [[ "${1:-}" != '--install' || $# != 1 ]]; then
  echo 'Plan only. Use --install for pinned installation and real CPU readiness checks.'
  [[ $# == 0 ]] && exit 0 || exit 2
fi
# Minimal tools needed to establish ownership before changing even a ready marker.
for command in /usr/bin/python3 sha256sum flock; do
  command -v "$command" >/dev/null || { echo "Missing host prerequisite: $command; use the explicit host setup step" >&2; exit 2; }
done
recipe="$repo/integrations/analysis/recipe.json"
requirements="$repo/integrations/analysis/requirements.lock"
readarray -t pin < <(/usr/bin/python3 -I - "$recipe" <<'PY'
import json,sys
m=json.load(open(sys.argv[1])); p=m['python']
for x in (p['version'],p['directory'],p['url'],p['sha256'],m['minimumFreeGiB']): print(x)
PY
)
[[ ${#pin[@]} == 5 && -s "$requirements" ]] || { echo 'Incomplete analysis recipe/lock' >&2; exit 2; }
python_home="$root/tools/runtime/${pin[1]}"
# Ownership checks apply only to installer-managed paths, not to creative agents.
/usr/bin/python3 -I - "$root" "${pin[1]}" <<'PY'
from pathlib import Path
import sys
root=Path(sys.argv[1])
directories=['','tools','tools/runtime','downloads','downloads/pip-cache','setup-jobs',
             'tools/audio-analysis','tools/audio-analysis/venv','tools/runtime/'+sys.argv[2]]
for relative in directories:
    p=root/relative
    if p.is_symlink() or (p.exists() and not p.is_dir()):
        raise SystemExit('Refusing linked/non-directory managed path: '+str(p))
for relative in ('tools/.analysis-install.lock','tools/audio-analysis/.studio-recipe',
                 'tools/audio-analysis/.studio-analysis-ready','tools/audio-analysis/venv/.studio-recipe'):
    p=root/relative
    if p.is_symlink() or (p.exists() and not p.is_file()):
        raise SystemExit('Refusing linked/non-file managed record: '+str(p))
PY
export PIP_CONFIG_FILE=/dev/null
mkdir -p "$root/tools/runtime" "$root/downloads" "$root/setup-jobs"
exec 9>>"$root/tools/.analysis-install.lock"
flock -n 9 || { echo 'Audio analysis installation already active' >&2; exit 2; }
expected="${pin[3]}:$(sha256sum "$requirements" | cut -d' ' -f1):$(sha256sum "$recipe" | cut -d' ' -f1)"
if [[ -e "$tool" ]]; then
  [[ -f "$tool/.studio-recipe" && "$(cat "$tool/.studio-recipe")" == "$expected" ]] || { echo 'Existing analysis directory is unowned or has a different recipe; refusing to overwrite' >&2; exit 2; }
else
  mkdir "$tool"
  printf '%s\n' "$expected" > "$tool/.studio-recipe"
fi
# Invalidate only after ownership is established, before host/media rechecks.
rm -f -- "$tool/.studio-analysis-ready"
run="$(mktemp -d "$root/setup-jobs/analysis.XXXXXX")"
stage="$(mktemp -d "$tool/.install-stage.XXXXXX")"
exec > >(tee "$run/install.log") 2>&1
cp "$recipe" "$run/recipe.json"
cp "$requirements" "$run/requirements.lock"
cp "$repo/integrations/analysis/"{analyze,probe}.py "$run/"
/usr/bin/python3 -I "$repo/scripts/host-python-snapshot.py" > "$run/host-python-before.json"
finish() {
  status=$?
  trap - EXIT
  /usr/bin/python3 -I "$repo/scripts/host-python-snapshot.py" > "$run/host-python-after.json" || status=1
  if ! cmp -s "$run/host-python-before.json" "$run/host-python-after.json"; then
    echo 'Host Python observations changed; investigate before continuing.'
    status=1
  fi
  if [[ "$status" == 0 ]]; then
    printf '%s\n' "$expected" > "$tool/.studio-analysis-ready"
  fi
  printf '%s\n' "$status" > "$run/exit-code.txt"
  rm -rf -- "$stage" # only this invocation's uniquely created staging directory
  printf '\nAnalysis setup exit %s; evidence: %s\n' "$status" "$run"
  exit "$status"
}
trap finish EXIT
source /etc/os-release
[[ "$ID" == ubuntu && "$VERSION_ID" == 26.04 && "$(uname -m)" == x86_64 ]] || { echo 'Requires Ubuntu 26.04 x86_64' >&2; exit 2; }
for command in /usr/bin/ffmpeg /usr/bin/ffprobe /usr/bin/dpkg-query curl tar; do
  command -v "$command" >/dev/null || { echo "Missing host prerequisite: $command; use the explicit host setup step" >&2; exit 2; }
done
fetch() {
  local url="$1" digest="$2" target="$3"
  [[ ! -L "$target" && ! -L "$target.part" ]] || { echo 'Refusing linked download path' >&2; return 1; }
  if [[ ! -f "$target" ]]; then
    if [[ -f "$target.part" ]] && printf '%s  %s\n' "$digest" "$target.part" | sha256sum --check --status; then
      mv -- "$target.part" "$target"
    else
      if ! curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --retry 2 --continue-at - "$url" -o "$target.part"; then
        [[ ! -f "$target.part" ]] || mv -- "$target.part" "$run/python.failed-part"
        return 1
      fi
      if ! printf '%s  %s\n' "$digest" "$target.part" | sha256sum --check --status; then
        mv -- "$target.part" "$run/python.bad-checksum"
        echo 'Download checksum mismatch' >&2; return 1
      fi
      mv -- "$target.part" "$target"
    fi
  fi
  printf '%s  %s\n' "$digest" "$target" | sha256sum --check --status || {
    echo 'Cached Python archive checksum mismatch; retained for diagnosis' >&2; return 1;
  }
}
if [[ ! -e "$python_home" ]]; then
  available_kb="$(df -Pk "$root" | awk 'NR==2 {print $4}')"
  (( available_kb >= pin[4] * 1024 * 1024 )) || { echo 'Insufficient free space for managed interpreter and analysis dependencies' >&2; exit 2; }
  fetch "${pin[2]}" "${pin[3]}" "$root/downloads/${pin[1]}.tar.gz"
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
assert 'include-system-site-packages = false' in (pathlib.Path(sys.prefix)/'pyvenv.cfg').read_text().lower()
import pip
PY
}
if ! check_venv; then "$python_home/bin/python3" -I -m venv "$tool/venv"; fi
check_venv
verify_lock() {
  "$python" -I - "$requirements" <<'PY'
import importlib.metadata,pathlib,re,sys
pins=dict(re.findall(r'^([\w.-]+)==([^\s\\]+)',pathlib.Path(sys.argv[1]).read_text(),re.M))
assert {'librosa','numpy','numba','scipy','soundfile'}.issubset(pins)
for name,version in pins.items(): assert importlib.metadata.version(name)==version, name
PY
}
if verify_lock > "$run/existing-pins.txt" 2>&1; then
  echo 'Existing dependency versions match; verify imports/fixtures without a reinstall or download.'
else
  available_kb="$(df -Pk "$root" | awk 'NR==2 {print $4}')"
  (( available_kb >= pin[4] * 1024 * 1024 )) || { echo 'Insufficient free space for analysis dependencies' >&2; exit 2; }
  "$python" -I -m pip --isolated --cache-dir "$root/downloads/pip-cache" install --index-url https://pypi.org/simple --require-hashes --only-binary=:all: --no-deps -r "$requirements"
fi
verify_lock
"$python" -I "$repo/integrations/analysis/probe.py" --prefix "$tool/venv" --output "$run/probe"
echo 'Actual isolated imports, native media and synthetic analysis passed; real-song accuracy and application integration remain separate.'
