## Context

SpecDeck reads Markdown and git directly, bundles OpenSpec 1.4.1, and detects legacy per-tool commands. Current OpenSpec installs shared or global skills. Existing delta parsing and capability links provide the foundation for a read-only review.

## Goals / Non-Goals

**Goals:** Support the published 2.1 CLI without losing legacy handoff; compare requirements and scenarios; preview resulting capability requirements; inspect artifact changes since approval.

**Non-Goals:** Test-evidence ingestion, semantic conflict inference, additional SDD providers, agent execution, publishing, or automatically migrating user projects.

## Decisions

- Verify compatibility against the actual bundled CLI and generated fixtures. Keep old command detection alongside skill detection; use exact workflow-to-skill mappings instead of substring matching.
- Inspect only known local skill roots. Shared skills prove a workflow is available, not that every agent is installed. Display the installation source and use a generic shared-skills entry when agent attribution is unknown.
- Compute comparisons on request from the current snapshot. Match requirements by whitespace-normalized names, with explicit renames. Show scenario changes by name and body. Do not use fuzzy or model-based matching.
- Withhold the resulting preview when duplicate names, invalid operations, missing targets, or parser errors prevent a reliable application. Show the reason beside the comparison. Archived changes cannot be reliably replayed against today's specs and receive an explanation instead.
- Read artifact versions at the approval commit through the existing git source. Show before/after contents, including additions and deletions; never mutate the working tree to compare.
- Keep review state ephemeral and preserve source Markdown. Render through existing sanitization or escaped text. Use responsive two-column comparisons and collapsed unchanged scenarios.

## Risks / Trade-offs

- Upstream layout changes: verify generated fixtures and retain a newer-than-verified warning.
- Name-based identity: reject ambiguous matches instead of inventing identities.
- Main specs may already contain a synced delta: explain inconsistent targets rather than claiming a valid preview.
- Global skills are machine-local: never claim they are repository configuration or agent installation evidence.

## Migration Plan

Update the bundled dependency and tests, then ship normal package updates. Opening a managed project performs no migration. Rollback uses the previous SpecDeck package and requires no data conversion.
