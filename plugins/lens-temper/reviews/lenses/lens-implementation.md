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

## Stateful Workflow Sweep

This lens owns the stateful workflow sweep; other lenses point here. When the
plan includes restore, load, save, update, delete, reset, deferred apply,
planner/apply separation, persisted records, or active UI/application state,
answer each question in the output's Stateful Workflow Sweep section:

- What does absence mean for each relevant value: `undefined`, `null`, empty string, empty array, empty object, missing key, or omitted planner field? Are defaults and backfills for legacy records in place before code reads the new shape?
- What existing active state must be preserved, replaced, cleared, invalidated, or resynced before and after the action, and can a delete or reset be undone by stale state?
- Can restore or apply work be deferred, and is the sequencing explicit enough to prevent save-before-restore, update-before-resync, delete-during-restore, or a second restore before the deferred work runs? If deferred, are cancellation, idempotency, and revision tokens defined?
- Does every planner output field, action, and state transition have a matching App or application-layer apply path, and does every apply branch have a planner case that can produce it?
- Is the saved data a full snapshot, patch, reference, or intent, and can saving during transitional state, a partial failure, or a retry leave mixed or invalid records?
- Does visible UI state match persisted/application state after success, failure, partial failure, cancellation, and retry?

An unanswered question is material when it meets the goal gate: durable data
can be lost or corrupted, or active state the goal depends on can go stale.
Deferred restore or apply is behavior to review, not a pending decision. A
scope deferral is acceptable only when the plan names the deferred behavior,
owner, timing, and interim user/data semantics.

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
