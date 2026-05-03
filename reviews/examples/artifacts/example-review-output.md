# Example Review Output

This file shows the expected shape of a completed review. Use it as a reference for output consistency across models and reviewers.

> **Note:** This is a fabricated example for format demonstration only. The feature, plan, and findings are fictional.

---

### Provenance

- Pass ID: pass-1
- Lens: Data Model
- Target Path: docs/plans/example-permissions-plan.md
- Target Revision: example-revision
- Template Revision: example-template-revision
- Lens Revision: example-lens-revision

### Verdict

**Usable with fixes** — sound approach, but specific changes are needed before implementation.

### What the Plan Gets Right
- Correctly identifies the need for a new permission check at the API layer.
- Breaks the work into frontend and backend tracks that can proceed in parallel.
- Includes a migration step for the new `role` column.

### Gaps and Risks
- [critical] Step 3 adds a non-nullable `role` column to the `users` table but does not specify a default value or backfill strategy. This will fail on existing rows.
- [major] The plan assumes the frontend can call the new `/permissions` endpoint before it is deployed. No feature flag or fallback is specified for the transition period.
- [major] No integration test is planned for the permission check. The unit test in step 6 only covers the happy path.
- [minor] The plan does not specify the error message shown to users when a permission check fails.

### Recommended Changes
- Add a backfill migration step between steps 3 and 4 that sets `role = 'member'` for all existing users.
- Add a feature flag to gate the frontend's use of the `/permissions` endpoint. Fall back to the existing behavior when the flag is off.
- Add an integration test that covers the full request cycle: API call → permission check → response.
- Specify the user-facing error copy for permission denial in the UX section.

### Open Questions
- Should the `role` column support custom roles in the future, or is the fixed enum (`admin`, `member`, `viewer`) sufficient?
- Is there an existing feature-flag system, or does one need to be introduced as part of this work?

### Cross-Cutting Sweep

- Security / privacy: [major] Permission-denial behavior must not reveal whether a protected resource exists.
- Accessibility: [minor] Permission-denied copy should be exposed through the existing alert/status pattern.
- Performance: Not applicable from this lens.
- Reliability / rollback: [major] Feature flag fallback is required for frontend/backend rollout ordering.
- Observability / debuggability: [minor] Add a lightweight denied-permission diagnostic log or existing analytics event if one already exists.
- Compatibility / platform constraints: Not applicable from this lens.

### Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Correctness | 3/5 | Migration will fail without backfill |
| Completeness | 3/5 | Missing feature flag and error UX |
| Risk Awareness | 2/5 | No rollback or staged rollout plan |
| Testability | 3/5 | Unit tests present but no integration coverage |
| Maintainability | 4/5 | Clean separation of concerns |
| Ship Readiness | 2/5 | Blocked by migration and deployment gaps |

---

## Strong / Locking Example

This second fabricated example shows that a review can legitimately end at `Strong` with all `5/5` scores even when the reviewer notes non-blocking polish.

### Provenance

- Pass ID: pass-2
- Lens: Product & UX
- Target Path: docs/plans/example-empty-state-plan.md
- Target Revision: example-revision-2
- Template Revision: example-template-revision
- Lens Revision: example-product-ux-lens-revision

### Verdict

**Strong** — safe to implement as-is with minor polish.

### What the Plan Gets Right
- Defines the empty, loading, error, retry, and success states for the new workflow.
- Specifies visible feedback for user-triggered save and delete actions.
- Reuses the existing status pattern instead of introducing a new interaction model.

### Gaps and Risks
- [minor] Non-material polish: the plan could name the exact success-message copy, but it already defines the required state, tone, and placement clearly enough to implement.

### Recommended Changes
- Optional polish: add the exact success-message string while editing the plan, but do not block implementation on this.

### Open Questions
- None.

### Cross-Cutting Sweep

- Security / privacy: Not applicable from this lens.
- Accessibility: No material issue found; the plan uses the existing announced status pattern and defines focus/disabled states.
- Performance: Not applicable from this lens.
- Reliability / rollback: Not applicable from this lens.
- Observability / debuggability: Not applicable from this lens.
- Compatibility / platform constraints: No material issue found; the interaction states cover touch, pointer, and keyboard input.

### Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Correctness | 5/5 | User-visible behavior is defined enough to implement correctly |
| Completeness | 5/5 | Required UX states and action feedback are covered |
| Risk Awareness | 5/5 | Failure and retry paths are specified |
| Testability | 5/5 | States are concrete enough for UI assertions |
| Maintainability | 5/5 | Reuses existing UX patterns |
| Ship Readiness | 5/5 | No material UX blockers |
