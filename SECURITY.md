# Security and privacy

Pawmetry is designed to inspect limited provider facts and keep them on the local machine. Simulation runs without provider access. Real integration starts only after explicit user action and the relevant checks in the [test plan](TEST_PLAN.md).

## Data boundary

| Permitted data | Handling |
| --- | --- |
| Supported quota metrics, units, window durations and reset times | Validate at ingress and hold in memory. Drop fields outside the schema |
| Enumerated activity and availability, safe correlation and observation timestamps | Keep ephemeral. Convert provider session identifiers to process-local correlation keys if needed. Clear on disconnect or source change |
| Product preferences and display placement | Persist locally with safe defaults. Keep provider histories out of settings |
| Troubleshooting | Use fixed health codes and versions. Keep diagnostic logs off by default and exclude payloads, identities and filesystem paths |

The quota probe uses the documented account check with forced token refresh disabled and a single quota read. It keeps raw provider IDs out of terminal output and disk, deriving opaque, process-local correlation keys from available identifiers. Workspace names are hidden by default and shown locally only on request. Shared quota correlation requires account and quota-scope evidence. Future session publishers cannot claim an account association based on a workspace name or folder. [Quota probe report](QUOTA_PROBE_REPORT.md)

Never read, extract, store or transmit provider authentication credentials. That includes credential files, environment secrets, keychains and browser sessions. Leave sign-in, storage and refresh to Codex. Avoid API-key, externally managed token, account mutation, credit redemption and private HTTP interfaces. A standard Codex subprocess can contact its provider for an approved read. Pawmetry creates no external analytics, crash-reporting uploads or background update checks by default. Review the workload's provider egress separately because the provider process has its own policy and settings. [Codex authentication modes](https://learn.chatgpt.com/docs/app-server#authentication-modes)

Never collect prompts, source code, transcripts, conversation text, tool inputs or outputs. Prefer interfaces that omit these fields. If a documented hook supplies a mixed envelope, retain only the allowlisted event identifier and minimal correlation/timing data at ingress. Exclude any hook if a safe projection cannot be demonstrated. Never serialize, log, forward or open paths from the envelope. Apply the same checks to errors, unexpected server requests, inherited environment, child stderr and crash handling.

## Consent and controls

- Obtain explicit consent for each provider or workspace hook change. Preview the exact changes, executable, purpose and uninstall path. Honor provider trust and organization policy.
- Prefer a disposable trusted workspace for experiments. User-wide configuration requires separate consent. Preserve existing hooks and use conflict-aware rollback that removes only the Pawmetry entry.
- Use fixed code from an approved install location. Do not accept workspace-controlled executable paths, shell commands, arguments or URLs. Apply time bounds, neutral output and failure behavior that leaves provider decisions to the provider and user.
- Store per-user settings and use standard-user privileges. Default startup, notifications and sound to off. Handle all errors without prompting for elevation.

## Trust boundaries

| Boundary | Controls |
| --- | --- |
| Desktop renderer → main | The pet, Settings and options use separate minimal preloads, local packaged routes, restrictive CSP, context isolation, renderer sandbox and disabled Node integration. Reject unexpected navigation, new windows and permission requests. IPC validates the owning renderer, main frame, exact local page, command and preference value. The folder picker only previews a hook location. File checks are limited to the current disposable definitions. Browser-provided paths and arbitrary commands have no write route |
| VS Code host → desktop | The listener binds IPv4 loopback. The Windows helper creates and verifies a current-user-owned descriptor with a DACL granting access only to the current logon SID. Both peers prove possession of the per-run capability using fresh nonces. Each connection admits one bounded, versioned request for status, refresh, or a fixed companion control. Controls carry no arguments. Activity publishing and arbitrary commands have no protocol route |
| Disposable Codex hook → desktop | This separate loopback UDP receiver accepts a bounded canonical event schema with a per-workspace HMAC, freshness window and in-memory replay filter. The generated files inherit a Windows DACL for the current logon. Nothing listens until the user starts the activity test. Keys rotate whenever it starts. A same-logon process with access to a generated definition can impersonate that workspace, so a valid datagram alone does not prove native Codex provenance. The channel cannot execute commands or change settings |
| Desktop → provider process | Explicit user-selected or verified supported executable and fixed stdio arguments without a shell. Allowlist the quota RPC, cap output and time, supervise only processes Pawmetry owns and fail closed on unexpected messages. Review startup configuration effects and do not collect provider debug output |
| Workspace and assets | Gate sensitive extension commands at execution with Workspace Trust. Use original static assets in the MVP. Future custom packs require bounded image/manifest parsing with no scripts or external resources |
| CI and packages | Pin reviewed dependencies and actions, scan lockfile changes, use least-privilege build workflows and keep signing credentials out of PR builds. Verify the contents of both packages before distribution |

Processes already executing as the same Windows user can interfere with that user's apps. Treat endpoint checks, role separation and rejection of unsupported commands as defense in depth. Test rights and failure behavior explicitly. [Electron security](https://www.electronjs.org/docs/latest/tutorial/security) · [Windows pipe ACLs](https://learn.microsoft.com/en-us/windows/win32/ipc/named-pipe-security-and-access-rights) · [VS Code Workspace Trust](https://code.visualstudio.com/api/extension-guides/workspace-trust) · [GitHub Actions security](https://docs.github.com/en/actions/reference/security/secure-use)

The IPC capability is generated locally and is unrelated to Codex credentials. The descriptor is restricted to Local AppData on a fixed drive and rejects redirected paths and broad ACLs. Exclusive mutation and compare-and-swap prevent a stale publisher or cleaner from overwriting a newer descriptor. Windows crash recovery was exercised with a killed disposable coordinator. Restart rotates its capability, and clients re-discover it after failure. Same-logon processes are inside the credential boundary. Multi-user isolation remains manual QA.

The hook helper discards model outcomes, tool data and every unapproved field in its transient input. Work, session and turn identifiers are HMAC-derived in memory. Cleanup leaves edited hook definitions and nonempty workspaces in place. After a crash the old receiver capability is inoperative. Remove the leftover generated definitions in the disposable folders before reusing them. Global settings, existing project hooks and native trust records are managed separately by the user.

Settings displays only explicitly selected preview paths, generated folders for this run, the running app's identity and bounded diagnostic labels. Checks compare the original config in place without disclosing it to the renderer. A separate authenticated synthetic probe can test the launcher and receiver, but cannot enter the activity timeline. Rejected native input can emit only a fixed health code, workspace label and timestamp. The editor launcher accepts only a generated folder and an eligible local `Code.exe`, using a fixed argument vector. The copied review command opens native Codex for that folder. Neither action modifies Codex configuration or approves a hook.

## Vulnerability reports

Use a private channel agreed with the maintainer during the research phase. Provide versions, impact and a synthetic reproduction. Exclude provider data and credentials. Select and document a permanent private reporting channel before public release.
