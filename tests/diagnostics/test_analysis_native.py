"""Learner-approved opt-in actual Librosa/isolated-env checks. No GPU/provider/network work.

After review and installation, run on Dundee with its absolute analysis Python:
  STUDIO_DATA_ROOT=... tools/audio-analysis/venv/bin/python -I \
    tests/diagnostics/test_analysis_native.py -v
Refuses ordinary host Python rather than silently skipping or installing anything.
All audio here is synthetic; musical judgement needs the separate real-song check.
"""
from fractions import Fraction
import hashlib
import importlib.metadata
import json
import math
import os
from pathlib import Path
import re
import struct
import subprocess
import sys
import tempfile
import unittest
import uuid
import wave


REPO = Path(__file__).resolve().parents[2]


class NativeAnalysis(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        root = os.environ.get("STUDIO_DATA_ROOT")
        if not root or not Path(root).is_absolute():
            raise RuntimeError("Opt-in prerequisite: absolute STUDIO_DATA_ROOT on Dundee")
        cls.expected_prefix = Path(root) / "tools/audio-analysis/venv"
        if Path(sys.prefix).resolve() != cls.expected_prefix.resolve() or sys.prefix == sys.base_prefix:
            raise RuntimeError("Use the separate analysis venv, never host/Comfy/YuE Python")
        cls.helper = REPO / "integrations/analysis/analyze.py"
        if not cls.helper.is_file():
            raise RuntimeError("TEST REVIEW ONLY: analysis helper missing; no behavioural result")

    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.source = self.root / "fixture.wav"

    def wav(self, samples, rate=44100, channels=2):
        with wave.open(str(self.source), "wb") as output:
            output.setparams((channels, 2, rate, 0, "NONE", "not compressed"))
            output.writeframes(b"".join(struct.pack("<" + "h" * channels, *row) for row in samples))

    def request(self):
        return {
            "schemaVersion": 1, "attemptId": str(uuid.uuid4()),
            "source": {"path": str(self.source), "sha256": hashlib.sha256(self.source.read_bytes()).hexdigest()},
            "waveformBucketSamples": 512,
        }

    def run_helper(self, request, expected_exit=0, result_path=None):
        request_path = self.root / (request["attemptId"] + ".request.json")
        request_path.write_text(json.dumps(request) + "\n")
        result_path = result_path or self.root / (request["attemptId"] + ".receipt.json")
        request_bytes = request_path.read_bytes()
        process = subprocess.run(
            [sys.executable, "-I", str(self.helper), "--request", str(request_path), "--result", str(result_path)],
            capture_output=True, text=True, timeout=180, check=False,
        )
        self.assertEqual(process.returncode, expected_exit, process.stdout + process.stderr)
        self.assertEqual(request_path.read_bytes(), request_bytes)
        result = json.loads(result_path.read_text(), parse_constant=lambda value: self.fail("Non-finite JSON: " + value))
        self.assertEqual(result["schemaVersion"], 1)
        self.assertEqual(result["attemptId"], request["attemptId"])
        return result

    def assert_unavailable(self, result):
        self.assertEqual(result["state"], "partial")
        self.assertEqual(result["beats"]["status"], "unavailable")
        self.assertIsNone(result["beats"]["estimatedBpm"])
        self.assertEqual(result["beats"]["sampleIndices"], [])
        self.assertTrue(result["beats"]["reason"].strip())

    def test_isolated_imports_exact_pins_and_dependency_consistency(self):
        import librosa
        import numba
        import numpy
        import scipy
        import soundfile

        cfg = (self.expected_prefix / "pyvenv.cfg").read_text().lower()
        self.assertIn("include-system-site-packages = false", cfg)
        for module in (librosa, numba, numpy, scipy, soundfile):
            self.assertTrue(Path(module.__file__).resolve().is_relative_to(self.expected_prefix.resolve()))
        for entry in sys.path:
            if "site-packages" in entry or "dist-packages" in entry:
                self.assertTrue(Path(entry).resolve().is_relative_to(self.expected_prefix.resolve()), entry)
        recipe = json.loads((REPO / "integrations/analysis/recipe.json").read_text())
        self.assertEqual(".".join(map(str, sys.version_info[:3])), recipe["python"]["version"])
        requirements = (REPO / "integrations/analysis/requirements.lock").read_text()
        pins = dict(re.findall(r"^([\w.-]+)==([^\s\\]+)", requirements, re.MULTILINE))
        self.assertTrue({"librosa", "numpy", "scipy", "soundfile", "numba"}.issubset(pins))
        self.assertEqual(pins["librosa"], "0.11.0")
        for name, version in pins.items():
            self.assertEqual(importlib.metadata.version(name), version, name)
        process = subprocess.run([sys.executable, "-I", "-m", "pip", "--isolated", "check"],
                                 capture_output=True, text=True, timeout=60, check=False)
        self.assertEqual(process.returncode, 0, process.stdout + process.stderr)

    def test_source_sample_grid_channel_count_and_waveform_tail_are_exact(self):
        samples = [(0, 0)] * 1103
        samples[0] = samples[600] = (16384, -16384)
        samples[-1] = (8192, -8192)
        self.wav(samples)
        before = self.source.read_bytes(), self.source.stat().st_mtime_ns
        request = self.request()
        result = self.run_helper(request)
        self.assert_unavailable(result)  # Anti-phase mean is silent; source waveform is not.
        source = result["source"]
        self.assertEqual((source["sampleRate"], source["channels"], source["sampleCount"]), (44100, 2, "1103"))
        self.assertEqual(source["sha256"], request["source"]["sha256"])
        duration = source["duration"]
        self.assertIsInstance(duration["numerator"], str)
        self.assertIsInstance(duration["denominator"], str)
        self.assertEqual(Fraction(int(duration["numerator"]), int(duration["denominator"])), Fraction(1103, 44100))
        self.assertEqual(result["waveform"]["bucketSamples"], 512)
        self.assertEqual(result["waveform"]["peaks"], [0.5, 0.5, 0.25])
        self.assertEqual((self.source.read_bytes(), self.source.stat().st_mtime_ns), before)

    def test_real_tracker_clicks_use_source_samples_with_an_explicit_accuracy_tolerance(self):
        rate = 44100
        onsets = [rate + i * (rate // 2) for i in range(22)]
        samples = [0] * (rate * 13)
        for onset in onsets:
            for j in range(441):
                samples[onset + j] = round(24000 * math.exp(-j / 100) * math.sin(2 * math.pi * 1500 * j / rate))
        self.wav(((v,) for v in samples), rate=rate, channels=1)
        request = self.request()
        original = self.source.read_bytes()
        result = self.run_helper(request)
        self.assertEqual(result["state"], "succeeded")
        self.assertEqual(result["beats"]["status"], "available")
        self.assertEqual(result["source"]["sampleCount"], str(len(samples)))
        self.assertEqual(result["source"]["sampleRate"], rate)
        self.assertEqual(result["source"]["sha256"], request["source"]["sha256"])
        self.assertEqual(self.source.read_bytes(), original)
        self.assertLessEqual(abs(result["beats"]["estimatedBpm"] - 120), 5)
        encoded = result["beats"]["sampleIndices"]
        self.assertTrue(all(isinstance(value, str) and value.isdecimal() for value in encoded))
        beats = list(map(int, encoded))
        self.assertGreaterEqual(len(beats), 12)  # Not a promise to find every click or downbeat.
        self.assertEqual(sorted(set(beats)), beats)
        self.assertGreater(beats[0], 0)  # No manufactured beat at the beginning of silence.
        self.assertLess(beats[-1], len(samples))
        for beat in beats:
            self.assertLessEqual(min(abs(beat - onset) for onset in onsets), rate * 0.06)
        self.assertTrue(result["analysisVersion"].strip())
        self.assertEqual(result["helperSha256"], hashlib.sha256(self.helper.read_bytes()).hexdigest())
        for name in ("librosa", "numpy", "scipy", "soundfile", "numba"):
            self.assertEqual(result["versions"][name], importlib.metadata.version(name))
        self.assertEqual(result["parameters"], {
            "sampleRate": rate, "resampling": "none", "monoMix": "arithmetic-mean",
            "waveformAggregation": "max-absolute-all-channels",
            "beatTrack": {"hop_length": 512, "start_bpm": 120.0, "tightness": 100,
                          "trim": True, "units": "samples", "sparse": True},
        })

    def test_silence_keeps_audio_facts_and_waveform_but_no_default_beat_map(self):
        self.wav([(0, 0)] * 88200)
        result = self.run_helper(self.request())
        self.assert_unavailable(result)
        self.assertEqual(result["source"]["sampleCount"], "88200")
        self.assertEqual(len(result["waveform"]["peaks"]), math.ceil(88200 / 512))
        self.assertTrue(all(value == 0 for value in result["waveform"]["peaks"]))

    def test_yue_float32_profile_keeps_native_rate_and_unclipped_channel_peaks(self):
        import numpy as np
        import soundfile as sf

        samples = np.zeros((1103, 2), dtype=np.float32)
        samples[0] = (1.25, -1.25)
        samples[600] = (0.125, -0.125)
        samples[-1] = (0.25, -0.25)
        sf.write(self.source, samples, 48000, format="WAV", subtype="FLOAT")
        original = self.source.read_bytes(), self.source.stat().st_mtime_ns
        request = self.request()
        result = self.run_helper(request)
        self.assert_unavailable(result)
        self.assertEqual((result["source"]["sampleRate"], result["source"]["channels"],
                          result["source"]["sampleCount"]), (48000, 2, "1103"))
        self.assertEqual(result["source"]["sha256"], request["source"]["sha256"])
        self.assertEqual(result["waveform"]["peaks"], [1.25, 0.125, 0.25])
        self.assertEqual((self.source.read_bytes(), self.source.stat().st_mtime_ns), original)

    def test_nonfinite_float_pcm_fails_without_sanitising_the_song(self):
        import numpy as np
        import soundfile as sf

        for invalid in (float("nan"), float("inf"), -float("inf")):
            with self.subTest(invalid=invalid):
                samples = np.zeros((1103, 2), dtype=np.float32)
                samples[600, 1] = invalid
                sf.write(self.source, samples, 48000, format="WAV", subtype="FLOAT")
                original = self.source.read_bytes()
                result = self.run_helper(self.request(), expected_exit=1)
                self.assertEqual(result["state"], "failed")
                self.assertEqual(result["error"]["code"], "non-finite-audio")
                self.assertIsNone(result["waveform"])
                self.assertIsNone(result["beats"])
                self.assertEqual(self.source.read_bytes(), original)

    def test_source_hash_mismatch_fails_without_replacing_the_source(self):
        self.wav([(0, 0)] * 1000)
        original = self.source.read_bytes()
        request = self.request()
        request["source"]["sha256"] = "0" * 64
        result = self.run_helper(request, expected_exit=1)
        self.assertEqual(result["state"], "failed")
        self.assertEqual(result["error"]["code"], "source-hash-mismatch")
        self.assertIsNone(result["waveform"])
        self.assertIsNone(result["beats"])
        self.assertEqual(self.source.read_bytes(), original)

    def test_corrupt_audio_is_not_reported_as_usable_silence(self):
        self.source.write_bytes(b"This is not an audio file.")
        original = self.source.read_bytes()
        result = self.run_helper(self.request(), expected_exit=1)
        self.assertEqual(result["state"], "failed")
        self.assertEqual(result["error"]["code"], "decode-failed")
        self.assertIsNone(result["waveform"])
        self.assertIsNone(result["beats"])
        self.assertEqual(self.source.read_bytes(), original)

    def test_repeat_uses_a_new_receipt_and_does_not_replace_old_evidence(self):
        self.wav([(0, 0)] * 88200)
        first_request = self.request()
        first = self.run_helper(first_request)
        first_path = self.root / (first_request["attemptId"] + ".receipt.json")
        retained = first_path.read_bytes()
        second_request = self.request()
        second = self.run_helper(second_request)
        self.assertNotEqual(first["attemptId"], second["attemptId"])
        for key in ("source", "beats", "waveform", "parameters", "versions", "analysisVersion", "helperSha256"):
            self.assertEqual(first[key], second[key])
        self.assertEqual(first_path.read_bytes(), retained)
        process = subprocess.run(
            [sys.executable, "-I", str(self.helper), "--request",
             str(self.root / (second_request["attemptId"] + ".request.json")), "--result", str(first_path)],
            capture_output=True, text=True, timeout=180, check=False,
        )
        self.assertNotEqual(process.returncode, 0)
        self.assertIn("exist", (process.stdout + process.stderr).lower())
        self.assertEqual(first_path.read_bytes(), retained)

    def test_result_cannot_overwrite_inputs_or_follow_a_dangling_symlink(self):
        self.wav([(0, 0)] * 1000)
        request = self.request()
        request_path = self.root / "request.json"
        request_path.write_text(json.dumps(request) + "\n")
        originals = {path: path.read_bytes() for path in (self.source, request_path)}
        target = self.root / "must-not-be-created.json"
        link = self.root / "dangling-result.json"
        link.symlink_to(target)
        for result_path in (self.source, request_path, link):
            with self.subTest(result_path=result_path):
                process = subprocess.run(
                    [sys.executable, "-I", str(self.helper), "--request", str(request_path),
                     "--result", str(result_path)],
                    capture_output=True, text=True, timeout=180, check=False,
                )
                self.assertNotEqual(process.returncode, 0)
                for path, original in originals.items():
                    self.assertEqual(path.read_bytes(), original)
                self.assertTrue(link.is_symlink())
                self.assertEqual(link.readlink(), target)
                self.assertFalse(target.exists())
if __name__ == "__main__":
    unittest.main()
