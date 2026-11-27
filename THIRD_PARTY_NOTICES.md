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

Provider and editor names identify potential integrations. Pawmetry is independent. No affiliation, compatibility or endorsement is implied. Pawmetry's original source code is licensed under [MIT](LICENSE). Name clearance and the public publisher identity are pending.

The Windows portable preview and the single-install VSIX include Electron's runtime and bundled Chromium notices. The standalone preview's optional editor-only VSIX uses the runtime already provided by VS Code. The public preview contains no Go runtime or additional mascot pack.

The release build uses `resedit` 3.1.0 and its `pe-library` dependency to embed the Windows executable icon. Both are MIT build-time dependencies and are omitted from the runtime and VSIX. VSCE is also a build tool. [Resource editor license](https://github.com/jet2jet/resedit-js/blob/main/LICENSE) · [PE library license](https://github.com/jet2jet/pe-library-js/blob/main/LICENSE)
