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
- Later phases extend `llm/reviews/registry.json` as their new schemas, scripts,
  skills, examples, and helper contracts are added. The registry remains the
  single discovery entry point.

## Phase 2: Validated Runtime State

Add schemas, a JSON ledger contract, and validators before adding orchestration.
The Markdown output remains the human-readable artifact; JSON and validation make
the review run mechanically checkable.

### Runtime And Artifact Contract

Phase 2 uses dependency-light Node scripts with `.mjs` extensions and no package
scaffold. Commands run with the system `node` executable, with Node 18+ as the
minimum runtime floor. If the repo later adds a package scaffold, TypeScript can
replace these scripts without changing the schemas, fixture names, or command
contracts.

The `.schema.json` files are normative documentation for the JSON shapes. During
Phase 2, the `.mjs` validators enforce those shapes with hand-written,
dependency-light checks instead of requiring a JSON Schema runtime dependency.
Each schema file must expose the same required fields, enum values, and object
shapes that the validator enforces. `validate-review-fixtures.mjs` must include a
schema-drift guard that fails when a schema declares a required field or enum the
matching validator does not check. Nested object-shape parity is enforced by the
shared validation contracts plus targeted fixture assertions for the canonical
JSON shapes.

Canonical artifact boundary:

- Markdown remains the human-readable review, synthesis, and final-summary
  artifact.
- JSON is the machine-readable source of truth for validation, rerun decisions,
  stale-output rejection, and archive helpers.
- Each completed lens review has a Markdown body and a normalized JSON record.
- The ledger references normalized review records and synthesis records by
  stable IDs, not by prose headings alone.
- Validators must check Markdown artifact existence, hash, and required section
  presence when a JSON record references a Markdown artifact, but they must not
  infer lifecycle state only from Markdown prose.
- Lifecycle state lives only in normalized JSON records and the ledger.

Planned files:

```text
llm/reviews/schemas/review-ledger.schema.json
llm/reviews/schemas/review-output.schema.json
llm/reviews/schemas/synthesis-output.schema.json
llm/reviews/examples/fixture-counts.json
llm/reviews/examples/review-output.valid-full.json
llm/reviews/examples/review-output.valid-minimal.json
llm/reviews/examples/review-output.invalid-missing-cross-cutting.json
llm/reviews/examples/review-output.invalid-score.json
llm/reviews/examples/review-output.invalid-missing-provenance.json
llm/reviews/examples/review-output.invalid-markdown-artifact-hash.json
llm/reviews/examples/review-output.invalid-missing-markdown-section.json
llm/reviews/examples/review-output.invalid-path-traversal.json
llm/reviews/examples/synthesis-output.valid.json
llm/reviews/examples/synthesis-output.invalid-stale-reference.json
llm/reviews/examples/synthesis-output.invalid-missing-final-assessment.json
llm/reviews/examples/review-ledger.valid.json
llm/reviews/examples/review-ledger.invalid-unclosed-reviewer.json
llm/reviews/examples/review-ledger.invalid-uncaptured-output.json
llm/reviews/examples/review-ledger.invalid-stale-target.json
llm/reviews/examples/review-ledger.invalid-duplicate-current-review.json
llm/reviews/examples/review-ledger.invalid-absolute-artifact-path.json
llm/reviews/examples/review-ledger.invalid-current-attempt-collision.json
llm/reviews/examples/artifacts/review-output.valid-full.md
llm/reviews/examples/artifacts/synthesis-output.valid.md
llm/reviews/examples/artifacts/final.valid.md
llm/reviews/scripts/validation-contracts.mjs
llm/reviews/scripts/validation-helpers.mjs
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

Individual script interfaces:

```powershell
node llm/reviews/scripts/validate-review-output.mjs <review-json> --target-revision <hash> [--artifact-root <path>]
node llm/reviews/scripts/validate-synthesis-output.mjs <synthesis-json> --ledger <ledger-json> [--artifact-root <path>]
node llm/reviews/scripts/validate-ledger.mjs <ledger-json> --target-revision <hash> [--artifact-root <path>]
node llm/reviews/scripts/validate-review-fixtures.mjs
```

Common options:

- `--help`: print usage to stdout and exit `0`.
- `--version`: print the LensTemper validator contract version to stdout and
  exit `0`.
- `--quiet`: suppress success summaries; validation failures still print to
  stderr.
- `--json`: emit machine-readable JSON Lines to stdout; errors still exit with
  the same codes.
- `--update-counts`: fixture runner only; rewrite
  `llm/reviews/examples/fixture-counts.json` from discovered fixtures after the
  contributor intentionally changes fixture inventory.

Exit behavior:

- Exit `0` only when every supplied artifact is valid.
- Exit non-zero when a required argument is missing, JSON cannot be parsed, a
  schema rule fails, a referenced file is missing, a target revision is stale, a
  current review is invalid, or an expected invalid fixture unexpectedly passes.
- Print validation errors as one line per failure with artifact path, record ID
  when available, field or section name, expected value, and actual value.
- Missing or invalid CLI arguments print the command usage, then the validation
  error, then exit non-zero.
- Validators report all independently detectable failures in a readable artifact.
  They fail fast only when an artifact cannot be read or parsed.
- Individual validators print no output on success unless `--json` is used or a
  later `--verbose` option is added. `validate-review-fixtures.mjs` prints the
  aggregate fixture-count success summary.
- Validators fail with a clear Node 18+ version message before using unsupported
  runtime features.

Exit codes:

| Code | Meaning |
|------|---------|
| `0` | Success, help, or version output. |
| `1` | Validation failed for a readable artifact. |
| `2` | CLI usage error, missing required argument, or unsupported option. |
| `3` | File read, JSON parse, or Markdown artifact read failure. |
| `4` | Stale target revision or hash mismatch. |
| `5` | Internal validator error. |

Example failure output:

```text
llm/reviews/examples/review-ledger.invalid-absolute-artifact-path.json record=review-implementation-1 field=artifact_path expected=repository-relative path actual=C:\tmp\review.md
```

Output ergonomics:

- Human-readable output is ASCII-only in Phase 2.
- Human-readable output must be deterministic: sort by artifact path, then
  record ID, then field or section name.
- Validation failure events are one line each.
- Human-readable success summaries go to stdout; validation failures and usage
  errors go to stderr.
- Non-TTY output must use the same stable format as TTY output.
- Do not emit ANSI styling by default. If color is added later, disable it when
  `NO_COLOR` is set or stdout/stderr is not a TTY.
- `--json` emits one JSON object per line with stable keys and the same event
  ordering as human-readable output.

Shared validator helpers should stay dependency-light and cover provenance,
score parsing, enum checks, target revision matching, repository-relative path
checks, Markdown section checks, and structured error formatting.
Shared validation contracts should live in
`llm/reviews/scripts/validation-contracts.mjs` and export the required-field
lists, enum maps, canonical scorecard keys, cross-cutting keys, and lock-state
values checked by the validators. It must also export required Markdown section
names for review, synthesis, and final summary artifacts. `validate-review-fixtures.mjs`
compares those exports against the schema files for required-field and enum
drift.

Canonical JSON shapes:

The block below defines shared nested object shapes, not complete top-level
record examples. Complete review, synthesis, and ledger records are defined by
their schema files and the required-field lists below.

```json
{
  "scorecard": {
    "correctness": 5,
    "completeness": 5,
    "risk_awareness": 5,
    "testability": 5,
    "maintainability": 5,
    "ship_readiness": 5
  },
  "material_blockers": {
    "present": false,
    "summary": "no accepted material blockers",
    "count": 0
  },
  "cross_cutting_status": {
    "security_privacy": "not_applicable|non_blocking|material_issue",
    "accessibility": "not_applicable|non_blocking|material_issue",
    "performance": "not_applicable|non_blocking|material_issue",
    "reliability_rollback": "not_applicable|non_blocking|material_issue",
    "observability_debuggability": "not_applicable|non_blocking|material_issue",
    "compatibility_platform": "not_applicable|non_blocking|material_issue"
  },
  "finding_decisions": [
    {
      "finding_id": "implementation-cli-contracts",
      "decision": "accepted|rejected|downgraded|deferred",
      "severity": "critical|major|minor",
      "affects_rerun_scope": true,
      "reason": "short reason"
    }
  ],
  "lens_lock_decisions": [
    {
      "lens": "implementation",
      "lock_state": "active|failing|passing_locked|rerun_required|converged_locked",
      "rerun_needed": true,
      "reason": "short reason"
    }
  ]
}
```

`verdict` belongs to individual lens review records and uses the reviewer
template enum: `Strong`, `Usable with fixes`, `High risk`, or `Incomplete`.
`final_assessment` belongs to synthesis records and uses the synthesis enum:
`Ready to implement`, `Ready with minor clarifications`, `Needs revision`, or
`Not implementation-ready`.

`schema_version` starts at integer `1`. Validators must reject missing,
non-integer, or unknown schema versions rather than attempting best-effort
parsing.

`finding_id` values must be stable slugs. They should be derived from the issue
domain and summary, not from list position, and synthesis records should include
the source lens and source review record ID for each accepted, rejected,
downgraded, or deferred finding.

Reference arrays use stable record IDs only:

- `current_review_record_ids`: records counted for readiness.
- Ledger `superseded_review_record_ids`: stale or replaced records retained only
  for history.
- `included_review_record_ids`: synthesis inputs counted for current readiness.
- Synthesis `superseded_review_record_ids`: historical review context excluded
  from current readiness. `validation-contracts.mjs` must document this dual
  semantic so validators do not treat ledger and synthesis superseded references
  as interchangeable.
- Ledger validation resolves record IDs through repository-relative artifact
  paths listed in the ledger. It must not infer record locations from ID strings
  alone.

Paths and artifact binding:

- `artifact_path` and `markdown_artifact_path` must be repository-relative paths
  using forward slashes.
- `artifact_path` identifies the normalized JSON artifact or archive entry for
  the record.
- `markdown_artifact_path` identifies the human-readable Markdown artifact whose
  sections and hash are validated.
- The full fixture `review-output.valid-full.json` and
  `synthesis-output.valid.json` must include `markdown_artifact_path` and
  `markdown_artifact_sha`. The minimal review-output fixture may omit Markdown
  binding only when it has `fixture_kind: "schema_only_minimal"` and is not
  counted as a completed review record.
- Absolute local paths are invalid in durable JSON records.
- Empty paths, `.` segments, `..` segments, backslashes, drive-prefixed paths,
  and resolved paths outside the artifact root are invalid.
- `markdown_artifact_sha` is required when `markdown_artifact_path` is present.
- Compute `markdown_artifact_sha` with `git hash-object --
  <markdown_artifact_path>` and store it as `git:<hash>`. If `git hash-object`
  is unavailable, compute SHA-256 over the raw file bytes without text
  normalization and store it as `sha256:<hex>`. Validators must compare both the
  prefix and value so fixture, archive, and validation code agree on the hash
  algorithm.
- Hash algorithm success notices are silent by default. Validators report hash
  algorithm details only in `--json` events, on hash mismatch/failure, or under a
  later explicit verbose mode. `--quiet` suppresses hash success notices.
- Hash JSON events must include stable keys: `event`, `artifact_path`,
  `hash_algorithm`, `expected`, and `actual` when applicable.
- A single current review run should not mix `git:` and `sha256:` hashes.
  Mixed-prefix archives are allowed only for explicitly imported historical
  records that are excluded from current readiness.
- Apply the same `git:<hash>` / `sha256:<hex>` prefix rule to target, template,
  and lens hashes created in later prompt assembly and archive helpers.
- Review-output validation must confirm the Markdown artifact exists under the
  optional `--artifact-root` or repository root, matches `markdown_artifact_sha`,
  and contains the required template sections.

Attempt semantics:

- `attempt` is a positive integer scoped by `pass_id`, `target_revision`, and
  `lens`.
- The first current review for a lens starts at `attempt: 1`.
- Replacement reviews for the same target revision and lens increment the
  attempt.
- Stale, invalid, and superseded attempts remain addressable by record ID but
  cannot appear in `current_review_record_ids`.
- A ledger is invalid when two current records share the same `pass_id`,
  `target_revision`, `lens`, and `attempt`.

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
- `markdown_artifact_path`
- `markdown_artifact_sha`
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
- `markdown_artifact_path`
- `markdown_artifact_sha`

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
- artifact path visibility (`public_safe` or `private_local_only`)

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
- repository-relative artifact paths and rejection of local absolute paths
- Markdown artifact hash and required-section checks when a JSON record points
  to a Markdown artifact
- attempt assignment, attempt collision, and current-vs-superseded reference
  rules
- privacy/local-path fixture lint for generic examples
- no synthesis completion when any included current review is stale, invalid,
  uncaptured, or unclosed

Success criteria:

- Valid example outputs added in this phase validate.
- Intentionally malformed examples fail with useful errors.
- Ledger validation catches stale, incomplete, uncaptured, or unclosed reviewer
  records.
- The ledger becomes the runtime source of truth for pass status, reviewer
  status, lock state, rerun decisions, and archive paths.
- A single local validation command reports fixture counts and exits non-zero on
  any unexpected result. Expected successful output shape:

  ```text
  review-output: 2 valid passed, 6 invalid rejected
  synthesis-output: 1 valid passed, 2 invalid rejected
  ledger: 1 valid passed, 6 invalid rejected
  all review validators passed
  ```
- The expected counts live in `llm/reviews/examples/fixture-counts.json`.
  Contributors update that file only by running
  `node llm/reviews/scripts/validate-review-fixtures.mjs --update-counts` after
  intentionally adding, removing, or reclassifying fixtures.
- Validation errors identify the file path, record ID when available, field or
  section name, expected value, and actual value.
- Every validation rule is mapped to at least one valid or invalid fixture
  assertion before `validate-review-fixtures.mjs` is considered complete.
- At least one invalid fixture for each artifact type asserts the emitted error
  includes file path, record ID when available, field or section name, expected
  value, and actual value.
- Phase 2 implementation is not complete until
  `node llm/reviews/scripts/validate-review-fixtures.mjs` passes locally.
- Update `llm/reviews/registry.json` with Phase 2 schemas, scripts, examples,
  fixture-count manifest, and validation helper contracts.

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
- The verification runner may append verification-result records to the ledger.
  Lens reviewers may not write ledger state.
- The skills remain wrappers around current source files rather than a second
  divergent prompt system.
- Update `llm/reviews/registry.json` with all skill paths and role-skill
  mappings.

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

Output contract:

- By default, write the assembled prompt to stdout.
- With `--out <path>`, write the assembled prompt to that repository-relative
  file path and print one ASCII status line to stdout.
- Errors use the validator one-line-per-event shape and go to stderr.
- `--json` emits a JSON Lines event with output path, target hash, template
  hash, lens hash, and selected lens.

Success criteria:

- A reviewer prompt can be regenerated from paths without manual paste work.
- The generated prompt includes deterministic provenance.
- The generated prompt can be validated against the selected lens manifest and
  current target hash before a reviewer sees it.
- Update `llm/reviews/registry.json` with prompt assembly scripts and example
  input packet paths.

## Phase 5: Ledger And Archive Helpers

Add simple state helpers, not full autonomous orchestration yet.

Planned files:

```text
llm/reviews/scripts/create-ledger.mjs
llm/reviews/scripts/update-ledger.mjs
llm/reviews/scripts/archive-review-run.mjs
llm/reviews/scripts/decide-reruns.mjs
llm/reviews/scripts/emit-completion-summary.mjs
```

These scripts should help an agent maintain state while the host agent still
owns actual subagent spawning.

`decide-reruns.mjs` is the script implementation of the rerun-decider role
manifest. The role manifest defines responsibility; the script is the callable
helper.

`update-ledger.mjs` assumes a single writer. Concurrent orchestrators must use
separate pass IDs or serialize writes outside the helper.

Output contracts:

- `decide-reruns.mjs` writes rerun-decision JSON to stdout by default. With
  `--ledger <path> --write`, it updates the ledger and prints one ASCII status
  line. Errors use the validator one-line-per-event shape.
- `archive-review-run.mjs` writes archive files and prints one ASCII status line
  containing the archive path and final assessment. `--json` emits JSON Lines.
- `emit-completion-summary.mjs` reads a ledger plus synthesis artifact and emits
  the user-facing completion summary required by `llm/reviews/README.md`,
  including final assessment, target path/revision, artifact storage status,
  per-lens score table, accepted findings, rerun/lock status, and verification
  evidence.
- `emit-completion-summary.mjs --ledger <ledger-json> --synthesis <synthesis-md>
  [--out <path>] [--json] [--quiet]` is the canonical interface.
- Without `--out`, human-readable summary output goes to stdout. With `--out`,
  the summary is written to the repository-relative path and one ASCII status
  line goes to stdout unless `--quiet` is set.
- Completion-summary failures use the validator one-line-per-event shape on
  stderr and the same exit-code table as validators.
- `emit-completion-summary.mjs --json` emits one JSON object for the full summary
  with stable keys: `final_assessment`, `target_path`, `target_revision`,
  `artifact_storage`, `lens_scores`, `accepted_findings`,
  `rerun_or_lock_status`, and `verification_evidence`.
- Human-readable completion summaries keep the README score table exactly for
  normal terminal output. When `--quiet` is set, or when a constrained host asks
  for compact output, emit deterministic line-oriented fields in this order:
  final assessment, target, artifact storage, one `lens=` line per selected lens,
  accepted findings, rerun/lock status, and verification evidence.

Archive helpers must normalize or flag workspace-local absolute paths before
writing durable artifacts. They must reject generic example fixtures that include
private source-project names, non-public target details, or local absolute paths
unless the run is explicitly marked private and local-only.
Archive rejection output must identify the offending field/path, state that the
artifact was blocked from durable archive, and name the required metadata for
private local-only storage.

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
- Update `llm/reviews/registry.json` with ledger, archive, rerun, and completion
  summary helper scripts.

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
4. Add `validation-contracts.mjs` and `validation-helpers.mjs` so schemas,
   fixtures, and validators share field lists, enum maps, score keys,
   cross-cutting keys, path checks, hash checks, and error formatting.
5. Add normalized valid and invalid example artifacts for review output,
   synthesis output, and ledger records.
6. Add the generic Markdown artifact fixtures that JSON records will bind to.
7. Add dependency-light `.mjs` validators for ledger, review output, and
   synthesis output.
8. Add `validate-review-fixtures.mjs` as the single local validation command.
9. Keep implementation small enough that it can run locally without a full agent
   runtime.

This turns the current composable index into enforceable state without changing
the working review loop.
