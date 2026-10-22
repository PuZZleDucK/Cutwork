# Shared GPU lane — fast-mode implementation scratchpad

## Request and decisions

Implement spec C4's actual persisted FIFO lane now, using the approved SQLite
single-app-writer design. This is native-call scheduling inside an attempt, not a
replacement for the project/agent state machine. Preserve resolved seeds and
inputs; restarting the app must never replay an expensive call automatically.
Standing fast-mode approval covers this tests-first implementation and verification.

There are no new product questions. Native release remains an adapter obligation:
a database transaction or a descriptive evidence assessment cannot prove it.
Ordinary agents retain their tools and capabilities. Only cooperating, registered
calls participate; no claim is made about policing arbitrary agent scripts.

## Tests before implementation

- [x] SQLite WAL/version, durable FIFO and idempotent immutable submissions.
- [x] Contending claimers cannot both hold the lane; stale tokens cannot mutate it.
- [x] Persist launch intent before invocation, then native acknowledgement.
- [x] Cancellation freezes further submissions and never launches queued work.
- [x] Active cancellation/reconciliation holds the lease until adapter cleanup evidence.
- [x] Completion/cancel race has one serialized winner; no late success placement.
- [x] Restart preserves uncertain work without automatic release/replay (database checks).
- [x] Maintenance excludes active work on that tool; FIFO does not bypass it.
- [x] Worker hands off only after adapter cleanup evidence, including failures.
- [x] Real SQLite/process integration on Kunlun and Dundee, CPU fixtures only.
- [ ] Dundee real-model cancellation, CUDA release and handoff proof.

## Scope of evidence

Contract tests with injected adapters prove queue/worker decisions only. A local
CPU child proves process lifecycle only. Neither is GPU unloading, model cancellation,
fresh-host support, or completion of slice 1/G4. Native outcomes are recorded below
as they actually occur; failures remain failures rather than waived gates.

## Implementation and review — 23 October 2026

`gpu-queue.ts` persists calls, immutable inputs, events, frozen attempts, the
single fenced lease, and per-tool maintenance locks. SQLite transactions serialize
claim/finish/cancel; they never execute or retry a generator. `gpu-worker.ts`
drives the trusted adapter. `systemd-gpu.ts` owns each supplied native helper in
a uniquely named transient user unit, including ordinary descendants that create
their own process groups. This is lifecycle ownership, not an agent sandbox:
creative agents remain outside these units, with their normal tools and access.

The supervisor waits behind a file gate until the actual invocation/process owner
has been committed. Full gate contents are atomically published without replacement.
An independent reviewer reproduced cancellation between launch intent and owner
acknowledgement; the fixed callback refreshes cancellation before opening the gate.
The regression remains in `gpu-worker-review.test.ts`.

Native execution deadlines are explicit adapter inputs, retained in the plan and
enforced both by the unit and worker. They are not clip-duration caps. The proof
uses 30-second unit limits, separate fixture watchdogs, cancellation on parent
signals, and nested-finally cleanup. Forced-parent-death/timeout injection has not
yet been performed. See the official [systemd service](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html)
and [process cleanup](https://www.freedesktop.org/software/systemd/man/latest/systemd.kill.html)
contracts for the lifecycle options used.

## Verified CPU lifecycle checkpoint

- Dependency: better-sqlite3 **13.0.3**, embedded SQLite **3.53.4**, verified with
  `npm ci --ignore-scripts` on pinned Dundee Node **24.22.0**. WAL and FULL
  synchronous mode checked. No host Python/package changes.
- Typecheck and **484/484** default tests passed on Dundee. The 38 new assertions
  include separate-process SQLite contention and the cancellation regression.
- Exact snapshot: `gpu-lane.8c272f27-02a9-4cd6-a0b7-0984b637d75d`, 146 source files;
  archive SHA-256 `ad7a32fd27bfad1818c9ec7289c1cae95c05a637d11418442eca09e89dbcaf15`.
- Opt-in CPU test: **1/1 passed**, 3.02 seconds test-run duration; enclosing service
  exit 0, 157.5 MiB peak RAM, zero swap. Six actual native fixture units exercised
  ordered handoff, active descendant cancellation, and deliberate GPU-query failure.
- Cancellation confirmations: **157.96 ms** and **169.99 ms** for CPU fixtures,
  not YuE2/H3. Two cancelled queued calls never invoked a helper. A deliberately
  wrong expected GPU UUID retained the reconciliation lease and next queued call.
- Independent review rechecked source/archive hashes, all six units/cgroups and
  30 recorded fixture/query/sentinel PIDs gone, and the unrelated personal Comfy
  process identity unchanged with the same 234 MiB GPU listing and port 8188.
- Local evidence: `.local-evidence/slice-1/gpu-lane/dundee-cpu/`. The preceding
  Kunlun CPU run is separate, older-source evidence, not substituted for Dundee.

Initial preflight could not inspect `/proc/1/ns/pid` as the service user. That
failure is retained, not presented as namespace certification. Resource reasoning
is limited to ordinary owned cgroups and direct host CUDA PID attribution; MPS,
GPU proxies, hidden PID namespaces and deliberately unregistered work are not
supported by these checks. CPU payloads cannot establish real CUDA release.

Slice 1/G4 and the original 12-case live suite remain open. The separately
prepared real-model lane test must pass before claiming model cancellation/handoff.

## First real-model lane run: retained failure and repair

The exact `10f604f` source snapshot on Dundee completed a real YuE2 sample and
a real song-conditioned H3 clip, with native cleanup/release after each. The
return YuE2 helper was killed by `systemd-oomd` during decoder loading. Journal
evidence attributes the kill to sustained host memory pressure, not a proven
VRAM exhaustion. Its unit peaked at 11.9 GiB RAM. A concurrent progress query
timed out, and post-stop GPU observation still contained the helper PID; the
queue correctly retained a reconciliation lease. This run failed and did not
reach either planned active-model cancellation test.

Snapshot: `gpu-model-lane.8b1d2698-d62b-40a5-af11-38ca4211496b`. Failed evidence
is retained locally under `.local-evidence/slice-1/gpu-lane/model-failed/` and
in that immutable remote snapshot. Independent later checks found all owned
PIDs/cgroups gone and personal Comfy unchanged. The old proof database is left
held; that is not an implemented restart-reconciliation feature.

Dundee has 22 GiB system RAM. The learner explicitly approved temporarily
pausing the separate roughly 6 GiB Chatterbox service and restoring it after
verification. Only that identified service was paused; personal Comfy was not
stopped. This is test-host preparation, not product permission to stop other
applications or a fresh-host memory guarantee.

The adapter now allows up to 30 seconds for valid lingering NVML rows to settle
after its verified unit stop, retaining every observation and checking cgroup
emptiness around each. Query/schema/cleanup errors or expiry still hold the
lease. Sixteen focused synthetic assertions cover settling, non-release and
deadline behavior. Progress telemetry separately permits a cleanly terminated
query timeout to be observed again, records the gap, and never treats it as an
empty GPU or as release authority. This repairs premature cleanup assessment;
it does not repair or disguise an OOM-killed generation. The next native run
uses a fresh source snapshot and preserves this failure.

## Retry outcome and focused verification

With the approved TTS pause, the exact `d7e2006` snapshot completed real
YuE2 → H3 → YuE2 generation/release in order. YuE2 cancellation after observed
unfinished semantic inference and owned CUDA attribution completed in about
1.693 seconds. H3 cancellation was also requested after unfinished inference;
its durable call ultimately became cancelled, release evidence passed and no
lease remained. The test itself failed because it continued progress/socket
inspection while the deliberately stopped Comfy owner disappeared. That failed
harness result remains retained, not relabelled as a passing test.

Independent inspection found all 79 remembered model/query PIDs and all five
owned cgroups gone, no H3 reconciliation marker, and personal Comfy unchanged.
The harness now stops progress polling after requesting cancellation and awaits
the independent worker cleanup. A separately named focused H3 cancellation
scenario can reuse the retained song/request without regenerating the three
successful media calls. Its result must still be run and recorded.

## Focused native checkpoints passed

Exact source `93dbb42`, snapshot `native-final.7fa28f31-6fd5-49a5-ae43-95a7cacecffe`:

- Focused real H3 cancellation **1/1 passed**, after observing unfinished native
  inference, its running prompt and owned CUDA PID. Request-to-confirmed-release
  measurement was **3.425 seconds**; no hard immediate-stop latency promise is
  inferred. The earlier full-scenario failure remains retained.
- Actual OOM-failed YuE2 call replay **1/1 passed** through the real HTTP client,
  queue and native worker. Original creative inputs, sampling, execution settings,
  actual stage seeds and helper/model/package identities matched. New call ID
  `7055217e-2c09-4cc0-b1e1-2a9b0c90f932`; original failure remains unchanged.
  This sample is still token-truncated; it is not a completed composition claim.
- Outer service exited 0 in 6m52.722s. Native receipts, logs and queue databases
  are retained under `.local-evidence/slice-1/gpu-lane/final-native/`.
- The replay harness completed normally. SIGINT/SIGTERM injection was not tested;
  a subsequent review added its missing cancellation latch and bounded status
  fetch for future runs. Its owned unit already had a 1,200-second watchdog.

The combined native evidence now covers actual ordered music/video/music release
and queued/running cancellation, rather than just CPU fixtures. Provider-driven
clean media/export verification is still separate and pending; the original
12-case aggregate driver and slice-1 completion are not claimed here.
