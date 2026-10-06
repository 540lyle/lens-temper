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
- Feature request, optional intent card, proposed plan, and relevant context.
- Complete review outputs.
- Constraints.
- Ledger state when available.

For full runs, reject synthesis inputs whose review input revision differs from
the ledger even when the target revision is unchanged.

## Outputs

- Goal reference, from the intent card or inferred.
- Blocking gaps, questions for the author, minor issues, and notes.
- Recommended plan changes and the scope delta.
- Per-finding decisions with change type, served goal, and rejection reason.
- Lens lock and rerun decisions.
- Final assessment and `Review delivered: N blocking gaps, K minor issues, M questions`.

Synthesis is a filter that defends the plan's goal. Only the synthesis owner may
accept, reject, downgrade, defer, or route findings to the author. Every
question and minor issue stays visible; filtering decides only what becomes a
plan change.
