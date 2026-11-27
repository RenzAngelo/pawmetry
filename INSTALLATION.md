# Install and remove Pawmetry

## Windows single-install preview

Install the Windows x64 VSIX via **Extensions → Install from VSIX** in local VS Code. The optional `-cat-review` variant is for local artwork review. Both variants use the same extension ID. Left-click **Start Pawmetry** in the status bar and accept the prompt to start reading live quota. If Codex can't be reached, the meters show unavailable values. Use **Settings → Connections** to turn off quota access or reconnect. That choice survives restarts. Exit any running standalone copy before switching to the bundled companion.

The VSIX includes the Windows runtime and uses authenticated local IPC. An explicitly started companion can keep running after VS Code closes. After installing a newer VSIX, click the Pawmetry desktop status item to restart an older bundled companion. The restart prompt explains live quota access. Exit Pawmetry before uninstalling the extension to release the Windows executable and DLL files.

Run `npm.cmd run package:single-install:cat` for the local Cat review. After the source license, public listing metadata, and Cat redistribution terms are recorded, `npm.cmd run package:public-preview` builds the public Windows x64 VSIX. Raw VSIX updates are manual. Marketplace delivery and clean standard-user acceptance remain release checks. The preview excludes native activity enrollment.

## Requirements

- Windows 11 x64. The portable companion includes its runtime.
- Live quota needs the local OpenAI Codex extension installed in the default VS Code extension location and signed in with ChatGPT.
- The optional Pawmetry extension targets VS Code 1.109 or later in a trusted local window.

## Install

1. Obtain the matching portable ZIP, VSIX if wanted, and `SHA256SUMS.txt` from the approved release channel. Compare the relevant entries with `Get-FileHash -Algorithm SHA256 -LiteralPath <file>` in PowerShell.
2. Exit any older Pawmetry build. Extract the whole ZIP to a folder you own and launch `Pawmetry.exe`. Keep the accompanying runtime files in that folder.
3. Use the tray menu to select **Live Codex quota**. The **Connections** tab can check for the local Codex installation. The preview uses the existing Codex sign-in.
4. Optionally use **Extensions > Install from VSIX**, then **Pawmetry: Connect to Companion**. The extension opens no provider connection by itself.

The Windows executable is unsigned in both the portable ZIP and the bundled VSIX. SmartScreen or Smart App Control may warn or block it, including on managed PCs. If Windows blocks it, use an administrator-approved distribution or a signed release when available. Keep Windows protections enabled. A matching checksum identifies the package bytes. Publisher provenance depends on the release channel. [Microsoft SmartScreen guidance](https://learn.microsoft.com/windows/apps/package-and-deploy/smartscreen-reputation)

## Troubleshoot

| Symptom | Check |
| --- | --- |
| Codex cannot be found | Use **Settings > Connections > Check for Codex**. Confirm one eligible local OpenAI Codex install and a ChatGPT sign-in in VS Code. WSL and Remote extensions are outside the preview. |
| Quota is unknown or stale | Check sign-in and connectivity, then refresh. Pawmetry clears expired values. A passed countdown does not establish a reset. |
| Companion is disconnected in VS Code | Launch the matching preview companion in the same Windows logon and select **Pawmetry: Connect to Companion** in a trusted local window. Older prototype extensions use a different protocol. |
| Pet is hidden or click-through | Double-click the Pawmetry tray icon, or use **Show or hide pet**, the configured hotkey, or **Pawmetry: Show Companion**. |
| Pawmetry appears to open an older copy | Exit the existing instance from the tray. Launch the executable from the new extraction and confirm **Settings > About**. |

## Uninstall

Exit Pawmetry from its tray, uninstall the Pawmetry extension from VS Code, and delete the extracted portable folder. To reset saved preferences, delete `%APPDATA%\Pawmetry\companion.json` after quitting. Normal shutdown removes the local IPC descriptor. A crash can leave a stale descriptor under Local AppData. The next launch replaces it after verifying the old listener is gone.

## Distribution options

For the first public preview, a GitHub prerelease in a clean public repository can host the ZIP, VSIX and checksums. Each prepared asset is within GitHub's 2 GiB per-asset limit. This path needs no Windows installer or Marketplace listing. [GitHub releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)

Marketplace publication is a separate decision. Choose a permanent publisher ID, use it in the extension manifest, and rebuild and test the VSIX under that identity. Microsoft supports manual VSIX upload through the publisher dashboard and recommends Microsoft Entra ID for automated publishing. Microsoft lists December 1, 2026 as the retirement date for global Azure DevOps personal access tokens. The preview's local publisher ID remains provisional. [VS Code publishing documentation](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
