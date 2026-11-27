# Architecture

Pawmetry has two local applications with one quota owner.

1. The Electron main process discovers the local Codex executable and launches a fixed stdio App Server quota probe after opt-in.
2. The TypeScript quota manager validates provider windows and keeps account-scoped readings in memory. It coalesces refreshes, respects reset deadlines, and expires stale readings. Only the desktop makes provider requests.
3. A pure behavior and animation layer maps the quota to energy, stamina, movement, and pose. Confirmed restoration requires a new provider observation. A valueless or stale reading is unknown.
4. Sandboxed local renderers show the pet, Settings and the options menu through narrow preload bridges. Main owns preferences, positioning in device-independent coordinates, pin state, and click-through recovery.
5. Local VS Code UI extension instances query the desktop's authenticated loopback protocol. IPC v2 admits only quota status, refresh, and named desktop controls. Simulation uses local fixtures.

The quota probe, normalized telemetry, behavior, animation, desktop, and VS Code integration remain separate modules. Account-level limits cannot attribute consumption to a project or conversation. The experimental activity provider integration remains in its own development branch and is omitted from the preview build and protocol.

See [Security](SECURITY.md), [Requirements](REQUIREMENTS.md) and the [animation asset specification](ANIMATION_ASSET_SPEC.md).
