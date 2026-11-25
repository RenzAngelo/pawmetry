# Development plan

Phase 0 and Phase 1 cover environment discovery, provider research, design and acceptance criteria. Implementation begins only after review and approval. The [feasibility report](FEASIBILITY.md) records which capabilities still need runtime evidence.

## Minimal proof of concept

Three small probes answer independent questions. Keep the provider probes separate from the UI until their evidence can be evaluated.

| Probe | Deliverable | Pass criteria |
| --- | --- | --- |
| A. Codex quota | A TypeScript CLI probe that launches an explicitly selected Codex executable over stdio using native Codex sign-in. Implement initialization and `account/rateLimits/read` only, plus cleanup and sanitized output | Read real supported windows for a known matching account and workspace. Compare three paired samples with the official usage UI, within its display precision. Confirm partial/missing/expired values and unsupported sign-in modes yield unknown. No agent turns, credential access in the probe or private HTTP |
| B. External Codex activity | A minimal, consented project hook probe in a disposable workspace using the stock Windows OpenAI VS Code extension | Observe independently corroborated activity with VS Code visible and minimized. Test sessions started before and after opt-in and report any reload or trust prerequisite. Uninstall cleanly. Prove zero content retention and ordinary provider behavior. Report actual supported states |
| C. Desktop and extension | A standalone frameless, transparent, always-on-top window with placeholder sprite frames, a tray, and simulation. Display the same simulated state in a VS Code status item and Tree View after the IPC access checks pass | Pet stays visible while VS Code is minimized and after it exits. Paired views show matching state and recover across reconnect. Drag across two displays, restore after unplug, and recover from click-through using the tray. Synthetic data is clearly labeled |

Apply the [proof-of-concept tests](TEST_PLAN.md) before merging any probe. A failed probe becomes a dated result with the tested versions and exact capability unavailable. The POC can establish a narrower scope, such as quota-only or activity-only on a specific version.

## Proposed MVP

Ship one original animated pet on Windows 11 x64 and a VS Code status bar, Pawmetry Tree View and companion commands. Include tray controls, dual-monitor positioning, size and animation speed, click-through recovery, reduced motion and offline simulation. Enable only independently verified Codex capabilities. Show source scope, connection, verified quota/reset fields and supported activity, with explicit unknown states. Keep automatic startup, notifications, sounds and custom pet imports out of the first milestone. Include startup and basic alerts only after their own checks, with off defaults.

## Milestones and exit gates

| Milestone | Exit gate |
| --- | --- |
| 0–1. Research and design | Review the 11 project documents and decide which POC probes to authorize |
| 2. Feasibility probes | Run A, B and C. Record versions and results, resolve the IPC choice, and decide whether to proceed with quota, activity, both or simulation only |
| 3. Simulation product slice | Establish the workspaces and canonical branding, build the real overlay and extension shell, add original sprites and pass offline, reconnect and accessibility tests |
| 4. Windows/Codex MVP | Integrate only the successful provider probes. Pass the capability matrix, failure tests, data-boundary review and clean Windows installation smoke tests |
| 5. Distribution readiness | Produce unpublished VSIX and per-user Windows installer. Verify mode-specific install/uninstall, dependency and asset notices, signing and SmartScreen handling. Decide license, trademark and publisher identity before release approval |
| 6. Provider expansion | Evaluate Claude Code and Copilot independently by surface, version, plan and capability. Consider other operating systems and custom assets after Windows is stable |

## Next development task

After approval, implement and run **Probe A**. Add a narrow TypeScript entry point and synthetic RPC fixtures for handshake, supported/partial quota responses, timeout and cleanup. Review child startup and provider egress before the first signed-in read. Use an already approved Codex-managed login and compare only normalized, redacted quota facts against the official UI. Record a pass, fail or unavailable result before expanding the adapter or building any dashboard.
