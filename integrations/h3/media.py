"""Sample-exact inputs and independently inspected media for the H3 proof.

Consumes the shared TypeScript VideoPlan. No beat estimation or re-planning.
The initial helper accepts the native YuE2 48 kHz stereo source profile only;
general imported-audio conversion is not silently added here.
"""
from fractions import Fraction
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha256(path):
    value = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def save(path, value):
    path = Path(path)
    with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, prefix="."+path.name, delete=False) as stream:
        temporary = Path(stream.name)
        json.dump(value, stream, indent=2, allow_nan=False)
        stream.write("\n")
    temporary.replace(path)


def integer(value, label):
    require(type(value) is int and 0 <= value <= 2**53-1, f"Invalid nonnegative integer {label}")
    return value


def validate_plan(plan):
    require(plan["fps"] == "24/1", "Only the approved 24/1 native rate is supported")
    native = integer(plan["nativeFrames"], "nativeFrames")
    requested = integer(plan["requestedFrames"], "requestedFrames")
    start = integer(plan["placement"]["startFrame"], "startFrame")
    end = integer(plan["placement"]["endFrame"], "endFrame")
    require(0 < requested == end-start <= native, "Placement and requested/native counts disagree")
    require(native >= 5 and (native-5) % 17 == 0, "Native count is not on the H3 grid")
    c = plan["conditioning"]
    for key in ("startSample", "availableSamples", "silenceSamples", "totalSamples"):
        integer(c[key], key)
    require(c["startSample"] == start*2000 and c["totalSamples"] == native*2000,
            "Conditioning sample offsets disagree with the captured frame plan")
    require(c["availableSamples"] + c["silenceSamples"] == c["totalSamples"], "Padding counts disagree")
    return plan


def probe(path):
    return json.loads(subprocess.check_output(["/usr/bin/ffprobe", "-v", "error", "-count_frames",
                                               "-show_streams", "-show_format", "-of", "json", str(path)], timeout=120))


def audio_samples(stream):
    count = int(stream["duration_ts"]) * Fraction(stream["time_base"]) * int(stream["sample_rate"])
    require(count.denominator == 1, "Audio does not expose an exact integer sample count")
    return count.numerator


def prepare_conditioning(song, plan, directory):
    validate_plan(plan)
    source = Path(song["path"])
    require(source.is_absolute() and source.is_file(), "Source song must be an existing absolute path")
    require(sha256(source) == song["sha256"], "Source song hash changed")
    directory = Path(directory)
    directory.mkdir(mode=0o700)  # exclusive attempt directory, no overwrite
    snapshot = directory / ("source-song" + source.suffix)
    shutil.copyfile(source, snapshot)
    require(sha256(snapshot) == song["sha256"], "Source song hash changed during capture")
    source_probe = probe(snapshot)
    save(directory / "source-ffprobe.json", source_probe)
    streams = [s for s in source_probe["streams"] if s["codec_type"] == "audio"]
    require(len(streams) == 1, "Expected exactly one source audio stream")
    stream = streams[0]
    require(source_probe["format"]["format_name"] == "wav" and
            stream["codec_name"] in {"pcm_s16le", "pcm_s24le", "pcm_s32le", "pcm_f32le"},
            "This feasibility helper requires a supported PCM WAV source; compressed imports are not implemented")
    require((int(stream["sample_rate"]), stream["channels"]) == (48000, 2),
            "This feasibility helper requires 48 kHz stereo; no implicit conversion")
    song_samples = audio_samples(stream)
    c = plan["conditioning"]
    require(c["availableSamples"] == min(c["totalSamples"], max(0, song_samples-c["startSample"])),
            "Captured plan's available samples disagree with the actual song")
    dest = directory / "conditioning.wav"
    command = ["/usr/bin/ffmpeg", "-nostdin", "-v", "error", "-xerror", "-n"]
    if c["availableSamples"]:
        command += ["-i", str(snapshot), "-map", "0:a:0", "-af",
                    f"atrim=start_sample={c['startSample']}:end_sample={c['startSample']+c['availableSamples']},"
                    f"asetpts=PTS-STARTPTS,apad=whole_len={c['totalSamples']},atrim=end_sample={c['totalSamples']}"]
    else:
        # Empty trim input is not a reliable generator of silence. Explicitly
        # create the entire post-song interval and record this distinct path.
        command += ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-af", f"atrim=end_sample={c['totalSamples']}"]
    command += ["-c:a", "pcm_f32le", "-ar", "48000", "-ac", "2", str(dest)]
    save(directory / "conditioning-command.json", command)
    subprocess.run(command, check=True, timeout=120)
    result_probe = probe(dest)
    save(directory / "conditioning-ffprobe.json", result_probe)
    result_stream = result_probe["streams"][0]
    require(result_stream["codec_name"] == "pcm_f32le" and audio_samples(result_stream) == c["totalSamples"],
            "Conditioning WAV does not have the exact planned PCM sample count")
    result = {"path": str(dest), "sha256": sha256(dest), "sourceSnapshot": str(snapshot),
              "songPath": str(source), "songSha256": song["sha256"], "songSamples": song_samples,
              "sampleRate": 48000, "channels": 2, "samples": c["totalSamples"],
              **{key: c[key] for key in ("startSample", "availableSamples", "silenceSamples", "totalSamples")},
              "whollyPostSong": c["availableSamples"] == 0, "conversion": "Source rate/channels unchanged; working WAV is float32 PCM",
              "command": command}
    save(directory / "conditioning.json", result)
    return result


def collect_outputs(*, result, graph, run, output, python, plan, synthetic):
    """Validate actual files/history, not the agent's success assertion."""
    require(result["prompt"][2] == graph, "Executed graph differs from captured inputs")
    require(result["status"]["completed"] and result["status"]["status_str"] == "success", "Native execution did not succeed")
    source = graph["15"]["inputs"]["images"]
    require(source == graph["16"]["inputs"]["images"], "Raw frames and video do not share the original image batch")
    if not synthetic:
        require(source == ["13", 0] and graph["13"]["class_type"] == "VAEDecode", "Raw branch is not the native VAE output")
    root = output.resolve()

    def artifact(item):
        path = output / item["subfolder"] / item["filename"]
        require(item["type"] == "output" and path.resolve().is_relative_to(root), "Output is outside the owned artifact directory")
        require(path.absolute() == path.resolve() and path.is_file(), "Output is missing or linked")
        return path

    outputs = result["outputs"]
    frames = [artifact(item) for item in outputs["15"]["images"]]
    require(len(frames) == plan["nativeFrames"] and len(set(frames)) == len(frames), "Incomplete or duplicate original image batch")
    require(len(outputs["17"]["images"]) == 1 and len(outputs["18"]["audio"]) == 1, "Expected one video and one audio source")
    video, audio = artifact(outputs["17"]["images"][0]), artifact(outputs["18"]["audio"][0])
    save(run / "original-frame-inputs.json", {"paths": [str(p) for p in frames], "graph": graph,
                                              "audioSha256": sha256(run / "inputs/conditioning.wav")})
    # Independent PNG decoding and metadata inspection in the isolated tool env.
    observed = json.loads(subprocess.check_output([str(python), "-I", str(Path(__file__).resolve()),
                                                   "--inspect-png", str(run / "original-frame-inputs.json")], timeout=180))
    manifest_path = run / "original-frames.json"
    save(manifest_path, {"origin": "synthetic-pre-encode" if synthetic else "pre-encode", "frames": observed})
    info, audio_info = probe(video), probe(audio)
    save(run / "video-ffprobe.json", info)
    save(run / "audio-ffprobe.json", audio_info)
    v = [s for s in info["streams"] if s["codec_type"] == "video"]
    a = [s for s in info["streams"] if s["codec_type"] == "audio"]
    require(len(v) == len(a) == 1, "Expected one video stream and one audio stream")
    require((v[0]["codec_name"], v[0]["pix_fmt"], v[0]["width"], v[0]["height"], v[0]["r_frame_rate"]) ==
            ("h264", "yuv420p", 640, 480, "24/1"), "Native video format differs from the proof profile")
    require(int(v[0]["nb_read_frames"]) == plan["nativeFrames"], "Encoded frame count differs from original batch")
    require(int(v[0]["duration_ts"]) * Fraction(v[0]["time_base"]) == Fraction(plan["nativeFrames"], 24), "Video duration is not frame-exact")
    require(a[0]["codec_name"] == "aac" and a[0]["channels"] == 2, "Expected native AAC stereo preview audio")
    require(len(audio_info["streams"]) == 1, "Expected one original audio stream")
    original_audio = audio_info["streams"][0]
    require(original_audio["codec_name"] == "flac" and original_audio["channels"] == 2, "Expected original FLAC stereo audio")
    expected_rate, expected_samples, mux_samples = validate_audio_profiles(original_audio, a[0], plan["nativeFrames"], synthetic)
    for path in (video, audio):
        subprocess.run(["/usr/bin/ffmpeg", "-nostdin", "-v", "error", "-xerror", "-i", str(path), "-f", "null", "-"],
                       check=True, timeout=180)
    decoded_path = run / "decoded-audio.f32le"
    with decoded_path.open("xb") as decoded:
        subprocess.run(["/usr/bin/ffmpeg", "-nostdin", "-v", "error", "-xerror", "-i", str(audio),
                        "-f", "f32le", "-acodec", "pcm_f32le", "-"], stdout=decoded, check=True, timeout=180)
    require(decoded_path.stat().st_size == expected_samples*2*4, "Decoded original audio length differs from metadata")
    return {"frameManifestPath": str(manifest_path), "nativeFrames": len(frames),
            "requestedFrames": plan["requestedFrames"], "initialPlacement": plan["placement"],
            "video": {"path": str(video), "sha256": sha256(video)},
            "audio": {"path": str(audio), "sha256": sha256(audio), "samples": audio_samples(original_audio),
                      "sampleRate": int(original_audio["sample_rate"]), "channels": original_audio["channels"],
                      "muxInputSamples": mux_samples,
                      "audioMinusVideoSeconds": str(Fraction(expected_samples, expected_rate)-Fraction(plan["nativeFrames"], 24))}}


def expected_audio(native_frames, synthetic):
    # Pinned H3 temporal_shape: 40 audio latent steps/s; audio VAE upsamples 800x.
    # Use exact arithmetic rather than trusting source-container duration.
    return (48000, native_frames*2000) if synthetic else (32000, 800*round(Fraction(native_frames*40, 24)))


def validate_audio_profiles(original, encoded, native_frames, synthetic):
    rate, samples = expected_audio(native_frames, synthetic)
    require(int(original["sample_rate"]) == rate and audio_samples(original) == samples,
            "Original audio rate or sample count differs from the pinned native profile")
    # Pinned VideoFromComponents trims its mux copy at ceil(video duration*rate).
    # The original FLAC remains complete even when H3 rounds audio upward.
    mux_samples = min(samples, (rate*native_frames+23)//24)
    require(int(encoded["sample_rate"]) == rate and 0 <= audio_samples(encoded)-mux_samples < 1024,
            "AAC rate/duration differs beyond one encoder packet of padding")
    return rate, samples, mux_samples


def validate_png_prompt(observed, submitted, audio_sha256):
    require(isinstance(observed, dict) and observed.keys() == submitted.keys(), "PNG graph node IDs differ")
    for key, node in observed.items():
        require(isinstance(node, dict) and set(node) <= set(submitted[key]) | {"is_changed"}, "Unknown PNG runtime annotation")
        require({k: v for k, v in node.items() if k != "is_changed"} == submitted[key], "PNG graph semantic inputs differ")
    require(observed["6"].get("is_changed") == [audio_sha256], "PNG LoadAudio fingerprint differs from the conditioned input")


def inspect_pngs(input_path):
    from PIL import Image  # only inside the isolated Comfy environment
    inputs = json.loads(Path(input_path).read_text())
    frames = []
    for index, name in enumerate(inputs["paths"], 1):
        path = Path(name)
        with Image.open(path) as image:
            image.load()
            require(image.format == "PNG" and image.mode == "RGB" and image.size == (640, 480), "Original PNG format/size differs")
            observed = json.loads(image.info.get("prompt", "null"))
            validate_png_prompt(observed, inputs["graph"], inputs["audioSha256"])
            # Full observed annotations remain in every original PNG; also save
            # the first graph as readable evidence, never replace the originals.
            if index == 1:
                save(Path(input_path).with_name("png-observed-prompt.json"), observed)
            frames.append({"index": index, "path": str(path), "sha256": sha256(path),
                           "pixelSha256": hashlib.sha256(image.tobytes()).hexdigest(), "bytes": path.stat().st_size})
    return frames


if __name__ == "__main__":
    require(len(sys.argv) == 3 and sys.argv[1] == "--inspect-png", "Internal PNG inspection requires a captured input file")
    print(json.dumps(inspect_pngs(sys.argv[2])))
