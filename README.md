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
- Use the tray’s **Start or stop disposable Codex activity** command to prepare two workspaces for the companion. `npm.cmd run activity:probe -- --prepare-disposable` offers the equivalent standalone terminal probe. Follow the [activity setup](#test-codex-activity-in-disposable-workspaces).
- Use `npm.cmd ci` and `npm.cmd run desktop` for the Windows companion. It starts in simulation. Enable **Live Codex quota** in the tray to read real quota. The first launch may download the pinned Electron runtime into the repository cache. Run `npm.cmd run desktop:smoke` for an offline renderer check. The separate `npm.cmd run desktop:smoke-live` intentionally makes one real quota request.
- Run `& .\tools\test-vscode.ps1` for the local extension-host test with an isolated profile. For interactive development, launch VS Code with `--extensionDevelopmentPath` pointing to `apps/vscode`. Editors share the desktop's quota results via authenticated local IPC. The VS Code refresh command asks the desktop rather than launching Codex from the editor.
- Run `npm.cmd run vscode:smoke-ipc` to test two isolated VS Code hosts against one synthetic coordinator. To include the disposable native discovery and hook-list checks in `npm.cmd test`, set `PAWMETRY_NATIVE_IPC_TEST=1` and `PAWMETRY_NATIVE_HOOKS_TEST=1` in the test shell.
- Run `npm.cmd run desktop:smoke-lock` to verify the desktop single-instance lock using an isolated profile and zero provider requests.
- Run `npm.cmd run desktop:smoke-performance` for five samples of hidden, offline companion CPU and process working sets in an isolated profile.

## Test Codex activity in disposable workspaces

1. Start Pawmetry and choose **Start or stop disposable Codex activity**. The companion shows the two new folders under local application data. Keep the companion running while testing.
2. Open each folder in a separate local VS Code window. Inspect the generated `.codex/hooks.json`. Each entry runs the local Pawmetry metadata helper with a two-second timeout. It targets this one companion run. Avoid sharing these files because they contain a local receiver capability.
3. Use Codex’s native project and hook review. Trust only the exact definitions you reviewed if you agree to the test. Official documentation describes `/hooks` for the CLI. If your IDE offers no review, record the IDE check as unavailable. Check for hook-policy warnings or a need to open a disposable conversation after enabling hooks. [Codex hook discovery and trust](https://learn.chatgpt.com/docs/hooks#review-and-trust-hooks)
4. Follow [the manual test matrix](MANUAL_TESTS.md) for model-only work, tool work, interruption, multiple sessions and minimization. If Pawmetry stays unknown, verify the active Codex working folder is one of the two shown and that the exact hooks are active. The desktop and extension show aggregate observations. A specific editor window's session identity remains unknown.
5. Close the disposable editor windows and use the same tray command to stop the receiver. Pawmetry removes its unchanged configurations and empty folders. After an unexpected exit, remove only the generated `.codex/hooks.json` in those disposable folders after reviewing it. Reopening the activity setup creates new folders and a fresh receiver.

Existing projects require individual approval to prepare their hook changes. Codex’s hook discovery and the Pawmetry receiver have passed separate automated checks. Native trusted delivery from VS Code remains open. Hook evidence can indicate working, interruption, stale or disconnected. Waiting, task success, failure and idle remain unknown when there is no authoritative signal.

## Build and package locally

Run `npm.cmd ci`, then `npm.cmd test`. Run `npm.cmd run build:local` to stage self-contained app and extension sources. Run `npm.cmd run package:local` on Windows x64 to create a portable ZIP and a VSIX in the printed `dist/pawmetry-*` directory. Packaging pins the official VSCE tool and uses the repository npm and Electron caches. The GitHub Actions workflow runs the tests and builds source staging with read-only permissions. [VS Code packaging](https://code.visualstudio.com/api/working-with-extensions/publishing-extension) · [Electron distribution](https://www.electronjs.org/docs/latest/tutorial/application-distribution)

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
