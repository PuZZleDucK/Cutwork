#!/usr/bin/env python3
"""CPU-only, immutable-input audio analysis. No generator, editor or agent policy."""
import argparse
from datetime import datetime, timezone
from fractions import Fraction
import hashlib
import importlib.metadata
import io
import json
import math
from numbers import Integral, Real
import os
from pathlib import Path
import tempfile
import sys
import uuid


ANALYSIS_VERSION = "studio-librosa-samples-v1"
PACKAGES = ("librosa", "numpy", "scipy", "soundfile", "numba")


def tracker_parameters():
    return {"hop_length": 512, "start_bpm": 120.0, "tightness": 100,
            "trim": True, "units": "samples", "sparse": True}


def unavailable(reason):
    return {"status": "unavailable", "estimatedBpm": None,
            "sampleIndices": [], "reason": reason}


def normalise_beats(tempo, sample_indices, *, sample_count):
    """Validate native estimates, never fabricate/repair a beat map."""
    if hasattr(tempo, "tolist"):
        tempo = tempo.tolist()
    if isinstance(tempo, (list, tuple)) and len(tempo) == 1:
        tempo = tempo[0]
    if (isinstance(tempo, bool) or not isinstance(tempo, Real)
            or not math.isfinite(tempo) or tempo <= 0):
        return unavailable("Detector returned no finite positive unambiguous tempo.")
    if hasattr(sample_indices, "tolist"):
        sample_indices = sample_indices.tolist()
    if not isinstance(sample_indices, (list, tuple)) or len(sample_indices) < 2:
        return unavailable("At least two detected beat anchors are needed for a usable interval.")
    if (isinstance(sample_count, bool) or not isinstance(sample_count, Integral) or sample_count <= 0):
        return unavailable("Invalid decoded sample count.")
    previous = -1
    encoded = []
    for sample in sample_indices:
        if (isinstance(sample, bool) or not isinstance(sample, Integral)
                or not previous < sample < sample_count):
            return unavailable("Detector positions must be strictly increasing integer source samples within the song.")
        previous = sample
        encoded.append(str(int(sample)))
    return {"status": "available", "estimatedBpm": float(tempo),
            "sampleIndices": encoded, "reason": None}


def detect_beats(mono, sample_rate, *, tracker=None):
    try:
        if tracker is None:
            from librosa.beat import beat_track
            tracker = beat_track
        tempo, samples = tracker(y=mono, sr=sample_rate, **tracker_parameters())
        return normalise_beats(tempo, samples, sample_count=len(mono))
    except Exception as error:
        return unavailable(f"Beat detection failed: {type(error).__name__}: {error}")


class AnalysisError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def validate_request(request):
    if not isinstance(request, dict) or type(request.get("schemaVersion")) is not int or request["schemaVersion"] != 1:
        raise AnalysisError("invalid-request", "Expected request schemaVersion 1.")
    try:
        uuid.UUID(request["attemptId"])
        source = request["source"]
        path = Path(source["path"])
        digest = source["sha256"]
        bucket = request["waveformBucketSamples"]
        if not path.is_absolute() or not isinstance(digest, str) or len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest):
            raise ValueError("Expected an absolute source path and lowercase SHA-256.")
        if type(bucket) is not int or not 1 <= bucket <= 10_000_000:
            raise ValueError("waveformBucketSamples must be an integer from 1 to 10000000.")
    except (KeyError, TypeError, ValueError, AttributeError) as error:
        raise AnalysisError("invalid-request", str(error)) from error
    return path, digest, bucket


def analyse(request):
    receipt = {
        "schemaVersion": 1, "attemptId": request.get("attemptId") if isinstance(request, dict) else None,
        "analysisVersion": ANALYSIS_VERSION,
        "helperSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        "startedAt": datetime.now(timezone.utc).isoformat(),
        "state": "failed", "versions": {}, "parameters": None,
        "source": None, "waveform": None, "beats": None, "error": None,
    }
    stage = "invalid-request"
    try:
        path, expected_hash, bucket = validate_request(request)
        stage = "source-read-failed"
        # Hash and decoder consume the SAME captured bytes, even if the path later changes.
        captured = path.read_bytes()
        digest = hashlib.sha256(captured).hexdigest()
        if digest != expected_hash:
            raise AnalysisError("source-hash-mismatch", "Captured audio does not match the submitted source hash.")
        stage = "dependency-failed"
        import numpy as np
        import soundfile as sf
        from librosa.beat import beat_track
        receipt["versions"] = {name: importlib.metadata.version(name) for name in PACKAGES}
        stage = "decode-failed"
        with sf.SoundFile(io.BytesIO(captured)) as audio:
            sample_rate, channels, subtype = audio.samplerate, audio.channels, audio.subtype
            samples = audio.read(dtype="float64", always_2d=True)
        count = len(samples)
        if count < 1 or sample_rate < 1 or channels < 1 or samples.shape != (count, channels):
            raise AnalysisError("decode-failed", "Empty or inconsistent decoded audio.")
        if not np.isfinite(samples).all():
            raise AnalysisError("non-finite-audio", "Decoded PCM contains NaN or infinite values; source was not sanitised.")
        duration = Fraction(count, sample_rate)
        receipt["source"] = {"path": str(path), "sha256": digest, "sampleRate": sample_rate,
                             "channels": channels, "sampleCount": str(count), "subtype": subtype,
                             "duration": {"numerator": str(duration.numerator), "denominator": str(duration.denominator)}}
        stage = "analysis-failed"
        absolute = np.max(np.abs(samples), axis=1)
        peaks = np.maximum.reduceat(absolute, np.arange(0, count, bucket)).tolist()
        receipt["waveform"] = {"bucketSamples": bucket, "peaks": peaks}
        receipt["parameters"] = {"sampleRate": sample_rate, "resampling": "none", "monoMix": "arithmetic-mean",
                                 "waveformAggregation": "max-absolute-all-channels", "beatTrack": tracker_parameters()}
        receipt["beats"] = detect_beats(samples.mean(axis=1), sample_rate, tracker=beat_track)
        receipt["state"] = "succeeded" if receipt["beats"]["status"] == "available" else "partial"
    except Exception as error:
        receipt["error"] = {"code": error.code if isinstance(error, AnalysisError) else stage,
                            "message": f"{type(error).__name__}: {error}"}
    receipt["finishedAt"] = datetime.now(timezone.utc).isoformat()
    return receipt


def write_new_receipt(path, receipt):
    """Publish complete JSON without replacing any existing file/link, including races."""
    encoded = json.dumps(receipt, indent=2, allow_nan=False) + "\n"
    fd, temporary = tempfile.mkstemp(prefix=".analysis-receipt-", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as output:
            output.write(encoded)
            output.flush()
            os.fsync(output.fileno())
        os.link(temporary, path)  # Atomic exclusive publication; never follows destination links.
    finally:
        os.unlink(temporary)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--request", type=Path, required=True)
    parser.add_argument("--result", type=Path, required=True)
    args = parser.parse_args()
    try:
        if os.path.lexists(args.result):
            raise FileExistsError(f"Result path already exists: {args.result}")
        def invalid_constant(value):
            raise ValueError("Non-finite request JSON: " + value)
        request = json.loads(args.request.read_text(), parse_constant=invalid_constant)
        receipt = analyse(request)
        write_new_receipt(args.result, receipt)
        print(json.dumps({"state": receipt["state"], "receipt": str(args.result), "error": receipt["error"]}))
        return 1 if receipt["state"] == "failed" else 0
    except Exception as error:
        print(f"{type(error).__name__}: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
