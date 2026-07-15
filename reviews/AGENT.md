# LensTemper Agent Instructions

Use this file when an agent needs to discover and run the LensTemper review
workflow from repository files instead of prior chat context.

## Discovery Order

1. Read `reviews/registry.json`.
2. Read `reviews/README.md` for workflow rules, ledger semantics, lens
   selection, rerun policy, and completion evidence.
3. Read the selected lens manifests under `reviews/manifests/lenses/`.
4. Read the selected role manifest under `reviews/manifests/roles/`.
5. Read `reviews/reviewer-template.md` or
   `reviews/synthesize-review-feedback.md` only when that role needs it.

## Safety Rules

- Treat the workspace files as the source of truth.
- Do not rely on inherited chat context for target plans, lens prompts, or
  previous review results.
- Do not invent repository details that are not present in the review packet or
  referenced files.
- Do not publish non-public source-project plans, product details, local
  absolute paths, or copied private constraints in examples or fixtures.
- Keep examples generic and fictional unless the repository owner explicitly
  asks for a project-specific private review run.
- Treat changes to the default lens set as review-contract changes. Update the
  registry, lens manifests, documentation, and evaluator fixtures together.
- Prefer path-based prompt assembly when the reviewer has workspace access.
- Record deterministic target, template, and lens revisions when running
  spawned or repeatable reviews.
- Close spawned reviewers after output capture.
- Label run mode honestly. Inline and advisory reviews cannot claim completed
  LensTemper passes, lock states, or lockable all-5 scores.

## Output Expectations

- Lens reviewers must return the exact structure from
  `reviews/reviewer-template.md`.
- Synthesis owners must return the exact structure from
  `reviews/synthesize-review-feedback.md`.
- Orchestrators must report final evidence from `reviews/README.md` before
  declaring a review complete.
- Orchestrators must validate completion and claim language before reporting
  lockable or complete status.
- Orchestrators must include the user-facing completion summary from
  `reviews/README.md`, including the per-lens score table, final assessment,
  artifact path/storage status, accepted material findings, rerun or lock status,
  and reviewer cleanup/validation evidence.
