# Working on Pawmetry

Pawmetry is a local-first desktop pet and VS Code extension. Read [the product brief](PRODUCT_BRIEF.md), [feasibility findings](FEASIBILITY.md) and [security requirements](SECURITY.md) before changing its design.

- The maintainer approved the quota-only probe. Keep implementation within that milestone until the maintainer approves further work.
- Use current official documentation and distinguish documented behavior, local verification, inference and open questions. Require independent runtime evidence for each provider capability and supported surface.
- Preserve provider-neutral contracts. Keep quota, activity and connection state independent. Missing, stale or ambiguous data becomes unknown. Simulation stays visibly labeled.
- Leave credentials and content with their provider. Never collect prompts, source, conversations or raw provider logs. Use documented interfaces and ask for explicit consent before modifying any provider hook configuration.
- Keep new dependencies justified, local and scoped. Use synthetic fixtures for CI. Keep provider files, secrets, build outputs and personal editor state out of Git.
- Keep branding centralized. Use original character assets and record their provenance. The working name and license need review before public distribution.
- Keep changes scoped to this repository. Publication, deployment, payments, trademark registration and later implementation require separate approval.
