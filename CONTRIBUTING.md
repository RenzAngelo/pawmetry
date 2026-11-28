# Contributing

## Set up on a new computer

Install Git, Node.js 24 with npm, and desktop VS Code 1.109 or later. Use Windows 11 x64 for Windows builds and desktop tests. Clone the public repository and start new work from `origin/main`. The `v0.1.5` tag is useful for reproducing that release. The older quota and activity branches are historical.

```powershell
git clone https://github.com/RenzAngelo/pawmetry.git
cd pawmetry
git switch -c feature/my-change origin/main
npm.cmd ci
npm.cmd test
npm.cmd run desktop:smoke
npm.cmd run desktop
```

Dependencies and build output are recreated on each machine. Cat's approved sprite atlas and logo are checked in. Install and sign in to the local OpenAI Codex VS Code extension only when testing genuine quota. The default development launch starts in simulation. Exit any running Pawmetry companion before interactive desktop testing. Use `npm.cmd run desktop:smoke-live` for a read-only live quota check.

For a release-style build, run `npm.cmd run package:public-preview`. It creates the Windows x64 single-install VSIX and `SHA256SUMS.txt` under `dist/pawmetry-*`. The bundle includes its runtime. Run the artifact and Windows checks in [TEST_PLAN.md](TEST_PLAN.md). Keep VSIX packages and `node_modules` out of Git.

Keep changes scoped, use synthetic fixtures for provider data, and store only bounded local quota metadata. Keep credentials, provider traces, personal settings, and generated binaries out of Git. Respect the separation between the preview and experimental provider integrations. Read [AGENTS.md](AGENTS.md) before changing the design.

Use a [GitHub issue](https://github.com/RenzAngelo/pawmetry/issues) for a feature or bug and a [pull request](https://github.com/RenzAngelo/pawmetry/pulls) for a reviewed change into `main`. Include the build ID, verification steps and any checks still pending. Read the [Code of Conduct](CODE_OF_CONDUCT.md).
