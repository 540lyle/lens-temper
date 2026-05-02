# LensTemper Agent Instructions

Use this file when an agent needs to discover and run the LensTemper review
workflow from repository files instead of prior chat context.

## Discovery Order

1. Read `llm/reviews/registry.json`.
2. Read `llm/reviews/README.md` for workflow rules, ledger semantics, lens
   selection, rerun policy, and completion evidence.
3. Read the selected lens manifests under `llm/reviews/manifests/lenses/`.
4. Read the selected role manifest under `llm/reviews/manifests/roles/`.
5. Read `llm/reviews/reviewer-template.md` or
   `llm/reviews/synthesize-review-feedback.md` only when that role needs it.

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
- Keep the six default lenses capped unless replacing an existing lens or
  explicitly running a second review wave.
- Prefer path-based prompt assembly when the reviewer has workspace access.
- Record deterministic target, template, and lens revisions when running
  spawned or repeatable reviews.
- Close spawned reviewers after output capture.

## Output Expectations

- Lens reviewers must return the exact structure from
  `llm/reviews/reviewer-template.md`.
- Synthesis owners must return the exact structure from
  `llm/reviews/synthesize-review-feedback.md`.
- Orchestrators must report final evidence from `llm/reviews/README.md` before
  declaring a review complete.
