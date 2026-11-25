# Development status

## Verified checkpoints

- The quota probe retrieved genuine Codex account limits. Both quota windows matched the official dashboard across three maintainer-paired reads.
- The 28-test suite passed after executable discovery was added. Discovery found the installed bundle and rejects ambiguous versions and redirected executable paths.
- The installed native Codex App Server discovered a disposable project `PreToolUse` hook using `hooks/list` in an empty profile. It reported project source and untrusted status with zero errors. This verified configuration discovery and the trust gate. No provider turn ran.

## Open validation and next steps

- The maintainer deferred the two-window continuity check. The App Server workspace label and upstream data age remain unknown. Live hook delivery, minimized-window behavior and concurrent IDE activity are pending. See [MANUAL_TESTS.md](MANUAL_TESTS.md).
- Implement and test sanitized hook projection and local delivery, then exercise the coordinator, telemetry and simulation with synthetic data. Keep development on local checkpoints and leave milestones with open acceptance criteria unmerged.
