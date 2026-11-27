# Public Preview release acceptance

## Single-install preview

**Maintainer result, 2026-11-27.** The v0.1.5 VSIX installed and launched in VS Code on a standard, non-administrator Windows account with no Windows warning. Uninstall and the other checklist steps were unreported in that run.

For v0.1.5, use `dist/pawmetry-8a7iSS/Pawmetry-0.1.5-win32-x64-single-install.vsix`. Exit any older companion from the tray. Disable the old `pawmetry-local.pawmetry` extension if installed so only the release candidate offers controls. On a standard Windows account, install the checked VSIX in a trusted local VS Code window and verify the extension ID is `renzangelo.pawmetry`. Click **Start Pawmetry**, accept the prompt, and confirm Cat appears and genuine quota matches Codex without a tray setup step. In **Settings → Connections**, turn off quota access and restart to confirm it stays off. Reconnect, verify another VS Code window shows the same data, then exit and uninstall. Record any Windows policy block with protections enabled. Use the remaining checks below where applicable.

## Standalone preview and shared checks

Use the exact ZIP and VSIX and record the build ID, Windows and VS Code versions, and pass, fail or unavailable for each row. These checks are pending unless a recorded result identifies the specific preview build and environment.

| Check | What to verify |
| --- | --- |
| Clean standard-user install and removal | In a genuine standard Windows account, verify the published checksums, extract the ZIP, install the VSIX, and confirm neither needs elevation or extra runtimes. Record any SmartScreen or policy blocks with protections enabled. Exit, uninstall, and check app files and optional preference cleanup. |
| Live parity and editor independence | Compare both remaining percentages and resets with Codex's official usage interface for the same account. Use two trusted local VS Code windows and minimize one. Check the same values and both conversations' continuity. With the editors closed, confirm the installed bundle still returns quota. No new prompts are needed. |
| Visible controls and two monitors | In each view, change sizes both ways and change pet size independently. Try all themes, transparent mode, pin, tray hide/show, keyboard menu dismissal, and click-through recovery. Restart and check saved settings. Repeat near mixed-DPI monitor edges and verify placement and that focus returns. |
| Sleep, offline, recovery and logon isolation | Check stale values after sleep or network loss and recovery on return. Confirm one normal desktop instance. From a separate interactive Windows logon, verify it cannot use the first logon's IPC. |
| Public scope | Confirm **Connections** offers quota only, **About** describes Coming Soon features, and no enrollment, activity diagnostics or alerts are visible. |

Native activity approval and live event testing belong to the experimental branch. The public preview requires neither disposable workspaces nor hook trust.

The Cat review is a quota build. Its Connections page has no Advanced tab. The experimental executable has a separate Settings sidebar with **Advanced → Diagnostics**. Exit the Cat review from the tray before launching the experimental app so the active companion does not receive the second launch.

## Cat sizing review

In **Settings → Appearance**, try 64, 96, 128, and 192 px, plus a custom value. In each mode, change the window size and confirm Cat fits, then enlarge the window and confirm it uses the saved size again. On a second monitor, check that the ears, tail, laptop, and jump frames remain visible. Use the [clip previews](assets/mascots/cat/review/index.html) for the laptop and the airborne poses.

On the physical desktop, hover Cat in pet-only mode and move across the gap to the toolbar. Unpin and immediately re-pin it, then test **Settings** and **More options**. Repeat near a mixed-DPI monitor edge. The isolated Windows smoke covers the hover path and immediate pin changes with injected Electron input.

## Native Codex activity

**Recorded result, 2026-11-27.** The new Workspace A VS Code prompt did not update the last-event timestamp on the private v0.1.1 build. Hook discovery and synthetic delivery passed. Leave native IDE delivery pending and defer another prompt until the delivery path changes.

Reuse the installed private **Pawmetry Activity Validation** VSIX (`0.1.1 · 909054cec225 · 2928a40c1c88`). In a trusted local Windows VS Code window, click **Start Pawmetry Activity Test** if the companion is closed. In **Settings → Advanced → Diagnostics**, use the current disposable workspace or generate it once if it was cleaned up. Use Workspace A’s **Open in VS Code** button. In a fresh Codex chat, use **Review hooks** in the Codex composer if offered. Review and approve only the generated Workspace A Pawmetry entries. If the control is absent, stop before sending a prompt. After native IDE approval, send one model-only prompt and check the workspace’s last-event time. Leave Workspace B alone until IDE delivery in A is verified.

After A receives a native event, review Workspace B separately and test a benign tool turn while A is active. Check minimized-window delivery, an interruption and turn-ended state. Confirm the latter does not report success. Use **Disconnect and remove disposable hooks** and verify definitions are removed and the receiver stops acknowledging requests.
