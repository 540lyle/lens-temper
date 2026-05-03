# LensTemper

Repo-local, agent-readable lens review workflow for implementation-plan
reviews.

## Naming

- Brand/product name: `LensTemper`
- Repository, URL, package, and code slug: `lens-temper`

The current system is intentionally Markdown-first:

- `.codex-plugin/plugin.json` exposes LensTemper as a Codex plugin with root
  `skills/` entrypoints.
- `skills/*/SKILL.md` define portable Agent Skills-style entrypoints for
  orchestration, one-lens review, synthesis, rerun decisions, and verification.
- `reviews/README.md` defines the review workflow, ledger semantics, lens
  locking, rerun rules, and final evidence requirements.
- `reviews/reviewer-template.md` defines the structured per-lens reviewer
  output, including the stateful workflow sweep reviewers must answer for
  restore/load/save/update/delete/reset and planner/apply plans.
- `reviews/synthesize-review-feedback.md` defines the synthesis owner
  output.
- `reviews/lenses/lens-*.md` define the six default review lenses.
- `reviews/examples/artifacts/example-review-output.md` provides both
  fix-required and high-confidence advisory examples.
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

## Plugin Layout

LensTemper follows the Superpowers-compatible shape:

```text
.codex-plugin/plugin.json
skills/
reviews/
```

Claude Code, Cursor, Codex, or other skill-aware agents should load the root
`skills/` folder as the skill entrypoint set. The `reviews/` folder contains the
shared registry, prompts, validators, schemas, evals, and archive helpers those
skills reference.

Platform notes:

- Codex can load the repo as a local plugin from `.codex-plugin/plugin.json`.
- Claude Code and Cursor can use the same root `skills/` folders when installed
  as a skill/plugin repo.
- Any agent without native skill loading can still clone this repo and start
  from `reviews/README.md`.

## Tooling

Validate the reusable review contract and fixtures with:

```powershell
node reviews/scripts/validate-review-fixtures.mjs
```

Common helpers:

- `node reviews/scripts/assemble-review-prompt.mjs --target <plan> --lens <id> --pass-id <id>`
- `node reviews/scripts/create-ledger.mjs --target <plan> --pass-id <id>`
- `node reviews/scripts/run-review-evals.mjs` verifies fixture content and
  assembled stateful reviewer prompts.

## Forward Plan

See `docs/plans/FORWARD_PLAN.md`.
