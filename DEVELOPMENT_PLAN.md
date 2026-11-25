# Development plan

Phase 0 and Phase 1 established the design and acceptance criteria. The maintainer approved Probe A. Its implementation and evidence are in the [quota probe report](QUOTA_PROBE_REPORT.md). Probes B and C require separate approval.

## Minimal proof of concept

Three small probes answer independent questions. Keep the provider probes separate from the UI until their evidence can be evaluated.

| Probe | Deliverable | Pass criteria |
| --- | --- | --- |
| A. Codex quota | TypeScript CLI launches a selected Codex executable over stdio. Initialize, use `account/read` without forced refresh, read `account/rateLimits/read` once, display scoped quota, and close its own child | Read real supported windows for a known matching account and workspace. Compare three paired samples with the official usage UI within its display precision. Check partial and expired data, supported sign-in, and two VS Code windows on the same account. Start zero turns, handle no provider credentials, and make no direct private HTTP calls |
| B. External Codex activity | A minimal, consented project hook probe in a disposable workspace using the stock Windows OpenAI VS Code extension | Observe independently corroborated activity with VS Code visible and minimized. Test sessions started before and after opt-in and report any reload or trust prerequisite. Uninstall cleanly. Prove zero content retention and ordinary provider behavior. Report actual supported states |
| C. Desktop and extension | A standalone frameless, transparent, always-on-top window with placeholder sprite frames, a tray, and simulation. Display the same simulated state in a VS Code status item and Tree View after the IPC access checks pass | Pet stays visible while VS Code is minimized and after it exits. Paired views show matching state and recover across reconnect. Drag across two displays, restore after unplug, and recover from click-through using the tray. Synthetic data is clearly labeled |

Apply the [proof-of-concept tests](TEST_PLAN.md) before merging any probe. A failed probe becomes a dated result with the tested versions and exact capability unavailable. The POC can establish a narrower scope, such as quota-only or activity-only on a specific version.

## Proposed MVP

Ship one original animated pet on Windows 11 x64 and a VS Code status bar, Pawmetry Tree View and companion commands. Include tray controls, dual-monitor positioning, size and animation speed, click-through recovery, reduced motion and offline simulation. Enable only independently verified Codex capabilities. Show source scope, connection, verified quota/reset fields and supported activity, with explicit unknown states. Keep automatic startup, notifications, sounds and custom pet imports out of the first milestone. Include startup and basic alerts only after their own checks, with off defaults.

## Milestones and exit gates

| Milestone | Exit gate |
| --- | --- |
| 0–1. Research and design | Review the 11 project documents and decide which POC probes to authorize |
| 2A. Codex quota probe | Implementation and live retrieval verified. Pair three reads with the official UI and confirm both editor windows remain usable before marking acceptance complete |
| 2B–C. Remaining feasibility probes | After approval, test activity and desktop-plus-extension operation. Decide IPC transport and which verified capabilities enter the MVP |
| 3. Simulation product slice | Establish the workspaces and canonical branding, build the real overlay and extension shell, add original sprites and pass offline, reconnect and accessibility tests |
| 4. Windows/Codex MVP | Integrate only the successful provider probes. Pass the capability matrix, failure tests, data-boundary review and clean Windows installation smoke tests |
| 5. Distribution readiness | Produce unpublished VSIX and per-user Windows installer. Verify mode-specific install/uninstall, dependency and asset notices, signing and SmartScreen handling. Decide license, trademark and publisher identity before release approval |
| 6. Provider expansion | Evaluate Claude Code and Copilot independently by surface, version, plan and capability. Consider other operating systems and custom assets after Windows is stable |

## Review gate

Finish the manual comparisons in the [quota probe report](QUOTA_PROBE_REPORT.md) before claiming UI parity or expanding into activity or the desktop. The [concurrency design](ARCHITECTURE.md#multiple-windows-projects-and-sessions) defines a centralized quota manager and a separate session registry for later milestones. Probe A tests shared quota keys with synthetic concurrent sessions and performs a single account quota read per run.
