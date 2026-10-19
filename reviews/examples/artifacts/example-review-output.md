# Example Review Output

This file shows the expected shape of a completed review. Use it as a reference for output consistency across models and reviewers. Provenance is not part of the review: `update-ledger.mjs` stamps it into the review record when the review is attached.

> **Note:** This is a fabricated example for format demonstration only. The feature, plan, and findings are fictional.

---

## Data Model Example

### Goal Gate

- Goal: let admins restrict sensitive actions by giving every user a role.
- Non-goals: none stated.
- Open decisions: none declared.

### Verdict

**Usable with fixes** — sound approach, but specific blocking gaps must be closed for the goal to be met.

### What the Plan Gets Right
- Correctly identifies the need for a new permission check at the API layer.
- Breaks the work into frontend and backend tracks that can proceed in parallel.
- Includes a migration step for the new `role` column.

### Goal Fit / Recommended Removals
- None.

### Gaps and Risks
- [critical] Step 3 adds a non-nullable `role` column to the `users` table but does not specify a default value or backfill strategy. The migration fails on existing rows, so no user gets a role.
- [major] The plan assumes the frontend can call the new `/permissions` endpoint before it is deployed. No feature flag or fallback is specified for the transition period, so permission checks the goal depends on break during rollout.
- [major] No integration test is planned for the permission check. The unit test in step 6 only covers the happy path, so a denied request that succeeds would ship unnoticed.

### Recommended Changes
- Add: a backfill migration step between steps 3 and 4 that sets `role = 'member'` for all existing users.
- Add: a rollout gate so the frontend uses the `/permissions` endpoint only after it is deployed, falling back to the existing behavior until then.
- Add: an integration test that covers the full request cycle: API call → permission check → response, including a denied request.

### Open Questions
- Will roles stay a fixed set (`admin`, `member`, `viewer`), or do you expect custom roles later? A fixed set keeps this a single-column migration. Custom roles would need a separate roles table now to avoid a second migration later. If you have no plans for custom roles, the fixed set applies.
- Does the product already have a feature-flag system? If yes, the rollout gate reuses it. If no, either deploy the backend before the frontend, or add a flag system, which adds scope this plan does not cover.

### Cross-Cutting Sweep

- Security / privacy: [major] Permission-denial behavior must not reveal whether a protected resource exists.
- Reliability / rollback: [major] A rollout gate with fallback is required for frontend/backend rollout ordering.

### Stateful Workflow Sweep

Owned by the Implementation lens.

### Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Correctness | 3/5 | Migration will fail without backfill |
| Completeness | 3/5 | Missing backfill and feature flag |
| Risk Awareness | 2/5 | No rollback or staged rollout plan |
| Testability | 3/5 | Unit tests present but no integration coverage |
| Maintainability | 4/5 | Clean separation of concerns |
| Ship Readiness | 2/5 | Blocked by migration and deployment gaps |

---

## Strong Advisory Example

This second fabricated example, a Product & UX review, shows that a per-lens review of a sound plan can legitimately end at `Strong` with no findings. A single per-lens output is still advisory; lockable completion requires the full ledger, artifacts, reviewer cleanup status, and validation evidence.

### Goal Gate

- Goal: users always know whether a save or delete in the new workflow worked.
- Non-goals: no new interaction model.
- Open decisions: none declared.

### Verdict

**Strong** — the plan can meet its stated goal as written; no blocking gaps.

### What the Plan Gets Right
- Defines the empty, loading, error, retry, and success states for the new workflow.
- Specifies visible feedback for user-triggered save and delete actions.
- Reuses the existing status pattern instead of introducing a new interaction model.

### Goal Fit / Recommended Removals
- None.

### Gaps and Risks
- None.

### Recommended Changes
- None.

### Open Questions
- None.

### Cross-Cutting Sweep

- Accessibility: No material issue found; the plan uses the existing announced status pattern and defines focus/disabled states.
- Performance: No material issue found; the states reuse existing components.
- Compatibility / platform constraints: No material issue found; the interaction states cover touch, pointer, and keyboard input.

### Stateful Workflow Sweep

Owned by the Implementation lens.

### Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Correctness | 5/5 | User-visible behavior is defined enough to implement correctly |
| Completeness | 5/5 | Required UX states and action feedback are covered; message wording is implementer discretion |
| Risk Awareness | 5/5 | Failure and retry paths are specified |
| Testability | 5/5 | States are concrete enough for UI assertions |
| Maintainability | 5/5 | Reuses existing UX patterns |
| Ship Readiness | 5/5 | No material UX blockers |
