# Pawmetry

**Your AI's pulse, brought to life.**

Pawmetry is a planned free, open-source, privacy-first desktop pet and VS Code extension. Its expressions and movement will reflect verified AI coding-agent activity and usage limits. The pet is designed to stay on the Windows desktop when VS Code is minimized.

## Project status

The quota probe has retrieved live Codex account limits on Windows 11 x64. Three maintainer-paired dashboard comparisons matched both quota windows. The provider workspace label and data age remain unknown, and the two-window VS Code continuity check remains open. Windows 11 and VS Code desktop are the first product target. Claude Code and GitHub Copilot are subsequent candidates. [Quota probe report](QUOTA_PROBE_REPORT.md)

## Run the quota probe

Use Node.js 24 or later and an installed native Codex executable with an existing Codex-managed ChatGPT sign-in. From this repository in a normal Windows PowerShell:

~~~powershell
npm.cmd run --silent quota:probe
npm.cmd test
~~~

On Windows x64 the probe checks the default local VS Code extension directory for one eligible OpenAI bundle. For custom locations or multiple eligible versions, select the trusted native executable explicitly:

~~~powershell
npm.cmd run --silent quota:probe -- --codex "C:\path\to\codex.exe"
~~~

On the tested Windows x64 installation, the OpenAI extension bundled the executable under `%USERPROFILE%\.vscode\extensions\openai.chatgpt-<version>-win32-x64\bin\windows-x86_64\codex.exe`. Check the installed extension version because an update can change the path.

Add `--show-workspace` to display the provider's workspace label locally when supplied. The probe performs one quota read and starts zero agent turns. Tests use synthetic replies and require no sign-in or dependencies. See the [manual comparison procedure](QUOTA_PROBE_REPORT.md#manual-validation).

## Run the prototypes

- Use `npm.cmd run simulate -- recharging` for an offline scenario in the terminal.
- Open **Settings** from the tray or pet. Dashboard and compact show pin, Settings, hide and more options. Hover over the pet in pet-only mode to reveal its controls. The options menu supports arrow keys and Escape. Hide to tray leaves monitoring running. Double-click the tray icon to restore the pet and disable click-through. The assigned global shortcut and **Pawmetry: Show Companion** also restore it.
- **Settings > Connections > Set up activity** checks for a supported local Codex installation and explains the profile-wide and single-project options. This build previews targets, and keeps temporary project creation under **Advanced > Diagnostics**. `npm.cmd run activity:probe -- --prepare-disposable` remains available as a standalone terminal probe. [Activity setup](#test-codex-activity-in-disposable-workspaces)
- Use `npm.cmd ci` and `npm.cmd run desktop` for the Windows companion. It starts in simulation. Enable **Live Codex quota** in the tray to read real quota. The first launch may download the pinned Electron runtime into the repository cache. Run `npm.cmd run desktop:smoke` for an offline renderer check. The separate `npm.cmd run desktop:smoke-live` intentionally makes one real quota request.
- Run `& .\tools\test-vscode.ps1` for the local extension-host test with an isolated profile. For interactive development, launch VS Code with `--extensionDevelopmentPath` pointing to `apps/vscode`. Editors share the desktop's quota results via authenticated local IPC. The VS Code refresh command asks the desktop rather than launching Codex from the editor.
- Run `npm.cmd run vscode:smoke-ipc` to test two isolated VS Code hosts against one synthetic coordinator. To include the disposable native discovery and hook-list checks in `npm.cmd test`, set `PAWMETRY_NATIVE_IPC_TEST=1` and `PAWMETRY_NATIVE_HOOKS_TEST=1` in the test shell.
- Run `npm.cmd run desktop:smoke-lock` to verify the desktop single-instance lock using an isolated profile and zero provider requests.
- Run `npm.cmd run desktop:smoke-performance` for five samples of hidden, offline companion CPU and process working sets in an isolated profile.

## Test Codex activity in disposable workspaces

Use **Live Codex quota** independently of activity. The desktop refuses native hook input from an elevated or administrator Windows account. Synthetic receiver diagnostics remain available. Leave the generated hooks pending in that environment.

1. Start the reviewed build under an isolated **standard Windows account**. Compare **Settings > About** with the build under review. In **Advanced > Diagnostics**, choose **Create two disposable workspaces** and wait for **Synthetic delivery passed**. Stop if the status says **Native activity blocked by Windows privileges**. Keep Pawmetry running for the rest of the test.
2. After the exact pack and standard-user checks pass, select **Copy Codex review command** for Workspace A. Paste it in PowerShell. Trust only that disposable directory if prompted, then type `/hooks`. Approve only the eight reviewed commands if you accept them. Each should name the hash-addressed `PawmetryActivity-….exe` and a two-second timeout. Stop if the commands differ or are absent. [Codex trust and hook review](https://learn.chatgpt.com/docs/hooks#review-and-trust-hooks)
3. Exit with `/exit`. Use **Open in VS Code** for Workspace A and start a fresh disposable conversation. Send one short model-only turn and check that A records a native model event. Repeat native review for Workspace B and a benign tool action only after A succeeds. Check that the rows stay distinct. [Manual test matrix](MANUAL_TESTS.md)
4. Select **Disconnect and remove disposable hooks**. Pawmetry revokes its capabilities and removes unchanged generated files. Edited files and native trust records are preserved. A crashed run may leave files to remove. Its old receiver can no longer acknowledge events.

Native Codex discovery and synthetic delivery passed separate automated checks. Trusted delivery from the VS Code extension remains open. See the [existing-project enrollment procedure](#enroll-an-existing-project-after-disposable-qa) before making any changes to a real project.

### Plan enrollment after disposable QA

1. Confirm native delivery in disposable VS Code windows first. The current wizard previews candidate paths. It does not enroll existing projects.
2. Choose one user-level hook file for local Codex clients using the same profile, or a project-only file for opt-in limited to that trusted project. The documented targets are `$CODEX_HOME/hooks.json` (normally `%USERPROFILE%\.codex\hooks.json`) and `<project>\.codex\hooks.json`. Confirm the editor’s actual profile before applying anything. Avoid overlapping user and project enrollments for the same workspace. [Codex hook locations](https://learn.chatgpt.com/docs/hooks#where-codex-looks-for-hooks)
3. Before installation, review the exact proposed addition, stable helper path, data scope and rollback. An installation should preserve other handlers and matchers and avoid writes to trust records or `config.toml`. Authorize the edit separately and use Codex to review only the new definitions. Verify in a fresh conversation when the project’s current task is finished.
4. To disable a future enrollment, disconnect its receiver or disable only Pawmetry’s hooks in native Codex. Remove only the exact added handlers to uninstall. Remove the file only when Pawmetry created it and it has stayed unchanged. Leave unrelated changes in place.

## Build and package locally

Run `npm.cmd ci`, then `npm.cmd test`. Run `npm.cmd run build:local` to stage app and extension sources. On Windows x64, run `powershell.exe -NoProfile -File tools/fetch-activity-sdk.ps1` once to verify and extract the pinned Go SDK into the repository cache. `npm.cmd run build:activity-helper` builds and tests the helper for local desktop development. `npm.cmd run package:local` builds it again and creates the portable ZIP and VSIX under the printed `dist/pawmetry-*` directory. The portable app carries the helper and its license. The SDK stays in the development repository. [Go downloads](https://go.dev/dl/) · [VS Code packaging](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)

Verify an artifact using `& .\tools\test-desktop-package.ps1 -Zip <zip-path>` or `npm.cmd run vscode:smoke-ipc -- <vsix-path>`. Both use disposable profiles and make zero provider requests.

1. Extract the ZIP into a user-owned folder and launch `Pawmetry.exe`. Quota starts in simulation. Tray **Settings** has three visible layouts, separate pet and per-layout window sizes, monitor placement, animation and global shortcut options, and individually configurable quota notifications. Tray **Show or hide** keeps monitoring independent of visibility. **Pause monitoring** stops quota requests and clears hook observations until resumed.
2. For the extension, choose **Install from VSIX** in VS Code and select the local package. If an older development copy has the same version, reinstall it with `code.cmd --install-extension <vsix-path> --force`. Open the **Pawmetry** view in Explorer or use the `Pawmetry:` commands. The companion must be running for these controls and real quota. A standalone quota read is available through `npm.cmd run quota:probe` if the desktop is unavailable.
3. Windows startup is off by default. The packaged app offers a per-user setting after a confirmation showing the executable path. Remove that entry from tray **Settings > Windows startup** before moving or deleting the portable folder if you opted in. Quit before uninstalling the VSIX or removing the extracted app. To reset desktop preferences, exit and remove only `%APPDATA%\Pawmetry\companion.json`.

The artifacts are unsigned local-development packages. An installer decision remains open while licensing, publisher identity, signing and Start Menu registration are reviewed. NSIS supports a future per-user installer. Native Windows toasts may require Start Menu registration. The companion displays its own low-quota notice when visible even if Windows suppresses the toast. [Electron Builder NSIS](https://www.electron.build/nsis.html) · [Electron notifications on Windows](https://www.electronjs.org/docs/latest/tutorial/notifications#windows)

If the editor reports disconnected, check the companion tray and the current Windows logon. The discovery helper respects Windows PowerShell policy. If policy blocks it, use the desktop on its own and leave the policy in place. Double-click the tray icon to recover from click-through.

## Project documents

| Document | Contents |
| --- | --- |
| [Product brief](PRODUCT_BRIEF.md) | Vision, audience, product boundaries and success measures |
| [Requirements](REQUIREMENTS.md) | Functional and privacy requirements |
| [Feasibility](FEASIBILITY.md) | Evidence, provider interfaces, workstation inventory and remaining risks |
| [Architecture](ARCHITECTURE.md) | Proposed modules, normalized state, local IPC and stack |
| [Development plan](DEVELOPMENT_PLAN.md) | Proof of concept, MVP, milestones and next task |
| [Security](SECURITY.md) | Data boundaries, threat model and consent |
| [Test plan](TEST_PLAN.md) | Acceptance and support criteria |
| [Quota probe report](QUOTA_PROBE_REPORT.md) | Runtime evidence, limits and manual validation |
| [Development status](DEVELOPMENT_STATUS.md) | Verified checkpoints and next steps |
| [Manual tests](MANUAL_TESTS.md) | Pending graphical and provider QA |
| [Animation asset specification](ANIMATION_ASSET_SPEC.md) | Mascot frames, atlas format, movement and asset validation |
| [Third-party notices](THIRD_PARTY_NOTICES.md) | Prior art, licenses and artwork policy |
| [Contributor guidance](AGENTS.md) | Repository rules and phase boundaries |

The [ignore rules](.gitignore) cover generated artifacts and common local files. Review changes locally with `git status --short`.

Pawmetry is an independent project. The name is provisional pending trademark clearance. A project source license remains to be selected before public distribution.
