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

- The maintainer deferred the two-window continuity check. The App Server workspace label and upstream data age remain unknown. Live hook delivery, minimized-window behavior and concurrent IDE activity are pending. See [MANUAL_TESTS.md](MANUAL_TESTS.md).
- Desktop starts in simulation. Its tray enables live quota explicitly, and one scheduler owns provider reads. The scheduler respects freshness and reset expiry, coalesces concurrent requests, and applies rate limits and backoff. Eight synthetic editor clients requested refresh against one provider read.
- The extension reads desktop state over IPC and visibly indicates disconnect, simulation and live quota. It never launches a quota probe. Two isolated VS Code extension hosts both received and displayed the same synthetic quota through the native descriptor and authenticated transport. Graphical controls, actual editor continuity and independent Windows logon isolation remain manual QA. Native desktop smoke uses the normal Windows user context because the managed shell denied Chromium AppContainer access to the runtime directory.

## Next steps

1. Record the results in [MANUAL_TESTS.md](MANUAL_TESTS.md), including quota continuity and actual native hook delivery.
2. Verify the remaining cross-logon and visible editor cases. Keep live activity unknown until native delivery and concurrent sessions are corroborated. Propose a separate authenticated publisher only after that evidence is available.
3. Keep milestones with open acceptance criteria unmerged. The placeholder artwork remains temporary.
