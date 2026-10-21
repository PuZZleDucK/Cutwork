"""Read-only Python/default observations, not a byte-for-byte host filesystem audit."""
import importlib.metadata
import json
import os
import shutil
import subprocess
import sys

shell_python = shutil.which("python3")
shell_info = subprocess.check_output(
    [shell_python, "-I", "-c", "import json,sys;print(json.dumps([sys.executable,sys.version,sys.prefix,sys.base_prefix]))"],
    text=True,
) if shell_python else None
print(json.dumps({
    "executable": sys.executable,
    "realExecutable": os.path.realpath(sys.executable),
    "version": sys.version,
    "prefix": sys.prefix,
    "basePrefix": sys.base_prefix,
    "packages": sorted((d.metadata.get("Name", ""), d.version or "") for d in importlib.metadata.distributions()),
    "shellPythonPath": shell_python,
    "shellPython": json.loads(shell_info) if shell_info else None,
}, indent=2, sort_keys=True))
