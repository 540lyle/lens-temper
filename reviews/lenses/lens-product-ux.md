# Review Lens: Product & UX

Evaluate the plan from a product behavior and user experience perspective.
Focus on whether the user-visible behavior serves the plan's goal: whether users
can complete the journeys the goal depends on, understand and recover from them,
and whether the behavior fits the existing product.

When the goal is reductive, such as simplifying, removing, consolidating, or
reducing a surface, review for subtraction first: flag user-visible surface that
works against the goal and recommend removals before additions.

This is not a visual design critique. Review the plan as a specification for
user-facing behavior, not as a spec that must be as detailed as the UI.

## Review Method

Use a two-pass review:

1. Identify the affected user journeys, UI surfaces, roles, states, and actions.
2. Apply only the probes relevant to those surfaces.

Do not turn every checklist item into a finding. A finding is valid only when it
meets the goal gate in the reviewer template. Copy, labels, layout details, and
ordinary defaults are implementer discretion unless a goal is about them.

A strong finding must include:

- the goal, data, or accessibility outcome at stake
- the user impact
- a concrete scenario where the issue appears
- the plan change needed to resolve it: add, clarify, or remove

## Focus Areas

- User problem, target user, and expected outcome
- User-visible behavior and interaction flow
- Discoverability, entry points, and first-use experience
- Empty, loading, pending, error, success, retry, fallback, and partial-success states
- Save, update, delete, duplicate, rename, restore, reset, overwrite, and undo semantics
- Settings, defaults, permissions, preferences, and configuration scope
- User mental model and terminology where confusion would defeat the goal
- Consistency with existing product patterns and platform conventions
- Accessibility and inclusive interaction behavior
- Recoverability from user mistakes
- User-visible rollout, migration, fallback, unavailable, or disabled-state behavior
- Cross-platform behavior where platforms differ materially

## Key Questions

- Does the plan define the target user, user problem, and expected outcome clearly enough to guide UX decisions?
- Would competent implementers build incompatible user-visible behavior that the goal depends on?
- Does the plan add user-visible surface the goal does not need?
- Where does the user discover or enter the flow?
- What appears before, during, and after each important user action?
- Are loading, empty, pending, success, error, retry, cancellation, fallback, and partial-success states addressed?
- Can users tell which action completed and which record, object, view, or context changed?
- Are edit, update, overwrite, rename, restore, reset, delete, and undo semantics distinct enough that users will not confuse them?
- Are defaults safe where a wrong default could lose data or mislead users about the result?
- Are failure and retry paths clear, recoverable, and respectful of user input?
- Are state transitions understandable from the user's perspective?
- Where platforms differ materially, would they diverge on behavior the goal depends on?
- Could localization, long names, date/time formats, or RTL layout break a journey the goal depends on?
- Does the plan create surprising, inconsistent, or dead-end behavior?

## Triggered Probes

Apply these only when the plan includes the relevant surface. Every probe sits
behind the goal gate: an unanswered probe is a finding only when the gate is met.

### Stateful Workflows and Persistence

Trigger for saved records, drafts, background jobs, optimistic updates, or stale
data a user can see. The Implementation lens owns the stateful workflow sweep;
ask only what the user perceives.

Ask:

- Can users tell whether the action completed, failed, is pending, was canceled, or was superseded?
- Are stale, unsaved, conflicted, or transitional states visible enough to prevent accidental mixed-context saves?
- Are overwrite, rename, update, reset, restore, duplicate, delete, and undo meanings distinct from the user's perspective?
- Does the user know which record, draft, version, environment, or context changed?
- Are destructive actions preventable, reversible, confirmed, or recoverable where appropriate?

### Async, Feedback, and Status

Trigger for loading, generation, sync, import, export, upload, deletion,
background work, optimistic UI, retry, notifications, progress, or partial
success.

Ask:

- What does the user see immediately after triggering the action?
- Is progress determinate, indeterminate, queued, backgrounded, or intentionally silent?
- Can the user cancel, retry, continue working, or navigate away?
- Are duplicate submissions, refreshes, and back navigation handled?
- Are partial success and failed sub-items represented clearly?
- Is the success state specific about what changed?
- Are status updates perceivable by assistive technology?
- Does the plan distinguish temporary UI state from saved/server state?

### Forms, Inputs, and Validation

Trigger for forms, search, filters, fields, multi-step flows, validation, or
user-entered data.

Ask:

- Are required, optional, default, disabled, and read-only fields defined?
- Is validation timing defined: on input, blur, submit, server-side, or async check?
- Do errors identify the exact problem and how to fix it?
- Does the UI preserve user input after validation or submission failure?
- Are duplicate names, invalid formats, character limits, permissions, and ambiguous inputs handled?

### Settings, Defaults, and Rollout

Trigger for settings, preferences, roles, permissions, feature flags, saved
views, workspace/team/user configuration, admin controls, rollout, migration, or
disabled/unavailable states.

Ask:

- Is the setting or rollout scope clear: user, workspace, organization, project, record, device, session, or environment?
- Is the default safe, useful, and unsurprising?
- Can users understand, preview, reset, or undo the consequence?
- Does a change take effect immediately, after save, after reload, or only for new objects?
- Are hidden dependencies, permissions, migrations, and existing-user behavior explained?
- Is user-visible behavior clear when the feature is disabled, unavailable, partially enabled, or rolled back?

### Accessibility and Inclusive Interaction

Trigger when the plan changes controls, forms, dialogs, menus, lists, tables,
drag/drop, gestures, keyboard shortcuts, dynamic content, status messages,
notifications, toasts, authentication, animation, media, or visual status.

Use WCAG 2.2 AA as the default planning baseline unless the product has a stricter
standard. Do not claim accessibility conformance from a spec review. Flag a
missing accessibility requirement when the changed surface would regress
accessibility without it.

Ask:

- Can every interactive element be reached and operated with a keyboard?
- Is focus order logical, visible, and not trapped?
- Is focus placement and return behavior defined for dialogs, drawers, popovers, menus, and toasts?
- Are custom controls specified with accessible name, role, value, state, and properties?
- Are status changes announced without unnecessary focus movement?
- Is meaning not conveyed by color, shape, position, icon, sound, or motion alone?
- Are icon-only actions, charts, media, and status indicators given accessible names or text alternatives?
- If functionality relies on dragging, swiping, hover, motion, or complex gestures, is there a non-gesture alternative?
- Are pressed, selected, disabled, loading, error, and focus states perceptible?

### Terminology and Copy

Trigger only when a goal is about wording or terminology, or when wording could
make a destructive or irreversible action ambiguous. Otherwise copy is
implementer discretion.

Ask:

- Are destructive or irreversible actions named plainly?
- Would a new term conflict with existing product vocabulary in a way users would misread?

## Red Flags

Apply the goal gate before lowering a score: does this product or UX issue meet
the gate? If not, it does not lower the score; report it as `[minor]` only when
it is a real issue the plan's owner should still see.

Treat the list below as examples of issues to watch for, not a checklist that
must produce findings.

Flag and classify as `[critical]`, `[major]`, or `[minor]`:

- User-visible behavior on a goal journey where competent implementers would build incompatible results
- User-visible surface the goal did not ask for, or that works against a reductive goal
- Missing primary journey, entry point, or success path
- Unspecified loading, pending, transition, empty, error, retry, fallback, or success states on a journey the goal depends on
- Unclear default behavior, rollout behavior, unavailable behavior, or disabled state
- Async or persisted state that can mislead users
- Mutation actions with no visible confirmation or ambiguous target/context
- Ambiguous title, edit, update, rename, reset, restore, delete, overwrite, or undo semantics
- Destructive actions without prevention, confirmation, undo, or recovery where appropriate
- Discoverability issues that make the feature effectively unreachable
- Settings with unclear scope or hidden consequences that users would misread
- Missing accessibility requirements needed for implementation or testing
- Touch, pointer, keyboard, focus, disabled, selected, loading, or error states that are imperceptible
- Drag, hover, gesture, animation, or motion-only interactions without alternatives
- Interaction flows that are technically correct but confusing to use
- Inconsistency with existing UX patterns without a user-centered reason
- Cross-platform behavior left undefined where platforms differ materially

## Severity Guidance

`[critical]`
Use when the plan is likely to ship an unusable, inaccessible, data-losing, or
misleading experience for a core flow, or when competent implementers would build
incompatible behavior on a flow the goal depends on.

`[major]`
Use when the issue meets the goal gate and would likely confuse users, block an
important segment, or cause avoidable mistakes.

`[minor]`
Use when the issue is real but below the goal gate. It does not lower a score.

## Reviewer Bias

When two approaches are roughly equivalent, prefer:

- Removing or reusing surface over adding it
- Consistent patterns over novel interactions
- Recoverable interactions
- Accessible defaults
- Clear state transitions over implicit state
- Leaving copy, layout, and ordinary defaults to the implementer unless a goal is about them
- Native or design-system components over custom controls
- User mental models over internal data model terminology

## Output Expectations

For each finding, include:

- Severity: `[critical]`, `[major]`, or `[minor]`, per the goal gate
- Area: Product, UX Flow, Accessibility, Content, State, Settings, or Cross-platform
- Issue: concise statement
- Scenario: concrete user situation
- Impact: which goal, data, or accessibility outcome it affects
- Recommended plan change: add, clarify, or remove

Do not produce generic critique. If the plan already serves its goal, do not
restate the checklist; zero findings is the expected result for a sound plan.
