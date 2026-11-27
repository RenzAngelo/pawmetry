# Contributing

Use Windows 11 x64 for desktop and VS Code host checks. Run `npm.cmd ci` with Node 24 to install the locked development dependencies. Node and npm are build tools. Portable users receive the runtime with the ZIP.

```powershell
npm.cmd test
npm.cmd run desktop:smoke
npm.cmd run package:single-install
```

Packaging uses the pinned Electron runtime and VSCE. It produces a portable ZIP, VSIX and `SHA256SUMS.txt` in the displayed `dist/pawmetry-*` directory. Package hashes cover that exact output. Repeat builds can have different timestamps and build identities. Run the artifact and Windows checks documented in [TEST_PLAN.md](TEST_PLAN.md).

Keep changes scoped, use synthetic fixtures for provider data, and store only bounded local quota metadata. Keep credentials, provider traces, personal settings, and generated binaries out of Git. Respect the separation between the preview and experimental provider integrations. Read [AGENTS.md](AGENTS.md) before changing the design.

When the repository is public, start with an [issue](https://github.com/RenzAngelo/pawmetry/issues) for a new feature or bug, then use a [pull request](https://github.com/RenzAngelo/pawmetry/pulls) to share a small change. Include the build ID, verification steps and any checks still pending. Read the [Code of Conduct](CODE_OF_CONDUCT.md).
