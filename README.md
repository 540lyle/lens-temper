# LensTemper

Repo-local, agent-readable lens review workflow extracted from Chip Chad.

## Naming

- Brand/product name: `LensTemper`
- Repository, URL, package, and code slug: `lens-temper`

This repository starts as a copy of the current Chip Chad implementation under
`llm/reviews/`. The current system is intentionally Markdown-first:

- `llm/reviews/README.md` defines the review workflow, ledger semantics, lens
  locking, rerun rules, and final evidence requirements.
- `llm/reviews/reviewer-template.md` defines the structured per-lens reviewer
  output.
- `llm/reviews/synthesize-review-feedback.md` defines the synthesis owner
  output.
- `llm/reviews/lens-*.md` define the six default review lenses.
- `llm/reviews/example-review-output.md` provides both fix-required and
  `Strong` / all-`5/5` examples.
- `llm/reviews/*-review-inputs.md` are copied sample input packets from the
  source repo. Keep them as fixtures or replace them with generic examples as
  the standalone project matures.

## Design Boundary

This is not a Chip Chad product feature. Treat LensTemper as a reusable
process/tooling project whose job is to make implementation-plan reviews:

- repeatable
- composable
- fresh-agent friendly
- resistant to nit churn
- auditable after the fact
- cheap enough to use before implementation

The first priority is preserving the current working Markdown flow while adding
small, testable pieces of machine-readable structure around it.

## Current Entry Point

Start with:

```text
llm/reviews/README.md
```

Then use one reviewer template plus one lens file per review agent.

## Forward Plan

See `FORWARD_PLAN.md`.
