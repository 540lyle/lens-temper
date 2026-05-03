# Review Lens: Product & UX

Evaluate the plan from a product behavior and user experience perspective. Focus on whether the plan defines enough user-visible behavior to implement consistently and whether the resulting experience will be coherent.

## Focus Areas

- Clarity of user-visible behavior and interaction flow
- Discoverability of the feature
- Empty, loading, error, and success states
- Settings, configuration, or preference handling
- User expectations and mental model alignment
- Consistency with existing UX patterns in the product
- Accessibility of the interaction
- Recoverability from user mistakes
- Confusing edge conditions in the UI

## Key Questions

- Is the user-visible behavior clearly defined, or will developers have to guess?
- Are loading, empty, success, and error states addressed?
- For user-triggered persistence or mutation actions, does the plan define visible success feedback?
- For save, update, load, delete, duplicate, or rename flows, can users tell which action completed and which record/context changed?
- Are edit, update, overwrite, rename, and reset semantics distinct enough that users will not confuse them?
- Could users misinterpret what the feature does or how to use it?
- Does the plan define enough UX detail to implement consistently across platforms?
- Are state transitions understandable to the user?
- Are defaults sensible?
- Are failure and retry paths clear from the user's perspective?
- Are pressed, focus, disabled, and selected states perceptible and accessible across touch, pointer, and keyboard input?
- Does the plan create surprising, inconsistent, or dead-end behavior?

## Stateful Workflow Ownership

For plans involving restore, load, save, update, delete, reset, deferred apply,
planner/apply separation, persisted records, or active UI/application state, own
these checks:

- Can users tell whether load, save, update, delete, reset, overwrite, or retry completed, failed, or is still pending?
- Does visible UI state match the persisted/application state after success, failure, cancellation, retry, and deferred apply completion?
- Are stale or transitional states visible enough that users do not save mixed context by accident?
- Are overwrite, rename, update, reset, and delete meanings distinct from the user's perspective?
- Does the plan define what the user sees when a restore is superseded by another action?

## Red Flags

Apply the materiality gate before lowering a score: would this product or UX issue justify changing the plan before implementation? If not, record it as non-blocking polish and do not let it prevent a `5/5`. Treat the list below as examples of issues to watch for, not a checklist that must produce findings.

Flag and classify as `[critical]`, `[major]`, or `[minor]`:
- Unspecified error or failure states visible to users
- Unspecified loading or transition states
- Unclear state transitions
- Discoverability issues
- Settings that are too hidden, too complex, or have confusing defaults
- UX behavior left to implementation guesswork
- Missing accessibility considerations
- Interaction flows that are technically correct but confusing to use
- Persistence or mutation actions with no visible confirmation that anything happened
- Ambiguous title/edit/update semantics where users cannot tell whether they changed a record label, record contents, or both
- Touch or pointer controls whose pressed/focus/disabled states are imperceptible

## Reviewer Bias

When two approaches are roughly equivalent, prefer:
- Explicit user-visible behavior specification over implementation notes
- Consistent patterns over novel interactions
- Reduced ambiguity in the spec
- Recoverable interactions
- Accessible defaults
