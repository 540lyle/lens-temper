# LensTemper

Repo-local, agent-readable lens review workflow for implementation-plan
reviews.

## Naming

- Brand/product name: `LensTemper`
- Repository, URL, package, and code slug: `lens-temper`

The current system is intentionally Markdown-first:

- `reviews/README.md` defines the review workflow, ledger semantics, lens
  locking, rerun rules, and final evidence requirements.
- `reviews/reviewer-template.md` defines the structured per-lens reviewer
  output.
- `reviews/synthesize-review-feedback.md` defines the synthesis owner
  output.
- `reviews/lenses/lens-*.md` define the six default review lenses.
- `reviews/examples/artifacts/example-review-output.md` provides both
  fix-required and `Strong` / all-`5/5` examples.
- `reviews/examples/input-packets/*-review-inputs.md` are generic fixture
  packets that show how to assemble review inputs without exposing
  project-specific implementation details.

## Design Boundary

Treat LensTemper as a reusable process/tooling project whose job is to make
implementation-plan reviews:

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
reviews/README.md
```

Then use one reviewer template plus one lens file per review agent.

## Forward Plan

See `FORWARD_PLAN.md`.
