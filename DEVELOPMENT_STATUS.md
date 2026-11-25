# Development status

## Verified checkpoints

- The quota probe retrieved genuine Codex account limits. Both quota windows matched the official dashboard across three maintainer-paired reads.
- The 28-test suite passed after executable discovery was added. The auto-discovered bundle completed a live quota read under the normal Windows user context. Discovery rejects ambiguous versions and redirected paths.
- The installed native Codex App Server discovered a disposable project `PreToolUse` hook using `hooks/list` in an empty profile. It reported project source and untrusted status with zero errors. No provider turn ran.
- The activity probe projects only tool-start and run-scoped session observations. A loopback test with two independent hook processes verified output minimization and distinct session correlation using synthetic inputs.
- The provider-neutral quota manager and session registry are implemented in memory. The 37-test suite passed, covering shared scopes, refresh coalescing and expiry, generation ordering, movement and pose selection, and explicit offline simulation states.
- The authenticated loopback transport passed tests for multiple clients, malformed and oversized frames, wrong keys, replay, spoofed servers, event injection and reconnection. The native Windows descriptor test passed creation, ACL verification, replacement and ownership-safe cleanup.
- The desktop live smoke read Codex quota, sent the result through authenticated IPC, and rendered an available meter with Chromium sandboxing enabled. Offline rendering passed. A native single-instance smoke confirmed the second Electron launch notified the primary and exited without acquiring the lock.
- The optional native hook test observed none, one untrusted project hook, then none after removal in the same isolated App Server. No hook was trusted or executed. The full Windows suite with both native checks enabled passed 47 tests.

## Current implementation and open validation

- The disposable hook probe now handles `SessionStart`, `SessionEnd`, `PreToolUse`, `PostToolUse`, `Interrupt`, and `Stop`. Four synthetic tests covered projection, signed datagrams, workspace separation, replay, missing closes, stale expiry, and resume. This turn made no hook configuration or trust changes.
- Candidate states are working on tool-start evidence, interrupted on an explicit interrupt, stale after the observation lease, disconnected on session end, and unknown when evidence is absent. A stop leaves outcome unknown. Waiting, completed, failed, idle, and a crash without a terminal event cannot be established by this hook set. Native desktop and editor activity therefore stay unknown.
- The maintainer deferred the two-window continuity check. The App Server workspace label and upstream data age remain unknown. Live hook delivery, minimized-window behavior and concurrent IDE activity are pending. See [MANUAL_TESTS.md](MANUAL_TESTS.md).
- Desktop starts in simulation. Its tray enables live quota explicitly, and one scheduler owns provider reads. The scheduler respects freshness and reset expiry, coalesces concurrent requests, and applies rate limits and backoff. Eight synthetic editor clients requested refresh against one provider read.
- The extension reads desktop state over IPC and visibly indicates disconnect, simulation and live quota. It never launches a quota probe. Two isolated VS Code extension hosts both received and displayed the same synthetic quota through the native descriptor and authenticated transport. Graphical controls, actual editor continuity and independent Windows logon isolation remain manual QA. Native desktop smoke uses the normal Windows user context because the managed shell denied Chromium AppContainer access to the runtime directory.
- Windows IPC now compare-and-swaps its protected discovery descriptor. Eight IPC tests passed with native checks enabled, including recovery after a fixture process was killed and rejection of its retired key. The native single-instance smoke passed again. Cross-logon isolation remains unverified.
- The desktop restores saved bounds and motion preferences, supports opt-in low-quota notifications, and maps pet state to reusable placeholder animation clips. Four targeted tests passed. The VS Code connect and show/hide commands use the existing authenticated channel.
- The Windows test run passed 55 tests. The native hook-configuration test was skipped this turn because writing hook configuration requires consent. The packaged desktop rendered offline after ZIP extraction. The VSIX installed and received matching synthetic quota in two isolated editor profiles.
- Local artifacts are in `dist/pawmetry-mNDIvt`. The portable ZIP includes Electron's bundled licenses. The pinned VSCE tool is used only to build the VSIX. The project lockfile audit reported zero advisories. The CI workflow is staged in the repository and has not run remotely.

## Next steps

1. Record the results in [MANUAL_TESTS.md](MANUAL_TESTS.md), including quota continuity and actual native hook delivery.
2. Verify the remaining cross-logon and visible editor cases. Keep live activity unknown until native delivery and concurrent sessions are corroborated. Propose a separate authenticated publisher only after that evidence is available.
3. Rebuild local artifacts with `npm.cmd run package:local`. If distribution is approved later, choose a per-user installer and verify signing, notification registration, publisher identity, and the project license before release. Keep milestones with open acceptance criteria unmerged.
