# Review Lens: Architecture

Evaluate the plan from an architecture perspective. Focus on whether the plan places logic, state, and responsibility in the right places and whether the resulting structure will be maintainable.

## Focus Areas

- Boundaries between modules, layers, or services
- Coupling and cohesion
- Abstraction quality and necessity
- Ownership of logic and responsibilities
- Long-term maintainability and extensibility
- Compatibility with existing patterns in the repo
- Risk of scattered or duplicated logic
- State management boundaries
- Data flow clarity
- API shape and interface stability

## Key Questions

- Does the plan place responsibilities in the right layer?
- Does it introduce leaky abstractions or break encapsulation?
- Does it create avoidable coupling between components?
- Does it fit existing architectural conventions, or introduce a new pattern without justification?
- Will this be easy to maintain and extend by someone unfamiliar with the feature?
- Does it centralize logic that should be shared, or duplicate logic that should be centralized?
- Does it create multiple sources of truth for the same data or decision?
- Are interfaces clear and stable enough to build against?

## Stateful Workflow Ownership

For plans involving restore, load, save, update, delete, reset, deferred apply,
planner/apply separation, persisted records, or active application state, own
these checks:

- Are active state, derived mirrors, caches, and persisted state owned by clear layers?
- Does the plan say which existing active state is preserved, replaced, cleared, invalidated, or resynced?
- Does every planner output field and state transition have a matching App or application-layer apply path?
- Does every apply branch have a planner case that can produce it?
- Are business rules centralized in a domain/application seam rather than scattered through UI branches?

## Red Flags

Apply the materiality gate before lowering a score: would this architectural issue justify changing the plan before implementation? If not, record it as non-blocking polish and do not let it prevent a `5/5`. Treat the list below as examples of issues to watch for, not a checklist that must produce findings.

Flag and classify as `[critical]`, `[major]`, or `[minor]`:
- Logic pushed into UI that should live in domain or application layers
- Feature-specific hacks where a reusable abstraction is warranted
- Premature abstractions that add indirection without benefit
- Duplicated decision logic across modules
- Unclear module ownership
- Hidden state transitions
- Plan steps that cross layer boundaries in brittle ways
- Dependency direction violations

## Reviewer Bias

When two approaches are roughly equivalent, prefer:
- Clear ownership over shared responsibility
- Small, composable interfaces over monolithic ones
- Consistency with existing repo architecture over novel patterns
- Minimal architectural change unless the plan justifies the cost
