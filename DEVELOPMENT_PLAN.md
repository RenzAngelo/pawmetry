# Development roadmap

## Public Preview

The v0.1.5 public release ships Cat in a Windows x64 VSIX with shared local quota and three display modes. Start future development on a feature branch from `origin/main`. The `v0.1.5` tag anchors the tested release. [Setup](CONTRIBUTING.md) · [Release acceptance](MANUAL_TESTS.md)

## Follow-up releases

1. Make a tray click bring an already-visible, unpinned companion to the foreground without changing its pin setting. Add drag-to-resize for the outer companion window while keeping Cat's size independently adjustable. Evaluate alert delivery and signing separately.
2. Validate trusted native IDE delivery in the isolated activity branch under a supported filtered-administrator or standard-user token. Start with model-only and tool observations, then test simultaneous workspaces, minimization, turn ending and revocation. Review the result before enrolling existing projects or bringing activity into a candidate. Keep the quota-only candidate available.
3. Assess more providers, projects, and platforms independently. Scope history, predictions, and custom pet packs only after their privacy and security requirements are clear.
4. Automate release preparation with GitHub Actions. Run tests, build the public VSIX, audit it, generate the checksum, and prepare a draft release. Keep human approval for publication and evaluate Marketplace Trusted Publishing later.

Publication, publisher identity, licensing, name clearance, and artwork decisions require maintainer approval.
