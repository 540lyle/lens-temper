# Review Lens: Implementation

Evaluate the plan from an implementation realism and execution clarity perspective. Focus on whether competent implementers, human or agent, would build compatible behavior from this plan wherever the goal depends on it.

## Focus Areas

- Sequencing and dependency ordering of work
- Feasibility of each step as described
- Hidden engineering work not accounted for in the plan
- Async, data, and state-update complexity
- Migration and backward-compatibility details
- Rollout practicality
- Refactor scope control
- Developer execution clarity

## Key Questions

- Is the work broken into steps a developer can execute in order?
- Are dependencies handled in the correct sequence?
- Does the plan hide major implementation complexity behind vague descriptions?
- Are there steps too vague to implement safely?
- Does the plan assume infrastructure, services, or code paths that may not exist?
- Are fallback or backward-compatibility paths needed and accounted for?

## Agent Implementability

Behind the goal gate, check where an implementing agent following the plan
literally could build behavior incompatible with the goal:

- Ambiguous source of truth: two places the plan treats as authoritative for the same value or decision.
- Missing cross-module contracts: a step depends on another module's shape, ordering, or behavior that the plan does not pin down.
- Conflicting readings: plan statements that support incompatible implementations.

Copy, labels, layout, and ordinary defaults are not implementability gaps.
A decision the plan hands to its owner is a question, not a gap; do not pick
the answer.

## Stateful Workflow Ownership

For plans involving restore, load, save, update, delete, reset, deferred apply,
planner/apply separation, persisted records, or active application state, own
these checks:

- Is the sequencing explicit enough to prevent save-before-restore, update-before-resync, delete-during-restore, or second-restore races?
- If restore or apply work is deferred, does the plan define cancellation, idempotency, revision tokens, and what interim actions are allowed?
- Does the implementation path handle every planner output field, action, and state transition?
- Are partial failures and retry paths implementable without leaving mixed active and persisted state?
- Are compatibility defaults and backfills described before code paths depend on the new shape?

## Red Flags

Apply the goal gate from the reviewer template before lowering a score: does this implementation issue meet it? If not, it does not lower the score or block a `5/5`. Treat the list below as examples of issues to watch for, not a checklist that must produce findings.

Flag and classify as `[critical]`, `[major]`, or `[minor]`:
- Vague steps that obscure real work
- Skipped data-shape or schema changes required by the feature
- Skipped async or state-synchronization concerns
- Missing migration or compatibility handling
- Changes that will cascade farther than the plan acknowledges
- Missing refactor boundaries
- Hidden work in shared utilities, schemas, or platform glue
- Steps ordered so that validation or testing is blocked until late

## Reviewer Bias

When two approaches are roughly equivalent, prefer:
- Explicit step ordering over implicit dependencies
- Minimal uncertainty during execution
- Incremental delivery with checkpoints
- Plans that reduce rework and late-stage surprises
