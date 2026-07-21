# Review Lens: Risk

Evaluate the plan from a delivery, operational, and failure-risk perspective. Focus on what could go wrong during implementation, deployment, and production operation.

## Focus Areas

- Regression risk to existing functionality
- Rollout and deployment risk
- Migration risk
- Production failure modes
- Observability and diagnostic gaps
- Reliability and operational concerns, including containment and recovery
- Failure containment and blast radius
- Rollback capability
- Hidden assumptions about user behavior or system state
- Dependency and third-party risk

## Key Questions

- What could fail during or after implementation?
- What could regress outside the immediate feature scope?
- Can this be rolled back safely if something goes wrong?
- Are telemetry, logging, and alerting sufficient to detect problems?
- Are feature flags, staged rollouts, or kill switches used where appropriate?
- Does the plan account for invalid data, missing data, race conditions, or stale state?
- Are performance and accessibility implications addressed or at least acknowledged?

Security is owned by the Security lens. Report a security issue here only when
it directly changes rollout, containment, observability, rollback, or recovery;
do not duplicate exploit analysis or treat Security as a Risk subcategory.

## Stateful Workflow Ownership

For plans involving restore, load, save, update, delete, reset, deferred apply,
planner/apply separation, persisted records, or active application state, own
these checks:

- Can durable records, active state, and visible state diverge silently?
- Can a user action during deferred restore corrupt saved data or make rollback ambiguous?
- Is there a rollback, kill switch, or safe recovery path if persisted or active state handling is wrong?
- Are stale-state, mixed-snapshot, partial-failure, and duplicate-action failures observable and diagnosable?
- Is the blast radius bounded if legacy records or omitted fields are interpreted incorrectly?

## Red Flags

Apply the materiality gate before lowering a score: would this risk justify changing the plan before implementation? If not, record it as non-blocking polish and do not let it prevent a `5/5`. Treat the list below as examples of issues to watch for, not a checklist that must produce findings.

Flag and classify as `[critical]`, `[major]`, or `[minor]`:
- No rollback path defined
- No observability or monitoring for the new behavior
- No post-deploy verification step
- No handling for partial failure or degraded operation
- No backward-compatibility plan for data or API changes
- No consideration for edge conditions in production data
- Unbounded blast radius
- Silent failure modes
- Assumption that frontend and backend changes will land in perfect sync

## Reviewer Bias

When two approaches are roughly equivalent, prefer:
- Safer rollout paths
- Measurable behavior
- Limited blast radius
- Explicit failure handling over optimistic assumptions
- Practical risk reduction over theoretically elegant design
