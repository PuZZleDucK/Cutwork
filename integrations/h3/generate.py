#!/usr/bin/env python3
"""Opt-in H3 feasibility runner with its own temporary ComfyUI process.

Not the shared durable service/scheduler, agent orchestrator or cancellation API.
--fixture explicitly tests orchestration with synthetic CPU frames instead of
models; it never acts as a fallback after a failed real generation.
"""
import argparse
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid


HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent


def load(name):
    spec = importlib.util.spec_from_file_location("studio_h3_"+name, HERE / (name+".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


media, workflow = load("media"), load("workflow")
require, save = media.require, media.save


def read_json(http, url, timeout):
    """Bound the entire GET/body parse, not only socket inactivity (Linux main thread).

    urllib's socket timeout alone allows a trickling body to hold the reader
    indefinitely. This helper owns its alarm, restores the handler, and refuses
    to replace another active timer. It never wraps a native submission POST.
    """
    require(timeout > 0, "Positive observation timeout required")
    require(signal.getitimer(signal.ITIMER_REAL) == (0.0, 0.0), "Observation alarm already in use")

    def expired(_signum, _frame):
        raise TimeoutError("Read-only observation response deadline exceeded")

    previous = signal.signal(signal.SIGALRM, expired)
    try:
        signal.setitimer(signal.ITIMER_REAL, timeout)
        with http.open(url, timeout=timeout) as response:
            return json.load(response)
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, previous)


def process_identity(pid):
    fields = Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()
    return {"pid": pid, "processGroupId": int(fields[2]), "startTicks": fields[19],
            "bootId": Path("/proc/sys/kernel/random/boot_id").read_text().strip()}


def group_members(group):
    found = []
    for entry in Path("/proc").iterdir():
        if entry.name.isdecimal():
            try:
                value = process_identity(int(entry.name))
                if value["processGroupId"] == group:
                    value["state"] = (entry / "stat").read_text().rsplit(")", 1)[1].split()[0]
                    found.append(value)
            except (FileNotFoundError, ProcessLookupError, PermissionError):
                pass
    return found


def exit_observation(proc):
    # Keep the leader unreaped until its whole group has stopped. Its reserved
    # PID anchors the group identity even when the leader exits before children.
    return os.waitid(os.P_PID, proc.pid, os.WEXITED | os.WNOHANG | os.WNOWAIT)


def stop_owned_group(proc, owner, timeout=15):
    result = {"stopSignals": []}
    try:
        require(owner is not None and process_identity(proc.pid) == owner, "Owned process identity unavailable/changed before cleanup")
        for sig in (signal.SIGINT, signal.SIGTERM, signal.SIGKILL):
            active = [p for p in group_members(proc.pid) if p["state"] not in ("Z", "X")]
            if not active:
                break
            require(process_identity(proc.pid) == owner, "Owned group anchor changed during cleanup")
            result["stopSignals"].append(sig.name)
            try:
                os.killpg(proc.pid, sig)
            except ProcessLookupError:
                pass
            deadline = time.monotonic()+timeout
            while time.monotonic() < deadline:
                if not any(p["state"] not in ("Z", "X") for p in group_members(proc.pid)):
                    break
                time.sleep(0.05)
        result["remainingGroupMembers"] = group_members(proc.pid)
        active = [p for p in result["remainingGroupMembers"] if p["state"] not in ("Z", "X")]
        if not active:
            # /proc can expose Z briefly before waitid reports a waitable exit
            # (observed with threaded Comfy shutdown). Keep the PID anchor and
            # wait boundedly rather than misreport a clean stop as unresolved.
            deadline = time.monotonic()+timeout
            observed = exit_observation(proc)
            while observed is None and time.monotonic() < deadline:
                time.sleep(0.05)
                observed = exit_observation(proc)
            if observed is not None:
                result["serviceExitCode"] = proc.wait(timeout=1)
        result["ownedServiceExited"] = proc.returncode is not None and not active
    except Exception as error:
        result.update(cleanupError=f"{type(error).__name__}: {error}", ownedServiceExited=False)
    return result


def gpu_processes():
    raw = subprocess.check_output(["nvidia-smi", "--query-compute-apps=pid,used_memory", "--format=csv,noheader,nounits"], timeout=10, text=True)
    result = []
    for line in raw.splitlines():
        pid, memory = [p.strip() for p in line.split(",")]
        result.append({"pid": int(pid), "usedMiB": int(memory) if memory.isdecimal() else None})
    return result


def verify_installation(root):
    tool = root / "tools/comfyui"
    recipe_path = REPO / "integrations/comfyui/recipe.json"
    lock_path = REPO / "integrations/comfyui/requirements.lock"
    recipe = json.loads(recipe_path.read_text())
    recipe_hash, lock_hash = media.sha256(recipe_path), media.sha256(lock_path)
    expected = ":".join((recipe["source"]["revision"], recipe["python"]["sha256"], lock_hash, recipe_hash))
    for path in (tool, tool / "source", tool / "venv"):
        require(path.is_dir() and path.absolute() == path.resolve(), "Missing or linked product-owned ComfyUI installation")
    for marker in (tool / ".studio-recipe", tool / ".studio-dependencies-ready", tool / "venv/.studio-recipe"):
        require(marker.read_text().strip() == expected, "Comfy dependency recipe marker differs")
    require((tool / "source/.studio-archive-sha256").read_text().strip() == recipe["source"]["sha256"], "Comfy source identity differs")
    return tool, recipe, {"recipeSha256": recipe_hash, "lockSha256": lock_hash}


def verify_models(root, receipt, persist):
    manifest_path = HERE / "models.json"
    manifest_hash = media.sha256(manifest_path)
    manifest = json.loads(manifest_path.read_text())
    lock_path = root / "models/.h3-install.lock"
    require(lock_path.is_file() and lock_path.absolute() == lock_path.resolve(), "Model installation lock is missing or linked")
    receipt["modelManifestSha256"] = manifest_hash
    receipt["verifiedModels"] = []
    directory = None
    with lock_path.open("r") as lock:
        fcntl.flock(lock, fcntl.LOCK_SH | fcntl.LOCK_NB)  # never race the active downloader
        for model in manifest["models"]:
            base = root / "models/h3" / model["repository"].split("/")[1] / model["revision"]
            require(base.absolute() == base.resolve(), "Linked model directory")
            require((base / ".studio-model-manifest").read_text().strip() == manifest_hash, "Model ownership/pin differs")
            for item in model["files"]:
                path = base / item["path"]
                require(path.absolute() == path.resolve() and path.is_file(), "Model asset is missing or linked")
                require(path.stat().st_size == item["bytes"] and media.sha256(path) == item["sha256"], f"Incomplete or changed model: {path}")
                receipt["verifiedModels"].append({"path": str(path), "sha256": item["sha256"], "bytes": item["bytes"]})
                persist()
            if model["role"] == "weights":
                directory = base
    require(directory is not None, "No weights directory in model manifest")
    return directory


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--request", type=Path, required=True)
    parser.add_argument("--run", action="store_true")
    parser.add_argument("--fixture", action="store_true")
    parser.add_argument("--port", type=int, default=8198)
    parser.add_argument("--timeout-seconds", type=int, default=3600)
    args = parser.parse_args()
    require(1024 <= args.port <= 65535 and args.timeout_seconds > 0, "Invalid port or execution timeout")
    raw = args.request.read_bytes()
    request = json.loads(raw)
    require(request["schemaVersion"] == 1, "Unsupported request version")
    attempt = str(uuid.UUID(request["attemptId"]))
    require(attempt == request["attemptId"], "Attempt ID must be a canonical UUID")
    project = request["projectId"]
    require(isinstance(project, str) and re.fullmatch(r"[A-Za-z0-9_-]+", project), "Invalid project directory ID")
    plan = media.validate_plan(request["plan"])
    graph = workflow.h3_graph(prompt=request["prompt"], seed=request["seed"], frames=plan["nativeFrames"], audio_filename="conditioning.wav",
                              first_frame_filename="continuation.png" if "firstFrame" in request else None)
    if args.fixture:
        require("firstFrame" not in request, "Synthetic fixture cannot prove image-conditioned native inference")
        require(plan["nativeFrames"] == 56, "The explicit synthetic fixture has exactly 56 frames")
        graph = workflow.synthetic_graph("conditioning.wav")
    root = Path(os.environ.get("STUDIO_DATA_ROOT", str(Path(os.environ.get("XDG_DATA_HOME", str(Path.home() / ".local/share"))) / "music-video-studio")))
    require(root.is_absolute(), "STUDIO_DATA_ROOT must be absolute")
    root = root.resolve()
    workspace = root / "projects" / project / "workspace"
    run = root / "projects" / project / "runs" / attempt
    print(f"Plan: {'SYNTHETIC CPU fixture' if args.fixture else 'REAL H3 GPU generation'}; evidence {run}", flush=True)
    print(f"Requested {plan['requestedFrames']} frames; native {plan['nativeFrames']} at 24 fps. Temporary owned loopback service.", flush=True)
    if not args.run:
        print("Plan only. Use --run explicitly; no work has been submitted.")
        return 0
    os.umask(0o077)
    require(run.absolute() == run.resolve() and workspace.absolute() == workspace.resolve(), "Linked project/run path")
    workspace.mkdir(parents=True, exist_ok=True)
    run.parent.mkdir(parents=True, exist_ok=True)
    run.mkdir()  # never reuse an attempt, even a failed one
    os.chdir(workspace)
    (run / "request.json").write_bytes(raw)
    save(run / "workflow-api.json", graph)
    receipt = {"schemaVersion": 1, "attemptId": attempt, "projectId": project,
               "state": "preparing", "synthetic": args.fixture, "cwd": str(workspace),
               "helperProcess": process_identity(os.getpid()), "requestSha256": media.sha256(run / "request.json"),
               "sourceHashes": {name: media.sha256(HERE / name) for name in ("generate.py", "workflow.py", "media.py")},
               "startedUnix": time.time(), "plan": plan,
               "boundary": "Synthetic CPU orchestration only; no H3 model execution" if args.fixture else
                           "Direct native helper; not provider orchestration, shared scheduler, native cancellation or final edit export"}
    persist = lambda: save(run / "receipt.json", receipt)
    persist()
    proc, owner, proof_lock, monitor = None, None, None, None
    reconciliation = root / "tools/.h3-proof-reconciling.json"
    stop = []
    observer_stop = threading.Event()
    start = time.monotonic()
    http = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def stopping(signum, _frame):
        if signal.Signals(signum).name not in stop:
            stop.append(signal.Signals(signum).name)

    previous = {s: signal.signal(s, stopping) for s in (signal.SIGINT, signal.SIGTERM)}

    def check():
        require(not stop, "Termination requested; process exit still requires observation")
        if proc is not None:
            observed = exit_observation(proc)
            require(observed is None, f"Owned Comfy process exited: {observed}")

    def get(route, timeout=10):
        return read_json(http, f"http://127.0.0.1:{args.port}/{route}", timeout)

    def remaining(deadline):
        check()
        seconds = deadline-time.monotonic()
        if seconds <= 0:
            raise TimeoutError("Native observation deadline exceeded")
        return seconds

    def observe_json(route, deadline):
        # Read-only observations of the already persisted job. Submission is
        # deliberately outside this function: a timed-out POST may be accepted.
        while True:
            timeout = min(10, remaining(deadline))
            try:
                value = get(route, timeout=timeout)
            except (urllib.error.URLError, TimeoutError, ConnectionError) as error:
                # HTTPError subclasses URLError, but is not a transport timeout.
                reason = error.reason if isinstance(error, urllib.error.URLError) else error
                if isinstance(error, urllib.error.HTTPError) or not isinstance(reason, (TimeoutError, ConnectionError)):
                    raise
                receipt.setdefault("observationErrors", []).append({
                    "route": route, "promptId": receipt["promptId"], "unix": time.time(),
                    "requestTimeoutSeconds": timeout,
                    "error": f"{type(error).__name__}: {error}"})
                persist()  # even a later stop/deadline keeps the failed read
                time.sleep(min(1, remaining(deadline)))
                continue
            remaining(deadline)  # a late response or intervening stop is not success
            return value

    def observe():
        with (run / "resources.jsonl").open("x") as log:
            while not observer_stop.is_set():
                row = {"monotonicSeconds": time.monotonic()-start, "unix": time.time()}
                try:
                    row["gpuProcesses"] = gpu_processes()
                    status = Path(f"/proc/{proc.pid}/status")
                    if status.exists():
                        row["memory"] = {key: value.strip() for key, value in
                                          (line.split(":", 1) for line in status.read_text().splitlines())
                                          if key in ("VmRSS", "VmHWM", "VmSwap")}
                    row["availableMemory"] = next(line for line in Path("/proc/meminfo").read_text().splitlines() if line.startswith("MemAvailable:"))
                except Exception as error:
                    row["observationError"] = f"{type(error).__name__}: {error}"
                log.write(json.dumps(row)+"\n")
                log.flush()
                observer_stop.wait(2)

    try:
        tool, recipe, pins = verify_installation(root)
        receipt.update(pins, sourceRevision=recipe["source"]["revision"])
        lock_path = root / "tools/.h3-proof.lock"
        require(lock_path.absolute() == lock_path.resolve(), "Linked H3 proof lock")
        proof_lock = lock_path.open("a")
        fcntl.flock(proof_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        require(not reconciliation.exists() and not reconciliation.is_symlink(), "Previous owned work needs reconciliation; see .h3-proof-reconciling.json")
        model_directory = None if args.fixture else verify_models(root, receipt, persist)
        check()
        receipt["conditioning"] = media.prepare_conditioning(request["song"], plan, run / "inputs")
        if "firstFrame" in request:
            receipt["firstFrame"] = media.prepare_first_frame(request["firstFrame"], run / "inputs", tool / "venv/bin/python", root / "projects" / project)
        base = run / "comfy-base"
        base.mkdir()
        for name in ("user", "custom_nodes", "models", "input", "output", "temp"):
            (base / name).mkdir()
        shutil.copyfile(receipt["conditioning"]["path"], base / "input/conditioning.wav")
        require(media.sha256(base / "input/conditioning.wav") == receipt["conditioning"]["sha256"], "Native audio input copy changed")
        if "firstFrame" in receipt:
            shutil.copyfile(receipt["firstFrame"]["path"], base / "input/continuation.png")
            require(media.sha256(base / "input/continuation.png") == receipt["firstFrame"]["sha256"], "Native continuation input copy changed")
        command = [str(tool / "venv/bin/python"), "-s", str(tool / "source/main.py"),
                   "--listen", "127.0.0.1", "--port", str(args.port), "--base-directory", str(base),
                   "--user-directory", str(base / "user"), "--disable-auto-launch", "--log-stdout"]
        command += ["--cpu"] if args.fixture else ["--models-directory", str(model_directory)]
        receipt.update(command=command, state="starting-service", gpuBefore=gpu_processes())
        persist()
        with socket.socket() as available:
            available.bind(("127.0.0.1", args.port))  # refuse another listener
        env = os.environ.copy()
        env.pop("PYTHONHOME", None)
        env.pop("PYTHONPATH", None)  # native venv isolation, not an agent policy
        check()
        with (run / "service.log").open("xb") as log:
            proc = subprocess.Popen(command, cwd=tool / "source", env=env, stdout=log,
                                    stderr=subprocess.STDOUT, start_new_session=True)
        owner = process_identity(proc.pid)
        receipt["owner"] = owner
        persist()
        monitor = threading.Thread(target=observe, daemon=True)
        monitor.start()
        deadline = time.monotonic()+180
        while True:
            check()
            try:
                stats = get("system_stats")
                break
            except (urllib.error.URLError, TimeoutError, ConnectionError):
                if time.monotonic() > deadline:
                    raise TimeoutError("Owned service did not become ready in 180 seconds")
                time.sleep(0.5)
        require(stats["system"]["argv"] == command[2:] and stats["system"]["comfyui_version"] == recipe["source"]["version"],
                "Endpoint identity/version differs from the owned service")
        require(stats["devices"][0]["type"] == ("cpu" if args.fixture else "cuda"), "Unexpected execution device; no fallback")
        save(run / "system-stats.json", stats)
        nodes = get("object_info")
        save(run / "object-info.json", nodes)
        require(all(n["class_type"] in nodes for n in graph.values()), "Required workflow node missing")
        receipt.update(state="submitting", clientId=str(uuid.uuid4()))
        persist()
        check()
        native_request = urllib.request.Request(f"http://127.0.0.1:{args.port}/prompt", method="POST",
            data=json.dumps({"prompt": graph, "client_id": receipt["clientId"]}).encode(), headers={"Content-Type": "application/json"})
        try:
            with http.open(native_request, timeout=30) as response:
                submitted = json.load(response)
        except urllib.error.HTTPError as error:
            (run / "submission-error.txt").write_bytes(error.read())
            raise
        save(run / "submission.json", submitted)
        receipt.update(state="running", promptId=submitted["prompt_id"], submittedUnix=time.time())
        persist()  # native ID on disk before observing job completion
        deadline = time.monotonic()+args.timeout_seconds
        while True:
            history = observe_json("history/"+receipt["promptId"], deadline)
            require(isinstance(history, dict), "Invalid native history response")
            if history:
                save(run / "history.json", history)
                require(set(history) == {receipt["promptId"]}, "Native history belongs to a different prompt")
                result = history[receipt["promptId"]]
                require(result["prompt"][1] == receipt["promptId"], "Native history prompt identity differs")
                break
            time.sleep(min(1, remaining(deadline)))
        receipt["outputs"] = media.collect_outputs(result=result, graph=graph, run=run, output=base / "output",
                                                   python=tool / "venv/bin/python", plan=plan, synthetic=args.fixture)
        queue = observe_json("queue", deadline)
        save(run / "queue-after.json", queue)
        require(all(isinstance(queue[key], list) for key in ("queue_running", "queue_pending")), "Invalid native queue response")
        require(all(item[1] != receipt["promptId"] for key in ("queue_running", "queue_pending") for item in queue[key]), "Completed prompt still appears in queue")
        # The observed native graph, not a rounded agent response, is the seed evidence.
        receipt["actualSeeds"] = {} if args.fixture else {"h3": str(result["prompt"][2]["9"]["inputs"]["noise_seed"])}
        if not args.fixture:
            require(receipt["actualSeeds"] == {"h3": request["seed"]}, "Observed seed differs from assigned seed")
        check()
        receipt["state"] = "validated-awaiting-owned-exit"
    except BaseException as error:
        receipt.update(state="interrupted" if stop else "failed", error=f"{type(error).__name__}: {error}")
    finally:
        receipt["stopSignals"] = []
        if proc is not None:
            receipt.update(stop_owned_group(proc, owner))
        observer_stop.set()
        if monitor is not None:
            monitor.join(timeout=12)
            receipt["observerExited"] = not monitor.is_alive()
        try:
            receipt["gpuAfter"] = gpu_processes()
            receipt["ownedGpuProcessAbsent"] = proc is not None and all(p["pid"] != proc.pid for p in receipt["gpuAfter"])
        except Exception as error:
            receipt["gpuAfterError"] = str(error)
        if receipt["state"] == "validated-awaiting-owned-exit":
            receipt["state"] = "succeeded" if receipt.get("ownedServiceExited") and receipt.get("ownedGpuProcessAbsent") and receipt.get("observerExited") else "reconciling"
        if stop:
            receipt["state"] = "interrupted" if proc is None or receipt.get("ownedServiceExited") else "reconciling"
        if proc is not None and not receipt.get("ownedServiceExited"):
            receipt["stateBeforeReconciliation"] = receipt["state"]
            receipt["state"] = "reconciling"
        receipt.update(terminationRequests=stop, elapsedSeconds=time.monotonic()-start, finishedUnix=time.time())
        try:
            if proc is not None and not receipt.get("ownedServiceExited"):
                # A flock disappears on helper exit. Persist unresolved work so
                # the next proof cannot silently dispatch alongside it.
                save(reconciliation, {"attemptId": attempt, "run": str(run), "owner": owner,
                                      "remainingGroupMembers": receipt.get("remainingGroupMembers"),
                                      "reason": receipt.get("cleanupError", "Owned group exit unconfirmed")})
            persist()
        finally:
            if proof_lock is not None:
                proof_lock.close()
            for sig, handler in previous.items():
                signal.signal(sig, handler)
    print(json.dumps(receipt, indent=2), flush=True)
    print(f"Evidence: {run}", flush=True)
    return 0 if receipt["state"] == "succeeded" else 1


if __name__ == "__main__":
    sys.exit(main())
