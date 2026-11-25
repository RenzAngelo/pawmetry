# Third-party notices and prior art

Reviewed on 2026-11-25. The desktop prototype depends on Electron 45.5.0 under the MIT license. See the lockfile for transitive packages. [Electron license](https://github.com/electron/electron/blob/v45.5.0/LICENSE)

The desktop vendors 22 unmodified interface SVGs from `lucide-static` 0.468.0 under ISC. The package includes icons derived from Feather under MIT. Both license texts ship beside the SVGs in the portable desktop. These files are interface controls and are independent of the pet artwork. [Lucide package](https://www.npmjs.com/package/lucide-static/v/0.468.0) · [Lucide license](apps/desktop/icons/LICENSE) · [Feather license](apps/desktop/icons/LICENSE.feather)

| Project and upstream license | Approach documented by maintainers | Pawmetry takeaway |
| --- | --- | --- |
| VS Code Pets, MIT. [Repository](https://github.com/tonybaloney/vscode-pets) · [License](https://github.com/tonybaloney/vscode-pets/blob/main/LICENSE) | Animated pets in an editor-hosted extension view | Learn from editor controls and pet settings. Use an independent desktop process for desktop visibility |
| Agent Pets by ifBars, MIT. [License](https://github.com/ifBars/agent-pets/blob/main/LICENSE) · [Privacy notes](https://github.com/ifBars/agent-pets/blob/main/PRIVACY.md) | Desktop pet with provider adapters. Samples the Codex session index and rollout files for broad activity. Uses small hook status files for some providers | Use consented metadata-only delivery for a provider-neutral pet |
| CodexBar by steipete, MIT. [License](https://github.com/steipete/CodexBar/blob/main/LICENSE) · [Codex sources](https://github.com/steipete/CodexBar/blob/main/docs/codex.md) | macOS menu-bar app with multiple quota sources, including Codex App Server RPC. Other routes use OAuth, PATs or web data. Local cost history is handled separately | Use the quota window and freshness concepts. Evaluate only the provider-managed App Server route |
| Codex Usage Monitor by darhanger, MIT. [Repository](https://github.com/darhanger/Codex-Usage-Monitor) · [License](https://github.com/darhanger/Codex-Usage-Monitor/blob/main/LICENSE) | Native Windows taskbar quota display using local Codex App Server for Codex. Other providers use credential-based routes | Relevant precedent for the separate quota reader and Windows DPI concerns. Verify Pawmetry's own account scope and data handling independently |

Before incorporating any dependency or asset, record its exact version or revision, source, license and required attribution. Review packaged dependencies and reproduce any required notices in both the desktop installer and the VSIX. Verify asset rights independently of repository license badges. Keep original artwork and sounds with an authorship and licensing record.

Provider and editor names identify potential integrations. Pawmetry is independent. No affiliation, compatibility or endorsement is implied. The Pawmetry source license, name clearance and public publisher identity are pending.

## Native activity helper

The Windows portable build includes a standalone helper linked with the Go runtime and standard library. Their BSD-style license and patent grant ship as `LICENSE.go` and `PATENTS.go`. The helper has no third-party Go modules. [Go license](https://go.dev/LICENSE)
