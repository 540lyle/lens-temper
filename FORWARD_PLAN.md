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

## Current Baseline

The first documentation and discovery slice is in place:

- Source-project implementation details were removed from reusable docs and
  example packets.
- `llm/reviews/registry.json` is the machine-readable entry point.
- Lens manifests declare prompt paths, domain focus, cross-cutting ownership,
  default selection triggers, and advisory tool expectations.
- Role manifests distinguish orchestrator, lens reviewer, synthesis owner, and
  rerun decider responsibilities.
- `llm/reviews/AGENT.md` defines discovery order and review safety rules.

The project is still Markdown-first. The registry and manifests wrap the
existing files; they do not replace validators, runtime state, skill packaging,
or orchestration.

## Non-Goals

- Do not add more default lenses. The six-lens cap is intentional.
- Do not build a full agent runtime before validators and ledger state prove
  value.
- Do not require a specific host agent platform.
- Do not move the current Markdown files into a new directory hierarchy until
  the registry, validators, and skill packaging prove useful.
- Do not add MCP or tracing infrastructure until there is repeated usage that
  justifies it.
- Do not publish non-public feature plans, product constraints, or absolute
  local paths. Example packets must be generic fixtures.
- Do not give lens reviewers write or shell authority by default. Reviewers
  should be read-only unless a later explicit verification role needs tools.

## Phase 1: Composable Index

Status: complete as the current baseline.

Added files:

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

JSON stays the first manifest format to avoid parser dependencies. The manifests
point to the current Markdown files instead of relocating them.

Success criteria:

- An agent can read one registry file and discover every review component.
- Each lens declares its prompt path, domain focus, cross-cutting ownership, and
  advisory tool expectations.
- Role manifests distinguish orchestrator, reviewer, synthesis owner, and rerun
  decider responsibilities.

## Phase 2: Validated Runtime State

Add schemas, a JSON ledger contract, and validators before adding orchestration.
The Markdown output remains the human-readable artifact; JSON and validation make
the review run mechanically checkable.

Planned files:

```text
llm/reviews/schemas/review-ledger.schema.json
llm/reviews/schemas/review-output.schema.json
llm/reviews/schemas/synthesis-output.schema.json
llm/reviews/examples/review-ledger.valid.json
llm/reviews/examples/review-ledger.invalid.json
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
- stale review rejection when `target_revision` does not match
- no synthesis completion when any included current review is stale, invalid,
  uncaptured, or unclosed

Success criteria:

- Existing example outputs validate.
- Intentionally malformed examples fail with useful errors.
- Ledger validation catches stale, incomplete, uncaptured, or unclosed reviewer
  records.
- The ledger becomes the runtime source of truth for pass status, reviewer
  status, lock state, rerun decisions, and archive paths.

## Phase 3: Skill Packaging

Package the existing workflow as composable Agent Skills-style folders while
keeping the current Markdown files in place. The skill files should be thin
activation and procedure wrappers that point back to the registry, manifests,
templates, and validators.

Planned files:

```text
llm/reviews/skills/plan-review-orchestrator/SKILL.md
llm/reviews/skills/lens-reviewer/SKILL.md
llm/reviews/skills/synthesize-review-feedback/SKILL.md
llm/reviews/skills/rerun-decider/SKILL.md
llm/reviews/skills/verification-runner/SKILL.md
```

Skill packaging should define:

- activation descriptions
- required inputs and produced outputs
- allowed tool posture
- read-only default for lens reviewers
- synthesis-only access to multiple reviewer outputs
- verification-runner separation for test or shell commands
- compatibility notes for host agents that do not support native skill loading

Success criteria:

- A host agent can discover when to activate orchestration, one-lens review,
  synthesis, rerun decisions, or verification.
- Lens reviewer instructions explicitly forbid writes, sibling review access,
  and synthesis behavior.
- The skills remain wrappers around current source files rather than a second
  divergent prompt system.

## Phase 4: Prompt Assembly

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
- The generated prompt can be validated against the selected lens manifest and
  current target hash before a reviewer sees it.

## Phase 5: Ledger And Archive Helpers

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
- Rerun decisions explain selected, skipped, locked, stale, and superseded
  lenses in terms of material findings or domain-relevant target changes.

## Phase 6: Review-Quality Eval Harness

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
- rerun decision accuracy
- synthesis deduplication quality

Adoption rule:

- Keep an added process layer only when recall is same or better, false
  blockers are lower, pass count is lower or unchanged, and token cost is not
  more than about 20% higher unless recall improves materially.
- Treat eval results as the gate for adding heavier orchestration, tracing, or
  platform-specific integrations.

## Phase 7: Optional Full Orchestration

Only after the previous phases are useful, consider a callable runner.

Possible files:

```text
llm/reviews/scripts/select-lenses.ts
llm/reviews/scripts/run-plan-review.ts
llm/reviews/scripts/run-synthesis.ts
```

Important constraint:

A local script may not be able to spawn Codex, Cursor, Claude, or other host
subagents directly. Treat full orchestration as host-specific unless the runtime
provides a stable subagent API.

The callable runner should remain a coordinator around:

- registry discovery
- deterministic prompt assembly
- JSON ledger updates
- validators
- archive helpers
- host-provided reviewer execution

## Later Integrations

Consider these only after repeated validated runs show they are worth the added
surface area:

- MCP integrations for repository metadata, CI status, review archive lookup, or
  documentation search.
- tracing for model, lens, token, cost, elapsed-time, tool-call, validation, and
  accepted-finding telemetry.
- platform-specific tool permission adapters.
- durable resumable execution when a host runtime offers reliable state APIs.

## Next Implementation Slice

Start with Phase 2:

1. Add `review-ledger.schema.json`.
2. Add `review-output.schema.json`.
3. Add `synthesis-output.schema.json`.
4. Add valid and invalid example artifacts.
5. Add validators for ledger, review output, and synthesis output.
6. Keep implementation small enough that it can run locally without a full agent
   runtime.

This turns the current composable index into enforceable state without changing
the working review loop.
