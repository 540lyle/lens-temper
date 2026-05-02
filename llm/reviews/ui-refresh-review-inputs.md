# UI Refresh Review Inputs

Use this packet with:

- `llm/reviews/reviewer-template.md`
- `docs/plans/ui-refresh-plan.md` as the `{{proposed_plan}}` input
- one selected lens file from `llm/reviews/`

This packet is intentionally narrow. It gives the review system enough context to evaluate the refresh plan without loading unrelated machining or backlog docs.
Save completed per-lens outputs and synthesis outside `llm/reviews/`; in this repo they belong in `llm/archive/` unless another folder explicitly owns the review history.

## Recommended Lens Order

### First-pass lenses

1. `lens-product-ux.md`
   Reason: this is a UI refresh plan first, so the highest-value review is whether the user-visible behavior and visual hierarchy are sufficiently defined without creating UX drift.
2. `lens-implementation.md`
   Reason: the plan touches shared primitives and shell-level surfaces, so sequencing and scope control matter.
3. `lens-architecture.md`
   Reason: the main structural risk is pushing design decisions into `App.tsx` instead of keeping them in shared component seams.
4. `lens-test-strategy.md`
   Reason: shared UI refresh work can silently regress compact layouts, tab interactions, and Results ownership contracts unless validation is explicit.

### Optional follow-up lens

- `lens-risk.md`
  Use if the first-pass reviews surface concern about exported-shell regressions, accessibility/performance drift, or blast radius from shared shell changes.

### Lens to skip for this plan

- `lens-data-model.md`
  Skip unless the refresh plan expands into persistence, schema, or setup-session contract changes. The current plan is intentionally visual and structural.

## Feature Request

Create a concrete, repo-native UI refresh plan for Chip Chad that turns a visually useful but implementation-unsafe external design handoff into an actionable product refresh.

The refresh should strengthen Chip Chad's brand identity, improve hierarchy and polish across the calculator shell and shared UI primitives, and identify which external ideas are worth porting. It must preserve the current product workflow, solver behavior, mobile-first interaction model, and shared Results/tune-status contracts.

## Relevant Context

### Product identity and current UX contract

- `docs/product-brief.md`
  - Product tone is practical, compact, confident, and industrial without looking dated.
  - The app uses a four-tab flow: `1 Setup`, `2 Calculate`, `3 Results`, and unnumbered `Reference`.
  - The generic tool card belongs at the end of the Setup flow.
  - Stick-out validation is already a defined user-visible rule and should not be visually obscured by a refresh.

### Engineering constraints for UI work

- `docs/engineering-rules.md`
  - Keep business logic out of UI components.
  - Use shared tokens from `src/theme/tokens.ts`.
  - Prefer mobile-first decisions.
  - Tab layout changes require Playwright updates in the same session.
  - Compact density is a cross-tab contract, not a one-off Setup patch.
  - The Results tune-status dock owns deflection and tradeoff visibility; that status should not be duplicated back into the card body.

### Testing and validation constraints

- `docs/testing-guide.md`
  - Playwright runs against the exported web build, not a dev-only path.
  - Tab helpers use `testID` plus `aria-selected="true"` as the stable contract.
  - Narrow mobile regressions should use geometry/bounding-box checks, not visibility alone.
  - Validation commands that depend on `dist/` must run serially, not in parallel.

### Current token and font system

- `src/theme/tokens.ts`
  - Canonical palette: warm cream canvas/panel/paper, dusty orange accent, steel/sage support colors, danger tint, warm highlight.
  - Canonical radii: `18`, `28`, and full-pill.
  - Canonical typography: local `SpaceGrotesk_500Medium` and `SpaceGrotesk_700Bold`.
  - Canonical shadow: single warm panel shadow.
- `src/lib/app-fonts.web.ts`
  - Web fonts are loaded from local app assets via Expo asset URIs, not from Google Fonts CDN.

### Current shell and component seams

- `App.tsx`
  - The calculator shell uses a hero plus tab section inside the main `ScrollView`.
  - The shell already uses a background `LinearGradient`; the tab bar is not fixed/sticky.
  - The pager/footer contract is already established and should be visually refreshed rather than behaviorally reworked.
- `src/components/StaticHomeRoute.tsx`
  - The static home route already shares tokens with the calculator, but uses a larger, more marketing-like hero treatment than the live shell.
- `src/components/TabBar.tsx`
  - Active tab state is a simple underline treatment with compact labels at the `480px` breakpoint from `src/lib/tab-bar-contract.ts`.
- `src/components/SectionTitle.tsx`
  - Shared eyebrow/title/description rhythm already exists and is a likely refresh seam.
- `src/components/FieldCard.tsx`
  - Numeric editing surfaces already share a clear label/value/suffix structure and compact mode.
- `src/components/MetricCard.tsx`
  - Baseline metric cards already use accent top bands and value/unit hierarchy.
- `src/components/OperationCard.tsx` and `src/components/ToolPresetCard.tsx`
  - Setup selection surfaces already carry the brand palette and active-state behavior.
- `src/components/RecommendationCard.tsx`
  - The main Results card already carries the active cutter-profile surface and stat grid.
- `src/components/ResultsTab.tsx`
  - Results-specific authority and quality/life bands live alongside the recommendation card and sliders.
  - The card currently contains tune controls, but tune-status messaging remains owned by the dock outside the card.
- `src/components/TuningSlider.tsx`
  - Tuning sliders already have inline SVG ownership/reset icons, risk-band tracks, boundary labels, and compact reset affordances.
- `src/components/StanceSlider.tsx`
  - Stance already has explicit user-facing copy for auto/manual and machine-envelope-limited behavior.

## Constraints

- Treat `docs/plans/ui-refresh-plan.md` as a future implementation plan, not a shipped-state document.
- Preserve the current workflow and contracts unless the plan explicitly calls for a behavior change and matching validation.
- Keep fonts local and asset-backed. Do not introduce Google Fonts CDN, Lucide, or other third-party UI/runtime dependencies.
- Keep `src/theme/tokens.ts` as the source of truth for palette, spacing, radii, typography, and shadow.
- Prefer shared-component seams over inline `App.tsx` styling logic whenever a refresh affects multiple tabs.
- Keep the current tab-bar contract intact unless a deliberate change is justified and reflected in tests.
- Keep the Results tune-status dock as the single owner of deflection/tradeoff severity visibility.
- Preserve mobile-first density and narrow-width usability across Setup, Calculate, and Results.
- Use the smallest honest validation set for the touched area; escalate to `test:ui`, `build:web`, and Lighthouse only when shell/exported-route changes justify it.

## Prompt Assembly Notes

When running a review:

1. Use `llm/reviews/reviewer-template.md` as the base template.
2. Inject the `Feature Request` section from this file into `{{feature_request}}`.
3. Inject the full contents of `docs/plans/ui-refresh-plan.md` into `{{proposed_plan}}`.
4. Inject the `Relevant Context` section from this file into `{{relevant_context}}`.
5. Inject the `Constraints` section from this file into `{{constraints}}`.
6. Inject one lens file into `{{review_lens}}`.

If synthesizing multiple outputs later, use `llm/reviews/synthesize-review-feedback.md`.
