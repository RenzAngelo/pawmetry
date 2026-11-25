# Codex quota probe report

**Status on 2026-11-25.** Genuine retrieval and three maintainer-paired dashboard comparisons passed for both quota windows. The App Server supplied no workspace label. Exact workspace identity could not be independently confirmed, and the two-window VS Code continuity check remains open.

## Implemented

The TypeScript probe launches an explicitly selected native Codex process in an empty temporary working directory. It connects over standard input and output and sends the following messages in order.

| Message | Purpose |
| --- | --- |
| `initialize` and `initialized` | Identify the client and complete the App Server handshake |
| `account/read` with `refreshToken: false` | Check for an existing ChatGPT sign-in without requesting a forced refresh |
| `account/rateLimits/read` | Fetch one account quota snapshot |

The probe closes only the process it creates. It sends no thread, turn, login, approval or quota mutation messages. It makes no direct HTTP requests. Codex handles its own sign-in and contacts its service for the quota read. The child receives allowlisted OS/profile environment variables and temporary startup overrides to disable analytics, OTLP export and agent features. Codex's native startup and managed organization policy still apply. Pawmetry does not open authentication files, read credential variables, inspect other Codex processes or log raw frames or stderr. [App Server protocol](https://learn.chatgpt.com/docs/app-server) · [Codex configuration](https://learn.chatgpt.com/docs/config-file/config-reference)

The terminal labels used percentage and computes remaining from the provider value. It shows UTC reset times when supplied and labels windows short- and long-term when their durations establish the relationship. Each reading includes its local retrieval time and freshness. The 120-second threshold is a local display policy. The quota window supplies no upstream observation age. A passed reset does not establish that quota was restored.

Quota keys combine provider, auth mode, account principal, provider quota scope and bucket. The probe derives process-local opaque keys from optional `userId` and `accountId` fields and omits these keys and the original identifiers from terminal output. When a field is missing, quota can still be displayed for the current source without linking it to other sessions. A supplied workspace name is display metadata. Local project folders and sessions do not enter quota calculations. [Codex account protocol types](https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/src/protocol/v2/account.rs) · [Concurrency design](ARCHITECTURE.md#multiple-windows-projects-and-sessions)

## Verified results

Tested Windows 11 Pro 25H2 x64 with Node.js 24.9.0, npm 11.6.0 and Codex CLI 0.171.0-alpha.13.2 bundled with `openai.chatgpt` 26.1120.50957.

| Check | Result |
| --- | --- |
| Automated tests | **24 passed on rerun.** Synthetic replies covered the exact RPC allowlist, malformed and oversized frames, partial and unsupported quota, stale values, cancellation, disconnect, timeout and cleanup, signed-out and unauthorized cases, and suppression of raw identifiers and messages |
| Concurrent scope logic | **Passed with synthetic data.** Two conversations in one project and sessions in another IDE window and the CLI reference one quota snapshot. Different accounts, quota scopes, providers, auth modes or buckets remain independent |
| Native startup without sign-in | **Passed.** The actual binary completed the handshake using an empty disposable profile and reported signed out |
| Normal-profile startup in the managed shell | **Unavailable.** The child disconnected before returning quota, including with the standard profile directory selected for that invocation |
| Signed-in native retrieval | **Passed.** Three reads in the normal Windows user context returned the Codex bucket with 300-minute and 10,080-minute windows, integer usage and reset epochs. Both optional scope identifiers were present and hidden. The workspace label was unavailable |
| Non-interference | **Process-level check passed.** All 21 pre-existing VS Code and Codex processes remained present across the live checks. No new Codex process remained. The read-only protocol and synthetic sibling test verified scope of cleanup. Conversation-level UI continuity still needs the two-window check |
| Official usage parity | **Passed for the reported dashboard.** The maintainer matched both remaining percentages in all three rounds. Reported reset countdowns were consistent at dashboard precision |
| Workspace and provider freshness | **Partially verified.** The live response had opaque account and quota-scope identifiers. The workspace label and upstream observation age remain unknown |

### Maintainer-paired validation

| Round | Probe retrieval time (UTC) | 5-hour and weekly remaining | Reset evidence |
| --- | --- | --- | --- |
| 1 | Not recorded | Both matched | Maintainer reported consistent countdowns |
| 2 | 2026-11-25T08:25:44.813Z | Both matched | 1h 56m 35s and 5d 19h 58m 41s calculated |
| 3 | 2026-11-25T08:26:09.103Z | Both matched | 1h 56m 10s and 5d 19h 58m 16s calculated |

Both recent reads gave the reset instants `2026-11-25T10:22:20.000Z` and `2026-12-01T04:24:26.000Z`. The official dashboard showed approximately 1h 57m and 5d 19h. The short countdown differed by under one minute from the exact intervals, and the weekly countdown agreed at whole-hour display precision. This comparison cannot establish the provider's data age. Exact personal allowance values remain out of the repository.

### Live readings already observed

| Probe retrieval time (UTC) | Result | Official UI comparison |
| --- | --- | --- |
| 2026-11-25 05:56:14 | Two windows, usage and reset timestamps present | Unpaired |
| 2026-11-25 05:57:22 | Two windows, usage and reset timestamps present | Unpaired |
| 2026-11-25 05:57:24 | Two windows, usage and reset timestamps present | Unpaired |

These were separate assistant-run checks. The second and third readings matched each other. Usage changed between the first and second readings while the reset timestamps stayed the same. The source provides no client or project attribution.

## Implementation review and Git readiness

- **Security and privacy.** Reviewed the fixed stdio RPC sequence, shell-free process launch, child-only cleanup, bounded frames and deadline, and sanitized output. The probe uses an explicit executable path as a trust boundary. Native Codex startup and organization policy remain outside Pawmetry's control.
- **Correctness and complexity.** The one-read flow, window normalization and terminal rendering are proportionate to the probe. Tests cover unknown and expired values and rejection of an account-change notification during a read. Live reset rollover, other account or workspace configurations, and editor conversation continuity still lack evidence.
- **Readiness.** The documentation update is ready for a review commit. Hold milestone merge until the two-window continuity result is recorded and the maintainer accepts the remaining scope limitation or confirms the workspace through the official client.

## Manual validation

1. Keep two VS Code windows on different local projects with existing Codex conversations. Confirm that both use the same ChatGPT account and provider workspace. Leave any existing activity alone. No new prompt or inference call is needed.
2. Open the official Codex usage dashboard in that account and workspace. Confirm an ambiguous workspace in the official client before recording a comparison. [Official usage dashboard](https://chatgpt.com/codex/settings/usage) · [OpenAI usage guidance](https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan)
3. In normal PowerShell opened in this repository, run the probe. Refresh the dashboard immediately and compare the matching allowance bucket and window within the dashboard's displayed precision. If the dashboard shows only remaining percentage, compare it to the probe's remaining percentage. Compare reset times in the same timezone. Record a field as unavailable when the dashboard omits it. Repeat for three paired readings.

   ~~~powershell
   npm.cmd run --silent quota:probe
   ~~~

   Automatic discovery checks the default local Windows x64 VS Code extension tree. For custom paths or multiple eligible versions, select the trusted native `codex.exe` directly. See the [explicit-path example](README.md#run-the-quota-probe). Add `--show-workspace` if the provider supplies a workspace label. The probe leaves sign-in controls to Codex.

4. Check both VS Code windows after each read. Confirm existing conversations are still open, already-running tasks continue as usual, and no reload or sign-in prompt appears. One window can be minimized during a round and restored for the check. Share match or mismatch by field and any continuity problems, leaving out account names, workspace names, IDs and conversation details.

Dashboard comparisons are recorded above. The maintainer deferred two-window conversation continuity to [manual QA](MANUAL_TESTS.md).

## Limits and remaining risks

- The live sample covers one Windows build, one Codex build and one signed-in configuration. API-key and expired-login behavior were exercised through synthetic responses. Changes in plan, auth or provider schema can affect available fields.
- **Executable discovery.** The maintainer's ordinary PowerShell did not resolve `codex`. The probe now checks matching OpenAI extension manifests and the native path, rejects redirected paths and requires an explicit choice for multiple eligible versions. The automatically selected Windows bundle completed a live quota read. The expected local directory and metadata bound the search without cryptographically verifying installed contents. Custom extension directories and other architectures use the explicit override.
- Scope identifiers are optional. The schema includes workspace display metadata, and the live profile returned none. The provider and official UI can resolve different workspaces if profiles differ.
- The protocol delivers account quota with no attribution to a window, local project, conversation or turn. Cross-surface session linkage, concurrent activity, reconnect behavior and shared polling need subsequent integration work.
- Tests use Node's native TypeScript execution and test runner with no external packages. They exercise runtime behavior without a separate TypeScript compiler.
