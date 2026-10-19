# Settings Consolidation Review Inputs

This is a generic fixture packet for reviewing a plan whose goal is reductive:
it exists to remove surface. It is intentionally fictional and does not
describe any real product or private repository.

A reductive goal exercises the parts of a review that a growth plan does not:
reviewers check plan content against the goal and list it under **Goal Fit /
Recommended Removals**, synthesis records a **Scope Delta** with
`reductive_goal: true`, and a plan whose net surface grows gets the `Goal drift`
verdict. Use this packet to check that a review can recommend removals and does
not answer a reductive goal with more surface.

## Review Input

Save this block as the run's `review-input.json` and pass it with
`--review-input`. The intent card makes the reductive goal explicit.

```json
{
  "schema_version": 2,
  "feature_request": "Consolidate the Account and Preferences screens of a browser-based team workspace into one Settings screen, and retire three settings that no longer change behavior. Success means fewer places to look and fewer controls, with every remaining setting still reachable.",
  "relevant_context": "Account holds display name, email, and time zone. Preferences holds theme, density, notification digest, and three retired settings: legacy editor, beta sidebar, and compact export. The retired settings have had no effect since the last release; their stored values are ignored. Support reports show users looking in the wrong screen for time zone and notification digest.",
  "constraints": "Web only. No new settings. Keep existing keyboard access and visible focus. Remaining settings keep their current behavior and stored values.",
  "previous_adjudications": "No previous adjudications supplied.",
  "intent": {
    "goals": [
      {
        "id": "G1",
        "text": "Every remaining setting is on one Settings screen.",
        "success_signal": "The Account and Preferences entry points are gone and each remaining setting appears once on Settings."
      },
      {
        "id": "G2",
        "text": "The three retired settings are removed from the interface.",
        "success_signal": "Legacy editor, beta sidebar, and compact export no longer appear anywhere in the interface."
      }
    ],
    "non_goals": [
      "Redesigning how any remaining setting behaves.",
      "Adding settings, search, or onboarding to the Settings screen."
    ],
    "must_not_grow": [
      "The number of settings controls.",
      "The number of navigation entry points to settings."
    ],
    "decided_tradeoffs": [
      {
        "decision": "Retired settings are removed outright.",
        "rejected_alternative": "Keep them behind an advanced section for a release.",
        "why": "They have had no effect since the last release."
      }
    ]
  }
}
```

## Proposed Plan

Save this block as the target plan, for example
`docs/plans/settings-consolidation-plan.md`.

```md
# Settings Consolidation Plan

## Summary
- Replace the Account and Preferences screens with one Settings screen.
- Remove the legacy editor, beta sidebar, and compact export settings.

## Changes
1. Add a Settings screen with two groups, Profile (display name, email, time
   zone) and Workspace (theme, density, notification digest).
2. Point the user menu at Settings and remove the Account and Preferences
   entries. Old links to either screen open Settings at the matching group.
3. Remove the three retired settings from the interface. Their stored values
   are left in place and stay ignored.
4. Add a search field above the groups that filters settings by name.
5. Show a one-time tour on the first visit that points out where each moved
   setting now lives.
6. Keep the beta sidebar setting in a collapsed Advanced group for one release
   in case someone still looks for it.

## Test Plan
- Regression coverage that every remaining setting appears once on Settings
  and keeps its behavior.
- Old Account and Preferences links open Settings at the matching group.
- Keyboard navigation reaches every control with visible focus.
```

## Lens Selection

Let the selector choose: run `select-lenses.mjs` or `run-plan-review.mjs`
without `--lens`. For this packet it matches the user-facing workflow domain
and selects Test Strategy and Product & UX. The plan is reversible and touches
no migration, authorization, money, or tool authority, so the full core profile
(`--core-profile standard-v2`) is not needed. Add a lens only with an
evidence-backed `--lens-proposal`.

## Prompt Assembly Notes

1. Save the Review Input block as `review-input.json` and the Proposed Plan
   block as the target plan.
2. Run `node reviews/scripts/run-plan-review.mjs --target <plan> --pass-id <id> --review-input <review-input.json>`.
3. Synthesize with `reviews/synthesize-review-feedback.md`; record the Scope
   Delta against the intent card's `must_not_grow` list.
