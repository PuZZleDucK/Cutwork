"""Proof-only cooperative node, staged in a fresh CPU Comfy base per test.

Not a generation model or cancellation implementation: call Comfy's actual
interrupt check, and let the real executor record the re-raised exception.
"""
import json
import os
from pathlib import Path
import time
import uuid

from comfy.model_management import (
    InterruptProcessingException,
    throw_exception_if_processing_interrupted,
)


class StudioCpuCancellationGate:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"token": ("STRING",)}}

    RETURN_TYPES = ()
    FUNCTION = "execute"
    OUTPUT_NODE = True
    CATEGORY = "studio/proof-only"

    def execute(self, token):
        if str(uuid.UUID(token)) != token:
            raise ValueError("Expected a canonical unique fixture token")
        root = Path(os.environ["STUDIO_COMFY_CPU_PROOF_DIR"])
        if not root.is_absolute() or not (root / "events").is_dir() or not (root / "gates").is_dir():
            raise RuntimeError("Missing owned fixture event/gate directories")
        events = []
        destination = root / "events" / f"{token}.jsonl"
        if destination.exists():
            raise RuntimeError("Refusing to reuse a fixture execution token")

        def record(kind):
            events.append({"token": token, "pid": os.getpid(), "kind": kind,
                           "monotonicNs": str(time.monotonic_ns())})
            temporary = destination.with_name(f"{token}.{uuid.uuid4()}.tmp")
            with temporary.open("x", encoding="utf8") as stream:
                stream.write("".join(json.dumps(event) + "\n" for event in events))
                stream.flush()
                os.fsync(stream.fileno())
            temporary.replace(destination)  # Readers see only complete snapshots.

        record("started")
        deadline = time.monotonic() + 90
        try:
            while True:
                throw_exception_if_processing_interrupted()
                if time.monotonic() >= deadline:
                    record("expired")
                    raise TimeoutError("CPU fixture watchdog expired, not successful completion")
                if (root / "gates" / token).exists():
                    record("released")
                    record("finished")
                    return {"ui": {"text": [token]}, "result": ()}
                time.sleep(0.01)
        except InterruptProcessingException:
            record("interrupted")
            raise  # Comfy, not this node, generates the native history/terminal state.


NODE_CLASS_MAPPINGS = {"StudioCpuCancellationGate": StudioCpuCancellationGate}
