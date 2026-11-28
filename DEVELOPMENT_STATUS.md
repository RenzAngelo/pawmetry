# Development status

## Resume here

- GitHub `main` contains the reviewed v0.1.5 source, and tag `v0.1.5` anchors the tested GitHub release. The v0.1.6 Marketplace listing update and documentation are on `listing/v0.1.6`. On 2026-11-28 the public Marketplace page reported v0.1.6. The listing branch was still local at that check. [GitHub release](https://github.com/RenzAngelo/pawmetry/releases/tag/v0.1.5) · [Marketplace](https://marketplace.visualstudio.com/items?itemName=renzangelo.pawmetry)
- The exact v0.1.6 Windows x64 VSIX was built from `4d7119a`, passed the package audit, and installed successfully in two isolated local VS Code hosts using synthetic shared quota. The new-device checkout passed all 57 tests with native Windows IPC enabled and passed the Windows desktop smoke. A clean install directly from the Marketplace and an in-place Marketplace update remain separate checks. [Test plan](TEST_PLAN.md) · [Release notes](RELEASE_NOTES.md)
- For an exact handoff use `listing/v0.1.6`. Use `origin/main` for a fresh public baseline. Start feature work on a new branch from the intended baseline. Keep old local development history and the native activity experiment separate from public changes. [Windows setup](CONTRIBUTING.md) · [Architecture](ARCHITECTURE.md)

## Next work when requested

1. Verify a fresh Marketplace install and the v0.1.5 to v0.1.6 update path. Check that **Help shape Pawmetry** appears in Details.
2. Bring an unpinned Cat to the foreground from the tray without changing its pin preference. Then add window-edge resizing independently of Cat size.
3. Keep native Codex activity and release automation as later milestones. Genuine IDE activity remains unverified. Public previews remain quota-only. [Roadmap](DEVELOPMENT_PLAN.md) · [Manual checks](MANUAL_TESTS.md)

Use [AGENTS.md](AGENTS.md) for project rules, [SECURITY.md](SECURITY.md) for runtime boundaries, and [PUBLISHING.md](PUBLISHING.md) for release steps. Pushes, merges into `main`, publishing, payments, and provider hook changes require separate approval.
