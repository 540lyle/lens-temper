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

### Runtime And Artifact Contract

Phase 2 uses dependency-light Node scripts with `.mjs` extensions and no package
scaffold. Commands run with the system `node` executable. If the repo later adds
a package scaffold, TypeScript can replace these scripts without changing the
schemas, fixture names, or command contracts.

Canonical artifact boundary:

- Markdown remains the human-readable review, synthesis, and final-summary
  artifact.
- JSON is the machine-readable source of truth for validation, rerun decisions,
  stale-output rejection, and archive helpers.
- Each completed lens review has a Markdown body and a normalized JSON record.
- The ledger references normalized review records and synthesis records by
  stable IDs, not by prose headings alone.
- Validators may check Markdown section presence, but they must not infer
  lifecycle state only from Markdown prose.

Planned files:

```text
llm/reviews/schemas/review-ledger.schema.json
llm/reviews/schemas/review-output.schema.json
llm/reviews/schemas/synthesis-output.schema.json
llm/reviews/examples/review-output.valid-full.json
llm/reviews/examples/review-output.valid-minimal.json
llm/reviews/examples/review-output.invalid-missing-cross-cutting.json
llm/reviews/examples/review-output.invalid-score.json
llm/reviews/examples/review-output.invalid-missing-provenance.json
llm/reviews/examples/synthesis-output.valid.json
llm/reviews/examples/synthesis-output.invalid-stale-reference.json
llm/reviews/examples/synthesis-output.invalid-missing-final-assessment.json
llm/reviews/examples/review-ledger.valid.json
llm/reviews/examples/review-ledger.invalid-unclosed-reviewer.json
llm/reviews/examples/review-ledger.invalid-uncaptured-output.json
llm/reviews/examples/review-ledger.invalid-stale-target.json
llm/reviews/examples/review-ledger.invalid-duplicate-current-review.json
llm/reviews/scripts/validate-ledger.mjs
llm/reviews/scripts/validate-review-output.mjs
llm/reviews/scripts/validate-synthesis-output.mjs
llm/reviews/scripts/validate-review-fixtures.mjs
```

Exact local validation command:

```powershell
node llm/reviews/scripts/validate-review-fixtures.mjs
```

The command validates all example artifacts and exits non-zero when a valid
fixture fails, an invalid fixture passes, an expected count changes without the
expected output being updated, or a referenced artifact is missing.

Normalized review output records should include:

- `schema_version`
- `record_id`
- `pass_id`
- `target_path`
- `target_revision`
- `template_revision`
- `lens`
- `lens_revision`
- `attempt`
- `execution_mode`
- `artifact_path`
- `verdict`
- `material_blockers`
- `cross_cutting_status`
- six named scorecard values

Normalized synthesis records should include:

- `schema_version`
- `record_id`
- `pass_id`
- `target_path`
- `target_revision`
- `included_review_record_ids`
- `superseded_review_record_ids`
- `finding_decisions`
- `lens_lock_decisions`
- `final_assessment`
- `artifact_path`

Ledger records should include:

- `schema_version`
- `pass_id`
- `target_path`
- `target_revision`
- `status`
- `execution_mode`
- selected lenses
- current review record IDs
- superseded review record IDs
- synthesis record IDs
- archive paths

Conditional lifecycle rules:

- In `fresh_spawned_lens_reviewers` mode, each current completed review requires
  `agent_id`, `closed: true`, and `output_captured: true`.
- In `manual_or_imported` mode, `agent_id` may be absent, but each current
  completed review still requires a captured artifact path, target revision,
  verdict, scorecard, material-blocker status, and explicit provenance.
- A synthesis record may reference superseded reviews only when they are listed
  as historical context and excluded from current readiness.
- There may be only one current review record per `pass_id`, `target_revision`,
  `lens`, and `attempt` tuple.

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
- unique current review identity per lens and attempt
- synthesis references only current valid reviews unless a review is explicitly
  marked superseded historical context
- conditional required fields for spawned and manual/imported execution modes
- no synthesis completion when any included current review is stale, invalid,
  uncaptured, or unclosed

Success criteria:

- Existing example outputs validate.
- Intentionally malformed examples fail with useful errors.
- Ledger validation catches stale, incomplete, uncaptured, or unclosed reviewer
  records.
- The ledger becomes the runtime source of truth for pass status, reviewer
  status, lock state, rerun decisions, and archive paths.
- A single local validation command reports fixture counts and exits non-zero on
  any unexpected result. Expected successful output shape:

  ```text
  review-output: 2 valid passed, 3 invalid rejected
  synthesis-output: 1 valid passed, 2 invalid rejected
  ledger: 1 valid passed, 4 invalid rejected
  all review validators passed
  ```
- Validation errors identify the file path, record ID when available, field or
  section name, expected value, and actual value.

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
- verification request handoff from read-only reviewers to the orchestrator or
  verification runner
- compatibility notes for host agents that do not support native skill loading

Success criteria:

- A host agent can discover when to activate orchestration, one-lens review,
  synthesis, rerun decisions, or verification.
- Lens reviewer instructions explicitly forbid writes, sibling review access,
  and synthesis behavior.
- Read-only reviewers may emit structured verification requests, but only the
  orchestrator or verification runner may execute shell commands or update the
  ledger with verification results.
- The skills remain wrappers around current source files rather than a second
  divergent prompt system.

## Phase 4: Prompt Assembly

Add a repeatable prompt assembly helper.

Planned files:

```text
llm/reviews/scripts/hash-review-target.mjs
llm/reviews/scripts/assemble-review-prompt.mjs
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
llm/reviews/scripts/create-ledger.mjs
llm/reviews/scripts/update-ledger.mjs
llm/reviews/scripts/archive-review-run.mjs
llm/reviews/scripts/decide-reruns.mjs
```

These scripts should help an agent maintain state while the host agent still
owns actual subagent spawning.

Archive helpers must normalize or flag workspace-local absolute paths before
writing durable artifacts. They must reject generic example fixtures that include
private source-project names, non-public target details, or local absolute paths
unless the run is explicitly marked private and local-only.

Success criteria:

- A run can be archived under
  `llm/archive/reviews/<yyyy-mm-dd>-<target-slug>-<pass-id>/`.
- Archive directories contain `ledger.json`, `input.packet.md`, `reviews/`,
  `synthesis.md`, and `final.md` when those artifacts exist.
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
llm/reviews/scripts/run-review-evals.mjs
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

Expected eval report shape:

```text
fixtures: 8
critical_recall: 7/7
false_positive_blockers: 0
unsupported_claim_rate: 0.00
schema_validity: 8/8
rerun_decision_accuracy: 8/8
recommendation: keep
```

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
llm/reviews/scripts/select-lenses.mjs
llm/reviews/scripts/run-plan-review.mjs
llm/reviews/scripts/run-synthesis.mjs
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
4. Add normalized valid and invalid example artifacts for review output,
   synthesis output, and ledger records.
5. Add dependency-light `.mjs` validators for ledger, review output, and
   synthesis output.
6. Add `validate-review-fixtures.mjs` as the single local validation command.
7. Keep implementation small enough that it can run locally without a full agent
   runtime.

This turns the current composable index into enforceable state without changing
the working review loop.
