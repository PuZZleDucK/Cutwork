#!/usr/bin/env bash
# Default is a read-only newcomer plan. No privilege or install without --install.
set -euo pipefail
umask 077
repo="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
command -v python3 >/dev/null || { echo 'Ubuntu desktop host Python3 is required for read-only bootstrap diagnostics; no host Python replacement is automated.' >&2; exit 2; }
exec python3 -I -B "$repo/scripts/bootstrap_support.py" bootstrap "$@"
