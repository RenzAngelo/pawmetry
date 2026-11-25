# Development plan

Phase 0 and Phase 1 established the design and acceptance criteria. The maintainer approved local development across the remaining milestones. See the [development status](DEVELOPMENT_STATUS.md) for verified checkpoints and the [manual test list](MANUAL_TESTS.md) for outstanding evidence.

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
| 2A. Codex quota probe | Live retrieval and three paired dashboard comparisons passed. Record two-window conversation continuity and preserve the workspace-label and data-age limits before milestone sign-off |
| 2B–C. Remaining feasibility probes | After approval, test activity and desktop-plus-extension operation. Decide IPC transport and which verified capabilities enter the MVP |
| 3. Simulation product slice | Establish the workspaces and canonical branding, build the real overlay and extension shell, add original sprites and pass offline, reconnect and accessibility tests |
| 4. Windows/Codex MVP | Integrate only the successful provider probes. Pass the capability matrix, failure tests, data-boundary review and clean Windows installation smoke tests |
| 5. Distribution readiness | The local portable ZIP and VSIX passed isolated smoke tests. A per-user installer, signing, full uninstall and SmartScreen checks, license, trademark, and publisher identity remain release gates |
| 6. Provider expansion | Evaluate Claude Code and Copilot independently by surface, version, plan and capability. Consider other operating systems and custom assets after Windows is stable |

## Review gate

Record two-window conversation continuity before merging Probe A. Its [quota probe report](QUOTA_PROBE_REPORT.md) documents dashboard parity for the tested setup and the outstanding scope limitation. The [concurrency design](ARCHITECTURE.md#multiple-windows-projects-and-sessions) defines a centralized quota manager and a separate session registry for later milestones.

## Recommended next milestone

Validate Probe B end to end with the desktop’s disposable workspaces. The installed App Server discovered the eight generated hooks while they were untrusted, and synthetic input reached the renderer through the Windows helper path. Use normal native trust and check actual `PreModelRequest` and `PreToolUse` delivery with VS Code visible and minimized, overlapping sessions, removal, and unchanged behavior. A confirmed interrupt is distinct from a `Stop` or a model-attempt outcome. Prepare an exact project enrollment and rollback preview only after the disposable result and separate consent. [Codex hooks](https://learn.chatgpt.com/docs/hooks) · [Activity acceptance tests](TEST_PLAN.md#independent-provider-validation)

## Desktop backlog

- Make the floating companion’s More Options menu avoid overlapping the pet. Prefer opening to the right when the display work area has room, fall back to the left or another suitable direction, and verify placement at monitor edges and mixed DPI. Keep this behind native activity validation.
