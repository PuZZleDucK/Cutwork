# Native helper HTTP integration — fast-mode checkpoint

## Request and boundary

Connect ordinary creative-agent tool calls to the durable shared GPU lane.
Keep normal CLI permissions and tools; the native JSON payload is a tool input,
not an agent answer schema. This is slice 1's internal server bootstrap, not a
finished studio UI, public/headless API, project store, or setup screen.

## Implementation

- Fastify 5.12.7 handles exact immutable native submissions, status and attempt
  cancellation. Same-origin/Host checks protect browser mutation boundaries;
  trusted native clients may omit Origin. No user accounts or permissive CORS.
- `native-coordinator.ts` owns one SQLite queue, worker and actual HTTP listener.
  Closing a browser/client changes no server state. Deliberate server shutdown
  freezes dispatch immediately and requests cleanup only for its own worker's
  active call; queued work remains durable. A retained startup lease is visibly
  reconciling, not automatically cleared or replayed.
- `native-command.ts` writes exclusive request snapshots and resolves the
  isolated Python helpers, private H3 port and project-specific workspace.
  Arbitrary shell commands are not accepted through these native endpoints;
  creative agents retain their normal independent shell/research tools.
- `scripts/native-call.ts` submits once, waits and returns the recorded outcome.
  Lost responses never cause automatic resubmission. Caller cancellation sends
  durable cancellation even if a submission response was lost; transport failure
  is explicitly uncertain. A tracking timeout does not claim native work stopped.
- `scripts/native-coordinator.ts` is an executable internal integration entry
  point with an explicit parent-attempt registry. The provider media proof now
  starts this same coordinator implementation and supplies its exact parent
  validation instead of manually coordinating direct generator processes.

## Tests and review

Tests were written before each implementation/review repair. Real loopback HTTP,
SQLite and client polling are exercised with explicitly synthetic native adapters;
these do not claim GPU or provider execution. Tests cover exact seed strings,
conflicts, malformed JSON/UTF-8, Host/Origin, parent validation, actual socket
submission/polling, persistence, held leases and shutdown.

Independent review found and reproduced three lifecycle defects: dispatch could
continue while HTTP requests drained, shutdown could cancel another worker's
lease, and a caller abort during a lost response could omit cancellation. These
now have retained red/green regression assertions. Client deadlines also bound
transport/body waits and reject late completion. The standalone coordinator has
no administrative release endpoint: only verified internal cleanup releases a
native lease. Restart recovery remains an open integration task.

**Verified locally:** typecheck and all **579 default tests** pass; the separate
provider-plan diagnostic has **5/5** passing cases. Actual HTTP assertions use
real sockets, not Fastify injection alone. No live provider success is inferred
from these fixture results.

Native model evidence remains separate in [gpu-lane-build.md](gpu-lane-build.md).
The new provider/coordinator path must be run and independently inspected before
claiming a clean agent-driven media chain. No slice or G4 box is checked here.

## Developer entry points

The explicit registry is an array of `{id, projectId, tools}` parent attempts,
where tools contains `yue2` and/or `h3`. IDs/settings must match the captured
native request. Paths below are placeholders for a reviewed local runtime.

```sh
node scripts/native-coordinator.ts \
  --runtime /absolute/studio-runtime \
  --registry /absolute/attempts.json \
  --database /absolute/studio-runtime/jobs/gpu-queue.sqlite \
  --gpu-uuid GPU-actual-verified-uuid

node scripts/native-call.ts http://127.0.0.1:9122 \
  PROJECT PARENT_ATTEMPT yue2 /absolute/native-request.json
```

Native execution is limited to 3,600 seconds by this entry point, shown on
startup and captured in each launch plan; it is not a clip-duration cap.
Listening on LAN additionally requires an explicit host/port allowlist. The
default internal proof binds loopback only. Stop it with SIGINT/SIGTERM; shutdown
waits for the adapter's bounded cleanup rather than deleting job records.

A separate explicit live check, `tests/live/gpu-failed-replay.test.ts`, is now
prepared to retry the genuinely OOM-killed YuE2 call. It verifies the retained
failed unit result, original request hash and actual stage seeds before launch,
then uses this HTTP coordinator to replay identical creative/native inputs under
a new call identity. It compares actual helper/model/package versions and seeds;
it does not promise byte-identical output. Typecheck and safe collection pass;
its native outcome will be recorded only after execution.

`scripts/verify-media-proof.ts` prepares independent post-run assertions against
native call rows, exclusive request hashes, helper/owned-unit receipts, actual
FFprobe/FFmpeg decoding, every original PNG/hash, the shared pre-encode graph
branch and the full-song H.264/AAC export. It does not use an agent's success
message as media evidence. The updated provider run must supply its first
real input before this checker can report an end-to-end result.

The genuine failed-call replay has now passed on Dundee through an actual HTTP
listener/client/native worker, not a fixture. See the native checkpoint above.
Both provider capability checks were also freshly rerun and independently
verified against their native sessions (`gpt-6.1-sol`, `claude-opus-5-5`), with
real research/tool use and executed score/timing artifacts. These small tasks
are not a provider-generated media-chain proof. The replay used source
`93dbb42`; the fresh provider capability tasks used `d7e2006`. The local private
evidence bundles retain their exact runs.

Review added a termination latch to the replay scenario and fixed an explicit
192-kbit/s AAC setting in the next validation-export brief, enabling an
independent reference encode comparison rather than guessing encoder settings.

## Clean real-provider result

The new real Codex task now passed through this HTTP coordinator and shared
SQLite lane, generating a fresh non-truncated song, conditioned H3 clip and
independently verified export. Both native calls retained successful owned-unit
release evidence. See the [final native evidence map](slice-1-native-evidence.md).
This closes the developer-facing integration proof, not the future browser/API
project lifecycle or server-restart reconciliation features.
