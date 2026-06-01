# Review Lens: Product & UX

Evaluate the plan from a product behavior and user experience perspective.
Focus on whether the plan defines enough user-visible behavior to implement
consistently, whether users can understand and recover from the experience, and
whether the behavior fits the existing product.

This is not a visual design critique. Review the plan as a specification for
user-facing behavior.

## Review Method

Use a two-pass review:

1. Identify the affected user journeys, UI surfaces, roles, states, and actions.
2. Apply only the probes relevant to those surfaces.

Do not turn every checklist item into a finding. A finding is valid only when it
identifies a material ambiguity or missing user-visible behavior that could
change the plan before implementation.

A strong finding must include:

- the missing or ambiguous spec detail
- the user impact
- a concrete scenario where the issue appears
- the plan change needed to resolve it

## Focus Areas

- User problem, target user, and expected outcome
- User-visible behavior and interaction flow
- Discoverability, entry points, and first-use experience
- Empty, loading, pending, error, success, retry, fallback, and partial-success states
- Save, update, delete, duplicate, rename, restore, reset, overwrite, and undo semantics
- Settings, defaults, permissions, preferences, and configuration scope
- User mental model, terminology, labels, helper text, and error copy
- Consistency with existing product patterns and platform conventions
- Accessibility and inclusive interaction behavior
- Recoverability from user mistakes
- User-visible rollout, migration, fallback, unavailable, or disabled-state behavior
- Cross-platform behavior where platforms differ materially

## Key Questions

- Does the plan define the target user, user problem, and expected outcome clearly enough to guide UX decisions?
- Is the user-visible behavior clearly defined, or will developers have to guess?
- Where does the user discover or enter the flow?
- What appears before, during, and after each important user action?
- Are loading, empty, pending, success, error, retry, cancellation, fallback, and partial-success states addressed?
- Can users tell which action completed and which record, object, view, or context changed?
- Are edit, update, overwrite, rename, restore, reset, delete, and undo semantics distinct enough that users will not confuse them?
- Are defaults sensible, safe, and explainable?
- Are failure and retry paths clear, recoverable, and respectful of user input?
- Are state transitions understandable from the user's perspective?
- Could users misinterpret what the feature does or how to use it?
- Are labels, actions, and messages specific enough to avoid implementation-by-copywriting?
- Does the plan define enough UX detail to implement consistently across platforms?
- Does the plan create surprising, inconsistent, or dead-end behavior?

## Triggered Probes

Apply these only when the plan includes the relevant surface. Do not cite missing
details as issues unless they materially affect the plan.

### Stateful Workflows and Persistence

Trigger for restore, load, save, update, delete, reset, deferred apply,
planner/apply separation, persisted records, drafts, background jobs, optimistic
updates, stale data, or active UI/application state.

Ask:

- Can users tell whether the action completed, failed, is pending, was canceled, or was superseded?
- Does visible UI state match persisted/application state after success, failure, cancellation, retry, undo, and deferred apply completion?
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
- Are field labels, helper text, constraints, and examples specified?
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
standard. Do not claim accessibility conformance from a spec review. Flag missing
accessibility requirements only when they would block implementation or testing
of the changed surface.

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

### Terminology, Labels, and UX Copy

Trigger for user-facing labels, buttons, status messages, errors, empty states,
confirmations, onboarding, help text, notifications, destructive actions, or new
domain terms.

Ask:

- Does copy use user language instead of internal implementation language?
- Are labels and actions specific enough to distinguish similar operations?
- Does error copy explain what happened, why if known, and what the user can do next?
- Are destructive or irreversible actions named plainly?
- Are empty states useful rather than decorative filler?
- Are terms consistent with existing product vocabulary?
- Could localization, long names, date/time formats, or RTL layout break the experience?

## Red Flags

Apply the materiality gate before lowering a score: would this product or UX issue
justify changing the plan before implementation? If not, record it as non-blocking
polish and do not let it prevent a `5/5`.

Treat the list below as examples of issues to watch for, not a checklist that
must produce findings.

Flag and classify as `[critical]`, `[major]`, or `[minor]`:

- User-visible behavior left to implementation guesswork
- Missing primary journey, entry point, or success path
- Unspecified loading, pending, transition, empty, error, retry, fallback, or success states
- Unclear default behavior, rollout behavior, unavailable behavior, or disabled state
- Async or persisted state that can mislead users
- Mutation actions with no visible confirmation or ambiguous target/context
- Ambiguous title, edit, update, rename, reset, restore, delete, overwrite, or undo semantics
- Destructive actions without prevention, confirmation, undo, or recovery where appropriate
- Discoverability issues that make the feature effectively unreachable
- Settings that are too hidden, too complex, unclear in scope, or have confusing defaults
- Hidden settings consequences left unexplained
- Missing accessibility requirements needed for implementation or testing
- Touch, pointer, keyboard, focus, disabled, selected, loading, or error states that are imperceptible
- Drag, hover, gesture, animation, or motion-only interactions without alternatives
- User-facing terminology, labels, or messages left to implementation judgment
- Interaction flows that are technically correct but confusing to use
- Inconsistency with existing UX patterns without a user-centered reason
- Cross-platform behavior left undefined where platforms differ materially

## Severity Guidance

`[critical]`
Use when the plan is likely to ship an unusable, inaccessible, data-losing, or
misleading experience for a core flow, or when implementation cannot proceed
consistently without major product decisions.

`[major]`
Use when the issue would likely confuse users, block an important segment, cause
avoidable mistakes, or require meaningful plan changes before implementation.

`[minor]`
Use when the issue is real but localized, recoverable, or polish-level, and does
not materially change the plan.

## Reviewer Bias

When two approaches are roughly equivalent, prefer:

- Explicit user-visible behavior specification over implementation notes
- Consistent patterns over novel interactions
- Reduced ambiguity in the spec
- Recoverable interactions
- Accessible defaults
- Clear state transitions over implicit state
- Specific UX copy over placeholder text
- Native or design-system components over custom controls
- User mental models over internal data model terminology

## Output Expectations

For each finding, include:

- Severity: `[critical]`, `[major]`, or `[minor]`
- Area: Product, UX Flow, Accessibility, Content, State, Settings, or Cross-platform
- Issue: concise statement
- Scenario: concrete user situation
- Impact: why it matters
- Recommended plan change: what the spec should add or clarify

Do not produce generic critique. If the plan already defines the behavior clearly,
do not restate the checklist. Reward strong specs.
