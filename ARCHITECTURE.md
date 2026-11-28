# Architecture

The Windows preview is distributed as one VSIX. At runtime the VS Code extension starts a separate Electron companion after consent. The companion owns the single quota monitor and can stay open when the editor closes. Each trusted local VS Code window in the same Windows logon reads that shared monitor.

1. The Electron main process discovers the local Codex executable and launches a fixed stdio App Server quota probe after opt-in.
2. The TypeScript quota manager validates provider windows and keeps account-scoped readings in memory. It coalesces refreshes, respects reset deadlines, and expires stale readings. Only the desktop makes provider requests.
3. A pure behavior and animation layer maps the quota to energy, stamina, movement, and pose. Confirmed restoration requires a new provider observation. A valueless or stale reading is unknown.
4. Sandboxed local renderers show the pet, Settings and the options menu through narrow preload bridges. Main owns preferences, positioning in device-independent coordinates, pin state, and click-through recovery.
5. Local VS Code UI extension instances query the desktop's authenticated loopback protocol. IPC v2 admits only quota status, refresh, and named desktop controls. Simulation uses local fixtures.

| Area | Source |
| --- | --- |
| Electron windows, preferences, and polling | `apps/desktop/` |
| VS Code extension, companion launch, and Marketplace text | `apps/vscode/` |
| Codex discovery, fixed App Server requests, and normalization | `tools/codex-quota-probe/` |
| Quota scope, caching, and reset times | `packages/telemetry/` |
| Authenticated loopback and Windows endpoint discovery | `packages/ipc/` |
| Behavior, animation, and simulation fixtures | `packages/behavior/`, `packages/animation/`, `packages/simulation/` |
| Approved Cat assets and packaging | `assets/mascots/cat/`, `tools/build-local.mjs` |

Account-level limits cannot attribute consumption to a project or conversation. The provider-neutral session registry has synthetic coverage. The public preview does not feed it from live IDE events. Native activity belongs to the separate experiment and is excluded from the preview build and protocol. [Build and development setup](CONTRIBUTING.md)

See [Security](SECURITY.md), [Requirements](REQUIREMENTS.md) and the [animation asset specification](ANIMATION_ASSET_SPEC.md).
