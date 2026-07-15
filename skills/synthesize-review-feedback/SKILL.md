---
name: synthesize-review-feedback
description: Use after LensTemper reviewer outputs already exist and the task is only to consolidate findings, decisions, rerun status, or final readiness.
---

# LensTemper Synthesis Owner

Use `reviews/synthesize-review-feedback.md` as the output contract and
`reviews/README.md` for lock, rerun, and materiality rules from the skill
package or repository root.

## Inputs

- Canonical review input and its normalized revision.
- Feature request, proposed plan, and relevant context.
- Complete review outputs.
- Constraints.
- Ledger state when available.

For full runs, reject synthesis inputs whose review input revision differs from
the ledger even when the target revision is unchanged.

## Outputs

- Consolidated critique.
- Per-finding decisions.
- Lens lock and rerun decisions.
- Recommended plan changes.
- Final assessment.

Only the synthesis owner may accept, reject, downgrade, or defer findings that
affect readiness or rerun scope.
