# Codex quota validation

The native quota probe uses a separately launched, shell-free Codex App Server. Its allowlist is the fixed initialization sequence, `account/read` with forced refresh disabled, and one `account/rateLimits/read`. Pawmetry holds only normalized quota data and suppresses raw protocol logs. [Codex App Server](https://learn.chatgpt.com/docs/app-server)

Three maintainer-paired readings matched both official dashboard percentages. The locally calculated countdowns also matched the dashboard's displayed precision. The tested bundle returned 300-minute and 10,080-minute limits. Exact test timestamps and personal allowance readings are omitted from this public candidate.

Windows verification used the local VS Code Codex bundle and an existing ChatGPT sign-in. Synthetic tests separately cover malformed or partial data, expired sign-in, non-ChatGPT auth, timeout, cancellation and rotation. A native quota read leaves existing sessions outside Pawmetry's child-process lifecycle. Two-window conversation continuity and an editor-closed live reading remain in [manual QA](MANUAL_TESTS.md).

Workspace labels and the upstream observation age may be unavailable. The preview treats 120 seconds as the maximum local freshness window, displays a reset only when supplied, and returns unknown on expiry. These readings describe an account quota and carry no project attribution.
