# Plan Review System

> Version 1.9

This folder contains reusable review prompts for evaluating implementation plans,
plus task-specific review input packets that assemble the context for one plan review run.

## Purpose

Standardize plan review so that:
- the same feature plan can be reviewed by multiple models or reviewers
- each review uses a consistent structure and scoring rubric
- the only variable is the review lens
- feedback can be compared and synthesized programmatically

## Quick Start

1. Generate a candidate implementation plan.
2. Assemble the required inputs in a repository-relative `review-input.json`, with an optional intent card stating the plan's goals.
3. Run a full LensTemper review by default: the selector picks the lenses the
   spec's domains call for, and one detached-context reviewer subagent runs per
   selected lens. The full core profile is an opt-in for irreversible work.
4. Collect the structured output from each spawned reviewer.
5. Run `synthesize-review-feedback.md` across all review outputs to filter the findings against the plan's goal.
   Deliver it as `Review delivered: N blocking gaps, K minor issues, M questions`, counting the synthesis Blocking Gaps, Minor Issues, and Questions for the Author. The review never edits the target spec.
6. A lens is `settled` once its validated review is delivered and reopens only when one of its findings is applied, an applied finding names it as affected, or the user reopens it. Inline and advisory outputs may guide planning, but their scores are not lockable.

Store completed review outputs outside this folder unless they are still being actively assembled.
`reviews/` is for reusable tooling and review-input packets; durable finished outputs or synthesis
should live in `reviews/archive/` or next to the owning plan/doc when that folder explicitly owns review history.
Default review run path: `reviews/archive/<yyyy-mm-dd>-<target-slug>-<pass-id>/`.
`run-plan-review.mjs` prepares the run there (`--out <dir>` chooses another
directory), and the ledger records it as the pass's archive. The directory holds
`review-input.json`, `lens-selection.json`, `ledger.json`, `events.jsonl`, and a
`<lens>.prompt.md` and `<lens>.spawn.md` per lens. Save each captured reviewer
output where the archive keeps it, before attaching it: `<run>/reviews/<record-id>.json`
with its Markdown at `<run>/reviews/<record-id>.md`, and the synthesis at
`<run>/synthesis/<record-id>.json` and `.md`. `archive-review-run.mjs`
completes the directory in place: records already there stay put, a record
captured under another name inside the run directory is moved there (not
copied, so no stale duplicate is left), and `--final <path>` lands in
`final.md`. A record outside the run directory is copied and left as it was. Use an owning plan/doc folder instead when that
folder already keeps review history next to the plan.

One pass has one ledger: `<run>/ledger.json`, the path `run-plan-review.mjs`
prints. Attach artifacts, record `target_edits`, run `decide-reruns.mjs --write`,
and pass `--parent-ledger` against that file, before and after archiving.
`archive-review-run.mjs --archive-root <dir>`, and ledgers written before the
run directory became the archive, produce a separate snapshot copy; the run
directory's ledger stays the pass's ledger.

## Single-Lens Run Without A Ledger

A single lens can run with no ledger, which is the lightest LensTemper review:

1. `assemble-review-prompt.mjs --target <plan> --lens <id> --pass-id <id> --review-input <path> --out <packet.md>`
   writes one reviewer packet with its provenance block and nothing else.
2. Give the packet to one fresh reviewer and read its review. Its findings are
   the delivered result; there is no synthesis, completion summary, or archive.
3. After the owner edits the plan, `decide-reruns.mjs --lens <id> --applied <finding,...>`
   (or `--reopen <id>`) says whether to rerun the lens.

`run-plan-review.mjs --lens <id>` is the ledger-backed alternative: a
`selected_lenses` full run whose review, synthesis, and completion summary are
validated and archived like any full run.

## Run Families And Claim Discipline

LensTemper supports three host-neutral run families:

- Default assumption: a request to "run LensTemper", "review with
  LensTemper", or "run a full LensTemper review" means `full_hosted`, or
  `full_detached` when the user opts into an independent orchestrator. Do not
  perform an inline/advisory substitute unless the user
  explicitly asks for inline or advisory review. If fresh subagents cannot be
  spawned, stop and report that the full review could not be completed.
- `inline`: current-context advisory review. It maps to `run_mode: inline` and `execution_mode: manual_or_imported`. Required wording: `Inline LensTemper-style review`, `Not independently reviewed`, `No spawned reviewers used`, and `Scores are advisory, not lockable`.
- `full_hosted`: the current agent owns orchestration and starts fresh lens reviewers through whatever host spawning mechanism exists. It maps to `run_mode: full` and `execution_mode: fresh_spawned_lens_reviewers`.
- `full_detached` (opt-in): a fresh orchestrator owns ledger, reviewer prompts, reviewer lifecycle evidence, synthesis, reruns, archive, and completion claims. It maps to `run_mode: full` and `execution_mode: fresh_spawned_orchestrator`. Its lifecycle evidence is checked in audit mode (see Audit Mode).

`run_mode: advisory` remains available for quick imported critique. It uses `execution_mode: manual_or_imported`; required wording is `Advisory LensTemper critique`, `Not a completed LensTemper pass`, `No lock states available`, and `Scores, if present, are advisory only`.

`run_mode` is separate from `execution_mode`. `full` supports `fresh_spawned_lens_reviewers` and `fresh_spawned_orchestrator`; `inline` and `advisory` require `manual_or_imported`.

`run_scope: core_profile` comes only from an explicit `--core-profile <id>`
(or a core-profile lens selection); every other full run, including
`--all-lenses`, is `run_scope: selected_lenses`. What each may claim:

- A focused (`selected_lenses`) full run delivers a review. Its unqualified
  claims are `Review delivered: N blocking gaps, K minor issues, M questions`
  and each selected lens's `settled` or `open` state. Its summary opens with
  `Full LensTemper review for selected lenses only: <lenses>`, and its
  `claim_flags.completion` and `review_complete` stay false.
- Only `full` plus a passed core profile may say unqualified
  `LensTemper pass complete` or `review complete`.

Completion and lockable claims are blocked unless the ledger and artifacts prove the run. The completion validator checks structured `claim_flags` and generated text for completion, lock-state, all-5, and review-complete wording.

## Audit Mode

Every run records what it cheaply can: `run-plan-review.mjs` writes
`events.jsonl` with the setup events (selection, ledger, prompt packets, spawn
prompts), and the orchestrator appends lifecycle events as it goes. Validating
that log is opt-in: `validate-ledger.mjs <run>/ledger.json --target-revision <hash> --audit`
checks every event against the ledger and, for a completed `full_detached` run,
requires the orchestrator's reviewer spawn, completion, and close events,
validation, synthesis, archive, and completion events. Default validation does
not read the log. Use audit mode when the run's independence must be shown, such
as a detached orchestrator on a host whose isolation is still being verified.

## Detached-Context Review Runs

When running `full_hosted` lens reviews through spawned agents, use one
detached-context reviewer subagent per lens and make the workspace the source
of truth. A detached-context reviewer subagent is fresh and receives none of
the host, parent, or orchestrator conversation or history; it reads only the
run packet and permitted workspace files. Do not rely on inherited conversation
context, stale pasted excerpts, or another lens agent's conclusions.
Host mechanisms for detached-context reviewers:

- Codex: use the current detached-context subagent mechanism once per selected
  lens. See `docs/hosts/codex.md` for current tool and configuration details.
- Claude Code: invoke the `Agent` (Task) tool once per selected lens. Each
  Agent invocation is already a fresh subagent with isolated context, so no
  fork flag is needed.
- Claude Desktop / Claude.ai: use only if the host can launch detached-context
  reviewer subagents and can provide the `reviews/` workflow resources. If it
  cannot, stop the full-review request and report that the host requirements
  are not met unless the user explicitly asks for advisory mode.
- Cursor and other skill-aware hosts: use the host's independent-agent
  mechanism that does not inherit the parent thread.

If that host mechanism is unavailable, do not continue as inline/advisory
unless the user explicitly requested that lower-rigor mode.

For `full_detached`, the parent agent acts only as launcher/reporter when the host can start a fresh orchestrator. Generate the platform-neutral orchestrator packet with `reviews/scripts/assemble-orchestrator-prompt.mjs` or `reviews/scripts/run-plan-review.mjs --execution-mode fresh_spawned_orchestrator`, then give that packet to the fresh orchestrator. Host mechanics vary across Codex, Claude, Cursor, and manual CLI environments; LensTemper artifacts stay Markdown/JSONL/JSON and repository-relative.

Required orchestration:

1. Materialize and validate one canonical `review-input.json`, then create an agent-run ledger before spawning reviewers. Track its repository-relative path and normalized revision together with lens name, lens file, pass id, target path, deterministic target revision/hash, agent id, status, final output captured, and closed status.
2. Spawn a detached-context reviewer subagent for each lens. Do not provide the host, parent, or orchestrator conversation or history.
3. Reviewer execution may be concurrent or sequential. Never reuse one reviewer for multiple lenses.
4. Start each reviewer in the current repository root, then give it the target plan/spec path, deterministic target revision/hash, pass id, `reviews/reviewer-template.md`, and the exact lens file path as repository-relative paths.
5. Instruct each reviewer to read the current files directly from the workspace before reviewing.
6. Keep reviewer prompts narrow: include the task, file paths, provenance values, and output expectations; do not include prior debate, user conversation, or other agents' findings unless the task is explicitly synthesis. For reruns, a short list of previously adjudicated non-material findings is allowed so fresh reviewers do not reopen already-settled nits. Generated spawn prompts should use repository-relative paths only; the host should set the reviewer working directory instead of embedding absolute workspace paths in the prompt.
7. Wait for each reviewer to produce its final review output, then copy that output into the parent thread or review artifact.
8. Close each completed reviewer immediately after its output is captured. Do not leave completed agents running.
9. If a reviewer times out, errors, or is superseded by a rerun, close it before spawning a replacement unless its output is still required.
10. Before reporting review completion, verify every spawned reviewer in the ledger has a terminal status and has been closed.

Ledger fields:

| Field | Required | Purpose |
|-------|----------|---------|
| `pass_id` | yes | Groups reviewers spawned for the same review pass. |
| `target_path` | yes | Plan/spec path under review. |
| `target_revision` | yes | Deterministic content identifier for the target plan/spec. Prefer `git hash-object -- <target_path>`; use a SHA-256 file hash only when `git hash-object` is unavailable. Do not use timestamps or vague notes for rerunnable reviews. |
| `review_input_path` | yes for full runs | Repository-relative path to the normalized review input JSON snapshot. |
| `review_input_revision` | yes for full runs | SHA-256 of the normalized review input. It must match across ledger, events, current reviews, synthesis, and completion output. |
| `lens_selection_path` | yes for full runs | Repository-relative path to the audited lens-selection record. |
| `lens_selection_revision` | yes for full runs | Deterministic revision of the lens-selection record bound to the ledger. |
| `run_mode` | yes | Claim authority: `full`, `inline`, or `advisory`. |
| `run_scope` | yes | `core_profile` or `selected_lenses`. |
| `core_profile_id` | for core-profile runs | Named registry profile, currently `standard-v2`. |
| `required_lens_ids` | for core-profile runs | Every lens required for this run: the profile core plus triggered specialists. |
| `completed_lens_ids` | for core-profile runs | Required lenses with current validated completion evidence. |
| `core_gate_passed` | for core-profile runs | True only when all required lenses and completion evidence pass. |
| `execution_mode` | yes | `manual_or_imported`, `fresh_spawned_lens_reviewers`, or `fresh_spawned_orchestrator`. |
| `apply_mode` | written by `create-ledger.mjs` | `interactive` (default) or `auto`. See Applying Findings. |
| `pass_index` | absent means 1 | Position in a rerun lineage. Pass 2 is the one automatic rerun; pass 3 and later need `human_approval`. |
| `parent_pass_id`, `parent_intent_revision` | from pass 2 | The parent pass and its intent card revision. A different card needs `intent.amended_by: human`. |
| `human_approval` | from pass 3 | `{ "decided_by": "human", "summary": "..." }`, recorded only when the user approved another pass. |
| `events_path` | yes for detached | Repository-relative path to the run's `events.jsonl` trace, checked only in audit mode. |
| `completion_validation` | yes | Validation evidence record with validator name/version, pass flag, validated records, and field-level failures. |
| `lens` | yes | Lens name. |
| `lens_file` | yes | Exact lens prompt file. |
| `lens_revision` | recommended | Deterministic content hash of the lens file used for the review. |
| `template_revision` | recommended | Deterministic content hash of `reviewer-template.md` used for the review. |
| `agent_id` | yes for spawned agents | Reviewer agent id or equivalent. |
| `status` | yes | One of `pending`, `running`, `completed`, `error`, `superseded`, `stale`, `ignored_locked_rerun`. |
| `output_captured` | yes for spawned agents | Whether the reviewer's final output was copied into the parent thread or review artifact. |
| `verdict` | yes after completion | Reviewer verdict. |
| `scorecard` | yes after completion | Named scores for Correctness, Completeness, Risk Awareness, Testability, Maintainability, and Ship Readiness. |
| `material_blockers` | yes after completion | `yes`, `no`, or a short count/summary. |
| `lens_state` | yes | `open` or `settled`. Keep this separate from `status`; `status` describes reviewer lifecycle outcome, while `lens_state` describes whether the lens still needs review. Legacy `lock_state` values map onto it: `passing_locked` and `converged_locked` are settled, and any other value is open exactly when `rerun_needed` is true. |
| `blocking`, `goal_fit` | recommended after completion | Lens verdict: `blocking` is `yes` or `no` and matches `material_blockers.present`; `goal_fit` is `ok`, `at_risk`, or `violated`, and is not `ok` when blocking. |
| `rerun_reason` | required for reruns | Why this lens is being rerun: its own finding was applied, an applied finding named it as affected, or the user reopened it. |
| `finding_decisions` | recommended after synthesis | Per-finding synthesis decisions: `accepted`, `rejected`, `downgraded`, `deferred`, or `needs_author`, with a short reason. |
| `target_edits` | when the target is edited after delivery | One entry per edit: `finding_id` or `host_initiated: true`, `decided_by` (`human` or `policy`), and a `summary`. See Applying Findings. |
| `previous_adjudications` | optional for reruns | Short list of previously rejected, downgraded, or non-material findings that fresh rerun reviewers may ignore unless the updated target reintroduces material evidence. |
| `artifact_path` | optional | Path where the review output or synthesis is stored, if any. |
| `closed` | yes for spawned agents | Whether the reviewer was closed after output capture. Keep this separate from `status`; `status` describes reviewer lifecycle outcome, while `closed` records cleanup. |

Ledger readiness fields are derived, not author-supplied. Attach each current
review and synthesis artifact with
`update-ledger.mjs --ledger <run>/ledger.json --review <review.json> --write`
(or `--synthesis <synthesis.json>`) before validating it with `--ledger`: the
validators accept only records the ledger already lists. Then run
`update-ledger.mjs --ledger <run>/ledger.json --finalize --write`. To attach an
artifact to a finalized core-profile ledger, pass `--finalize` again in the same
call. Finalization
recomputes `completed_lens_ids`, binds completion validation to the exact current
review and synthesis records, and sets `core_gate_passed` only when the complete
trust chain validates. Caller-authored readiness values are overwritten and the
write is rejected if the derived ledger does not validate.

Attaching registers each record's content hash as `artifact_sha` beside its
`record_id` and `artifact_path`. The ledger validator rejects a registered
file edited after attachment, and `validate-review-output.mjs` /
`validate-synthesis-output.mjs --ledger` reject a different file that reuses a
registered `record_id` with different content. To change a record, edit the
registered file and attach it again. Validating a record that is not attached
prints the attach command first and omits the fields attaching would stamp.
Validators print one `valid ...` line on success (`--quiet` silences it,
`--json` prints a `valid` event).

Synthesis owner:

- The parent orchestrator owns the ledger, final synthesis, materiality decisions, lens states, rerun selection, and final completion decision.
- In `full_detached`, the fresh orchestrator owns those duties; the parent launcher reports only what the detached artifacts prove.
- Lens reviewers stay independent. They review only their assigned lens and do not coordinate convergence with other reviewers.
- The synthesis owner is a filter that defends the plan's goal, not a merger. It records a decision for every finding: an accepted `add` must name the goal it serves (`serves_goal`), rejections carry a `rejection_reason` (`conflicts_with_goal`, `adds_unrequested_scope`, `implementer_discretion`, `unsupported`, `duplicate`, `out_of_domain`, or `contradicted`), and decisions that belong to the plan's owner are `needs_author` and become questions. Filtering decides what becomes a plan change, never what the owner sees.

Review-output provenance:

- Reviewers do not echo provenance. `update-ledger.mjs --review` (and
  `--synthesis`) stamps what the run already knows into the attached record
  when the record omits it: `pass_id`, `target_path`, `target_revision`,
  `review_input_revision`, `run_mode`, `execution_mode`, the package's
  `template_revision` and `lens_revision`, and `markdown_artifact_sha`. It
  fills a skipped cross-cutting category with `not_applicable` only when the
  lens does not own it; an owned category must be answered. With `--write`
  the stamped record is saved before the ledger validates it; a supplied value
  that disagrees with the run is never overwritten and still fails validation.
  Review Markdown no longer needs a `### Provenance` section; older Markdown
  that has one stays valid. A review written to the goal-anchored contract (it
  records `goal_fit` or `blocking`, or was stamped with the current reviewer
  template revision) must include the `### Goal Gate` and
  `### Goal Fit / Recommended Removals` sections; reviews written before that
  contract keep the older section list.
- Review records store input evidence in `provenance.input_sources[]`.
- Each input source has `role`, `basis`, `paths_reviewed`, and `target_included`.
- Valid basis values are `direct_workspace_read`, `provided_packet`, `imported_archive`, and `fixture`.
- Mixed provenance is allowed. For example, an inline target can use `provided_packet` while supporting workflow files use `direct_workspace_read`.
- `paths_reviewed` lists the files a `direct_workspace_read` source read: at least one, each repository-relative, normalized, traversal-free, and existing at validation time, and it includes `target_path` when that source has `target_included: true` on a completed review. Every other basis keeps `paths_reviewed: []`; a packet the reviewer was handed (`provided_packet`) is not a workspace read, even when the packet is a file in the run directory.
- `fixture` basis is valid only on records with `fixture_kind`.
- Reviewer lifecycle remains top-level: `agent_id`, `closed`, and `output_captured` are not provenance fields.

Score discipline:

- A `5/5` score requires `score_challenges.<dimension>` with `would_make_this_a_4`, `why_not_present`, and `evidence_no_material_issue`.
- The challenge evidence is machine-readable in JSON. Markdown reviews should include concise score notes when the score supports a lock or completion claim.
- If prior accepted material findings are relevant, record them in `prior_material_findings_context`; do not infer them by broad archive scanning.
- Synthesis may settle a lens only from a reviewer output that is validated, current for the target revision, captured into artifacts, and closed. Unvalidated outputs remain advisory/imported and must be labeled that way.

Rerun protocol:

- Each lens is `open` or `settled`. A lens settles when its validated review is delivered; settling does not depend on scores or on blocking gaps being fixed.
- A settled lens reopens only when one of its own findings is applied, an applied finding from another lens names it in `affected_lenses`, or the user reopens it. Editing the target does not by itself reopen anything: target revisions stay as the audit trail of what each review read, not as a staleness trigger.
- `decide-reruns.mjs --ledger <run>/ledger.json` derives the decisions from the ledger's `target_edits` and the synthesis `finding_decisions`; `--reopen <lens,...>` records an explicit user reopen. A reopened lens outside the ledger's pass is marked `reviewed_in_pass: false`, and its reason says the next pass reviews it fresh. Without a ledger (see Single-Lens Run Without A Ledger), pass `--lens <id>` with `--applied <finding,...>` or `--reopen`; `--reopen` there may name only a lens the run reviewed. `--write` stores the decisions as the ledger's `rerun_decisions`.
- Reruns start a new pass with `run-plan-review.mjs --parent-ledger <run>/ledger.json`, which reruns only the reopened lenses unless the user names lenses. Pass 2 is the one automatic rerun. Pass 3 and later require `--human-approval "<what the user approved>"`, recorded in the ledger as `human_approval`. The intent card stays fixed across a lineage unless the owner amends it with `amended_by: human`.
- Spawn new fresh agents for reruns. Do not reuse prior reviewer agents.
- A full clean rerun is exceptional. Use it only for broad plan rewrites, suspected reviewer contamination, corrupted inputs, or explicit user request.
- Treat rerun outputs as current only if the reviewer read the updated workspace files directly; the rerun's ledger, not the reviewer, records the `target_revision` it read.
- If the same lens returns repeated non-material or preference-only findings after material fixes, record them as non-blocking and do not reopen that lens.
- A review is delivered when every selected lens has a captured, validated output and all spawned agents are closed. Report it as `Review delivered: N blocking gaps, K minor issues, M questions`, counting the synthesis Blocking Gaps, Minor Issues, and Questions for the Author, and listing every question and minor issue. Delivery does not require resolving blocking gaps, answering questions, or reaching a lock state. The review never edits the target spec; applying fixes is the user's call, and rerunning a lens after the user edits the spec is a supported user-driven action.
  An unqualified `LensTemper pass complete` claim also requires `run_mode: full`, `run_scope: core_profile`, `core_gate_passed: true`, successful `completion_validation`, and no missing current reviewer evidence.

## Applying Findings

The review never edits the target. When the user or host edits it after
delivery, record each edit in the reviewed pass's ledger (`<run>/ledger.json`)
as a `target_edits` entry so growth that bypasses synthesis stays visible:

```bash
node reviews/scripts/update-ledger.mjs --ledger <run>/ledger.json --applied <finding-id> --summary "<what changed>" --write
node reviews/scripts/update-ledger.mjs --ledger <run>/ledger.json --host-initiated --summary "<what changed>" --write
```

`--decided-by policy` replaces the default `human` where the rules below allow
it; the write is rejected when they do not. Without `--write` the call is a dry
run: it prints the ledger it would write and says on stderr which entry it would
record. To remove a mistaken entry, name it by its index in `target_edits` or by
the finding id it applied:

```bash
node reviews/scripts/update-ledger.mjs --ledger <run>/ledger.json --remove-edit <index|finding-id> --write
```

Removing an entry clears stored `rerun_decisions`; run
`decide-reruns.mjs --ledger <run>/ledger.json --write` again.

After a target edit, the ledger still records the revision the pass reviewed.
Validate it with `validate-ledger.mjs <run>/ledger.json --target-revision <the
ledger's target_revision>`; validating at the edited text's revision fails
with a message saying the target was edited after delivery.

- Cite the synthesis `finding_id` the edit applies, or set
  `host_initiated: true` for an edit no finding asked for.
- Set `decided_by: human` when a person chose the edit. `decided_by: policy`
  may apply only an accepted `[critical]` or `[major]` finding that cites a
  stated goal (an intent card goal id when the review input has a card); the
  validator rejects anything else.
- Questions for the author and minor issues are never applied by policy. A
  question becomes an edit only after the owner answers it.

Apply modes (`--apply-mode` on `run-plan-review.mjs` and `create-ledger.mjs`,
recorded as the ledger's `apply_mode`):

- `interactive` (default): nothing is applied. The run finishes and delivers
  every blocking gap, question, and minor issue in one list; the validator
  rejects any `decided_by: policy` edit.
- `auto` (opt-in): after delivery, the host may apply the blocking fixes above
  as `decided_by: policy`, run `decide-reruns.mjs --write`, and run the one
  automatic rerun pass of the reopened lenses. It then stops and presents what
  remains. Questions are never converted into edits. Policy edits are valid only
  on pass 1; the validator rejects them on the rerun pass and later passes.

Ledgers written before `apply_mode` existed keep the policy rule without the
mode check.

## Project Root

Scripts that take a target or a run artifact accept `--root <path>` (default:
the current directory). The target, review input, ledger, run artifacts, and
`reviews/archive/` resolve against that project root, so a plan in another
project can be hashed, reviewed, and archived there. The registry, manifests,
lenses, and templates always come from the LensTemper package. Validators also
accept the older `--artifact-root` spelling.

## Available Lenses

The `standard-v2` core profile uses seven lenses because Security and
operational Risk are separate P0 readiness perspectives. Changing that core set
is a review-contract change: add a new named profile or update the registry,
lens manifests, documentation, and evaluator fixtures together.

| Lens | File | Focus |
|------|------|-------|
| Architecture | `lenses/lens-architecture.md` | Boundaries, coupling, abstraction, ownership |
| Implementation | `lenses/lens-implementation.md` | Sequencing, feasibility, execution clarity |
| Risk | `lenses/lens-risk.md` | Failure modes, rollback, observability |
| Security | `lenses/lens-security.md` | Trust boundaries, authn/authz, secrets, injection, SSRF, exploitability |
| Test Strategy | `lenses/lens-test-strategy.md` | Coverage, edge cases, verification |
| Product & UX | `lenses/lens-product-ux.md` | User-visible behavior, states, accessibility |
| Data Model | `lenses/lens-data-model.md` | Schema, migration, storage, contracts |
| Natty (triggered specialist) | `lenses/lens-natty.md` | LLM-to-authority boundaries, deterministic resolution, conversational safety |

## Cross-Cutting Sweep

Each lens reviews only the cross-cutting categories it owns, as primary or
secondary owner. `assemble-review-prompt.mjs` writes the lens's categories into
the packet from its manifest's `cross_cutting_ownership`. A lens skips every
other category, with no `Not applicable` line, unless it sees an issue there
that meets the goal gate. The review record lists skipped categories as
`not_applicable`, which `update-ledger.mjs` fills in when they are omitted; it
never fills a category the lens owns.

| Category | Primary lens owner | Secondary lens owners |
|----------|--------------------|-----------------------|
| Security / privacy | Security | Architecture, Data Model, Implementation, Natty |
| Accessibility | Product & UX | Test Strategy, Implementation |
| Performance | Architecture | Implementation, Test Strategy, Product & UX |
| Reliability / rollback | Risk | Test Strategy, Implementation, Natty |
| Observability / debuggability | Risk | Implementation, Test Strategy |
| Compatibility / platform constraints | Implementation | Architecture, Product & UX, Test Strategy |

Cross-cutting findings follow the same materiality rules as other findings. A category can block implementation only when the issue is material for the feature and review lens.

The stateful workflow sweep has one owner, the Implementation lens, whose file
holds its questions. Other lenses write `Owned by the Implementation lens` in
the sweep section unless they see a stateful issue that meets the goal gate
through their own lens. Security may exit with `No security surface changed`
when the plan touches no trust boundary, credential, untrusted input, network
target, or disclosure boundary.

## Lens Selection Contract

Resolve lens scope before creating the ledger or spawning reviewers.
`reviews/manifests/lens-selection.json` and
`reviews/scripts/lens-selection.mjs` are the source of truth.

1. **Explicit scope is exact.** When the user supplies lens ids, validate them
   against `reviews/registry.json` and use exactly that set. Do not infer
   additions or removals. Unknown or duplicate lens ids are a validation stop.
   An explicit all-lenses request selects the complete registry set.
2. **Otherwise, selection follows the spec's domains.** Deterministic code
   evaluates the normalized canonical review input and current target with
   Unicode-normalized exact phrases and bounded co-occurrence rules, and
   selects the lenses of every matched domain. `select-lenses.mjs`,
   `run-plan-review.mjs`, and `assemble-orchestrator-prompt.mjs` use the same
   focused selection. The full core profile is an explicit opt-in,
   `--core-profile <id>`, which unions triggered specialists with the
   profile's core lenses; use it for irreversible work such as migrations,
   authorization, money, or tool authority. When a focused selection matches
   a migration, security, or model-authority domain, the scripts print a hint
   naming the opt-in. `deterministic_lenses` may not be reduced by model
   judgment. Natty is
   selected when one paragraph or bounded text window establishes a
   natural-language, model-output, tool-return, or retrieval boundary that can
   affect resolution, authoritative state, narration, write, or dispatch.
   Negated safety requirements such as “the LLM must not write state” still
   establish a boundary. Generic mentions of an LLM, MCP tool, free-text field,
   or RAG do not select Natty unless an authority-boundary rule also matches.
   Explicit absence statements may be encoded as narrow rule exclusions; the
   selector does not attempt general natural-language negation parsing.
3. **The orchestrator may add, never subtract.** Each proposed addition must
   name a registry-valid lens and provide a concise reason plus concrete
   evidence from the canonical review input or target. Inherited conversation
   and model confidence are not selection evidence. The final set is the union
   of the deterministic minimum and validated additions.
4. **Ambiguity fails closed.** An automatic request with zero matched domains
   stops with `needs_clarification`, even when an LLM proposal exists. The
   message names the ways forward: `--lens <ids>`, `--core-profile <id>`, or
   `--selection-fallback all`.

The runner stores the selection mode, policy and input revisions,
deterministic minimum, validated additions, evidence, and final selected set in
`lens-selection.json`. The policy manifest, not duplicated prose phrase lists,
owns the current domain mapping.

An optional `--lens-proposal <repo-relative-path>` uses this validated shape:

```json
{
  "schema_version": 1,
  "additions": [
    {
      "lens": "product-ux",
      "reason": "The plan introduces an operator retry decision.",
      "evidence": "Target section Error recovery defines visible retry states."
    }
  ]
}
```

Proposal validation is structural and additive. It does not turn inherited
conversation, confidence, or unsupported interpretation into evidence.

## Standard Inputs

Every review receives these inputs. The template uses `{{double_curly}}` variable syntax to mark injection points.

| Variable | Description | Guidance |
|----------|-------------|----------|
| `{{feature_request}}` | What is being built and why | 1 to 3 paragraphs. Include user-facing goal and success criteria. |
| `{{intent_card}}` | Optional intent card from the review input | Rendered as JSON when supplied; otherwise a note that reviewers infer the goal. |
| `{{pass_id}}` | Identifier for this review pass | Required for spawned-agent runs. Use the same value in every reviewer prompt for one pass. |
| `{{target_path}}` | Plan/spec file path under review | Required for spawned-agent runs. Use a repository-relative path; the host provides the workspace root separately. |
| `{{target_revision}}` | Deterministic content hash for the target plan/spec | Required for spawned-agent runs and reruns. Prefer `git hash-object -- <target_path>`. |
| `{{review_input_revision}}` | SHA-256 of the normalized review input contract | Required for full runs. Every current review, synthesis, event, ledger, and completion artifact must report the same value. |
| `{{template_revision}}` | Deterministic content hash for `reviewer-template.md` | Recommended for stale-output detection. |
| `{{lens_revision}}` | Deterministic content hash for the lens file | Recommended for stale-output detection. |
| `{{proposed_plan}}` | The implementation plan under review | Full plan text. Ordered steps preferred. |
| `{{relevant_context}}` | Supporting material from the repo or specs | Keep it focused. Include only material needed to evaluate the plan. Prefer excerpts over full files. |
| `{{constraints}}` | Hard constraints, deadlines, or non-negotiables | List form. Include tech stack, timeline, backward-compatibility requirements, and non-goals where relevant. |
| `{{review_lens}}` | The lens file contents | Paste the full lens file. |
| `{{cross_cutting_owned}}` | The lens's cross-cutting categories | From the lens manifest's `cross_cutting_ownership`, for example `Accessibility (primary); Performance (secondary)`. |
| `{{previous_adjudications}}` | Previously rejected, downgraded, or non-material findings | Optional. Use only for reruns and keep it short. Do not include raw prior review debate. |

The synthesis template (`synthesize-review-feedback.md`) uses one additional variable:

| Variable | Description | Guidance |
|----------|-------------|----------|
| `{{review_outputs}}` | Collected outputs from one or more reviews | Paste complete review outputs. Use the structure shown in `example-review-output.md`. |

## General Rules

- Critique the plan rather than replacing it unless replacement is necessary.
- Prefer concrete corrections over vague commentary.
- Call out missing steps, unsupported assumptions, sequencing problems, and meaningful risks.
- Judge every finding against the plan's goal. A finding is material only if,
  left unaddressed, a stated goal fails, data is lost, a trust boundary is
  crossed, accessibility regresses, or competent implementers would build
  incompatible behavior the goal depends on. A finding whose fix adds
  unrequested surface is not material. Copy, labels, layout details, and
  ordinary defaults are implementer discretion unless a goal is about them.
  Zero findings is the expected result for a sound plan.
- Questions stay questions. A decision the plan explicitly hands to its owner
  is asked, not answered, and does not lower Completeness or the verdict. Every
  question reaches the user, ranked by consequence; none is dropped. An item is
  never both a question and a recommended change.
- A decided trade-off in the intent card is settled. Reviewers do not re-raise
  its rejected alternative unless keeping the decision makes a goal fail or
  meets another condition of the goal gate.
- Preference-only polish, wording improvements, or optional refactors must not prevent a `Strong` verdict or `5/5` score when no material issue remains.
- Reruns follow applied findings or an explicit user reopen. Do not spawn reruns only to chase nits.
- Reviewers cover the cross-cutting categories their lens owns and raise any other category only with an issue that meets the goal gate.
- Do not invent repository details that are not present in the provided input.
- Optimize for safe, shippable implementation over theoretical elegance.

Final evidence before completion:

- Latest output, verdict, scorecard, and material-blocker status for each selected lens.
- Cross-cutting sweep status for each selected lens's owned categories.
- Lens state for each selected lens, including why any settled lens was not rerun after plan/spec edits.
- Confirmation that each current reviewer read the current workspace files directly.
- Confirmation that every spawned reviewer has terminal status and is closed.
- Run mode, run scope, completion-validation result, and whether scores are lockable or advisory.
- A concise synthesis listing blocking gaps, every question for the plan's owner, minor issues, the scope delta, rejected or downgraded findings with their reasons, and any explicitly deferred risks.

User-facing completion summary:

When reporting a completed review run to the user, the orchestrator must include a compact final summary. Do not require the user to open the archive to learn the outcome.
`emit-completion-summary.mjs --ledger <run>/ledger.json --synthesis <synthesis.json> --out <run>/final.md`
writes it, starting with the `Review delivered: N blocking gaps, K minor issues, M questions`
line. The emitter counts blocking gaps from the synthesis finding decisions
(accepted findings that are not minor). Minor issues and questions are counted
from the decisions too (accepted minor or downgraded; `needs_author`), raised to
the synthesis Markdown's own line when that counts more, because reviewer Open
Questions live only in the Markdown. The synthesis validator (and so attaching
and `--finalize`) rejects a synthesis whose `Review delivered` line disagrees
with its decisions: a different blocking count, or fewer minor issues or
questions than the decisions hold. `validate-completion-summary.mjs --ledger`
applies the same check to the summary's line and its `delivered` counts. Its
completion claim comes from the finalized ledger, so the synthesis
`claim_flags` may stay false. The summary also states each artifact path's git
status (`committed`, `committed, with uncommitted changes`, `not committed
(untracked …)`, `ignored/local-only`, or stored outside git) as of emission, and
derives its verification evidence from the current review records: outputs
captured per selected lens, spawned reviewers completed, captured, and closed,
and reviewers that read the target directly at the reviewed revision.

Required fields:

- The `Review delivered` line.
- Final assessment from synthesis.
- Target path and deterministic target revision reviewed.
- Review artifact path, plus whether the artifact is committed, ignored/local-only, or stored elsewhere.
- Per-lens score table with lens, verdict, goal fit, all six score values, material-blocker status, and lens state.
- Accepted material findings and the plan changes or follow-up actions they require.
- Every question for the plan's owner, ranked by consequence.
- Every minor issue, even when nothing blocks.
- Rejected, downgraded, deferred, or non-blocking findings that affect rerun scope.
- Verification evidence: reviewer outputs captured, reviewers terminal and closed, current reviewers read current workspace files directly, and any validator or stale-output checks that were run.

Use this table shape unless the host interface requires a shorter form:

| Lens | Verdict | Goal Fit | Correctness | Completeness | Risk Awareness | Testability | Maintainability | Ship Readiness | Material Blockers | State |
|------|---------|----------|-------------|--------------|----------------|-------------|-----------------|----------------|-------------------|-------|
| Implementation | Usable with fixes | at_risk | 4/5 | 3/5 | 4/5 | 4/5 | 4/5 | 3/5 | yes | settled |

## Recommended Prompt Assembly

Assemble a single prompt containing:
1. The contents of `reviewer-template.md`
2. One lens file injected into the `{{review_lens}}` slot
3. The feature request, proposed plan, relevant context, and constraints in their respective slots

Then request output in exactly the structure specified in the template.

For full runs, use a repository-relative JSON review input artifact:

```json
{
  "schema_version": 2,
  "feature_request": "What is being built, why, and the success criteria.",
  "relevant_context": "Focused supporting context or excerpts.",
  "constraints": "Hard constraints and non-goals, or an explicit statement that none were supplied.",
  "previous_adjudications": "Settled rerun findings, or an explicit statement that none were supplied."
}
```

An optional `intent` card makes the goal explicit instead of inferred:

```json
{
  "intent": {
    "goals": [{ "id": "G1", "text": "What must be true when the plan ships.", "success_signal": "How the owner will observe it." }],
    "non_goals": ["What the plan will not do."],
    "must_not_grow": ["Surface the plan must not add to."],
    "decided_tradeoffs": [{ "decision": "What was chosen.", "rejected_alternative": "What was not.", "why": "Why." }]
  }
}
```

When present, reviewers and synthesis use it as the goal reference: findings
cite goal ids, an accepted `add` must name the goal it serves, and a
reductive goal whose net surface grows makes the synthesis verdict `Goal drift`.
When absent, reviewers infer the goal and mark it `inferred`. The card is part
of the review input, so it is hashed into `review_input_revision`, separately
from the target spec. Only the plan's owner changes it: a card that differs
from the parent pass's card must carry `amended_by: "human"`, and
`run-plan-review.mjs`, `create-ledger.mjs`, and the ledger validator reject a
rerun pass whose card changed without it.

`feature_request` must be non-empty. The other fields are always materialized;
when omitted from scalar compatibility input, the runner writes explicit
`No additional ... supplied` values instead of silent blanks. Prefer
`--review-input <repo-relative-path>` for portability. The scalar
`--feature-request`, `--relevant-context`, `--constraints`, and
`--previous-adjudications` options remain a compatibility path and cannot be
mixed with `--review-input`.

`reviews/scripts/run-plan-review.mjs` creates a normalized `review-input.json`,
an audited `lens-selection.json`, and two reviewer-facing files per selected
lens. Omitting `--lens` invokes the canonical selector, which picks the same
focused domain selection as `select-lenses.mjs`; `--core-profile <id>` opts
into the full core profile, and `--all-lenses` is the explicit
complete-registry mode.

- `<lens>.prompt.md`: the assembled reviewer packet with the target plan, template, lens, constraints, and deterministic revisions.
- `<lens>.spawn.md`: the compact host-to-subagent handoff prompt. Use this as the spawned agent's initial prompt when the host can start the reviewer in the repository root.

Preparation is deterministic: independent lens packets are assembled in
parallel, while ledger creation and event commits remain ordered. Full
synthesis accepts only `--ledger <path>` and admits the current reviewer
artifacts after ledger, revision, Markdown-hash, and lifecycle validation. Raw
Markdown inputs are not accepted by the full synthesis runner.

For package development, `node reviews/scripts/validate-all.mjs` runs unit,
package, fixture, and evaluator lanes concurrently and reports them in stable
order. Use the individual validators when diagnosing one lane.
`validate-review-fixtures.mjs` checks only the package's own fixtures; validate
a project's run with the individual validators and `--ledger`.

For detached orchestration, `reviews/scripts/assemble-orchestrator-prompt.mjs` emits `<pass-id>.orchestrator.md`. The packet includes target path/revision, review input path/revision, run mode, run scope, selected lenses, allowed files, required artifacts, stop conditions, and claim rules. It uses repository-relative paths only. `run-plan-review.mjs --execution-mode fresh_spawned_orchestrator` creates the normalized review input, ledger, event log, orchestrator packet, reviewer packets, and reviewer spawn handoffs in one setup pass.

For spawned-agent runs, prefer path-based assembly over pasted content when the agent has workspace access:

- `workspace`: host-provided working directory; do not embed absolute workspace paths in generated spawn prompts
- `target_plan`: path to the current plan/spec under review
- `pass_id`: current pass identifier
- `target_revision`: deterministic content hash of the target plan/spec, preferably from `git hash-object -- <target_plan>`
- `review_input`: repository-relative normalized review input JSON
- `review_input_revision`: SHA-256 of the normalized review input record
- `template_revision`: deterministic content hash of `reviews/reviewer-template.md`
- `lens_revision`: deterministic content hash of the selected lens file
- `template`: `reviews/reviewer-template.md`
- `lens`: one of the lens files listed above
- `previous_adjudications`: reruns only; short list of already-settled non-material findings
- `instructions`: read all of those files directly from disk, ignore inherited conversation context, and return only the structured review output

Generated spawn prompts should be outcome-first: role, goal, success criteria, context, and constraints. They should not duplicate the full review packet, include absolute local paths, or claim core-profile completion for selected-lens runs.

Reject or mark stale any current review, synthesis, or completion output whose reported target revision or review input revision does not match the ledger. Changing the feature request, relevant context, constraints, or previous adjudications invalidates current outputs even when the target plan itself is unchanged.
