"""Linux owned-process-group fixtures, never ComfyUI or GPU cancellation proof."""
import importlib.util
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

path = Path(__file__).resolve().parents[2] / "integrations/h3/generate.py"
spec = importlib.util.spec_from_file_location("h3_runner", path)
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class OwnershipTest(unittest.TestCase):
    def launch(self, source, *args):
        proc = subprocess.Popen([sys.executable, "-c", source, *args], start_new_session=True,
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        owner = runner.process_identity(proc.pid)
        def cleanup():
            # Independent fixture teardown, with its own captured start identity.
            if proc.returncode is None:
                try:
                    if runner.process_identity(proc.pid) == owner:
                        os.killpg(proc.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                proc.wait(timeout=3)
        self.addCleanup(cleanup)
        return proc, owner

    def test_normal_owned_group_exits(self):
        proc, owner = self.launch("import signal,time; signal.alarm(10); time.sleep(30)")
        result = runner.stop_owned_group(proc, owner, timeout=0.3)
        self.assertTrue(result["ownedServiceExited"], result)
        self.assertEqual(result["stopSignals"], ["SIGINT"])

    def test_exited_leader_does_not_abandon_a_stubborn_child(self):
        with tempfile.TemporaryDirectory() as tmp:
            ready = Path(tmp) / "ready.json"
            source = """
import json,os,signal,sys,time
from pathlib import Path
signal.alarm(10)
if os.fork() == 0:
    signal.signal(signal.SIGINT, signal.SIG_IGN)
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
    signal.alarm(10)
    fields=Path('/proc/self/stat').read_text().rsplit(')',1)[1].split()
    Path(sys.argv[1]).write_text(json.dumps({'pid':os.getpid(),'start':fields[19]}))
    time.sleep(30)
else:
    signal.signal(signal.SIGINT, lambda *_: sys.exit(0))
    time.sleep(30)
"""
            proc, owner = self.launch(source, str(ready))
            deadline = time.monotonic()+3
            while not ready.exists():
                if time.monotonic() > deadline:
                    self.fail("Fixture child did not become ready")
                time.sleep(0.01)
            child = json.loads(ready.read_text())
            try:
                result = runner.stop_owned_group(proc, owner, timeout=0.2)
                self.assertTrue(result["ownedServiceExited"], result)
                self.assertEqual(result["stopSignals"], ["SIGINT", "SIGTERM", "SIGKILL"])
                self.assertFalse(any(p["state"] not in ("Z", "X") for p in runner.group_members(owner["pid"])))
                self.assertEqual(proc.returncode, 0)
            finally:
                # Even if the implementation under test reaped the leader too
                # soon, this independently captured child identity can be ended.
                try:
                    fields = Path(f"/proc/{child['pid']}/stat").read_text().rsplit(")", 1)[1].split()
                    if fields[19] == child["start"] and fields[0] not in ("Z", "X"):
                        os.kill(child["pid"], signal.SIGKILL)
                except FileNotFoundError:
                    pass

    def test_wrong_identity_refuses_to_signal(self):
        proc, owner = self.launch("import signal,time; signal.alarm(10); time.sleep(30)")
        result = runner.stop_owned_group(proc, owner | {"startTicks": "0"}, timeout=0.1)
        self.assertFalse(result["ownedServiceExited"])
        self.assertEqual(result["stopSignals"], [])
        self.assertIsNone(runner.exit_observation(proc))

    def test_already_exited_leader_is_observed_without_pid_reuse_window(self):
        proc, owner = self.launch("pass")
        deadline = time.monotonic()+3
        while runner.exit_observation(proc) is None:
            if time.monotonic() > deadline:
                self.fail("Fixture process did not exit")
            time.sleep(0.01)
        self.assertIsNone(proc.returncode)  # exit observed but leader remains unreaped
        result = runner.stop_owned_group(proc, owner, timeout=0.1)
        self.assertTrue(result["ownedServiceExited"], result)
        self.assertEqual(result["stopSignals"], [])

    def test_zombie_stat_can_precede_waitable_exit(self):
        proc, owner = self.launch("pass")
        deadline = time.monotonic()+3
        while (observed := runner.exit_observation(proc)) is None:
            if time.monotonic() > deadline:
                self.fail("Fixture process did not exit")
            time.sleep(0.01)
        with patch.object(runner, "exit_observation", side_effect=[None, observed]):
            result = runner.stop_owned_group(proc, owner, timeout=0.2)
        self.assertTrue(result["ownedServiceExited"], result)


if __name__ == "__main__":
    unittest.main()
