---
name: plan-review-orchestrator
description: Use when selecting lenses, assembling prompts, tracking reviewer state, synthesizing outputs, deciding reruns, or archiving a LensTemper plan review.
---

# LensTemper Plan Review Orchestrator

Use `reviews/registry.json` from the plugin or repository root as the entry
point. Read `reviews/README.md`, `reviews/AGENT.md`, selected lens manifests,
and selected role manifests before running a review.

## Inputs

- Target plan or spec path.
- Feature request and constraints.
- Selected lenses, or enough context to select lenses.
- Pass id and deterministic target revision.

## Outputs

- Ledger JSON.
- Per-lens prompt packets or reviewer instructions.
- Captured review outputs.
- Synthesis output.
- Rerun decisions and completion summary.

## Procedure

1. Select the smallest lens set that covers the plan risk.
2. Create or update a ledger with deterministic target, template, and lens
   revisions.
3. Assemble reviewer prompts with `reviews/scripts/assemble-review-prompt.mjs`
   when possible.
4. Run reviewers as independent fresh agents when the host supports that.
5. Validate review, synthesis, and ledger JSON with
   `reviews/scripts/validate-review-fixtures.mjs` or the individual validators.
6. Archive completed runs with `reviews/scripts/archive-review-run.mjs`.

The orchestrator may update ledger state. Lens reviewers may not.
