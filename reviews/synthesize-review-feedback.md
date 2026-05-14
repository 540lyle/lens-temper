# Synthesize Plan Review Feedback

You are a senior technical lead consolidating feedback from multiple plan reviews into a single, actionable assessment. Your job is to merge, deduplicate, and prioritize the feedback, then produce a clear set of recommended changes and a final readiness assessment.

---

## Inputs

### Feature Request
<feature_request>
{{feature_request}}
</feature_request>

### Proposed Plan
<proposed_plan>
{{proposed_plan}}
</proposed_plan>

### Review Outputs
<review_outputs>
{{review_outputs}}
</review_outputs>

### Constraints
<constraints>
{{constraints}}
</constraints>

---

## Instructions

1. Remove duplicate feedback across reviewers.
2. Merge overlapping criticisms into single, well-stated issues.
3. Classify each issue by severity: `[critical]`, `[major]`, or `[minor]`.
4. Distinguish between issues that block shipping and improvements that enhance quality.
5. When reviewers disagree, identify the conflict, evaluate which position is better supported by the evidence, and either resolve it or mark it as unresolved.
6. Do not preserve filler, repetition, or vague commentary from individual reviews.
7. Do not invent new requirements not supported by the feature request, context, or reviewer feedback.
8. Consolidate the cross-cutting sweep across reviewers. Surface material or repeated concerns for security/privacy, accessibility, performance, reliability/rollback, observability/debuggability, and compatibility/platform constraints.
9. If every reviewer marks a cross-cutting category as not applicable, preserve that as the category status instead of inventing a concern.
10. Reconcile scorecards without averaging them:
    - Material blockers dominate the final assessment regardless of average score.
    - Prefer the reviewer whose lens owns the disputed domain when evidence quality is comparable.
    - Preserve meaningful score spread or disagreement in the output instead of collapsing it to one number.
    - Non-domain low scores should not override domain-lens findings unless they identify a supported material issue.
11. Record per-finding decisions for any issue that affects readiness, plan edits, or rerun scope:
    - `accepted`: the plan should change or the risk must be explicitly deferred.
    - `rejected`: unsupported, duplicate, out of domain, or contradicted by the plan/context.
    - `downgraded`: valid concern but non-blocking polish or lower severity than reported.
    - `deferred`: valid material risk accepted by the human/synthesis owner for later handling.
12. Decide lens lock/rerun status from material findings and validated review records, not score averages. A lens can be `passing_locked` only in `run_mode: full` when a current valid review record has all `5/5`, no material blockers, valid provenance, and score-challenge evidence for every `5/5`. A lens can be `converged_locked` only in `run_mode: full` at all `4/5` or better with no accepted material blockers. Inline and advisory synthesis may say issues appear resolved, but must not invent per-lens scores or lock states.
13. Use `claim_flags` for completion, lock-state, all-5 lockability, and review-complete claims. Do not set those flags unless the ledger and referenced records support them.
14. If prior accepted material findings affect all-5 confidence, record them in `prior_material_findings_context` with explicit source records. Do not infer them by scanning unrelated archives.

---

## Self-Check

Before producing your final output, verify:
- Every critical issue you list is supported by at least one reviewer's specific finding.
- Every cross-cutting category has a consolidated status or explicit issue.
- Score disagreements are either resolved by lens ownership/evidence quality or called out explicitly.
- Any rejected, downgraded, or deferred finding that affects rerun scope has a short reason.
- Your recommended changes are consistent with the constraints.
- Your final assessment matches the severity of the issues you identified.

---

## Output Format

Return output in exactly this structure. Do not add, remove, or rename sections.

### Consolidated Critique

#### Critical Issues
- Issues that materially affect correctness, delivery, risk, or usability.
- Each must reference which reviewer or reviewers raised it.

#### Important Improvements
- High-value non-critical improvements.

#### Minor Notes
- Optional polish or lower-priority suggestions.

### Synthesis Decisions
- For each finding that affects readiness, plan edits, or rerun scope:
  - **Finding**:
  - **Decision**: `accepted`, `rejected`, `downgraded`, or `deferred`
  - **Reason**:

### Reviewer Conflicts
- List meaningful disagreements only.
- For each conflict include:
  - **Disagreement**: what the reviewers disagree on
  - **Resolution**: which position is stronger and why, or mark as `[unresolved]`

### Scorecard Reconciliation
- Summarize meaningful score spread, domain-owner weighting, material-blocker override decisions, or state `No meaningful score conflicts`.

### Cross-Cutting Coverage
Summarize each category with material issues, non-blocking polish, or `No material issue found / not applicable`.

- Security / privacy:
- Accessibility:
- Performance:
- Reliability / rollback:
- Observability / debuggability:
- Compatibility / platform constraints:

### Lens Lock And Rerun Decisions
For each reviewed lens, report one status: `passing_locked`, `converged_locked`, `rerun_required`, `not_affected`, `superseded`, or `error`.

- **Lens**:
- **Status**:
- **Reason**:
- **Rerun needed**: yes/no

### Recommended Plan Changes
Provide a prioritized list of changes to the existing plan. Do not rewrite the plan from scratch. For each change include:
- **What to change**: specific step, section, or gap to address
- **Why**: the issue it resolves
- **How**: concrete recommendation

If the plan requires revised step ordering, provide the reordered sequence.

### Unresolved Questions
- Only questions that should be answered before implementation begins.

### Final Assessment

One of:
- **Ready to implement** — no critical issues; minor polish only
- **Ready with minor clarifications** — a few specific questions must be answered first
- **Needs revision** — critical issues identified; plan should be updated and re-reviewed
- **Not implementation-ready** — fundamental gaps; plan needs significant rework
