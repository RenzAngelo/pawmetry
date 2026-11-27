# Pawmetry

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/branding/pawmetry/logo-dark.svg">
  <img src="assets/branding/pawmetry/logo-light.svg" width="310" alt="Pawmetry logo">
</picture>

**Your AI's pulse, brought to life.**

Pawmetry turns Codex usage limits into an animated Windows desktop companion. See the short-term allowance as **energy** and the long-term allowance as **stamina**. The companion stays available when VS Code is minimized, and a companion VS Code extension shows the same readings from one shared quota monitor.

Pawmetry is an independent third-party application. It is not an official OpenAI product. The name is a working name pending trademark review.

## Windows single-install preview

- Cat, the first Pawmetry mascot, with genuine Codex quota, remaining percentages, local reset times, and countdowns in the v0.1.5 release candidate.
- A transparent pet-only view, compact view, and dashboard with independent pet and window sizes.
- Desktop positioning, always-on-top, theme and opacity settings, reduced motion, click-through, and tray recovery.
- VS Code status indicators and controls for the same local companion. The desktop can query the installed Codex bundle independently of the editor process.
- Unavailable or stale quota is shown without estimated values.

The supported target is Windows 11 x64 with the local OpenAI Codex extension for VS Code signed in via ChatGPT. Other operating systems, remote VS Code hosts, API-key usage, and other providers are outside this preview. Account allowances can be shared across projects. Workspace labels and the provider's upstream data age may be unavailable.

## Install and connect

1. Verify the Windows VSIX against its SHA-256 checksum and install it with **Extensions → Install from VSIX**.
2. In trusted local VS Code, click **Start Pawmetry** in the status bar and confirm live Codex quota access.
3. The companion connects to Codex. Manage quota access in **Settings → Connections**. Use the tray to hide or exit Pawmetry.

See the [installation and troubleshooting guide](INSTALLATION.md) for platform requirements, unsigned package behavior, and removal.

## Privacy and architecture

Pawmetry runs locally. It leaves sign-in and provider credentials with Codex and starts no inference turns. The companion launches a separate Codex App Server for read-only quota requests. Electron owns the companion and quota cache. The TypeScript VS Code extension reads the same quota over authenticated localhost IPC. Pawmetry operates without analytics, a cloud backend, or a separate paid API. Live quota availability still depends on the user's Codex account. [Privacy statement](PRIVACY.md) · [Architecture](ARCHITECTURE.md) · [Security](SECURITY.md)

## Coming soon

Native Codex prompt activity is the next priority. The experimental integration is kept out of the preview. Cat’s preview motion reflects account quota. Additional providers and mascots are planned.

Build from source with [CONTRIBUTING.md](CONTRIBUTING.md). Once the repository is public, you can [star Pawmetry](https://github.com/RenzAngelo/pawmetry), [report a bug or request a feature](https://github.com/RenzAngelo/pawmetry/issues), or [open a pull request](https://github.com/RenzAngelo/pawmetry/pulls). See the [release notes](RELEASE_NOTES.md), [MIT source license](LICENSE), and [separate artwork terms](ARTWORK.md).
