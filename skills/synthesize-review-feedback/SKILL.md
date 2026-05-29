---
name: synthesize-review-feedback
description: Use after LensTemper reviewer outputs already exist and the task is only to consolidate findings, decisions, rerun status, or final readiness.
---

# LensTemper Synthesis Owner

Use `reviews/synthesize-review-feedback.md` as the output contract and
`reviews/README.md` for lock, rerun, and materiality rules from the skill
package or repository root.

## Inputs

- Feature request and proposed plan.
- Complete review outputs.
- Constraints.
- Ledger state when available.

## Outputs

- Consolidated critique.
- Per-finding decisions.
- Lens lock and rerun decisions.
- Recommended plan changes.
- Final assessment.

Only the synthesis owner may accept, reject, downgrade, or defer findings that
affect readiness or rerun scope.
