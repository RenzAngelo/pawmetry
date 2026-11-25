# Requirements

| Priority | Meaning |
| --- | --- |
| MVP | First approved product target, subject to independent validation |
| Later | Retained for a later milestone |
| Required | Applies whenever the relevant capability ships |

## Desktop companion

| ID | Priority | Requirement |
| --- | --- | --- |
| D1 | MVP | Independent transparent, frameless and always-on-top pet window. Remains visible during normal desktop use when VS Code is minimized or exits |
| D2 | MVP | Drag between two monitors, restore sensible placement after a display change and configure pet size |
| D3 | MVP | Optional click-through with a tray path to restore mouse interaction. Tray exposes show/hide, pause/resume and exit |
| D4 | Later | Opt-in startup with Windows, notifications and sounds. Default all three to off and support disabling them |

## VS Code desktop extension

| ID | Priority | Requirement |
| --- | --- | --- |
| V1 | MVP | Persistent status indicator in an active desktop editor window and dedicated Pawmetry sidebar |
| V2 | MVP | Show connection and source scope, supported allowance values and reset countdowns, and independently verified agent activity |
| V3 | MVP | User settings and companion commands for show/hide and pause/resume, with a clear desktop-unavailable state |
| V4 | Required | Work through supported VS Code APIs. Report exact supported host, provider surface and versions |
| V5 | MVP | Store provider reset instants in UTC. Show local reset times with timezone and daylight saving support and human-readable countdowns. Update countdowns locally and request a refresh after expected reset. Show expired, stale, missing and invalid timestamp states. Require provider evidence before displaying recharge |

## Pet behavior and customization

| ID | Priority | Requirement |
| --- | --- | --- |
| B1 | MVP | Use applicable short-term quota for energy and long-term quota for stamina. Support independent missing windows and provider-specific models |
| B2 | MVP | Support energetic running/play, normal walking, tired slowing/yawning, exhausted struggling/crawling, and sleep for confirmed blocking exhaustion. Simulation can demonstrate all states |
| B3 | Required | Support thinking, working, waiting for approval, success, failure/interruption, disconnected/unknown and recharging when evidence supports them. Require a confirmed reset before showing recharging for a reset |
| B4 | MVP | One original sprite-sheet character, configurable size and animation speed, reduced-motion mode and visibly labeled offline simulation |
| B5 | Later | Multiple pets and validated custom character assets |

## Data and compatibility

| ID | Priority | Requirement |
| --- | --- | --- |
| P1 | Required | Local-first operation. Keep external analytics and diagnostics uploads off by default. No collection of source, prompts or conversations. Never access provider credentials |
| P2 | Required | Prefer supported provider interfaces. Avoid undocumented private HTTP endpoints. Require explicit consent and the provider's trust review for hook configuration changes |
| P3 | Required | Never invent percentages, reset times or activity. Expire stale data and keep ambiguous scope unknown. Calculate a displayed remaining percentage only from valid provider data |
| P4 | Required | Use renderer context isolation, sandboxing and restricted IPC. Require no elevation for normal use. Reject arbitrary commands on every IPC boundary |
| P5 | Required | Keep the provider contract neutral, centralize branding and independently validate each advertised integration. Respect license, artwork and trademark rights |
| P6 | MVP | Target Windows 11 x64 and local VS Code desktop first, with verified Codex capabilities only. Evaluate WSL, remote hosts, Claude Code and Copilot separately |

See [the test plan](TEST_PLAN.md) for acceptance and [the security design](SECURITY.md) for controls.

## Desktop prototype follow-up

- Visible presentations are pet-only, compact and dashboard. Hidden mode keeps explicitly enabled background monitoring active. Window size is independent of pet size. Preserve settings, mapped monitor placement and a tray recovery route for click-through.
- Expose separate animation and monitoring controls. Editor controls only issue fixed authenticated messages to the companion. A confirmed per-user startup setting is optional and defaults to off.
- Notify on fresh real quota observations only. Confirm restoration using a newer reading from the same known quota scope, an advanced reset timestamp, and increased remaining allowance. Require authoritative activity evidence before enabling task or approval alerts.
- Keep artwork, animation, activity, movement and quota channels independent. Use temporary assets until the maintainer approves the original mascot. [Animation asset specification](ANIMATION_ASSET_SPEC.md)
