"""Real CPU/FFmpeg sample checks; no model, provider or GPU execution."""
import hashlib
import importlib.util
import json
from pathlib import Path
import struct
import subprocess
import tempfile
import unittest
import wave

path = Path(__file__).resolve().parents[2] / "integrations/h3/media.py"
spec = importlib.util.spec_from_file_location("h3_media", path)
media = importlib.util.module_from_spec(spec)
spec.loader.exec_module(media)


class ConditioningTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / "song.wav"
        self.pcm = b"".join(struct.pack("<hh", i % 16000 - 8000, 8000 - i % 16000) for i in range(120000))
        with wave.open(str(self.source), "wb") as stream:
            stream.setparams((2, 2, 48000, 120000, "NONE", "uncompressed"))
            stream.writeframes(self.pcm)
        self.song = {"path": str(self.source), "sha256": hashlib.sha256(self.source.read_bytes()).hexdigest()}
        self.plan = {"fps": "24/1", "requestedFrames": 48, "nativeFrames": 56,
                     "placement": {"startFrame": 0, "endFrame": 48}, "durationWarning": False,
                     "conditioning": {"startSample": 0, "availableSamples": 112000,
                                      "silenceSamples": 0, "totalSamples": 112000}}

    def prepare(self):
        return media.prepare_conditioning(self.song, self.plan, self.root / "inputs")

    def pcm_output(self, result):
        return subprocess.check_output(["/usr/bin/ffmpeg", "-v", "error", "-i", result["path"],
                                        "-f", "s16le", "-acodec", "pcm_s16le", "-"])

    def test_native_overshoot_uses_more_song_not_padding(self):
        result = self.prepare()
        self.assertEqual(self.pcm_output(result), self.pcm[:112000*4])
        self.assertEqual(result["samples"], 112000)
        self.assertEqual(result["silenceSamples"], 0)
        self.assertEqual(result["songSha256"], self.song["sha256"])
        self.assertEqual(Path(result["sourceSnapshot"]).read_bytes(), self.source.read_bytes())

    def test_partial_tail_is_silence_only_after_actual_song(self):
        self.plan["placement"] = {"startFrame": 48, "endFrame": 96}
        self.plan["conditioning"] = {"startSample": 96000, "availableSamples": 24000,
                                     "silenceSamples": 88000, "totalSamples": 112000}
        result = self.prepare()
        self.assertEqual(self.pcm_output(result), self.pcm[96000*4:] + bytes(88000*4))

    def test_wholly_post_song_is_explicit_sample_exact_silence(self):
        self.plan["placement"] = {"startFrame": 72, "endFrame": 120}
        self.plan["conditioning"] = {"startSample": 144000, "availableSamples": 0,
                                     "silenceSamples": 112000, "totalSamples": 112000}
        result = self.prepare()
        self.assertEqual(self.pcm_output(result), bytes(112000*4))
        self.assertTrue(result["whollyPostSong"])

    def test_changed_song_is_rejected(self):
        self.song["sha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "hash"):
            self.prepare()

    def test_extra_plan_fields_cannot_replace_observed_provenance(self):
        self.plan["conditioning"].update(path="wrong", sha256="wrong", channels=99, samples=1)
        result = self.prepare()
        self.assertEqual(result["channels"], 2)
        self.assertEqual(result["samples"], 112000)
        self.assertEqual(result["sha256"], hashlib.sha256(Path(result["path"]).read_bytes()).hexdigest())

    def test_compressed_source_is_not_silently_accepted_as_native_pcm(self):
        compressed = self.root / "song.mp3"
        subprocess.run(["/usr/bin/ffmpeg", "-nostdin", "-v", "error", "-i", str(self.source), str(compressed)], check=True)
        self.song = {"path": str(compressed), "sha256": hashlib.sha256(compressed.read_bytes()).hexdigest()}
        with self.assertRaisesRegex(ValueError, "PCM WAV"):
            self.prepare()

    def test_wrong_offsets_or_padding_fail_instead_of_being_replanned(self):
        for field in ("startSample", "availableSamples", "silenceSamples", "totalSamples"):
            with self.subTest(field=field):
                plan = json.loads(json.dumps(self.plan))
                plan["conditioning"][field] += 1
                with self.assertRaises(ValueError):
                    media.prepare_conditioning(self.song, plan, self.root / field)

    def test_existing_input_attempt_is_never_overwritten(self):
        self.prepare()
        with self.assertRaises(FileExistsError):
            self.prepare()

    def test_invalid_native_or_placement_plan_rejected(self):
        for changes in ({"fps": "30/1"}, {"nativeFrames": 48}, {"requestedFrames": 49},
                        {"nativeFrames": True}, {"placement": {"startFrame": 1, "endFrame": 49}}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                media.validate_plan(self.plan | changes)

    def test_runtime_fingerprint_is_allowed_but_semantic_changes_are_not(self):
        graph = {"6": {"class_type": "LoadAudio", "inputs": {"audio": "conditioning.wav"}}}
        observed = json.loads(json.dumps(graph))
        observed["6"]["is_changed"] = ["abc"]
        media.validate_png_prompt(observed, graph, "abc")
        for mutate in (lambda g: g["6"]["inputs"].update(audio="wrong.wav"),
                       lambda g: g["6"].update(is_changed=["wrong"]),
                       lambda g: g["6"].update(unexpected=True)):
            changed = json.loads(json.dumps(observed))
            mutate(changed)
            with self.assertRaises(ValueError):
                media.validate_png_prompt(changed, graph, "abc")

    def test_native_audio_grid_is_distinct_from_video_and_fixture_samples(self):
        self.assertEqual(media.expected_audio(56, False), (32000, 74400))
        self.assertEqual(media.expected_audio(56, True), (48000, 112000))

    def test_audio_profile_rejects_truncation_and_wrong_rates(self):
        original = {"sample_rate": "32000", "duration_ts": 74400, "time_base": "1/32000"}
        encoded = original | {"duration_ts": 74752}
        self.assertEqual(media.validate_audio_profiles(original, encoded, 56, False), (32000, 74400, 74400))
        for src, enc in ((original | {"duration_ts": 74000}, encoded),
                         (original | {"sample_rate": "48000"}, encoded),
                         (original, encoded | {"sample_rate": "48000"}),
                         (original, encoded | {"duration_ts": 74000})):
            with self.subTest(src=src, enc=enc), self.assertRaises(ValueError):
                media.validate_audio_profiles(src, enc, 56, False)

    def test_22_frame_mux_crop_does_not_discard_original_audio_evidence(self):
        original = {"sample_rate": "32000", "duration_ts": 29600, "time_base": "1/32000"}
        encoded = original | {"duration_ts": 29334}
        self.assertEqual(media.validate_audio_profiles(original, encoded, 22, False), (32000, 29600, 29334))


if __name__ == "__main__":
    unittest.main()
