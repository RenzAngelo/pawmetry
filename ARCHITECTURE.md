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
Desktop main ── quota manager, session registry, behavior, settings
    ├── preload bridge ── local pet renderer
    ├── native tray and window controls
    └── local IPC ── VS Code status bar, Tree View and companion commands
~~~

A future opt-in hook can publish sanitized activity directly to desktop main. The VS Code UI extension runs on the local Node extension host and reconnects independently of the desktop process. Store desktop settings in Electron's user-data path and keep extension UI preferences in user-scoped VS Code settings. Desktop main owns shared settings. Use validated defaults, versioned migrations and atomic replacement for persisted settings. [VS Code remote extensions](https://code.visualstudio.com/api/advanced-topics/remote-extensions)

## Normalized state and behavior

A quota snapshot records provider, approved local source instance, scope, bucket, observation time and freshness. A window can include metric type, usage ratio or supplied counts, duration and reset time. Calculating percentages from counts requires a known positive allowance in the same unit. Track quota, reset and connection availability independently. Select energy and stamina only from recognized short- and long-term windows in the applicable allowance. Preserve other known buckets as separate rows. A provider with one suitable window can leave the other pet meter unknown.

Activity snapshots carry a bounded state, observation time, source and an ephemeral correlation key where available. Account-wide quota samples and activity events are different records. Quota changes carry no project, session or turn attribution.

Use a deterministic behavior reducer with an injectable clock. Treat activity and energy or stamina as separate channels. Show approval, completion and interruption poses only on matching fresh evidence, and expire temporary outcomes. Use sleep for confirmed blocking exhaustion. A full bucket can coexist with credits or another way to continue, so that fact alone cannot imply sleep. Use an unknown pose or indicator when evidence expires and retain independent indicators for channels that remain fresh. Recharging follows confirmed recovery or a reset. Cosmetic speed thresholds leave numeric readings intact.

For the future UI, store each validated reset as a UTC instant and format it for the user's current timezone, including daylight saving at the reset instant. Calculate human-readable countdowns from the difference between UTC instants. Local display ticks require no provider read. At or after the expected reset, deduplicate refreshes per quota scope and use bounded retries if the provider has no fresh result. Recompute on clock changes and resume from sleep. Distinguish expired and stale values from missing or invalid timestamps. Keep allowance unknown after expiry until refreshed evidence arrives, and show recharge only after provider confirmation.

## Multiple windows, projects and sessions

The desktop main process will host one quota manager and one session registry per interactive Windows user session. Each local VS Code extension host can reconnect to that coordinator and receive an initial snapshot followed by updates. Local CLI, IDE and desktop agents can publish separately when the relevant adapter can observe their documented events. An editor window can own several local project folders and several conversations. A project can have concurrent conversations in several windows and other clients.

| Identity | Proposed handling |
| --- | --- |
| Provider and authentication mode | Identify the adapter and supported login mode independently. Sessions in different provider or auth namespaces have independent quotas |
| Account and provider quota scope | Independently key the verified account principal, provider quota scope and bucket. Use documented opaque IDs where available and derive process-local keys. A provider workspace label is display metadata. A local project folder cannot establish provider quota scope |
| Local workspace and client instance | Use a local project key where the host can associate it safely. An extension-host instance and connection generation identify the publisher, even when local workspaces overlap |
| Session and turn | Use documented session or thread identifiers and turn IDs when exposed, scoped to their provider and origin. Keep turn identity within its session. Link equivalent sessions across surfaces only when the adapter can establish identity. Otherwise keep sources distinct or report ambiguity |

**Quota manager.** Key snapshots by provider, auth mode, verified account, provider quota scope and bucket. Coalesce in-flight refreshes, batch buckets returned by one read, share valid results across all associated sessions, and use bounded retries and backoff per scope. Replace each full snapshot once per observation. Apply sparse updates only when source and scope match, and refresh on uncertainty. Missing account or scope fields may support an unlinked view of a source's current usage, with no cross-session linking. Keep a selected account's quota view separate when several scopes are active. A change in quota does not identify which client or project consumed it.

**Session registry.** Maintain independent state for each observable session and turn. Use documented event IDs or sequence numbers for bounded deduplication and ordering where available. Treat delayed events from superseded generations or completed turns as obsolete. When an event is missing or the sequence is uncertain, request a supported metadata snapshot or wait for fresh corroboration. Missing heartbeat, known process exit or loss of the source moves affected sessions to unknown or disconnected after an appropriate expiry. On reconnect, start a new generation and reconcile only sessions the source can safely identify. Unobservable sessions have unknown activity.

**Unified display.** The first mode shows one pet reflecting observed concurrent activity, with deterministic handling of simultaneous events and a shared quota view for the selected scope. The dashboard can identify independent session states or report unknown. Multiple quota scopes remain separate. Later modes may follow a selected project, workspace or provider and may introduce multiple pets.

The quota manager and session registry now run in memory and have synthetic concurrency coverage. The activity probe uses a per-run loopback capability in disposable workspaces, separate from the planned desktop IPC. The desktop prototype uses offline simulation while native IDE activity and the IPC transport remain under validation. [Development status](DEVELOPMENT_STATUS.md)

## Desktop and IPC

Use a standalone transparent, frameless, always-on-top `BrowserWindow` with a fixed layout for each supported size. Resize programmatically and test the transition. Use a drag region or tested drag handler. Use `screen` work areas and device-independent pixels to restore and clamp placement when monitors change. Provide tray and authorized VS Code controls for recovery from click-through. Test focus and visibility across taskbar, virtual desktops, fullscreen and mixed DPI. Use `app.setLoginItemSettings` for opt-in startup in the tested Windows package. [Window customization](https://www.electronjs.org/docs/latest/tutorial/window-customization) · [Window interactions](https://www.electronjs.org/docs/latest/tutorial/custom-window-interactions) · [Displays](https://www.electronjs.org/docs/latest/api/screen) · [Login items](https://www.electronjs.org/docs/latest/api/app#appsetloginitemsettingssettings-macos-windows)

Prefer a Windows named pipe scoped to the current user and logon session. Verify the actual ACL and remote-client rejection in a transport probe. Node's socket API alone does not establish either requirement. If the probe fails, evaluate a minimal Windows helper or reselect the transport after review. Keep the UI spike on simulation if this gate is open. Use length-bounded messages, a protocol version and separate permissions for status readers, companion controllers and telemetry publishers. Accept fixed commands, use bounded reconnect and send a fresh snapshot on reconnect. Route renderer IPC through the preload bridge separately. [Windows pipe access rights](https://learn.microsoft.com/en-us/windows/win32/ipc/named-pipe-security-and-access-rights) · [Windows remote-client mode](https://learn.microsoft.com/en-us/windows/win32/api/namedpipeapi/nf-namedpipeapi-createnamedpipew) · [Electron security](https://www.electronjs.org/docs/latest/tutorial/security)

Acquire Electron's single-instance lock before starting the coordinator. Scope the IPC endpoint to the desktop user's logon session and verify access from several local extension hosts. A second desktop launch may activate the existing companion through a fixed command; it cannot start another poller or accept arbitrary forwarded arguments. [Electron single-instance lock](https://www.electronjs.org/docs/latest/api/app#apprequestsingleinstancelockadditionaldata)

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
