# Proposed architecture

Run the pet as an independent Windows application. The VS Code extension displays the same normalized state and sends a small set of companion commands. Each provider adapter translates the facts its source can establish.

## Repository layout

| Proposed location | Responsibility |
| --- | --- |
| `apps/desktop` | Electron main, narrow preload bridge, pet renderer, tray and lifecycle |
| `apps/vscode` | Local desktop UI extension, status bar, Tree View, commands and user settings |
| `packages/providers` | Provider interface, simulator and adapters such as `codex/quota` and `codex/hooks` |
| `packages/telemetry` | Versioned schemas, validation, capabilities, provenance and freshness |
| `packages/behavior` | Pure rules turning normalized state into pet pose, speed and expression |
| `packages/animation` | Sprite manifests, frame timing, playback and reduced motion |
| `packages/settings` | Schema, defaults, migration and local persistence |
| `packages/ipc` | Versioned local protocol, codecs, transport and role enforcement |
| `packages/branding` | Canonical metadata and templates for desktop, VSIX and package manifests |
| `assets/` and `tests/` | Original sprites, icons and provenance. Shared synthetic fixtures and integration harnesses |

Use package boundaries where they protect dependencies. Keep behavior, telemetry and animation rules independent of Electron, VS Code and provider SDKs.

~~~text
Provider interfaces or simulation
          │
          ▼
Adapters and data minimization
          │
          ▼
Desktop main ── telemetry validation, freshness, behavior, settings
    ├── preload bridge ── local pet renderer
    ├── native tray and window controls
    └── local IPC ── VS Code status bar, Tree View and companion commands
~~~

A future opt-in hook can publish sanitized activity directly to desktop main. The VS Code UI extension runs on the local Node extension host and reconnects independently of the desktop process. Store desktop settings in Electron's user-data path and keep extension UI preferences in user-scoped VS Code settings. Desktop main owns shared settings. Use validated defaults, versioned migrations and atomic replacement for persisted settings. [VS Code remote extensions](https://code.visualstudio.com/api/advanced-topics/remote-extensions)

## Normalized state and behavior

A quota snapshot records provider, approved local source instance, scope, bucket, observation time and freshness. A window can include metric type, usage ratio or supplied counts, duration and reset time. Calculating percentages from counts requires a known positive allowance in the same unit. Track quota, reset and connection availability independently. Select energy and stamina only from recognized short- and long-term windows in the applicable allowance. Preserve other known buckets as separate rows. A provider with one suitable window can leave the other pet meter unknown.

Activity snapshots carry a bounded state, observation time, source and an ephemeral correlation key where available. Order and deduplicate within a source and discard events from obsolete connections. Keep provider, account and session scope distinct. Multiple sessions can appear separately when safe correlation is established. Ambiguity yields unknown for the active pet and precludes cross-session aggregation.

Use a deterministic behavior reducer with an injectable clock. Treat activity and energy or stamina as separate channels. Show approval, completion and interruption poses only on matching fresh evidence, and expire temporary outcomes. Use sleep for confirmed blocking exhaustion. A full bucket can coexist with credits or another way to continue, so that fact alone cannot imply sleep. Use an unknown pose or indicator when evidence expires and retain independent indicators for channels that remain fresh. Recharging follows confirmed recovery or a reset. Cosmetic speed thresholds leave numeric readings intact.

## Desktop and IPC

Use a standalone transparent, frameless, always-on-top `BrowserWindow` with a fixed layout for each supported size. Resize programmatically and test the transition. Use a drag region or tested drag handler. Use `screen` work areas and device-independent pixels to restore and clamp placement when monitors change. Provide tray and authorized VS Code controls for recovery from click-through. Test focus and visibility across taskbar, virtual desktops, fullscreen and mixed DPI. Use `app.setLoginItemSettings` for opt-in startup in the tested Windows package. [Window customization](https://www.electronjs.org/docs/latest/tutorial/window-customization) · [Window interactions](https://www.electronjs.org/docs/latest/tutorial/custom-window-interactions) · [Displays](https://www.electronjs.org/docs/latest/api/screen) · [Login items](https://www.electronjs.org/docs/latest/api/app#appsetloginitemsettingssettings-macos-windows)

Prefer a Windows named pipe scoped to the current user and logon session. Verify the actual ACL and remote-client rejection in a transport probe. Node's socket API alone does not establish either requirement. If the probe fails, evaluate a minimal Windows helper or reselect the transport after review. Keep the UI spike on simulation if this gate is open. Use length-bounded messages, a protocol version and separate permissions for status readers, companion controllers and telemetry publishers. Accept fixed commands, use bounded reconnect and send a fresh snapshot on reconnect. Route renderer IPC through the preload bridge separately. [Windows pipe access rights](https://learn.microsoft.com/en-us/windows/win32/ipc/named-pipe-security-and-access-rights) · [Windows remote-client mode](https://learn.microsoft.com/en-us/windows/win32/api/namedpipeapi/nf-namedpipeapi-createnamedpipew) · [Electron security](https://www.electronjs.org/docs/latest/tutorial/security)

## Stack decision

| Choice | Reason |
| --- | --- |
| TypeScript, maintained Node 24 LTS patch, npm Workspaces | Share contracts with a single lockfile. Pin the tested development release and use `npm ci` in CI. Electron and VS Code ship distinct runtimes |
| Electron and local HTML/CSS sprite animation | Use documented window and tray APIs and one TypeScript stack. Measure Chromium footprint before release. CSS sprite steps suffice for one pet |
| Native VS Code API | Use a status item, Tree View and commands for an accessible dashboard without a webview |
| Vitest | Test deterministic logic and fixtures without loading either app. Add host and manual Windows testing for OS behavior |
| GitHub Actions, Electron Builder and `@vscode/vsce` | Use local tools and build-only CI. Produce unpublished per-user NSIS and VSIX artifacts when approved. Verify workspace imports and `engines.vscode` on clean installs |

Defer React, Tailwind and Canvas until UI or rendering complexity justifies them. Store settings in local files and keep telemetry snapshots in memory. External hosting, a database, paid APIs, Supabase and Firebase are outside the proposed scope. [Node release lines](https://nodejs.org/en/about/previous-releases) · [npm Workspaces](https://docs.npmjs.com/cli/v11/using-npm/workspaces/) · [VS Code Tree View](https://code.visualstudio.com/api/extension-guides/tree-view) · [Electron release support](https://www.electronjs.org/docs/latest/tutorial/electron-timelines) · [NSIS](https://www.electron.build/v26/docs/nsis/) · [VSIX packaging](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)

## Branding and stable identifiers

Keep the name, tagline, icon references, publisher display metadata and documentation metadata in one branding manifest. Generate or validate consumer manifests from that source. Choose stable technical identities for the application, extension, settings and IPC protocol before release. A rebrand can preserve those identities or migrate settings and installation paths explicitly. Trademark clearance and public publisher identity remain open.
