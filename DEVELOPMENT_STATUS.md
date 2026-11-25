# Development status

## Verified checkpoints

- The quota probe retrieved genuine Codex account limits. Both quota windows matched the official dashboard across three maintainer-paired reads.
- The 28-test suite passed after executable discovery was added. The auto-discovered bundle completed a live quota read under the normal Windows user context. Discovery rejects ambiguous versions and redirected paths.
- The installed native Codex App Server discovered a disposable project `PreToolUse` hook using `hooks/list` in an empty profile. It reported project source and untrusted status with zero errors. No provider turn ran.
- The activity probe projects only tool-start and run-scoped session observations. A loopback test with two independent hook processes verified output minimization and distinct session correlation using synthetic inputs.
- The provider-neutral quota manager and session registry are implemented in memory. The 37-test suite passed, covering shared scopes, refresh coalescing and expiry, generation ordering, movement and pose selection, and explicit offline simulation states.

## Current implementation and open validation

- The maintainer deferred the two-window continuity check. The App Server workspace label and upstream data age remain unknown. Live hook delivery, minimized-window behavior and concurrent IDE activity are pending. See [MANUAL_TESTS.md](MANUAL_TESTS.md).
- The simulation desktop window uses temporary geometry. The Electron renderer smoke passed with Chromium sandboxing enabled in the normal Windows user context. The managed shell denied the Chromium AppContainer access to the runtime directory.
- The isolated VS Code extension-host smoke passed activation and both simulation state transitions. Live quota is available through an explicit refresh command using the validated Codex probe. The native host test exercises simulation. Live extension refresh and visual status indicators remain manual QA.

## Next steps

1. Record the results in [MANUAL_TESTS.md](MANUAL_TESTS.md), including quota continuity and actual native hook delivery.
2. Verify Windows IPC access controls and then connect the desktop coordinator and VS Code to shared live telemetry. Check connection churn and relink sessions only when reliable account scope is available.
3. Keep milestones with open acceptance criteria unmerged. The placeholder artwork remains temporary.
