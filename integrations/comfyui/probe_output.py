"""Synthetic output diagnostic, called inside the owned CPU service probe.

Not a generator, scheduler, cancellation proof, or substitute for the live suite.
"""
import hashlib
import importlib.util
import json
import math
from fractions import Fraction
from pathlib import Path
import struct
import subprocess
import time
import urllib.error
import urllib.request
import uuid
import wave


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def verify(*, repo, run, tool, get, http, port, proc, stop_requested, receipt, save):
    spec = importlib.util.spec_from_file_location("studio_h3_workflow", repo / "integrations/h3/workflow.py")
    workflow = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(workflow)
    receipt["outputProbeSourceSha256"] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    receipt["workflowSourceSha256"] = hashlib.sha256(Path(spec.origin).read_bytes()).hexdigest()
    receipt["boundary"] = "Synthetic CPU output-path proof only; no H3 models, GPU inference, agent orchestration or native job-cancellation proof"
    base = run / "comfy-base"
    samples = 56 * 2000  # native 56 frames at 24fps and 48kHz
    pcm = b"".join(struct.pack("<hh", int(6000*math.sin(2*math.pi*440*i/48000)),
                             int(4000*math.sin(2*math.pi*660*i/48000))) for i in range(samples))
    audio_path = base / "input/synthetic.wav"
    with wave.open(str(audio_path), "wb") as audio:
        audio.setparams((2, 2, 48000, samples, "NONE", "not compressed"))
        audio.writeframes(pcm)
    graph = workflow.synthetic_graph(audio_path.name)
    save(run / "workflow-api.json", graph)
    receipt["status"] = "submitting-synthetic-output-probe"
    receipt["clientId"] = str(uuid.uuid4())
    save(run / "receipt.json", receipt)
    require(not stop_requested and proc.poll() is None, "Owned probe stopped before submission")
    request = urllib.request.Request(f"http://127.0.0.1:{port}/prompt", method="POST",
                                    data=json.dumps({"prompt": graph, "client_id": receipt["clientId"]}).encode(),
                                    headers={"Content-Type": "application/json"})
    try:
        with http.open(request, timeout=30) as response:
            submitted = json.load(response)
    except urllib.error.HTTPError as error:
        (run / "submission-error.txt").write_bytes(error.read())
        raise
    save(run / "submission.json", submitted)
    receipt["promptId"] = submitted["prompt_id"]
    receipt["status"] = "running-synthetic-output-probe"
    save(run / "receipt.json", receipt)  # capture ownership BEFORE polling
    deadline = time.monotonic() + 300
    while True:
        require(not stop_requested, "Probe termination requested during output test")
        require(proc.poll() is None, "Owned CPU service exited during output test")
        history = get("history/" + receipt["promptId"])
        if receipt["promptId"] in history:
            save(run / "history.json", history)
            result = history[receipt["promptId"]]
            require(result["status"]["completed"] and result["status"]["status_str"] == "success",
                    "Synthetic workflow failed; see history.json and service.log")
            break
        if time.monotonic() >= deadline:
            raise TimeoutError("Synthetic output workflow did not finish in 300 seconds")
        time.sleep(0.5)
    require(result["prompt"][2] == graph, "Executed graph differs from submitted graph")
    queue = get("queue")
    save(run / "queue-after.json", queue)
    require(all(item[1] != receipt["promptId"] for key in ("queue_running", "queue_pending") for item in queue[key]),
            "Completed synthetic prompt still appears in the queue")
    outputs = result["outputs"]

    def output_path(item):
        require(item["type"] == "output", "Artifact is not an output file")
        path = base / "output" / item["subfolder"] / item["filename"]
        require(path.resolve().is_relative_to((base / "output").resolve()), "Artifact outside owned output directory")
        require(path.is_file() and not path.is_symlink(), "Artifact missing or linked")
        return path

    frames = [output_path(item) for item in outputs["15"]["images"]]
    require(len(frames) == 56 and len(set(frames)) == 56, "Expected 56 unique original PNG files")
    require(len(outputs["17"]["images"]) == 1, "Expected one video")
    require(len(outputs["18"]["audio"]) == 1, "Expected one audio file")
    video = output_path(outputs["17"]["images"][0])
    lossless_audio = output_path(outputs["18"]["audio"][0])
    # Decode PNGs using Pillow in the isolated native environment, not host pip.
    # Every pixel is checked, not just a file count or a plausible thumbnail.
    pixels_script = """
import hashlib, json, sys
from pathlib import Path
from PIL import Image
fixture = json.loads(Path(sys.argv[1]).read_text())
observed = []
for index, (name, color) in enumerate(zip(fixture['paths'], fixture['colors'], strict=True)):
    path = Path(name)
    with Image.open(path) as image:
        image.load()
        if image.format != 'PNG' or image.mode != 'RGB' or image.size != (640, 480):
            raise RuntimeError('Original frame format or dimensions differ')
        expected = bytes(color) * (640*480)
        if image.tobytes() != expected:
            raise RuntimeError(f'Original pixels/order differ at frame {index}')
        observed.append({'index': index, 'path': str(path), 'bytes': path.stat().st_size,
                         'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                         'pixelSha256': hashlib.sha256(image.tobytes()).hexdigest()})
print(json.dumps(observed))
"""
    save(run / "frame-paths.json", {"paths": [str(path) for path in frames], "colors": workflow.fixture_colors()})
    observed = json.loads(subprocess.check_output([str(tool / "venv/bin/python"), "-I", "-c", pixels_script,
                                                   str(run / "frame-paths.json")], timeout=60))
    save(run / "original-frames.json", {"origin": "synthetic IMAGE batch before video encoding", "frames": observed})

    def probe(path, name):
        value = json.loads(subprocess.check_output(["/usr/bin/ffprobe", "-v", "error", "-count_frames",
                                                   "-show_streams", "-show_format", "-of", "json", str(path)], timeout=60))
        save(run / name, value)
        return value

    video_info = probe(video, "video-ffprobe.json")
    v = [s for s in video_info["streams"] if s["codec_type"] == "video"]
    a = [s for s in video_info["streams"] if s["codec_type"] == "audio"]
    require(len(v) == len(a) == 1, "Expected exactly one video stream and one audio stream")
    require((v[0]["codec_name"], v[0]["pix_fmt"], v[0]["r_frame_rate"], v[0]["nb_read_frames"],
             v[0]["width"], v[0]["height"]) == ("h264", "yuv420p", "24/1", "56", 640, 480), "Video stream differs from profile")
    require((a[0]["codec_name"], a[0]["sample_rate"], a[0]["channels"]) == ("aac", "48000", 2), "AAC stream differs from profile")
    require(int(v[0]["duration_ts"]) * Fraction(v[0]["time_base"]) == Fraction(56, 24), "Exact video duration differs")
    # Independent FFmpeg decode proves video frame order too (lossy RGB tolerance).
    decoded = subprocess.check_output(["/usr/bin/ffmpeg", "-v", "error", "-xerror", "-i", str(video),
                                       "-map", "0:v:0", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], timeout=60)
    require(len(decoded) == 56 * 640 * 480 * 3, "Decoded video frame byte count differs")
    for index, color in enumerate(workflow.fixture_colors()):
        offset = (index * 640 * 480 + 240 * 640 + 320) * 3
        require(all(abs(got - wanted) <= 5 for got, wanted in zip(decoded[offset:offset+3], color)),
                f"Encoded video order/color differs at frame {index}")
    subprocess.run(["/usr/bin/ffmpeg", "-v", "error", "-xerror", "-i", str(video), "-f", "null", "-"], check=True, timeout=60)
    audio_info = probe(lossless_audio, "audio-ffprobe.json")
    flac = audio_info["streams"]
    require(len(flac) == 1 and (flac[0]["codec_name"], flac[0]["sample_rate"], flac[0]["channels"]) == ("flac", "48000", 2),
            "Lossless audio stream differs from fixture")
    audio_pcm = subprocess.check_output(["/usr/bin/ffmpeg", "-v", "error", "-xerror", "-i", str(lossless_audio),
                                         "-f", "s16le", "-acodec", "pcm_s16le", "-"], timeout=60)
    require(audio_pcm == pcm, "Lossless audio PCM or exact sample count changed")
    require(not stop_requested, "Probe termination requested during validation")
    receipt["syntheticOutput"] = {
        "originalFrames": 56, "width": 640, "height": 480, "fps": "24/1",
        "originalPixelsAndOrderVerified": True, "encodedVideoOrderVerified": True,
        "losslessAudioSamplesPerChannel": samples, "losslessAudioPcmVerified": True,
        "video": str(video), "videoSha256": hashlib.sha256(video.read_bytes()).hexdigest(),
        "audio": str(lossless_audio), "audioSha256": hashlib.sha256(lossless_audio.read_bytes()).hexdigest(),
    }
    receipt["status"] = "synthetic-output-verified"
