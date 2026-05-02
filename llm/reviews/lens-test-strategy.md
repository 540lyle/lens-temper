# Review Lens: Test Strategy

Evaluate the plan from a testing and verification perspective. Focus on whether the plan is testable as designed and whether the proposed testing is proportional to feature risk.

## Focus Areas

- Unit test coverage for new logic
- Integration test coverage where modules interact
- End-to-end test coverage for user-critical flows
- Edge-case and negative-path testing
- Regression prevention for existing behavior
- Observability and runtime validation
- Testability of the architecture
- Data contract and schema verification
- Error-state coverage
- Post-deploy verification

## Key Questions

- Is the feature testable as planned, or does the design make testing difficult?
- Are the main success paths covered?
- Are edge cases and failure modes covered?
- Does the plan make validation easy or hard?
- Are contracts between modules or services verified?
- Are loading, empty, invalid, and failure states covered for UI features?
- Is there a clear post-deploy verification path?

## Red Flags

Apply the materiality gate before lowering a score: would this testing or verification issue justify changing the plan before implementation? If not, record it as non-blocking polish and do not let it prevent a `5/5`. Treat the list below as examples of issues to watch for, not a checklist that must produce findings.

Flag and classify as `[critical]`, `[major]`, or `[minor]`:
- Testing mentioned only generically without specifying what or how
- No negative-path or error-state coverage
- No integration tests where multiple components interact
- No end-to-end coverage for user-critical flows
- No contract or schema verification for API or data changes
- No telemetry or runtime validation for production
- Architecture that is hard to mock, stub, or isolate for testing
- Missing accessibility assertions for UI features

## Reviewer Bias

When two approaches are roughly equivalent, prefer:
- Simple, layered test strategies
- Verification proportional to feature risk
- Targeted regression protection over broad coverage mandates
- Testable seams in the design
