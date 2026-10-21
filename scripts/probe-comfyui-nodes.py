#!/usr/bin/env python3
"""Opt-in, owned CPU service/node probe. Not H3 inference or job cancellation."""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid


REQUIRED_NODES = (
    "UNETLoader", "CLIPLoader", "VAELoader", "CLIPTextEncode",
    "EmptyMiniMaxH3LatentAV", "MiniMaxH3ImageToVideo", "MiniMaxH3AddGuide",
    "MiniMaxH3ReferenceToVideo", "MiniMaxH3SigmaShift", "BasicGuider",
    "RandomNoise", "KSamplerSelect", "BasicScheduler", "SamplerCustomAdvanced",
    "VAEDecode", "SaveImage", "LoadAudio", "VAEDecodeAudio",
    "CreateVideo", "SaveVideo",
)


def save(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n")


def require(condition, message):
    # Proof checks must still execute under -O / inherited PYTHONOPTIMIZE.
    if not condition:
        raise RuntimeError(message)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", action="store_true")
    parser.add_argument("--verify-output", action="store_true",
                        help="Also submit and validate a synthetic 56-frame/audio workflow (no models)")
    parser.add_argument("--port", type=int, default=8198)
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error("Use an unprivileged TCP port")
    root = Path(os.environ.get("STUDIO_DATA_ROOT", str(
        Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local/share")) / "music-video-studio"
    )))
    if not root.is_absolute():
        parser.error("STUDIO_DATA_ROOT must be absolute")
    tool = root / "tools/comfyui"
    print(f"Plan: start ONLY {tool}/source on loopback:{args.port} with --cpu, inspect nodes, stop our process.")
    print("Synthetic output workflow requested; no models or inference." if args.verify_output
          else "No workflow submission requested.")
    print("No model download, existing-service reuse or global interrupt.")
    if not args.run:
        print("Plan only. Use --run to execute.")
        return 0
    repo = Path(__file__).resolve().parent.parent
    recipe = json.loads((repo / "integrations/comfyui/recipe.json").read_text())
    recipe_hash = hashlib.sha256((repo / "integrations/comfyui/recipe.json").read_bytes()).hexdigest()
    lock_hash = hashlib.sha256((repo / "integrations/comfyui/requirements.lock").read_bytes()).hexdigest()
    expected = ":".join((recipe["source"]["revision"], recipe["python"]["sha256"], lock_hash, recipe_hash))
    for path in (root, root / "tools", tool, tool / "source", tool / "venv", root / "setup-jobs"):
        if path.is_symlink() or not path.is_dir():
            raise RuntimeError(f"Missing or linked product-owned directory: {path}")
    for marker in (tool / ".studio-recipe", tool / ".studio-dependencies-ready", tool / "venv/.studio-recipe"):
        if marker.read_text().strip() != expected:
            raise RuntimeError(f"Dependency recipe mismatch: {marker}")
    if (tool / "source/.studio-archive-sha256").read_text().strip() != recipe["source"]["sha256"]:
        raise RuntimeError("Source archive ownership mismatch")
    with socket.socket() as check:
        check.bind(("127.0.0.1", args.port))  # refuse an occupied port, never adopt it
    run = root / "setup-jobs" / ("comfyui-nodes." + str(uuid.uuid4()))
    run.mkdir(mode=0o700)
    base = run / "comfy-base"
    base.mkdir()
    # --base-directory changes paths but prestartup discovery assumes that the
    # custom_nodes directory already exists, even with no custom nodes installed.
    for name in ("user", "custom_nodes", "models", "input", "output", "temp"):
        (base / name).mkdir()
    command = [str(tool / "venv/bin/python"), "-s", str(tool / "source/main.py"),
               "--cpu", "--listen", "127.0.0.1", "--port", str(args.port),
               "--base-directory", str(base), "--user-directory", str(base / "user"),
               "--disable-auto-launch", "--log-stdout"]
    env = os.environ.copy()
    # Native environment isolation only; no changes to provider/agent tools.
    env.pop("PYTHONHOME", None)
    env.pop("PYTHONPATH", None)
    receipt = {"status": "starting", "command": command, "sourceRevision": recipe["source"]["revision"],
               "recipeSha256": recipe_hash, "lockSha256": lock_hash,
               "probeSourceSha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
               "boundary": "CPU API/node registration and owned server exit only; no model loading, GPU inference, raw-frame output or native job cancellation"}
    proc = None
    start = time.monotonic()
    save(run / "receipt.json", receipt)
    stop_requested = []

    def request_stop(signum, _frame):
        name = signal.Signals(signum).name
        if name not in stop_requested:
            stop_requested.append(name)
        # Do not raise from a signal handler: repeated signals must not bypass
        # or interrupt the bounded finally cleanup after Popen owns a child.

    previous_handlers = {sig: signal.signal(sig, request_stop) for sig in (signal.SIGINT, signal.SIGTERM)}
    # Do not send a localhost request through a user's HTTP proxy.
    http = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def get(route):
        with http.open(f"http://127.0.0.1:{args.port}/{route}", timeout=10) as response:
            return json.load(response)

    try:
        require(not stop_requested, "Probe termination requested before launch")
        with (run / "service.log").open("xb") as log:
            proc = subprocess.Popen(command, cwd=tool / "source", env=env,
                                    stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
            stat = Path(f"/proc/{proc.pid}/stat").read_text().rsplit(")", 1)[1].split()
            receipt["owner"] = {"pid": proc.pid, "processGroupId": int(stat[2]), "startTicks": stat[19],
                                "bootId": Path("/proc/sys/kernel/random/boot_id").read_text().strip()}
            save(run / "receipt.json", receipt)
            deadline = time.monotonic() + 180
            while True:
                require(not stop_requested, "Probe termination requested")
                if proc.poll() is not None:
                    raise RuntimeError(f"Owned service exited during startup: {proc.returncode}")
                try:
                    stats = get("system_stats")
                    break
                except (urllib.error.URLError, TimeoutError, ConnectionError):
                    if time.monotonic() >= deadline:
                        raise TimeoutError("ComfyUI did not become ready in 180 seconds")
                    time.sleep(1)
            # Close the bind/check race: an unrelated listener is never evidence.
            require(not stop_requested, "Probe termination requested")
            require(stats["system"]["argv"] == command[2:], "Endpoint is not our launched service")
            require(stats["system"]["comfyui_version"] == recipe["source"]["version"], "ComfyUI version mismatch")
            require(stats["devices"][0]["type"] == "cpu", "Probe did not select CPU mode")
            save(run / "system-stats.json", stats)
            nodes = get("object_info")
            save(run / "object-info.json", nodes)
            missing = sorted(set(REQUIRED_NODES) - nodes.keys())
            require(not missing, f"Required nodes did not load: {missing}")
            guide = nodes["MiniMaxH3AddGuide"]
            require({"positive", "latent", "frame_idx"} <= guide["input"]["required"].keys(), "Guide required inputs changed")
            require({"audio", "audio_vae"} <= guide["input"]["optional"].keys(), "Guide audio inputs missing")
            require(guide["output"] == ["CONDITIONING"], "Guide output schema changed")
            i2v = nodes["MiniMaxH3ImageToVideo"]
            require({"first_frame", "last_frame"} <= i2v["input"]["optional"].keys(), "Keyframe inputs missing")
            require(i2v["output"] == ["CONDITIONING", "LATENT"], "Image-to-video output schema changed")
            require("minimax" in nodes["CLIPLoader"]["input"]["required"]["type"][0], "MiniMax text encoder type missing")
            require(nodes["SaveImage"]["output_node"] is True, "SaveImage is not an output node")
            require(proc.poll() is None, "Owned service exited during node inspection")
            require(not stop_requested, "Probe termination requested")
            receipt.update(status="nodes-verified", registeredNodeCount=len(nodes), verifiedNodes=list(REQUIRED_NODES),
                           objectInfoSha256=hashlib.sha256((run / "object-info.json").read_bytes()).hexdigest())
            if args.verify_output:
                spec = importlib.util.spec_from_file_location("studio_output_probe", repo / "integrations/comfyui/probe_output.py")
                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)
                module.verify(repo=repo, run=run, tool=tool, get=get, http=http, port=args.port,
                              proc=proc, stop_requested=stop_requested, receipt=receipt, save=save)
    except BaseException as error:
        receipt.update(status="failed", error=f"{type(error).__name__}: {error}")
    finally:
        receipt["stopSignals"] = []
        if proc is not None:
            # Popen retains this child's identity. No service-name/global kills.
            for sig in (signal.SIGINT, signal.SIGTERM, signal.SIGKILL):
                if proc.poll() is not None:
                    break
                receipt["stopSignals"].append(sig.name)
                try:
                    os.killpg(proc.pid, sig)
                except ProcessLookupError:
                    pass
                try:
                    proc.wait(timeout=15)
                except subprocess.TimeoutExpired:
                    continue
            receipt["serviceExitCode"] = proc.poll()
            receipt["ownedServiceExited"] = proc.returncode is not None
        if receipt["status"] in ("nodes-verified", "synthetic-output-verified"):
            receipt["status"] = "passed" if receipt.get("ownedServiceExited") else "reconciling"
        receipt["terminationRequests"] = stop_requested
        if stop_requested and receipt["status"] == "passed":
            receipt.update(status="interrupted", error="Probe termination requested")
        receipt["elapsedSeconds"] = time.monotonic() - start
        save(run / "receipt.json", receipt)
        print(json.dumps(receipt, indent=2))
        print(f"Evidence: {run}")
        for sig, handler in previous_handlers.items():
            signal.signal(sig, handler)
    return 0 if receipt["status"] == "passed" else 1


if __name__ == "__main__":
    sys.exit(main())
