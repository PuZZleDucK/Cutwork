# Working on Cutwork

Cutwork is a proof of concept, not a production multi-user service. Please keep
changes small, explain the behaviour they change, and preserve the distinction
between offline tests and real generation evidence.

## Local development

1. Use Ubuntu x86_64 and Node 24 (the app bootstrap pins a concrete version).
2. Run `npm ci --ignore-scripts --no-fund`, then `npm run typecheck` and `npm test`.
3. Choose an **absolute, disposable** `STUDIO_DATA_ROOT` for development. Do not
   point tests or experiments at a studio containing valuable media.
4. Run `npm run build`, then `npm start` for the combined UI/API on port 9122.
   In another terminal, `npm run dev` provides the local Vite UI on 5173, proxying
   that API. Changing the backend port also requires updating the dev proxy.

The offline suite needs no GPU, model weights or provider login. Running the actual
media tools needs the [supported host and tool setup](docs/installation.md).
A developer-only install may report missing host/tool prerequisites; do not treat
that as successful native verification.

## Before committing a change

```sh
npm run typecheck
npm test
npm run build
git diff --check
```

Add a regression test for changed behaviour. For UI work, check it in a real
browser. Native tests are separately opted in: read [tests/README.md](tests/README.md)
and the relevant recipe before starting GPU work, provider calls or destructive
lifecycle tests. Do not run them against another person's active work.

## Important contracts

- Existing requests keep captured prompts, provider/model choice, seeds and timing.
  Retry/restart reuses the capture; a new generation records a new seed.
- Source footage is preserved independently of its timeline trim and placement.
- Preview is live; export renders the same arrangement. Gaps are black and clips
  may continue beyond the song. Topmost whole clips determine overlap dominance.
- Owned-job cancellation is not permission to kill unrelated services.
- Normal agent tools are intentionally available. Working directories are not
  filesystem sandboxes, and natural-language success claims are not media validation.
- Schema changes must preserve existing project data and have migration tests.

## What belongs in Git

Source, tests, pinned recipes, public planning/evidence summaries and explicitly
curated documentation media. **Not** credentials, provider sessions, runtime
SQLite databases, full prompts/logs from private projects, model weights, raw
recordings, personal learner context or machine-specific evidence captures.
The ignore rules help prevent accidents; they do not remove prior committed data.
Review staged changes and history before publishing. Never rewrite shared history
or rotate credentials without coordinating with the owner.

## Reporting problems

Include the affected operation, relevant version/commit, host/GPU details and a
small reproduction. Redact secrets, private prompts and identifying file paths.
Prefer a synthetic fixture over uploading a real project or provider transcript.
The trusted-LAN/no-auth model and full-access agents are deliberate prototype
boundaries, not a promise of safe Internet exposure.
