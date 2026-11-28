# Pawmetry Public Preview release notes

## 0.1.6 Marketplace listing update

This update adds a startup guide, feature summary, and GitHub feedback links to the extension's Details page. It keeps the same quota-only scope as v0.1.5. The public Marketplace page reported v0.1.6 on 2026-11-28. [Marketplace listing](https://marketplace.visualstudio.com/items?itemName=renzangelo.pawmetry)

## 0.1.5 Public Preview

Install one Windows x64 VSIX and click **Start Pawmetry** in VS Code. Pawmetry connects to live Codex quota after confirmation. If Codex is unavailable, the desktop and editor show unknown readings. Manage quota access in **Settings → Connections**. [Installation and troubleshooting](INSTALLATION.md)

Cat debuts with energy and stamina indicators, local reset countdowns, pet-only, compact, and dashboard views, and saved appearance preferences. The approved Pawmetry logo appears in the Windows executable, tray, Settings, and VS Code. Native prompt activity remains experimental and is excluded from this preview. The companion is unsigned and Windows policies can block it. [Release acceptance](MANUAL_TESTS.md)

The tested VSIX and its checksum are available in the [GitHub prerelease](https://github.com/RenzAngelo/pawmetry/releases/tag/v0.1.5). The [Marketplace listing](https://marketplace.visualstudio.com/items?itemName=renzangelo.pawmetry) is public.

## 0.1.0 standalone preview

This first preview focuses on Codex account quota. The Windows pet reflects available short- and long-term allowances with energy, stamina and movement. A matching VS Code extension shows the same data across local editor windows.

Use **Live Codex quota** from the tray to connect. Keep the extracted portable folder together and use the accompanying checksums. No extra Node.js or Go installation is needed. [Installation and troubleshooting](INSTALLATION.md)

The preview uses temporary artwork. Native activity, agent alerts, other providers and custom pets are deferred. Account quota cannot identify the project that consumed it. Source age and some reset or allowance fields may be unavailable. The Windows package is unsigned and can be blocked by Windows policy.

This candidate is prepared locally for maintainer review. See [release acceptance](MANUAL_TESTS.md) for the checks still required.
