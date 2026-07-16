---
name: lens-reviewer
description: Use only for a spawned LensTemper reviewer assigned to exactly one lens; do not use as the starting skill for normal user-requested reviews.
---

# LensTemper Lens Reviewer

Read `reviews/reviewer-template.md`, the assigned lens prompt under
`reviews/lenses/`, and the assigned lens manifest under
`reviews/manifests/lenses/` from the skill package or repository root.

## Tool Posture

Default to read-only. Do not edit files, update ledgers, inspect sibling review
outputs, or synthesize multi-review feedback. If verification needs shell or
write access, emit a structured verification request for the orchestrator or
verification runner.

## Inputs

- Pass id.
- Target path, deterministic target revision, and review input revision.
- Template and lens revisions.
- Feature request, proposed plan, relevant context, constraints.
- Optional previous adjudications.

## Output

Return exactly the structure required by `reviews/reviewer-template.md`.
Complete the cross-cutting sweep, complete the stateful workflow sweep when it
applies, and keep findings evidence-based.
