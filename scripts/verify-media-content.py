"""Read-only recorded-media audit; run in the existing isolated Comfy Python.

No models, providers, services or source-artifact writes. FFmpeg/FFprobe are CPU
readers/encoders; the independent 192k AAC reference and audit logs go only into
an exclusive private output directory. Synthetic tests do not prove inference.
"""
import argparse
from fractions import Fraction
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import selectors
import signal
import subprocess
import time

import numpy as np
from PIL import Image

REPO = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location("h3_png_semantics", REPO / "integrations/h3/media.py")
media = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(media)
MSE_LIMIT = 100.0
BLACK_LIMIT = 3
COMMAND_SECONDS = 180
MAX_JSON_BYTES = 16 * 1024 * 1024


def require(condition, message):
    if not condition:
        raise ValueError(message)


def save(path, value):
    with Path(path).open("x") as stream:
        json.dump(value, stream, indent=2, allow_nan=False)
        stream.write("\n")


class Audit:
    def __init__(self, directory):
        self.directory = directory
        self.inputs = {}
        self.commands = (directory / "commands.jsonl").open("x")

    def input(self, value):
        path = Path(value)
        require(path.is_absolute() and path.absolute() == path.resolve() and path.is_file(),
                f"Input must be an existing unlinked absolute file: {path}")
        digest = media.sha256(path)
        if str(path) in self.inputs:
            require(self.inputs[str(path)] == digest, f"Input changed during audit: {path}")
        self.inputs[str(path)] = digest
        return path

    def json(self, value):
        path = self.input(value)
        require(path.stat().st_size <= MAX_JSON_BYTES, "Captured JSON exceeds the audit size bound")
        return json.loads(path.read_text())

    def event(self, value):
        self.commands.write(json.dumps(value, allow_nan=False) + "\n")
        self.commands.flush()

    def command(self, name, argv, *, parse_json=False):
        stdout = self.directory / f"{name}.stdout"
        stderr = self.directory / f"{name}.stderr"
        event = {"name": name, "argv": list(map(str, argv)), "timeoutSeconds": COMMAND_SECONDS}
        self.event(event | {"state": "started"})
        try:
            with stdout.open("xb") as out, stderr.open("xb") as err:
                result = subprocess.run(event["argv"], stdout=out, stderr=err, timeout=COMMAND_SECONDS, check=False)
            self.event(event | {"state": "exited", "exitCode": result.returncode})
            require(result.returncode == 0, f"{name} failed; inspect {stderr.name}")
            if parse_json:
                require(stdout.stat().st_size <= MAX_JSON_BYTES, f"{name} JSON exceeds audit size bound")
                return json.loads(stdout.read_text())
        except BaseException as error:
            self.event(event | {"state": "failed", "error": str(error)})
            raise

    def probe(self, path, name):
        return self.command(name, ["/usr/bin/ffprobe", "-v", "error", "-threads", "1", "-count_frames", "-show_streams",
                                   "-show_format", "-of", "json", str(path)], parse_json=True)

    def compare_frames(self, path, originals, count, *, export=False):
        """Only one decoded frame and one PNG are held, never an entire movie."""
        name = "export" if export else "native"
        command = ["/usr/bin/ffmpeg", "-nostdin", "-v", "error", "-xerror", "-threads", "1",
                   "-filter_threads", "1", "-i", str(path), "-map", "0:v:0", "-an", "-sn", "-dn",
                   "-fps_mode", "passthrough", "-threads:v", "1", "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"]
        self.event({"name": name + "-rgb", "argv": command, "state": "started", "timeoutSeconds": COMMAND_SECONDS,
                    "stdout": "frame-by-frame stream, not accumulated or stored"})
        mse_values, black_max = [], 0
        with (self.directory / f"{name}-decode.stderr").open("xb") as err, \
             (self.directory / f"{name}-frames.jsonl").open("x") as scores:
            proc = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=err)
            deadline = time.monotonic() + COMMAND_SECONDS
            selector = selectors.DefaultSelector()
            os.set_blocking(proc.stdout.fileno(), False)
            selector.register(proc.stdout, selectors.EVENT_READ)
            def read_exact(size):
                result = bytearray()
                while len(result) < size:
                    remaining = deadline - time.monotonic()
                    require(remaining > 0, f"{name} frame decode deadline exceeded")
                    require(selector.select(remaining), f"{name} frame decode deadline exceeded")
                    chunk = os.read(proc.stdout.fileno(), min(65536, size-len(result)))
                    if not chunk:
                        break
                    result.extend(chunk)
                return result
            try:
                for index in range(count):
                    raw = read_exact(640*480*3)
                    require(len(raw) == 640*480*3, f"{name} decoded frame count is short at {index+1}")
                    decoded = np.frombuffer(raw, dtype=np.uint8).reshape(480, 640, 3)
                    if index < len(originals):
                        with Image.open(originals[index]) as image:
                            require(image.mode == "RGB" and image.size == (640, 480), "PNG profile changed before decode")
                            image.load()
                            difference = np.subtract(decoded, np.asarray(image), dtype=np.float32)
                        np.square(difference, out=difference)
                        mse = float(difference.mean(dtype=np.float64))
                        scores.write(json.dumps({"index": index+1, "rgbMse": mse}) + "\n");scores.flush()
                        mse_values.append(mse)
                        require(mse < MSE_LIMIT, f"{'Export placed' if export else 'Native'} frame {index+1} MSE {mse} exceeds {MSE_LIMIT}")
                    else:
                        maximum = int(decoded.max());black_max = max(black_max, maximum)
                        scores.write(json.dumps({"index": index+1, "blackMaximumRgb": maximum}) + "\n");scores.flush()
                        require(maximum <= BLACK_LIMIT, f"Black tail frame {index+1} has RGB {maximum}")
                require(not read_exact(1), f"{name} has extra decoded frames")
                remaining = deadline-time.monotonic()
                require(remaining > 0, f"{name} frame decode deadline exceeded")
                code = proc.wait(timeout=remaining)
                require(code == 0, f"{name} decoding failed; inspect stderr")
                self.event({"name": name + "-rgb", "state": "exited", "exitCode": code, "frames": count})
            finally:
                selector.close();proc.stdout.close()
                if proc.poll() is None:
                    proc.kill()  # Only our own FFmpeg child handle, never a media/GPU PID.
                proc.wait(timeout=5)
        return mse_values, black_max


def one_stream(probe, kind):
    streams = [s for s in probe["streams"] if s["codec_type"] == kind]
    require(len(streams) == 1, f"Expected exactly one {kind} stream")
    return streams[0]


def video_profile(stream, count):
    require((stream["codec_name"], stream["pix_fmt"], stream["width"], stream["height"], stream["r_frame_rate"]) ==
            ("h264", "yuv420p", 640, 480, "24/1"), "Video profile differs")
    require(int(stream["nb_read_frames"]) == count, "Video frame count differs")
    require(int(stream["duration_ts"])*Fraction(stream["time_base"]) == Fraction(count, 24), "Video duration is not frame-exact")
    require(int(stream.get("start_pts", 0)) == 0, "Video does not begin at zero")


def audit(plan_path, output_directory):
    directory = Path(output_directory)
    require(directory.is_absolute() and directory.absolute() == directory.resolve(), "Audit output must be absolute and unlinked")
    directory.mkdir(mode=0o700)  # Exclusive: never overwrite a previous audit or original artifact.
    a = Audit(directory)
    try:
        plan = a.json(plan_path)
        music = a.json(plan["paths"]["musicReceipt"])
        video = a.json(plan["paths"]["videoReceipt"])
        run = Path(plan["paths"]["videoReceipt"]).parent
        require(music["state"] == video["state"] == "succeeded" and video["synthetic"] is False, "Successful real-media receipts required")
        require(music["attemptId"] == plan["native"]["musicAttemptId"] and video["attemptId"] == plan["native"]["h3AttemptId"] and
                video["projectId"] == plan["intent"]["projectId"], "Captured attempt/project identity differs")
        media.validate_plan(video["plan"])
        require(video["plan"]["requestedFrames"] == 48 and video["plan"]["placement"] == {"startFrame": 0, "endFrame": 48}, "This proof places frames 1-48 at zero")
        native_count = video["plan"]["nativeFrames"]
        require(native_count == video["outputs"]["nativeFrames"] == 56, "This proof requires the planned 56 native frames")
        song = a.input(music["audio"]["path"])
        artifacts = [f for f in music["artifacts"] if f["path"] == "audio.wav"]
        require(len(artifacts) == 1 and song == song.parent / "audio.wav" and artifacts[0]["sha256"] == a.inputs[str(song)] and
                artifacts[0]["bytes"] == song.stat().st_size, "YuE audio artifact hash/bytes differ from the original receipt")
        conditioning = a.input(video["conditioning"]["path"])
        source_snapshot = a.input(video["conditioning"]["sourceSnapshot"])
        require(a.inputs[str(song)] == a.inputs[str(source_snapshot)] == video["conditioning"]["songSha256"], "Song/conditioning source hash differs")
        require(a.inputs[str(conditioning)] == video["conditioning"]["sha256"], "Conditioning hash differs")
        graph = a.json(run / "workflow-api.json")
        history = a.json(run / "history.json")
        prompt_id = video["promptId"]
        require(set(history) == {prompt_id} and a.json(run / "submission.json")["prompt_id"] == prompt_id, "History prompt identity differs")
        executed = history[prompt_id]
        require(executed["prompt"][1] == prompt_id, "History prompt identity differs")
        require(executed["prompt"][2] == graph, "History graph differs from submitted graph")
        require(executed["status"]["completed"] is True and executed["status"]["status_str"] == "success", "History execution was not successful")
        require(graph["15"]["class_type"] == "SaveImage" and graph["16"]["class_type"] == "CreateVideo" and
                graph["15"]["inputs"]["images"] == graph["16"]["inputs"]["images"] == ["13", 0] and
                graph["13"]["class_type"] == "VAEDecode" and graph["13"]["inputs"]["samples"] == ["12", 0] and
                graph["12"]["class_type"] == "SamplerCustomAdvanced", "Raw frames/video do not share native decoded output")
        require(graph["5"]["inputs"]["length"] == native_count and graph["16"]["inputs"]["fps"] == 24, "Executed frame plan differs")
        seed = str(graph["9"]["inputs"]["noise_seed"])
        require(video["actualSeeds"] == {"h3": seed} and seed == plan["intent"]["seeds"]["h3"], "Executed H3 seed differs")
        output_root = run / "comfy-base/output"
        def artifact(item):
            path = output_root / item["subfolder"] / item["filename"]
            require(item["type"] == "output" and path.resolve().is_relative_to(output_root.resolve()), "History artifact escapes the owned output")
            return a.input(path)
        manifest = a.json(video["outputs"]["frameManifestPath"])
        require(manifest["origin"] == "pre-encode" and len(manifest["frames"]) == native_count, "Original frame manifest differs")
        originals = [artifact(item) for item in executed["outputs"]["15"]["images"]]
        require(len(set(originals)) == len(originals) == native_count and
                list(map(str, originals)) == [f["path"] for f in manifest["frames"]], "History frame order differs from manifest")
        for index, (path, frame) in enumerate(zip(originals, manifest["frames"]), 1):
            require(frame["index"] == index and frame["sha256"] == a.inputs[str(path)] and frame["bytes"] == path.stat().st_size, "PNG file manifest differs")
            with Image.open(path) as image:
                require(image.format == "PNG" and image.mode == "RGB" and image.size == (640, 480), "PNG profile differs")
                image.load()
                media.validate_png_prompt(json.loads(image.info.get("prompt", "null")), graph, a.inputs[str(conditioning)])
                require(hashlib.sha256(image.tobytes()).hexdigest() == frame["pixelSha256"], "PNG decoded pixels differ")
        native_items = executed["outputs"]["17"]["images"]
        require(len(native_items) == 1, "Expected one native video")
        native = artifact(native_items[0])
        require(str(native) == video["outputs"]["video"]["path"] and a.inputs[str(native)] == video["outputs"]["video"]["sha256"], "Native video history/hash differs")
        song_probe = a.probe(song, "song-probe")
        require(len(song_probe["streams"]) == 1 and song_probe["format"]["format_name"] == "wav", "Expected the original PCM WAV only")
        sound = one_stream(song_probe, "audio")
        require(sound["codec_name"] in {"pcm_s16le", "pcm_s24le", "pcm_s32le", "pcm_f32le"} and
                int(sound["sample_rate"]) == 48000 and sound["channels"] == 2, "Original song profile differs")
        song_samples = media.audio_samples(sound)
        require(song_samples == music["audio"]["samples"], "Original song sample count differs")
        final_frames = max(48, (song_samples+1999)//2000)
        target_samples = final_frames*2000
        export_path = a.input(plan["paths"]["exportPath"])
        native_probe = a.probe(native, "native-probe")
        final_probe = a.probe(export_path, "export-probe")
        video_profile(one_stream(native_probe, "video"), native_count)
        require(len(final_probe["streams"]) == 2, "Export must contain exactly one video and one audio stream")
        video_profile(one_stream(final_probe, "video"), final_frames)
        encoded = one_stream(final_probe, "audio")
        require((encoded["codec_name"], int(encoded["sample_rate"]), encoded["channels"]) == ("aac", 48000, 2), "Export audio profile differs")
        native_mse, _ = a.compare_frames(native, originals, native_count)
        final_mse, black_max = a.compare_frames(export_path, originals[:48], final_frames, export=True)
        reference = directory / "original-song-reference.m4a"
        a.command("reference-aac", ["/usr/bin/ffmpeg", "-nostdin", "-v", "error", "-xerror", "-n", "-threads", "1", "-filter_threads", "1",
            "-i", str(song), "-map", "0:a:0", "-af", f"apad=whole_len={target_samples},atrim=end_sample={target_samples}",
            "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", str(reference)])
        def packets(path, name):
            return a.command(name, ["/usr/bin/ffprobe", "-v", "error", "-select_streams", "a:0", "-show_packets",
                "-show_data_hash", "sha256", "-show_entries", "packet=pts,dts,duration,size,data_hash:packet_side_data", "-of", "json", str(path)], parse_json=True)["packets"]
        actual_packets = packets(export_path, "export-aac-packets")
        reference_packets = packets(reference, "reference-aac-packets")
        require(reference_packets and len(actual_packets) == len(reference_packets), "AAC packet count differs from independent 192k reference")
        require([p["data_hash"] for p in actual_packets] == [p["data_hash"] for p in reference_packets], "AAC packet hashes differ from independent original-song 192k reference")
        require(actual_packets == reference_packets, "AAC packet timing/padding metadata differs from independent reference")
        require(encoded["time_base"] == "1/48000", "AAC time base differs from reference sample grid")
        for name, digest in a.inputs.items():
            require(media.sha256(name) == digest, f"Input changed during audit: {name}")
        result = {"state": "verified-recorded-media-content", "diagnosticFixture": plan.get("diagnosticFixture", False),
            "planPath": str(plan_path), "inputHashes": a.inputs, "nativeFrames": native_count, "nativeFrameMse": native_mse,
            "exportFrames": final_frames, "exportPlacedFrameMse": final_mse, "blackTailFrames": final_frames-48,
            "blackTailMaximumRgb": black_max, "rgbMseLimitExclusive": MSE_LIMIT, "blackMaximumRgbLimitInclusive": BLACK_LIMIT,
            "songSamples": song_samples, "exportAudioTargetSamples": target_samples, "silencePadSamples": target_samples-song_samples,
            "aacPacketHashesMatched": len(actual_packets), "referenceAacSha256": media.sha256(reference),
            "boundary": "Recorded history establishes order; RGB MSE tolerance does not uniquely prove ordering of near-identical frames. Packet equality requires this FFmpeg AAC 192k encoding, not perceptual equivalence. No listening, provider identity, inference execution, GPU release or scheduler claim."}
        save(directory / "result.json", result)
        return result
    except BaseException as error:
        save(directory / "result.json", {"state": "failed", "errorType": type(error).__name__, "error": str(error), "inputHashes": a.inputs})
        raise
    finally:
        a.commands.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    interrupted = False
    def stop(signum, _frame):
        nonlocal interrupted
        if not interrupted:
            interrupted = True
            raise InterruptedError(f"Audit interrupted by {signal.Signals(signum).name}")
    previous = {sig: signal.signal(sig, stop) for sig in (signal.SIGINT, signal.SIGTERM)}
    try:
        print(json.dumps(audit(args.plan, args.output), indent=2, allow_nan=False))
    finally:
        for sig, handler in previous.items(): signal.signal(sig, handler)


if __name__ == "__main__":
    main()
