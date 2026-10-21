# Generator knowledge for creative agents — revision 1

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

The current proof helpers have different run layouts: the provider uses
`projects/<id>/workspace/runs/<attempt>/`; H3 writes
`projects/<id>/runs/<attempt>/`; YuE2 uses the caller's explicit result path.
Record actual paths rather than pretending these are already one artifact
registry. Runtime layout convergence belongs to the durable integration.

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

Both native generators have produced media independently on Dundee. A first
Codex-driven task also generated a fresh song and H3 media, then recovered a
validation export after the H3 helper's completion-observation timeout. That
attempt remains failed; recovered files do not turn it into a clean pipeline
pass. A later direct same-input replay using the repaired helper completed
with full history and identical media; it did not rerun the provider task.
The durable shared GPU scheduler, arbitrary-descendant tracking and native
cancellation API are not implemented/proved. The temporary H3 lock only
serializes H3 proof helpers; it is not a cross-tool lease.

For the supervised sequential integration proof, await each generator's real
process exit and independently verify release before starting another GPU
generator. Do not mistake a receipt written before exit for resource release.
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
# Only when deliberately authorising the real task:
PATH="$NODE_BIN:$CLI_BIN:$PATH" STUDIO_LIVE=1 "$NODE_BIN/node" scripts/provider-media-proof.ts codex --run
```

The PATH prefix selects installed pins without deleting ordinary user tools or
configuration. `STUDIO_DATA_ROOT` takes precedence over
`$XDG_DATA_HOME/music-video-studio`, then `~/.local/share/music-video-studio`;
the resulting root must be absolute. There is no installation/sign-in side
effect or automatic generation retry. Each execution is a new candidate, not
faithful replay of a failed one.

The live experiment was hosted in an explicitly started transient user service
so an SSH disconnect would not end it; that is not the future durable scheduler
or a browser job API. The foreground command above does not provide restart
reconciliation. A successful provider exit means only
`provider-exited-awaiting-independent-validation`. Independently verify session
identity, tool calls, inputs/seeds, artifacts and owned-resource release before
claiming a media-chain pass. Natural-language failure/recovery reports may be
perfectly legitimate successful CLI exits.
