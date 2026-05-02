# Dashboard Refresh Review Inputs

This is a generic fixture packet for reviewing a UI refresh plan. It is
intentionally fictional and does not describe any real product or private
repository.

Use this packet with:

- `llm/reviews/reviewer-template.md`
- `docs/plans/dashboard-refresh-plan.md` as the `{{proposed_plan}}` input
- one selected lens file from `llm/reviews/`

Save completed per-lens outputs and synthesis outside `llm/reviews/`; use
`llm/archive/` unless another folder explicitly owns the review history.

## Recommended Lens Order

### First-Pass Lenses

1. `lens-product-ux.md`
   Reason: the plan changes user-visible hierarchy and interaction states.
2. `lens-implementation.md`
   Reason: the plan touches shared UI primitives and page-level layout.
3. `lens-architecture.md`
   Reason: the review should confirm refresh decisions stay in shared seams
   rather than becoming duplicated screen-specific styling.
4. `lens-test-strategy.md`
   Reason: UI refresh work can silently regress compact layouts, keyboard
   navigation, and loading/error states unless validation is explicit.

### Optional Follow-Up Lens

- `lens-risk.md`
  Use if the first-pass reviews surface concern about accessibility,
  performance, rollout, or broad shared-component blast radius.

### Lens To Skip For This Plan

- `lens-data-model.md`
  Skip unless the refresh plan expands into persistence, schema, saved views, or
  user preference contracts.

## Feature Request

Create a concrete, repo-native UI refresh plan for a browser-based operations
dashboard. The refresh should improve visual hierarchy, empty/loading/error
states, and shared component consistency while preserving existing workflows and
keyboard accessibility.

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

- Add component-level coverage for shared primitives that change behavior.
- Add browser coverage for the main dashboard scan path, empty state, loading
  state, error state, and keyboard navigation through primary actions.
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

- Treat `docs/plans/dashboard-refresh-plan.md` as a future implementation plan,
  not a shipped-state document.
- Preserve current workflows unless a behavior change is explicit.
- Do not introduce third-party UI/runtime dependencies without a specific
  justification.
- Keep design-token files as the source of truth for visual constants.
- Preserve keyboard navigation and visible focus states.
- Use the smallest honest validation set for the touched area.

## Prompt Assembly Notes

When running a review:

1. Use `llm/reviews/reviewer-template.md` as the base template.
2. Inject the `Feature Request` section from this file into
   `{{feature_request}}`.
3. Inject the full contents of `docs/plans/dashboard-refresh-plan.md` into
   `{{proposed_plan}}`.
4. Inject the `Relevant Context` section from this file into
   `{{relevant_context}}`.
5. Inject the `Constraints` section from this file into `{{constraints}}`.
6. Inject one lens file into `{{review_lens}}`.

If synthesizing multiple outputs later, use
`llm/reviews/synthesize-review-feedback.md`.
