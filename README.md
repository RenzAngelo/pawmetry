# Pawmetry

**Your AI's pulse, brought to life.**

Pawmetry is a planned free, open-source, privacy-first desktop pet and VS Code extension. Its expressions and movement will reflect verified AI coding-agent activity and usage limits. The pet is designed to stay on the Windows desktop when VS Code is minimized.

## Project status

Phase 0 and Phase 1 are complete for review. This repository contains the product definition, technical feasibility and implementation plan. Windows 11 x64 and VS Code desktop are the first target, with OpenAI Codex as the first integration candidate. Claude Code and GitHub Copilot are subsequent candidates. Pawmetry has yet to pass independent runtime testing with any provider.

The first prototype will test whether a separately launched Codex App Server can report matching account quota, whether an opted-in hook can report activity from the stock Codex extension, and whether the desktop and editor show the same simulated state while minimizing or closing VS Code. [Feasibility findings](FEASIBILITY.md) · [Development plan](DEVELOPMENT_PLAN.md)

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
| [Third-party notices](THIRD_PARTY_NOTICES.md) | Prior art, licenses and artwork policy |
| [Contributor guidance](AGENTS.md) | Repository rules and phase boundaries |

The Git baseline uses the existing `main` branch and `origin` remote. The [ignore rules](.gitignore) cover generated artifacts and common local files. Review changes locally with `git status --short`. Application setup instructions will follow an approved implementation milestone.

Pawmetry is an independent project. The name is provisional pending trademark clearance. A project source license remains to be selected before public distribution.
