# Forward Plan: LensTemper

## Goal

Turn the current Markdown review system into LensTemper: a composable workflow that an
agent can discover, run in parts, validate, and archive without relying on prior
chat context.

Use `LensTemper` for product/brand copy and `lens-temper` for repository names,
URLs, package names, and code identifiers.

The target shape is:

```text
select lenses
-> run fresh per-lens reviews
-> validate review outputs
-> synthesize feedback
-> decide reruns or completion
-> archive final result
```

Each stage should have clear inputs, outputs, source files, state updates, and
validation rules.

## Non-Goals

- Do not add more default lenses. The six-lens cap is intentional.
- Do not build a full agent runtime before validators prove value.
- Do not require a specific host agent platform.
- Do not move the current Markdown files until the registry and validators are
  useful.
- Do not add MCP or tracing infrastructure until there is repeated usage that
  justifies it.
- Do not publish non-public feature plans, product constraints, or absolute
  local paths. Example packets must be generic fixtures.

## Phase 1: Composable Index

Add machine-readable discovery around the existing files without moving them.

Planned files:

```text
llm/reviews/registry.json
llm/reviews/manifests/lenses/architecture.json
llm/reviews/manifests/lenses/implementation.json
llm/reviews/manifests/lenses/risk.json
llm/reviews/manifests/lenses/test-strategy.json
llm/reviews/manifests/lenses/product-ux.json
llm/reviews/manifests/lenses/data-model.json
llm/reviews/manifests/roles/orchestrator.json
llm/reviews/manifests/roles/lens-reviewer.json
llm/reviews/manifests/roles/synthesis-owner.json
llm/reviews/manifests/roles/rerun-decider.json
llm/reviews/AGENT.md
```

Use JSON first to avoid adding parser dependencies. The manifests should point
to the current Markdown files instead of relocating them.

Success criteria:

- An agent can read one registry file and discover every review component.
- Each lens declares its prompt path, domain focus, cross-cutting ownership, and
  advisory tool expectations.
- Role manifests distinguish orchestrator, reviewer, synthesis owner, and rerun
  decider responsibilities.

## Phase 2: Runtime State And Validators

Add schemas and validators before adding orchestration.

Planned files:

```text
llm/reviews/schemas/review-ledger.schema.json
llm/reviews/schemas/review-output.schema.json
llm/reviews/schemas/synthesis-output.schema.json
llm/reviews/scripts/validate-ledger.ts
llm/reviews/scripts/validate-review-output.ts
llm/reviews/scripts/validate-synthesis-output.ts
```

Validation should enforce:

- required sections
- valid verdict/final-assessment enums
- all six scorecard dimensions
- scores from `1/5` through `5/5`
- required cross-cutting categories
- provenance fields
- deterministic target revision match
- terminal reviewer state
- closed reviewer state
- captured output for completed reviewers

Success criteria:

- Existing example outputs validate.
- Intentionally malformed examples fail with useful errors.
- Ledger validation catches stale, incomplete, or unclosed reviewer records.

## Phase 3: Prompt Assembly

Add a repeatable prompt assembly helper.

Planned files:

```text
llm/reviews/scripts/hash-review-target.ts
llm/reviews/scripts/assemble-review-prompt.ts
llm/reviews/examples/review-input.packet.md
```

The assembly helper should:

- read the target plan directly from disk
- compute `target_revision` with `git hash-object -- <target_path>` when
  available
- compute template and lens hashes
- inject the review template variables
- support optional `previous_adjudications` for reruns

Success criteria:

- A reviewer prompt can be regenerated from paths without manual paste work.
- The generated prompt includes deterministic provenance.

## Phase 4: Ledger And Archive Helpers

Add simple state helpers, not full autonomous orchestration yet.

Planned files:

```text
llm/reviews/scripts/create-ledger.ts
llm/reviews/scripts/update-ledger.ts
llm/reviews/scripts/archive-review-run.ts
llm/reviews/scripts/decide-reruns.ts
```

These scripts should help an agent maintain state while the host agent still
owns actual subagent spawning.

Success criteria:

- A run can be archived under
  `llm/archive/reviews/<yyyy-mm-dd>-<target-slug>-<pass-id>/`.
- Rerun decisions are generated from ledger state, synthesis decisions, and
  changed target hashes.
- Locked lenses are preserved unless the target changes in their domain.

## Phase 5: A/B Eval Harness

Before building a full runner, test whether the added structure improves review
quality or just burns tokens.

Planned files:

```text
llm/reviews/evals/fixtures/
llm/reviews/evals/expected-findings.json
llm/reviews/scripts/run-review-evals.ts
```

Fixture types:

- missing migration backfill
- UI error state missing
- rollback or kill switch missing
- happy-path-only tests
- stale target revision
- accessibility gap
- performance risk
- false-positive bait

Metrics:

- material defect recall
- false-positive blockers
- unsupported-claim rate
- duplicate finding count
- schema validity
- passes to completion
- accepted findings per 1k tokens
- reruns triggered by non-material feedback

Adoption rule:

- Keep an added process layer only when recall is same or better, false
  blockers are lower, pass count is lower or unchanged, and token cost is not
  more than about 20% higher unless recall improves materially.

## Phase 6: Optional Full Orchestration

Only after the previous phases are useful, consider a callable runner.

Possible files:

```text
llm/reviews/scripts/select-lenses.ts
llm/reviews/scripts/run-plan-review.ts
```

Important constraint:

A local script may not be able to spawn Codex, Cursor, Claude, or other host
subagents directly. Treat full orchestration as host-specific unless the runtime
provides a stable subagent API.

## First Implementation Slice

Start with documentation independence, then Phase 1:

1. Sanitize existing docs so LensTemper stands alone and no non-public
   implementation plans or constraints remain.
2. Add `registry.json`.
3. Add lens manifests that point at the current `lens-*.md` files.
4. Add role manifests for orchestrator, lens reviewer, synthesis owner, and
   rerun decider.
5. Add `AGENT.md` with the discovery order and review safety rules.
6. Do not move existing files.

This gives the project composability without changing the working review loop.
