# Public Preview test plan

## Automated tests

- `npm.cmd test` exercises quota math, freshness, reset handling, executable discovery, malformed or unavailable provider responses, account scope, shared refresh, IPC auth and replay protection, preference validation, window placement, and the atlas contract.
- On Windows, set `PAWMETRY_NATIVE_IPC_TEST=1` for descriptor ACL and stale-process tests. Use isolated endpoints and synthetic cases.
- `npm.cmd run desktop:smoke` tests native rendering, Settings, pin, sizes, menu controls, persistence and rejection of the former experimental action. `npm.cmd run desktop:smoke-lock` tests the lock in a separate profile.
- `npm.cmd run desktop:smoke-live` performs only read-only quota retrieval and checks renderer and authenticated IPC. It requires an existing Codex sign-in.
- `npm.cmd run package:local` audits archive names and executable sources for excluded capabilities. Run `& .\tools\test-desktop-package.ps1 -Zip <ZIP>` and `npm.cmd run vscode:smoke-ipc -- <VSIX>` against the exact artifacts. Both use isolated profiles.

## Manual acceptance

Use [MANUAL_TESTS.md](MANUAL_TESTS.md) for checks that need a real standard-user logon, the official usage dashboard, or physical displays. Synthetic Windows host tests cannot establish provider activity, physical DPI behavior, or cross-logon isolation.
