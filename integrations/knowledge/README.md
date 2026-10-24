# Generator knowledge for creative agents — revision 3

These are product-owned task references for the normal Codex/Claude CLI agents,
not a sandbox, replacement system prompt, tool allowlist or response schema.
Agents may research, use their normal tools, inspect relevant context, edit
scores, and write scripts. The launcher supplies the actual project, immutable
user inputs, assigned seeds, paths and timing; these guides explain the native
tools and the evidence the application needs.

- [Music generation](music.md): translating intent to YuE2 and retaining stages.
- [Video generation](video.md): translating intent to H3 and retaining originals.

## Starting context

The launcher identifies `STUDIO_DATA_ROOT` and the installed integration source
root. Do not infer those from a personal Pi skill, a globally latest session,
or another project's files. Start in the supplied project's `workspace/`;
retain attempt-specific scripts, prompts, requests and receipts in distinct run
directories, with stable project notes/references where useful.

Provider evidence is saved under `projects/<id>/workspace/runs/<attempt>/`.
With the supplied coordinator, both native generators write
`projects/<id>/runs/<native-call-id>/receipt.json`. Standalone helpers can use
different layouts: follow the task's actual paths and keep native-call IDs
separate from their parent agent-attempt IDs.

## Recording work without constraining creativity

Before calling a tool, save the resolved prompt/settings, exact input files and
assigned seed strings. Helpers write structured receipts; your response can be
ordinary prose. If you adapt a helper or use your own script, retain equivalent
native-job/process identity, input snapshots, actual settings/seeds, model/code
identity and output hashes. Missing tracking is an explicit integration gap,
not a reason to claim success from a final message alone.

For a new variation use new application-assigned seeds. Retry/Restart preserves
the failed call's captured inputs and seeds; it is not fresh interpretation.
Keep earlier attempts and their failure evidence. Numbers in JSON may lose
precision in JavaScript: retain seeds as strings until the native Python call.

## Current execution boundary

The installed toolchain supports the song-to-video workflow, including durable
native-call scheduling, owned systemd process tracking and captured requests.
A recorded Dundee run exercised fresh setup, music, H3 continuation and export;
that is evidence for that configuration, not a guarantee for every duration,
prompt, hardware combination or musical/visual outcome.

Native work shares one GPU queue. Helpers report their own jobs and artifacts;
the coordinator additionally observes process/resource release. Work deliberately
moved outside an owned unit is not automatically tracked. Retain evidence and
report integration gaps rather than describing an unobserved call as complete.

When the task supplies a coordinator origin, use `scripts/native-call.ts`
with the captured project, parent attempt, tool and native request file. The
server snapshots inputs, runs the isolated helper and waits for verified native
release. Both tools write `projects/<id>/runs/<native-call-id>/receipt.json` in
that mode. Keep exact request IDs/seeds and inspect both coordinator status and
native receipts. Client output is tool data, not a required agent reply format.
Alternative scripts can call the same internal endpoint; normal tools remain
available. A transport timeout does not mean the job stopped: inspect its ID,
never blindly create another expensive call. For historical direct-helper
experiments, await process exit and independently verify release before the
next GPU generator. Do not mistake a receipt written before exit for resource release.
If identity/outcome is uncertain, report it and leave the next heavy stage
undispatched; never stop unrelated processes or the user's personal Comfy.
This is the task's resource-sharing protocol, not a restriction on agent tools.

The 22 October Codex attempt captured and used these guides. Its immutable
copies and hashes are retained with the attempt; this README has since changed
to record the outcome. Every launch must capture exact bytes and hashes rather
than relying on this revision label. See [the evidence and remaining
failure](../../devpost/slice-1-progress.md).

## Supervised real-media probe

`scripts/provider-media-proof.ts` prepares a fixed small creative brief for
`codex` or `claude`. Without `--run` it only prints a plan; it writes nothing and
starts no provider. On Dundee, after the pinned runtime, authenticated provider,
isolated native tools and model assets are verified, the explicit live command
consumes provider credits/GPU time and creates fresh media. Do not run it
concurrently with other studio GPU jobs. The H3 observation repair has local regression and direct native replay
evidence; a clean full provider-task rerun is still required before calling
this a repeatable end-to-end integration proof.

From the reviewed source checkout on Dundee, using the intended absolute root:

```sh
export STUDIO_DATA_ROOT="$HOME/.local/share/music-video-studio"
NODE_BIN="$STUDIO_DATA_ROOT/tools/runtime/node-v24.22.0-linux-x64/bin"
CLI_BIN="$STUDIO_DATA_ROOT/tools/provider-cli/codex-0.163.0_claude-2.1.306/node_modules/.bin"
PATH="$NODE_BIN:$CLI_BIN:$PATH" "$NODE_BIN/node" scripts/provider-media-proof.ts codex
# Only when deliberately authorising the real task; use the actual GPU UUID:
export STUDIO_GPU_UUID="GPU-your-verified-device-uuid"
PATH="$NODE_BIN:$CLI_BIN:$PATH" STUDIO_LIVE=1 "$NODE_BIN/node" scripts/provider-media-proof.ts codex --run
```

The PATH prefix selects installed pins without deleting ordinary user tools or
configuration. `STUDIO_DATA_ROOT` takes precedence over
`$XDG_DATA_HOME/music-video-studio`, then `~/.local/share/music-video-studio`;
the resulting root must be absolute. There is no installation/sign-in side
effect or automatic generation retry. Each execution is a new candidate, not
faithful replay of a failed one.

The original experiment was hosted in a transient user service to survive SSH
disconnection. The current command starts the shared native coordinator on
loopback port 9122, with a 3,600-second limit per native helper. Do not start it
alongside another studio server or an independent proof GPU worker. Its queue
persists calls; it does not automatically reconcile an interrupted server's
retained lease. It is still an internal proof, not the finished browser API. A successful provider exit means only
`provider-exited-awaiting-independent-validation`. Independently verify session
identity, tool calls, inputs/seeds, artifacts and owned-resource release before
claiming a media-chain pass. Natural-language failure/recovery reports may be
perfectly legitimate successful CLI exits.
