# Codex quota probe report

**Status on 2026-11-25.** Genuine retrieval passed. Full milestone acceptance remains open until three probe reads are paired with the official usage UI for the same account and provider workspace and the two-window VS Code check is completed.

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
| Automated tests | **24 passed.** Synthetic replies covered the exact RPC allowlist, malformed and oversized frames, partial and unsupported quota, stale values, cancellation, disconnect, timeout and cleanup, signed-out and unauthorized cases, and suppression of raw identifiers and messages |
| Concurrent scope logic | **Passed with synthetic data.** Two conversations in one project and sessions in another IDE window and the CLI reference one quota snapshot. Different accounts, quota scopes, providers, auth modes or buckets remain independent |
| Native startup without sign-in | **Passed.** The actual binary completed the handshake using an empty disposable profile and reported signed out |
| Normal-profile startup in the managed shell | **Unavailable.** The child disconnected before returning quota, including with the standard profile directory selected for that invocation |
| Signed-in native retrieval | **Passed.** Three reads in the normal Windows user context returned the Codex bucket with 300-minute and 10,080-minute windows, integer usage and reset epochs. Both optional scope identifiers were present and hidden. The workspace label was unavailable |
| Non-interference | **Process-level check passed.** All 21 pre-existing VS Code and Codex processes remained present across the live checks. No new Codex process remained. The read-only protocol and synthetic sibling test verified scope of cleanup. Conversation-level UI continuity still needs the two-window check |
| Official usage parity | **Pending.** Three successful probe reads, zero paired UI observations. The signed-in usage page was unavailable through the research tools |

### Live readings already observed

| Probe retrieval time (UTC) | Result | Official UI comparison |
| --- | --- | --- |
| 2026-11-25 05:56:14 | Two windows, usage and reset timestamps present | Unpaired |
| 2026-11-25 05:57:22 | Two windows, usage and reset timestamps present | Unpaired |
| 2026-11-25 05:57:24 | Two windows, usage and reset timestamps present | Unpaired |

The second and third readings matched each other. Usage changed between the first and second readings while the reset timestamps stayed the same. The source provides no client or project attribution. Exact personal allowance readings are omitted from the repository.

## Manual validation

1. Keep two VS Code windows on different local projects with existing Codex conversations. Confirm that both use the same ChatGPT account and provider workspace. Leave any existing activity alone. No new prompt or inference call is needed.
2. Open the official Codex usage dashboard in that account and workspace. Confirm an ambiguous workspace in the official client before recording a comparison. [Official usage dashboard](https://chatgpt.com/codex/settings/usage) · [OpenAI usage guidance](https://help.openai.com/en/articles/11369540-using-codex-with-your-chatgpt-plan)
3. In normal PowerShell opened in this repository, run the probe. Refresh the dashboard immediately and compare the matching allowance bucket and window within the dashboard's displayed precision. If the dashboard shows only remaining percentage, compare it to the probe's remaining percentage. Compare reset times in the same timezone. Record a field as unavailable when the dashboard omits it. Repeat for three paired readings.

   ~~~powershell
   $codexExecutable = (Get-Command codex -CommandType Application -ErrorAction Stop).Source
   npm.cmd run --silent quota:probe -- --codex "$codexExecutable"
   ~~~

   If PowerShell cannot resolve `codex` or resolves only a shim, pass the absolute path to the trusted native `codex.exe` directly. The OpenAI extension can bundle an executable that a normal PowerShell cannot find on PATH. See the [explicit-path example](README.md#run-the-quota-probe). Add `--show-workspace` if the provider supplies a workspace label. The probe leaves sign-in controls to Codex.

4. Check both VS Code windows after each read. Confirm existing conversations are still open, already-running tasks continue as usual, and no reload or sign-in prompt appears. One window can be minimized during a round and restored for the check. Share match or mismatch by field and any continuity problems, leaving out account names, workspace names, IDs and conversation details.

| Pair | UTC time | Short window percentage / reset | Long window percentage / reset | Both VS Code windows stayed usable |
| --- | --- | --- | --- | --- |
| 1 | Pending | Pending | Pending | Pending |
| 2 | Pending | Pending | Pending | Pending |
| 3 | Pending | Pending | Pending | Pending |

## Limits and remaining risks

- The live sample covers one Windows build, one Codex build and one signed-in configuration. API-key and expired-login behavior were exercised through synthetic responses. Changes in plan, auth or provider schema can affect available fields.
- **Executable discovery.** The managed shell found the bundled executable, while the maintainer's ordinary PowerShell did not resolve `codex`. Extension paths are versioned and can change after upgrades. Future onboarding should identify the trusted native executable, show which one it found, and allow an explicit path when discovery fails or finds multiple candidates.
- Scope identifiers are optional. The schema includes workspace display metadata, and the live profile returned none. The provider and official UI can resolve different workspaces if profiles differ.
- The protocol delivers account quota with no attribution to a window, local project, conversation or turn. Cross-surface session linkage, concurrent activity, reconnect behavior and shared polling need subsequent integration work.
- Tests use Node's native TypeScript execution and test runner with no external packages. They exercise runtime behavior without a separate TypeScript compiler.
