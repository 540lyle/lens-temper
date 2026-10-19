# Dashboard Refresh Review Inputs

This is a generic fixture packet for reviewing a UI refresh plan. It is
intentionally fictional and does not describe any real product or private
repository.

Use this packet with:

- `reviews/reviewer-template.md`
- `docs/plans/dashboard-refresh-plan.md` as the `{{proposed_plan}}` input
- one selected lens file from `reviews/lenses/`

Save completed per-lens outputs and synthesis outside reusable workflow files;
use `reviews/archive/` unless another folder explicitly owns the review history.

## Lens Selection

Let the selector choose: run `select-lenses.mjs` or `run-plan-review.mjs`
without `--lens`. For this packet it matches the user-facing workflow domain
and selects Test Strategy and Product & UX. A visual refresh is reversible and
touches no migration, authorization, money, or tool authority, so the full core
profile is not needed. Add a lens only with an evidence-backed
`--lens-proposal`, for example Architecture when the plan moves page-specific
styling into shared components.

## Feature Request

Create a concrete, repo-native UI refresh plan for a browser-based operations
dashboard. The refresh changes how the existing screens look, not what they do:
clearer visual hierarchy and consistent shared component styling. Existing
screens, interaction states, and workflows stay as they are, and keyboard
accessibility and visible focus must not regress.

## Intent Card

```json
{
  "goals": [
    { "id": "G1", "text": "Priority, ownership, and next action are easier to scan on the existing screens.", "success_signal": "Users find the next action on Overview, Work Queue, and Reports without new navigation." },
    { "id": "G2", "text": "Shared components look consistent across the three workspace areas.", "success_signal": "Cards and tables use the shared design tokens with no page-specific overrides." }
  ],
  "non_goals": [
    "New screens, interaction states, or workflows.",
    "Changes to data contracts, routes, or command semantics."
  ],
  "must_not_grow": ["Interaction states", "Workflows"]
}
```

## Relevant Context

### Product And Current UX Contract

- The app has three primary workspace areas: Overview, Work Queue, and Reports.
- Users repeatedly scan dense operational data, compare statuses, and take
  small corrective actions.
- The refresh should make priority, ownership, and next action easier to scan
  without turning the dashboard into a marketing page.

### Engineering Constraints For UI Work

- Keep business rules out of presentational components.
- Use shared design tokens for color, spacing, typography, radii, and shadows.
- Prefer mobile-capable responsive behavior, but optimize the primary desktop
  scanning workflow.
- Keep existing route names, data contracts, and command semantics unless the
  plan explicitly calls for a behavior change and matching validation.
- Prefer shared-component changes over one-off page overrides when a pattern
  appears in multiple areas.

### Testing And Validation Constraints

- Keep component-level coverage for shared primitives whose styling changes.
- Keep regression coverage for the main dashboard scan path, the existing
  empty, loading, and error states, and keyboard navigation through primary
  actions.
- Use layout assertions for narrow-width regressions when visibility checks are
  too weak.
- Run expensive browser and performance checks only when page shell or exported
  route behavior changes justify them.

### Current Shell And Component Seams

- The app shell owns navigation, page chrome, and global status messaging.
- Shared cards own title, status, metadata, and action placement.
- Shared tables own density, row focus, selection, and empty-state layout.
- Page modules own data loading and workflow-specific command labels.

## Constraints

- Treat `docs/plans/dashboard-refresh-plan.md` as a future plan, not a
  shipped-state document.
- This is a visual refresh: do not add or change interaction states or
  workflows.
- Do not introduce third-party UI/runtime dependencies without a specific
  justification.
- Keep design-token files as the source of truth for visual constants.
- Preserve keyboard navigation and visible focus states.
- Use the smallest honest validation set for the touched area.

## Prompt Assembly Notes

When running a review:

1. Use `reviews/reviewer-template.md` as the base template.
2. Inject the `Feature Request` section from this file into
   `{{feature_request}}` and the `Intent Card` JSON into `{{intent_card}}`.
3. Inject the full contents of `docs/plans/dashboard-refresh-plan.md` into
   `{{proposed_plan}}`.
4. Inject the `Relevant Context` section from this file into
   `{{relevant_context}}`.
5. Inject the `Constraints` section from this file into `{{constraints}}`.
6. Inject one lens file into `{{review_lens}}`.

If synthesizing multiple outputs later, use
`reviews/synthesize-review-feedback.md`.
