#!/usr/bin/env python3
"""Real, CPU-only readiness probe; all media is labelled synthetic."""
import argparse
import hashlib
import importlib.metadata
import json
import math
from pathlib import Path
import re
import subprocess
import sys
import uuid
import wave
import struct


def run(argv, timeout=180):
    result = subprocess.run(argv, capture_output=True, text=True, timeout=timeout, check=True)
    return result.stdout


def main():
    if not __debug__:
        raise SystemExit("Refusing optimized Python: readiness assertions must remain enabled.")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--prefix", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir()  # A new evidence directory for every check; never overwrite.
    here = Path(__file__).resolve().parent
    recipe = json.loads((here / "recipe.json").read_text())
    prefix = args.prefix.resolve()
    assert Path(sys.prefix).resolve() == prefix and sys.prefix != sys.base_prefix
    assert "include-system-site-packages = false" in (prefix / "pyvenv.cfg").read_text().lower()
    assert ".".join(map(str, sys.version_info[:3])) == recipe["python"]["version"]
    for path in sys.path:
        if "site-packages" in path or "dist-packages" in path:
            assert Path(path).resolve().is_relative_to(prefix), path
    import librosa
    import numba
    import numpy
    import scipy
    import soundfile
    modules = (librosa, numba, numpy, scipy, soundfile)
    for module in modules:
        assert Path(module.__file__).resolve().is_relative_to(prefix)
    pins = dict(re.findall(r"^([\w.-]+)==([^\s\\]+)", (here / "requirements.lock").read_text(), re.MULTILINE))
    assert {"librosa", "numpy", "numba", "scipy", "soundfile"}.issubset(pins)
    versions = {name: importlib.metadata.version(name) for name in pins}
    assert versions == pins
    pip_check = run([sys.executable, "-I", "-m", "pip", "--isolated", "check"])
    tools = {}
    for name in ("ffmpeg", "ffprobe"):
        path = Path("/usr/bin") / name
        tools[name] = {"path": str(path), "resolvedPath": str(path.resolve()),
                       "version": run([str(path), "-version"]),
                       "packageOwner": run(["/usr/bin/dpkg-query", "-S", str(path)]).strip()}
        assert tools[name]["packageOwner"].split(": ")[0] == "ffmpeg"
    encoders = run(["/usr/bin/ffmpeg", "-hide_banner", "-encoders"])
    filters = run(["/usr/bin/ffmpeg", "-hide_banner", "-filters"])
    encoder_names = {line.split()[1] for line in encoders.splitlines() if len(line.split()) > 1}
    filter_names = {line.split()[1] for line in filters.splitlines() if len(line.split()) > 1}
    required_encoders = {"libx264", "aac", "pcm_s16le", "pcm_f32le", "flac", "png"}
    required_filters = {"atrim", "apad", "asetpts", "aresample", "aformat", "trim", "setpts", "concat", "scale", "fps", "color"}
    assert required_encoders <= encoder_names
    assert required_filters <= filter_names
    (args.output / "ffmpeg-encoders.txt").write_text(encoders)
    (args.output / "ffmpeg-filters.txt").write_text(filters)
    fixture = args.output / "synthetic-media.mp4"
    run(["/usr/bin/ffmpeg", "-nostdin", "-v", "error", "-f", "lavfi", "-i",
         "color=c=black:s=64x64:r=24:d=0.5", "-f", "lavfi", "-i",
         "sine=frequency=440:sample_rate=48000:duration=0.5", "-c:v", "libx264", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-ac", "2", "-shortest", str(fixture)])
    media = json.loads(run(["/usr/bin/ffprobe", "-v", "error", "-count_frames", "-show_streams", "-of", "json", str(fixture)]))
    video = next(s for s in media["streams"] if s["codec_type"] == "video")
    audio = next(s for s in media["streams"] if s["codec_type"] == "audio")
    assert (video["codec_name"], video["r_frame_rate"], video["nb_read_frames"]) == ("h264", "24/1", "12")
    assert (audio["codec_name"], audio["sample_rate"], audio["channels"]) == ("aac", "48000", 2)
    run(["/usr/bin/ffmpeg", "-nostdin", "-v", "error", "-xerror", "-i", str(fixture), "-f", "null", "-"])
    rate = 44100
    samples = [0] * (rate * 13)
    onsets = [rate + i * (rate // 2) for i in range(22)]
    for onset in onsets:
        for j in range(441):
            samples[onset + j] = round(24000 * math.exp(-j / 100) * math.sin(2 * math.pi * 1500 * j / rate))
    source = args.output / "synthetic-clicks.wav"
    with wave.open(str(source), "wb") as output:
        output.setparams((1, 2, rate, 0, "NONE", "not compressed"))
        output.writeframes(struct.pack("<" + "h" * len(samples), *samples))
    request = {"schemaVersion": 1, "attemptId": str(uuid.uuid4()), "waveformBucketSamples": 512,
               "source": {"path": str(source.resolve()), "sha256": hashlib.sha256(source.read_bytes()).hexdigest()}}
    request_path, receipt_path = args.output / "request.json", args.output / "receipt.json"
    request_path.write_text(json.dumps(request, indent=2) + "\n")
    run([sys.executable, "-I", str(here / "analyze.py"), "--request", str(request_path), "--result", str(receipt_path)])
    receipt = json.loads(receipt_path.read_text())
    assert receipt["state"] == "succeeded"
    assert (receipt["source"]["sampleRate"], receipt["source"]["sampleCount"]) == (rate, str(len(samples)))
    assert receipt["source"]["sha256"] == request["source"]["sha256"]
    assert abs(receipt["beats"]["estimatedBpm"] - 120) <= 5
    beats = list(map(int, receipt["beats"]["sampleIndices"]))
    assert len(beats) >= 12 and beats == sorted(set(beats)) and 0 < beats[0] < beats[-1] < len(samples)
    assert all(min(abs(b - onset) for onset in onsets) <= rate * 0.06 for b in beats)
    result = {"state": "succeeded", "scope": "Actual isolated imports, shared native media capabilities and synthetic CPU audio analysis; not real-song musical accuracy or application-service proof",
              "prefix": sys.prefix, "basePrefix": sys.base_prefix, "python": sys.version, "versions": versions,
              "modulePaths": {m.__name__: m.__file__ for m in modules}, "pipCheck": pip_check.strip(),
              "nativeTools": tools, "requiredEncoders": sorted(required_encoders), "requiredFilters": sorted(required_filters),
              "mediaFixture": media, "analysisReceipt": str(receipt_path), "synthetic": True}
    (args.output / "readiness.json").write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"state": "succeeded", "readiness": str(args.output / "readiness.json")}))


if __name__ == "__main__":
    main()
