# Setup presentation revision — 24 October 2026

## Request / interpretation
- Show all five navbar indicators from the first loaded tool status. Uninstalled
  tools are disabled; installed indicators remain available for configuration.
- Incomplete steps have static hazard stripes. Only `installing` animates them;
  queued steps, readiness checks, errors and generation activity do not.
- Keep the agent panel and all four tool panels together throughout setup.
  Clear a completed step's stripes, but retain its panel until all tools and
  provider sign-in are ready. Then remove the entire setup area together.
- Config still exposes every tool. An explicitly opened agent selector or Debug
  dialog remains accessible; setup completion must not close an active dialog.
- No installer, queue, project, provider-permission or model changes.

## Checks
- [x] Regression tests for initial/mixed/queued/checking/error/ready states.
- [x] Implement stable indicators and grouped setup visibility; remove handoff.
- [x] Browser-check controlled setup states without reinstalling real tools.
- [x] Full tests, typecheck/build, web-only deployment and live browser check.
- [x] Record verification and commit only intended files.

## Verification
+- Test-first run failed on 10 assertions (new presentation cases plus the old
+  installed-only indicator filter). Final suite: **1,445 tests / 104 files pass**;
+  TypeScript checking and production build pass.
+- Chrome, real built frontend, explicitly synthetic read-only setup API:
+  initial missing tools show five disabled indicators and five static-striped
+  panels; partial completion keeps every panel, clears completed stripes and
+  animates only ComfyUI's installing indicator/panel. Queued and checking steps
+  have computed animation `none`. Polling to all-ready removes the whole setup
+  group while retaining five enabled indicators. Config restores all controls;
+  the agent indicator independently opens/closes just its configuration panel.
+- Screenshot evidence: `.local-evidence/setup-presentation/mixed.jpg` and
+  `deployed-config.jpg`. These are presentation checks, not a new installation
+  run or fresh download test. No real installs/generations were requested.
+- Deployed only the web bundle on Dundee, with assets uploaded before an atomic
+  index replacement; old hashed assets remain available to existing tabs.
+  Served asset bytes match the local build. Service PID is unchanged; existing
+  project snapshots are unchanged. Actual LAN browser inspection confirms five
+  enabled, stripe-free indicators, no setup area on Projects, and all controls
+  still available on Config.
+- Updated PRD/spec Markdown and HTML plus README to supersede the individual
+  handoff animation. No backend, model, installer or agent-permission changes.
+- Temporary browser tabs and the owned local fixture server were closed.
