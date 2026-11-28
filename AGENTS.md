# Working on Pawmetry

Pawmetry is a local-first desktop pet and VS Code extension. Read [the product brief](PRODUCT_BRIEF.md), [feasibility findings](FEASIBILITY.md) and [security requirements](SECURITY.md) before changing its design.

Use [Contributing](CONTRIBUTING.md) for a fresh Windows setup and [the roadmap](DEVELOPMENT_PLAN.md) to find the next development tasks.

- The maintainer approved local development of the ordered milestones in the [development plan](DEVELOPMENT_PLAN.md). Keep live provider claims gated on validation and track deferred graphical checks in [MANUAL_TESTS.md](MANUAL_TESTS.md).
- Use current official documentation and distinguish documented behavior, local verification, inference and open questions. Require independent runtime evidence for each provider capability and supported surface.
- Preserve provider-neutral contracts. Keep quota, activity and connection state independent. Missing, stale or ambiguous data becomes unknown. Simulation stays visibly labeled.
- Leave credentials and content with their provider. Never collect prompts, source, conversations or raw provider logs. Use documented interfaces and ask for explicit consent before modifying any provider hook configuration.
- Keep new dependencies justified, local and scoped. Use synthetic fixtures for CI. Keep provider files, secrets, build outputs and personal editor state out of Git.
- Keep branding centralized. Use original character assets and record their provenance. The working name and license need review before public distribution.
- Keep changes scoped to this repository. Global provider changes, pushes, merges into main, publication, deployment, payments and trademark registration require separate approval.
