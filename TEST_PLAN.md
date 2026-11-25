# Test plan

This plan defines future acceptance checks. The [feasibility report](FEASIBILITY.md) records the completed environment and static checks.

## Simulation and unit tests

| Area | Required coverage |
| --- | --- |
| Normalization | Missing and null windows, malformed and out-of-range percentages, zero/unknown allowance, mixed units, multiple buckets, overlapping legacy views, sparse updates and invalid timestamps |
| Freshness and reset | Independent quota and activity expiry, rounded countdowns, clock changes and sleep/resume, refresh at the reset boundary, continued absence, provider-confirmed reset and absence of false recharging |
| Future reset display | Use an injected clock to compare the same UTC reset in several timezones, including a daylight saving transition and a timezone change while open. Verify local countdown ticks cause zero provider requests, the reset boundary schedules a deduplicated refresh, and stale, expired, missing or invalid times never show a false recharge |
| Behavior | All supported poses, threshold boundaries, single-window behavior, explicit blocking exhaustion, harmless exhaustion of other buckets, approval precedence, terminal event expiry and unknown states |
| Events | Duplicates, out-of-order arrival, concurrent sessions, obsolete connections, reconnect snapshots and account or source changes |
| Content exclusion | Synthetic secret, prompt, code and transcript-path canaries in provider frames, hook input and stderr. None may appear in published state, settings, logs, IPC, renderer or diagnostic export |
| Local settings | Defaults, version upgrade, corrupted settings, concurrent or interrupted save, valid coordinates and display fallback |

Use deterministic clocks and synthetic data for CI. Keep all fixture state visibly distinct from live provider data.

## Independent provider validation

Record operating system, runtime and extension versions, harness, local or remote mode, sign-in mode, plan category, observation time, expected and actual results. Keep identity values and session content out of test records. An independent tester should reproduce the claims outside the adapter implementation and use a separate workspace from the developer's first run.

| Case | Procedure and acceptance |
| --- | --- |
| Quota identity and accuracy | With consent and a known matching Codex-managed account/workspace, compare three paired samples from the separate read-only server and official UI. Match bucket and scope before comparing percentage and reset within the UI's visible precision. If an official surface omits a field or identity is ambiguous, record that verification as unavailable |
| Concurrent VS Code windows | Open two VS Code windows on different local folders, with existing conversations in the same ChatGPT account and provider workspace. Record pre-run state without conversation details. Run the probe from a separate terminal and check both windows retain their existing conversations and continue updating normally. Repeat across the three paired samples. Existing activity may proceed naturally. No new prompts are required. Use the [manual procedure](QUOTA_PROBE_REPORT.md#manual-validation) |
| Shared scope and concurrent activity | Use synthetic conversations within and across projects and CLI/IDE surfaces to show four consumers share one quota key. Isolate other users, scopes, auth modes, providers and buckets. Later integration tests must exercise sequence gaps, multiple extension instances, disconnects, recovery of one session without changing its neighbor, and a single quota refresh across active sessions |
| Quota lifecycle | Verify the reader while VS Code is visible, minimized, reloaded and closed. Test signed-out, unsupported mode, account changes when possible, network loss/recovery and partial fields. Freshness policy must converge to unknown on expiry, and reads must never start turns or modify quota |
| IDE activity provenance | In a disposable workspace with separately approved hooks, independently observe a benign activity signal in the stock OpenAI VS Code extension. Compare allowlisted events against the UI on fresh, resumed and already-open sessions. Test hook trust denied and approved, restart, simultaneous sessions and provider interruption |
| Activity under minimization | Try the independently verified signal three times with VS Code visible and three with it minimized during delivery. Proposed probe target is receipt within two seconds of the provider emitting the event on this machine. Record delays and exact supported states. Recheck after closing or reloading VS Code and after Windows wakes |
| Activity truth | Test think, tool work, approval, completion, error and interruption individually as supported. Mere silence, session-file changes or a `Stop` event alone cannot establish success, visible approval or continued activity |
| Rollback and privacy | Check the config diff, measured latency and behavior when the receiver is absent or slow. Compare provider behavior with and without hooks. Remove the Pawmetry entry and confirm that pre-existing configuration still works |

Use simulation for exhaustion and resets unless a genuine event is already available. Request consent before configuring hooks or running any new test turn that consumes usage. Keep any captured evidence limited to sanitized measurements. Add separate rows for Claude Code or Copilot only after the specific harness and supported plan are independently exercised.

## Windows, integration and distribution

| Area | Required coverage |
| --- | --- |
| Overlay | Standard user on Windows 11 x64. Verify transparent edges, focus, always-on-top behavior over ordinary windows, coexistence with minimized or closed VS Code and responsive hide, pause, exit and restore |
| Display changes | Two monitors with different scales and negative coordinates, primary monitor change, unplug/replug, dock and sleep. Pet remains within a usable work area and can be recovered from the tray |
| Accessibility and controls | Keyboard access to tray and extension commands, status text distinct from color, reduced motion, size and speed, pause and click-through recovery |
| Electron isolation | Confirm sandbox, context isolation, Node integration disabled, navigation restrictions and typed preload access. Deny unexpected renderer frames and permissions |
| Local IPC | Test stale versions, unauthorized roles, invalid or oversized frames, timeout/reconnect, second local user/session and remote connections. Verify the effective pipe ACL and remote rejection. Fail the integration if they differ from policy |
| Performance | Measure idle CPU, memory and animation responsiveness with visible, paused and hidden windows. Record the machine and sampling method. Set release budgets after the first measurement |
| Packages | Build desktop NSIS and VSIX locally or in build-only CI after approval. Inspect bundle contents, run clean per-user install/uninstall and upgrade, verify VS Code version range, startup off by default, process cleanup and Windows signing/SmartScreen behavior |

Publish support claims per capability and tested surface only. Record open results explicitly and re-run the relevant checks when a supported provider, runtime or package changes.
