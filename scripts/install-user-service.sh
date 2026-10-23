#!/usr/bin/env bash
# Normal user service, not a sandbox. No unit/service writes without --install.
set -euo pipefail
umask 077
repo="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
command -v python3 >/dev/null || { echo 'Host Python3 is required; no host Python replacement is automated.' >&2; exit 2; }
exec python3 -I -B "$repo/scripts/bootstrap_support.py" service "$@"
