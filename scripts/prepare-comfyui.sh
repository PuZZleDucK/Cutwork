#!/usr/bin/env bash
# Dependencies only. No model download, inference, host pip or service changes.
set -euo pipefail
umask 077
repo="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
root="${STUDIO_DATA_ROOT:-${XDG_DATA_HOME:-$HOME/.local/share}/music-video-studio}"
case "$root" in /*) ;; *) echo 'STUDIO_DATA_ROOT must be absolute' >&2; exit 2;; esac
for command in /usr/bin/python3 curl sha256sum tar flock; do command -v "$command" >/dev/null || { echo "Missing prerequisite: $command" >&2; exit 2; }; done
recipe="$repo/integrations/comfyui/recipe.json"
requirements="$repo/integrations/comfyui/requirements.lock"
readarray -t pin < <(/usr/bin/python3 -I - "$recipe" <<'PY'
import json,sys
m=json.load(open(sys.argv[1])); p=m['python']; s=m['source']
for x in (p['version'], p['directory'], p['url'], p['sha256'], s['revision'], s['url'], s['sha256'], s['version'], m['minimumFreeGiB']): print(x)
PY
)
[[ ${#pin[@]} == 9 && -s "$requirements" ]] || { echo 'Incomplete ComfyUI recipe/lock' >&2; exit 2; }
tool="$root/tools/comfyui"
python_home="$root/tools/runtime/${pin[1]}"
printf 'Plan: isolated ComfyUI %s at %s using managed Python %s\n' "${pin[7]}" "$tool" "${pin[0]}"
printf '%s\n' 'No host-Python changes, agent configuration changes, models, inference, APT, drivers or service management.'
if [[ "${1:-}" != '--install' || $# != 1 ]]; then
  echo 'Plan only. Use --install for the dependency/import proof.'
  [[ $# == 0 ]] && exit 0 || exit 2
fi
source /etc/os-release
[[ "$ID" == ubuntu && "$VERSION_ID" == 26.04 && "$(uname -m)" == x86_64 ]] || { echo 'Requires Ubuntu 26.04 x86_64' >&2; exit 2; }
# Only installer-created paths are managed. In particular, never adopt a link to
# someone's personal checkout/environment. This is not a restriction on agents.
/usr/bin/python3 -I - "$root" "${pin[1]}" <<'PY'
from pathlib import Path
import sys
root=Path(sys.argv[1])
for relative in ('', 'tools', 'tools/runtime', 'downloads', 'downloads/pip-cache', 'setup-jobs',
                 'tools/comfyui', 'tools/comfyui/source', 'tools/comfyui/venv',
                 'tools/runtime/'+sys.argv[2]):
    p=root/relative
    if p.is_symlink() or (p.exists() and not p.is_dir()):
        raise SystemExit('Refusing linked/non-directory managed path: '+str(p))
lock=root/'tools/.comfyui-install.lock'
if lock.is_symlink() or (lock.exists() and not lock.is_file()):
    raise SystemExit('Refusing linked/non-file installer lock: '+str(lock))
PY
# pip --isolated alone does not suppress global/site pip index configuration.
export PIP_CONFIG_FILE=/dev/null
mkdir -p "$root/tools/runtime" "$root/downloads" "$root/setup-jobs"
exec 9>>"$root/tools/.comfyui-install.lock"
flock -n 9 || { echo 'ComfyUI installation already active' >&2; exit 2; }
lock_hash="$(sha256sum "$requirements" | cut -d' ' -f1)"
recipe_hash="$(sha256sum "$recipe" | cut -d' ' -f1)"
expected="${pin[4]}:${pin[3]}:$lock_hash:$recipe_hash"
if [[ -e "$tool" ]]; then
  [[ -f "$tool/.studio-recipe" && "$(cat "$tool/.studio-recipe")" == "$expected" ]] || { echo 'Existing ComfyUI directory is unowned or has a different recipe; refusing to overwrite' >&2; exit 2; }
else
  mkdir "$tool"
  printf '%s\n' "$expected" > "$tool/.studio-recipe"
fi
run="$(mktemp -d "$root/setup-jobs/comfyui-dependencies.XXXXXX")"
stage="$(mktemp -d "$tool/.install-stage.XXXXXX")"
exec > >(tee "$run/install.log") 2>&1
cp "$recipe" "$run/recipe.json"
cp "$requirements" "$run/requirements.lock"
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
verify_lock() {
  "$tool/venv/bin/python" -I - "$requirements" <<'PY'
import importlib.metadata,pathlib,re,sys,urllib.parse
count=0
for line in pathlib.Path(sys.argv[1]).read_text().splitlines():
    match=re.match(r'^([\w.-]+)==([^\s\\]+)',line)
    if match:
        name,version=match.groups()
    else:
        match=re.match(r'^([\w.-]+) @ (https://\S+)',line)
        if not match:
            continue
        name,url=match.groups()
        version=urllib.parse.unquote(urllib.parse.urlsplit(url).path).rsplit('/',1)[1].split('-')[1]
    assert importlib.metadata.version(name)==version, 'Installed version differs: '+name
    count+=1
assert count>2, 'Incomplete lock'
PY
}
# Completed repeats verify pins and imports without reserving a fresh install.
complete=false
if [[ -f "$tool/.studio-dependencies-ready" && "$(cat "$tool/.studio-dependencies-ready")" == "$expected" && -x "$tool/venv/bin/python" ]] && verify_lock; then
  complete=true
fi
if [[ "$complete" != true ]]; then
  available_kb="$(df -Pk "$root" | awk 'NR==2 {print $4}')"
  (( available_kb >= pin[8] * 1024 * 1024 )) || { echo 'Insufficient free space for a fresh or incomplete dependency installation; models require a separate budget' >&2; exit 2; }
fi
fetch() {
  local url="$1" digest="$2" target="$3"
  [[ ! -L "$target" && ! -L "$target.part" ]] || { echo 'Refusing linked download path' >&2; return 1; }
  if [[ ! -f "$target" ]]; then
    # Promote a completed partial before curl (which could otherwise return 416).
    if [[ -f "$target.part" ]] && printf '%s  %s\n' "$digest" "$target.part" | sha256sum --check --status; then
      mv -- "$target.part" "$target"
    else
      echo "Downloading pinned asset: $(basename "$target")"
      if ! curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --retry 2 --continue-at - "$url" -o "$target.part"; then
        # Retain failed evidence but do not resume a potentially unusable prefix.
        [[ ! -f "$target.part" ]] || mv -- "$target.part" "$run/$(basename "$target").failed-part"
        return 1
      fi
      if ! printf '%s  %s\n' "$digest" "$target.part" | sha256sum --check --status; then
        mv -- "$target.part" "$run/$(basename "$target").bad-checksum"
        echo 'Download checksum mismatch' >&2; return 1
      fi
      mv -- "$target.part" "$target"
    fi
  fi
  printf '%s  %s\n' "$digest" "$target" | sha256sum --check --status
}
if [[ "$complete" != true ]]; then
  fetch "${pin[2]}" "${pin[3]}" "$root/downloads/${pin[1]}.tar.gz"
fi
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
assert 'include-system-site-packages = false' in (pathlib.Path(sys.prefix)/'pyvenv.cfg').read_text().lower()
import pip
PY
}
if ! check_venv; then "$python_home/bin/python3" -I -m venv "$tool/venv"; fi
check_venv
# Cache direct wheel URLs explicitly: pip otherwise re-downloads torch on repeat
# installation even when it is already installed. Hashes are still mandatory.
if [[ "$complete" != true ]]; then
/usr/bin/python3 -I - "$requirements" "$root/downloads" "$run/install-requirements.lock" "$stage/direct-wheels.tsv" <<'PY'
import pathlib,re,sys,urllib.parse
source,cache,target,listing=map(pathlib.Path,sys.argv[1:])
rows=[]
def local(match):
    name,url=match.groups()
    parsed=urllib.parse.urlsplit(url)
    assert parsed.scheme=='https' and parsed.hostname=='download-r2.pytorch.org'
    digest=urllib.parse.parse_qs(parsed.fragment)['sha256'][0]
    assert re.fullmatch('[0-9a-f]{64}',digest)
    filename=urllib.parse.unquote(pathlib.PurePosixPath(parsed.path).name)
    assert filename.endswith('.whl') and '/' not in filename
    dest=cache/filename
    rows.append('\t'.join((url,digest,str(dest))))
    return name+' @ '+dest.as_uri()+'#sha256='+digest
result=re.sub(r'(?m)^(\S+) @ (https://\S+)',local,source.read_text())
assert len(rows)==2, 'Expected exactly the pinned torch and torchvision wheels'
target.write_text(result)
listing.write_text('\n'.join(rows)+'\n')
PY
while IFS=$'\t' read -r url digest target; do fetch "$url" "$digest" "$target"; done < "$stage/direct-wheels.tsv"
"$python" -I -m pip --isolated --cache-dir "$root/downloads/pip-cache" install --require-hashes --only-binary=:all: --no-deps -r "$run/install-requirements.lock"
fetch "${pin[5]}" "${pin[6]}" "$root/downloads/comfyui-${pin[4]}.tar.gz"
if [[ ! -e "$tool/source" ]]; then
  mkdir "$stage/source"
  tar -xzf "$root/downloads/comfyui-${pin[4]}.tar.gz" --directory "$stage/source" --strip-components=1 --no-same-owner
  printf '%s\n' "${pin[6]}" > "$stage/source/.studio-archive-sha256"
  mv -T -- "$stage/source" "$tool/source"
fi
fi
[[ -f "$tool/source/.studio-archive-sha256" && "$(cat "$tool/source/.studio-archive-sha256")" == "${pin[6]}" ]] || { echo 'ComfyUI source ownership/pin mismatch' >&2; exit 2; }
verify_lock
"$python" -I -m pip --isolated check
"$python" -I - "$run/imports.json" <<'PY'
import importlib.metadata,json,pathlib,sys
import torch,torchvision,transformers,av
from transformers import Qwen2Tokenizer
result={'prefix':sys.prefix,'basePrefix':sys.base_prefix,'python':sys.version,'versions':{n:importlib.metadata.version(n) for n in ['torch','torchvision','transformers','av','comfy-kitchen','comfy-aimdo']},'torchCudaBuild':torch.version.cuda,'boundary':'Dependency imports only; no service, H3 model load or GPU generation tested'}
pathlib.Path(sys.argv[1]).write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result,indent=2))
PY
[[ ! -L "$tool/.studio-dependencies-ready" ]] || { echo 'Refusing linked completion marker' >&2; exit 2; }
printf '%s\n' "$expected" > "$tool/.studio-dependencies-ready"
printf '\nDependency/import proof passed. Service nodes and H3 generation remain UNVERIFIED.\nEvidence: %s\n' "$run"
