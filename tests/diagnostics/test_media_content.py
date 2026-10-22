"""Synthetic CPU media fixtures, NOT native H3/provider evidence.

Run with the existing isolated Comfy Python (Pillow/numpy) and FFmpeg installed.
The fixture deliberately fabricates captured-history/receipt schemas around
solid-colour images; it never loads a model or starts a service.
"""
import copy
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest import mock
import wave

import numpy as np
from PIL import Image, PngImagePlugin

REPO = Path(__file__).resolve().parents[2]

def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

checker = load("media_content_audit", REPO / "scripts/verify-media-content.py")
workflow = load("fixture_graph_schema_only", REPO / "integrations/h3/workflow.py")

def save(path, data):
    path.write_text(json.dumps(data, indent=2) + "\n")

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def ffmpeg(*args):
    subprocess.run(["/usr/bin/ffmpeg", "-nostdin", "-v", "error", "-xerror", "-n",
                    "-threads", "1", "-filter_threads", "1", *map(str, args)],
                   check=True, timeout=45, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


class MediaContentTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.storage = tempfile.TemporaryDirectory()
        cls.addClassCleanup(cls.storage.cleanup)
        cls.base = Path(cls.storage.name) / "base"
        cls.base.mkdir()
        b = cls.base
        run = b / "h3"
        raw = run / "comfy-base/output/raw"
        raw.mkdir(parents=True)
        for name in ["native", "audio"]:
            (raw.parent / name).mkdir()
        (run / "inputs").mkdir()
        (b / "music").mkdir()
        song = b / "music/audio.wav"
        samples = 120123  # Not frame-aligned: full target is 61*2000, not source length.
        t = np.arange(samples, dtype=np.float64) / 48000
        pcm = (np.stack((np.sin(t*2*math.pi*440), np.sin(t*2*math.pi*660)), axis=1)*8000).astype("<i2")
        for path, data in [(song, pcm), (b / "unrelated.wav", -pcm),
                           (run / "inputs/conditioning.wav", pcm[:112000])]:
            with wave.open(str(path), "wb") as stream:
                stream.setparams((2, 2, 48000, len(data), "NONE", "uncompressed"))
                stream.writeframes(data.tobytes())
        shutil.copyfile(song, run / "inputs/source-song.wav")
        graph = workflow.h3_graph(prompt="Synthetic diagnostic schema, no inference", seed="18446744073709551615",
                                  audio_filename="conditioning.wav", frames=56)
        observed = copy.deepcopy(graph)
        observed["6"]["is_changed"] = [digest(run / "inputs/conditioning.wav")]
        frames = []
        for i, color in enumerate(workflow.fixture_colors(), 1):
            path = raw / f"frame_{i:05d}_.png"
            png = PngImagePlugin.PngInfo()
            png.add_text("prompt", json.dumps(observed))
            with Image.new("RGB", (640, 480), color) as image:
                image.save(path, pnginfo=png)
                frames.append({"index": i, "path": str(path), "sha256": digest(path),
                               "bytes": path.stat().st_size, "pixelSha256": hashlib.sha256(image.tobytes()).hexdigest()})
        native = raw.parent / "native/clip.mp4"
        ffmpeg("-framerate", "24", "-start_number", "1", "-i", raw / "frame_%05d_.png", "-frames:v", "56",
               "-c:v", "libx264", "-threads:v", "1", "-crf", "18", "-pix_fmt", "yuv420p",
               "-video_track_timescale", "24000", "-movie_timescale", "24000", native)
        ffmpeg("-i", native, "-vf", "negate", "-c:v", "libx264", "-threads:v", "1", "-crf", "18",
               "-pix_fmt", "yuv420p", "-video_track_timescale", "24000", "-movie_timescale", "24000", b / "native-wrong.mp4")
        native_audio = raw.parent / "audio/clip.flac"
        ffmpeg("-i", song, "-af", "atrim=end_sample=112000", "-c:a", "flac", native_audio)
        # Every variant keeps identical codec/dimensions/counts; only actual content differs.
        def export(name, mode="correct", music=song, bitrate="192k"):
            visual = "trim=end_frame=48,setpts=PTS-STARTPTS,tpad=stop_mode=add:stop_duration=10:color=black,trim=end_frame=61"
            if mode == "black": visual += ",drawbox=color=black:t=fill"
            if mode == "wrong": visual += ",drawbox=color=red:t=fill:enable='lt(n,48)'"
            if mode == "tail": visual += ",drawbox=color=red:t=fill:enable='gte(n,48)'"
            ffmpeg("-framerate", "24", "-start_number", "1", "-i", raw / "frame_%05d_.png", "-i", music,
                   "-map", "0:v:0", "-map", "1:a:0", "-vf", visual,
                   "-af", "apad=whole_len=122000,atrim=end_sample=122000", "-c:v", "libx264", "-threads:v", "1",
                   "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", bitrate,
                   "-ar", "48000", "-ac", "2", b / name)
        export("export.mp4")
        export("black.mp4", "black")
        export("wrong.mp4", "wrong")
        export("tail.mp4", "tail")
        export("unrelated.mp4", music=b / "unrelated.wav")
        export("bitrate.mp4", bitrate="128k")
        def item(path): return {"type": "output", "subfolder": str(path.parent.relative_to(raw.parent)), "filename": path.name}
        history = {"fixture-prompt": {"prompt": [0, "fixture-prompt", graph],
            "status": {"completed": True, "status_str": "success"},
            "outputs": {"15": {"images": [item(Path(f['path'])) for f in frames]},
                        "17": {"images": [item(native)]}, "18": {"audio": [item(native_audio)]}}}}
        save(run / "history.json", history)
        save(run / "workflow-api.json", graph)
        save(run / "submission.json", {"prompt_id": "fixture-prompt"})
        save(run / "original-frames.json", {"origin": "pre-encode", "frames": frames})
        save(b / "music-receipt.json", {"state": "succeeded", "attemptId": "fixture-music",
            "audio": {"path": str(song), "samples": samples, "sampleRate": 48000, "channels": 2},
            "artifacts": [{"path": "audio.wav", "bytes": song.stat().st_size, "sha256": digest(song)}]})
        save(run / "receipt.json", {"state": "succeeded", "synthetic": False, "attemptId": "fixture-h3",
            "projectId": "fixture-project", "promptId": "fixture-prompt", "actualSeeds": {"h3": "18446744073709551615"},
            "plan": {"fps": "24/1", "requestedFrames": 48, "nativeFrames": 56, "placement": {"startFrame": 0, "endFrame": 48},
                     "conditioning": {"startSample": 0, "availableSamples": 112000, "silenceSamples": 0, "totalSamples": 112000}},
            "conditioning": {"path": str(run / "inputs/conditioning.wav"), "sha256": digest(run / "inputs/conditioning.wav"),
                             "sourceSnapshot": str(run / "inputs/source-song.wav"), "songSha256": digest(song)},
            "outputs": {"frameManifestPath": str(run / "original-frames.json"), "nativeFrames": 56, "requestedFrames": 48,
                        "video": {"path": str(native), "sha256": digest(native)},
                        "audio": {"path": str(native_audio), "sha256": digest(native_audio)}}})
        save(b / "captured-plan.json", {"diagnosticFixture": True, "intent": {"projectId": "fixture-project", "seeds": {"h3": "18446744073709551615"}},
            "native": {"musicAttemptId": "fixture-music", "h3AttemptId": "fixture-h3"},
            "paths": {"musicReceipt": str(b / "music-receipt.json"), "videoReceipt": str(run / "receipt.json"), "exportPath": str(b / "export.mp4")}})

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "case"
        shutil.copytree(self.base, self.root)
        for path in self.root.rglob("*.json"):
            path.write_text(path.read_text().replace(str(self.base), str(self.root)))
        self.plan = self.root / "captured-plan.json"
        self.output = self.root / "audit"

    def run_audit(self): return checker.audit(self.plan, self.output)

    def failure(self, message):
        with self.assertRaisesRegex(ValueError, message): self.run_audit()
        self.assertEqual(json.loads((self.output / "result.json").read_text())["state"], "failed")

    def test_correct_synthetic_media_passes_exact_padding_packets_and_bounded_frames(self):
        before = {str(p): digest(p) for p in self.root.rglob("*") if p.is_file()}
        result = self.run_audit()
        self.assertEqual(result["state"], "verified-recorded-media-content")
        self.assertTrue(result["diagnosticFixture"])
        self.assertEqual(result["exportFrames"], 61)
        self.assertEqual(result["exportAudioTargetSamples"], 122000)
        self.assertEqual(result["silencePadSamples"], 1877)
        self.assertEqual(result["nativeFrames"], 56)
        self.assertEqual(len(result["nativeFrameMse"]), 56)
        self.assertEqual(len(result["exportPlacedFrameMse"]), 48)
        self.assertEqual(result["blackTailFrames"], 13)
        self.assertGreater(result["aacPacketHashesMatched"], 0)
        self.assertIn("near-identical", result["boundary"])
        self.assertEqual(before, {name: digest(Path(name)) for name in before})
        self.assertEqual(self.output.stat().st_mode & 0o777, 0o700)

    def test_native_video_must_correspond_to_its_original_pngs(self):
        target = self.root / "h3/comfy-base/output/native/clip.mp4"
        shutil.copyfile(self.root / "native-wrong.mp4", target)
        path = self.root / "h3/receipt.json";value = json.loads(path.read_text())
        value["outputs"]["video"]["sha256"] = digest(target);save(path, value)
        self.failure("Native frame")

    def test_all_black_movie_cannot_pass_shape_only_checks(self):
        shutil.copyfile(self.root / "black.mp4", self.root / "export.mp4")
        self.failure("Export placed frame")

    def test_wrong_first_visuals_fail(self):
        shutil.copyfile(self.root / "wrong.mp4", self.root / "export.mp4")
        self.failure("Export placed frame")

    def test_nonblack_tail_fails(self):
        shutil.copyfile(self.root / "tail.mp4", self.root / "export.mp4")
        self.failure("Black tail")

    def test_unrelated_audio_fails_even_with_matching_audio_profile(self):
        shutil.copyfile(self.root / "unrelated.mp4", self.root / "export.mp4")
        self.failure("AAC packet")

    def test_different_aac_settings_fail_honestly_not_as_equivalent(self):
        shutil.copyfile(self.root / "bitrate.mp4", self.root / "export.mp4")
        self.failure("AAC packet")

    def test_history_frame_order_not_guessed_from_filenames(self):
        path = self.root / "h3/history.json"
        value = json.loads(path.read_text())
        images = value["fixture-prompt"]["outputs"]["15"]["images"]
        images[0], images[1] = images[1], images[0]
        save(path, value)
        self.failure("History frame order")

    def test_history_internal_prompt_identity_is_required(self):
        path = self.root / "h3/history.json"
        value = json.loads(path.read_text());value["fixture-prompt"]["prompt"][1] = "other"
        save(path, value)
        self.failure("History prompt identity")

    def test_png_semantic_graph_and_conditioning_fingerprint_required(self):
        for mutation in ["graph", "fingerprint"]:
            with self.subTest(mutation=mutation):
                path = self.root / "h3/comfy-base/output/raw/frame_00001_.png"
                with Image.open(path) as image:
                    observed = json.loads(image.info["prompt"])
                    if mutation == "graph": observed["9"]["inputs"]["noise_seed"] = 1
                    else: observed["6"]["is_changed"] = ["0"*64]
                    info = PngImagePlugin.PngInfo();info.add_text("prompt", json.dumps(observed))
                    image.save(path, pnginfo=info)
                manifest = self.root / "h3/original-frames.json";value = json.loads(manifest.read_text())
                value["frames"][0].update(sha256=digest(path), bytes=path.stat().st_size);save(manifest, value)
                self.output = self.root / f"audit-{mutation}"
                self.failure("PNG")
                # Restore the semantic fixture so the second subcase isolates the fingerprint.
                shutil.copyfile(self.base / "h3/comfy-base/output/raw/frame_00001_.png", path)

    def test_original_song_must_match_yue_artifact_hash_not_only_conditioning(self):
        path = self.root / "music-receipt.json";value = json.loads(path.read_text())
        value["artifacts"][0]["sha256"] = "0"*64;save(path, value)
        self.failure("YuE audio artifact")

    def test_wrong_png_dimensions_are_rejected_before_pixel_allocation(self):
        image = mock.MagicMock()
        image.format, image.mode, image.size = "PNG", "RGB", (64000, 48000)
        image.load.side_effect = AssertionError("pixels must not be allocated")
        context = mock.MagicMock()
        context.__enter__.return_value = image
        with mock.patch.object(checker.Image, "open", return_value=context):
            self.failure("PNG profile")

    def test_existing_audit_directory_is_never_overwritten(self):
        self.output.mkdir();marker = self.output / "keep";marker.write_text("original")
        with self.assertRaises(FileExistsError): self.run_audit()
        self.assertEqual(marker.read_text(), "original")
        self.assertEqual(list(self.output.iterdir()), [marker])


if __name__ == "__main__":
    unittest.main()
