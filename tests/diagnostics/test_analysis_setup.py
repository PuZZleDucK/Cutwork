"""Plan checks plus bounded preflight/optimized-probe regressions.

The preflight fixture invokes --install with missing-FFmpeg discovery intercepted;
it stops before environment creation. This is not host-wide preservation proof.
"""
import os
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


class AnalysisSetupPlan(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.script = Path(__file__).resolve().parents[2] / "scripts/prepare-analysis.sh"
        if not cls.script.is_file():
            raise RuntimeError("TEST REVIEW ONLY: installer not implemented; no behavioural result")

    def test_no_argument_is_a_read_only_plan_for_the_separate_environment(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "not-created"
            process = subprocess.run(["bash", str(self.script)],
                                     env=os.environ | {"STUDIO_DATA_ROOT": str(root)},
                                     capture_output=True, text=True, timeout=10, check=False)
            self.assertEqual(process.returncode, 0, process.stdout + process.stderr)
            self.assertIn(str(root / "tools/audio-analysis/venv"), process.stdout)
            self.assertIn("--install", process.stdout)
            self.assertFalse(root.exists())

    def test_relative_root_is_rejected_without_creating_it(self):
        with tempfile.TemporaryDirectory() as directory:
            process = subprocess.run(["bash", str(self.script)], cwd=directory,
                                     env=os.environ | {"STUDIO_DATA_ROOT": "relative-analysis-root"},
                                     capture_output=True, text=True, timeout=10, check=False)
            self.assertNotEqual(process.returncode, 0)
            self.assertIn("absolute", process.stdout + process.stderr)
            self.assertEqual(list(Path(directory).iterdir()), [])

    def test_missing_host_media_invalidates_only_an_owned_ready_marker(self):
        repo = self.script.parent.parent
        recipe_path = repo / "integrations/analysis/recipe.json"
        recipe = json.loads(recipe_path.read_text())
        expected = ":".join((recipe["python"]["sha256"],
                             hashlib.sha256((repo / "integrations/analysis/requirements.lock").read_bytes()).hexdigest(),
                             hashlib.sha256(recipe_path.read_bytes()).hexdigest()))
        # Explicit shell preflight fixture, not an installation or missing-host observation.
        # The real installer still runs; only OS declaration and command discovery are faked.
        shell = '''
source() { if [[ "$1" == /etc/os-release ]]; then ID=ubuntu; VERSION_ID=26.04; else builtin source "$@"; fi; }
command() { if [[ "$*" == '-v /usr/bin/ffmpeg' ]]; then return 1; else builtin command "$@"; fi; }
export -f source command
exec bash "$1" --install
'''
        for owned in (True, False):
            with self.subTest(owned=owned), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                tool = root / "tools/audio-analysis"
                tool.mkdir(parents=True)
                (tool / ".studio-recipe").write_text(expected if owned else "somebody-else")
                marker = tool / ".studio-analysis-ready"
                marker.write_text("old-ready-observation")
                process = subprocess.run(["bash", "-c", shell, "fixture", str(self.script)],
                                         env=os.environ | {"STUDIO_DATA_ROOT": str(root)},
                                         capture_output=True, text=True, timeout=30, check=False)
                self.assertNotEqual(process.returncode, 0)
                self.assertEqual(marker.exists(), not owned)
                if owned:
                    self.assertIn("Missing host prerequisite", process.stdout + process.stderr)
                else:
                    self.assertEqual(marker.read_text(), "old-ready-observation")
                self.assertFalse((tool / "venv").exists())

    def test_optimized_probe_refuses_before_creating_evidence(self):
        probe = self.script.parent.parent / "integrations/analysis/probe.py"
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "must-not-exist"
            process = subprocess.run([sys.executable, "-I", "-O", str(probe), "--output", str(output),
                                      "--prefix", str(Path(directory) / "not-an-environment")],
                                     capture_output=True, text=True, timeout=10, check=False)
            self.assertNotEqual(process.returncode, 0)
            self.assertIn("optim", (process.stdout + process.stderr).lower())
            self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
