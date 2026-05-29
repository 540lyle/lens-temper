# Plan Review System

> Version 1.6

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
2. Assemble the required inputs.
3. Run a full LensTemper review by default: spawn one fresh reviewer per
   selected lens with no inherited thread context (`fork_context: false` or
   platform equivalent).
4. Collect the structured output from each spawned reviewer.
5. Run `synthesize-review-feedback.md` across all review outputs to produce a consolidated assessment.
6. Lock lenses only from validated `full` run artifacts. Inline and advisory outputs may guide planning, but their scores are not lockable.

Store completed review outputs outside this folder unless they are still being actively assembled.
`reviews/` is for reusable tooling and review-input packets; durable finished outputs or synthesis
should live in `reviews/archive/` or next to the owning plan/doc when that folder explicitly owns review history.
Default durable review run path: `reviews/archive/<yyyy-mm-dd>-<target-slug>-<pass-id>/`.
That directory should contain `ledger.json`, `events.jsonl`, generated prompt packets, `synthesis.md`, and `final.md`
when those artifacts are produced. Use an owning plan/doc folder instead when that folder already keeps
review history next to the plan.

## Run Families And Claim Discipline

LensTemper supports three host-neutral run families:

- Default assumption: a request to "run LensTemper", "review with
  LensTemper", or "run a full LensTemper review" means `full_hosted` or
  `full_detached`. Do not perform an inline/advisory substitute unless the user
  explicitly asks for inline or advisory review. If fresh subagents cannot be
  spawned, stop and report that the full review could not be completed.
- `inline`: current-context advisory review. It maps to `run_mode: inline` and `execution_mode: manual_or_imported`. Required wording: `Inline LensTemper-style review`, `Not independently reviewed`, `No spawned reviewers used`, and `Scores are advisory, not lockable`.
- `full_hosted`: the current agent owns orchestration and starts fresh lens reviewers through whatever host spawning mechanism exists. It maps to `run_mode: full` and `execution_mode: fresh_spawned_lens_reviewers`.
- `full_detached`: a fresh orchestrator owns ledger, reviewer prompts, reviewer lifecycle evidence, synthesis, reruns, archive, and completion claims. It maps to `run_mode: full` and `execution_mode: fresh_spawned_orchestrator`.

`run_mode: advisory` remains available for quick imported critique. It uses `execution_mode: manual_or_imported`; required wording is `Advisory LensTemper critique`, `Not a completed LensTemper pass`, `No lock states available`, and `Scores, if present, are advisory only`.

`run_mode` is separate from `execution_mode`. `full` supports `fresh_spawned_lens_reviewers` and `fresh_spawned_orchestrator`; `inline` and `advisory` require `manual_or_imported`.

Use `run_scope: six_lens` only when all six manifest-backed lenses are current. Only `full` plus `six_lens` may say unqualified `LensTemper pass complete`. A selected-lens full run must say `Full LensTemper review for selected lenses only`.

Completion and lockable claims are blocked unless the ledger and artifacts prove the run. Detached completion also requires agreement among `events.jsonl`, ledger, reviewer outputs, synthesis, and archive evidence. The completion validator checks structured `claim_flags` and generated text for completion, lock-state, all-5, and review-complete wording.

## Fresh-Agent Review Runs

When running `full_hosted` lens reviews through spawned agents, use one fresh agent per lens and make the workspace the source of truth.
Do not rely on inherited conversation context, stale pasted excerpts, or another lens agent's conclusions.
Host mechanisms for fresh reviewers:

- Codex: `spawn_agent` with `fork_context: false`, one agent per selected lens.
- Claude Code: invoke the `Agent` (Task) tool once per selected lens. Each
  Agent invocation is already a fresh subagent with isolated context, so no
  fork flag is needed.
- Claude Desktop / Claude.ai: use only if the host can launch fresh, isolated
  reviewer agents and can provide the `reviews/` workflow resources. Otherwise
  treat the run as inline/advisory.
- Cursor and other skill-aware hosts: use the host's independent-agent
  mechanism that does not inherit the parent thread.

If that host mechanism is unavailable, do not continue as inline/advisory
unless the user explicitly requested that lower-rigor mode.

For `full_detached`, the parent agent acts only as launcher/reporter when the host can start a fresh orchestrator. Generate the platform-neutral orchestrator packet with `reviews/scripts/assemble-orchestrator-prompt.mjs` or `reviews/scripts/run-plan-review.mjs --execution-mode fresh_spawned_orchestrator`, then give that packet to the fresh orchestrator. Host mechanics vary across Codex, Claude, Cursor, and manual CLI environments; LensTemper artifacts stay Markdown/JSONL/JSON and repository-relative.

Required orchestration:

1. Create an agent-run ledger before spawning reviewers. Track lens name, lens file, pass id, target path, deterministic target revision/hash, agent id, status, final output captured, and closed status.
2. Spawn each lens reviewer with no inherited thread context (`fork_context: false` or platform equivalent).
3. Start each reviewer in the current repository root, then give it the target plan/spec path, deterministic target revision/hash, pass id, `reviews/reviewer-template.md`, and the exact lens file path as repository-relative paths.
4. Instruct each reviewer to read the current files directly from the workspace before reviewing.
5. Keep reviewer prompts narrow: include the task, file paths, provenance values, and output expectations; do not include prior debate, user conversation, or other agents' findings unless the task is explicitly synthesis. For reruns, a short list of previously adjudicated non-material findings is allowed so fresh reviewers do not reopen already-settled nits. Generated spawn prompts should use repository-relative paths only; the host should set the reviewer working directory instead of embedding absolute workspace paths in the prompt.
6. Wait for each reviewer to produce its final review output, then copy that output into the parent thread or review artifact.
7. Close each completed reviewer immediately after its output is captured. Do not leave completed agents running.
8. If a reviewer times out, errors, or is superseded by a rerun, close it before spawning a replacement unless its output is still required.
9. Before reporting review completion, verify every spawned reviewer in the ledger has a terminal status and has been closed.

Ledger fields:

| Field | Required | Purpose |
|-------|----------|---------|
| `pass_id` | yes | Groups reviewers spawned for the same review pass. |
| `target_path` | yes | Plan/spec path under review. |
| `target_revision` | yes | Deterministic content identifier for the target plan/spec. Prefer `git hash-object -- <target_path>`; use a SHA-256 file hash only when `git hash-object` is unavailable. Do not use timestamps or vague notes for rerunnable reviews. |
| `run_mode` | yes | Claim authority: `full`, `inline`, or `advisory`. |
| `run_scope` | yes | `six_lens` or `selected_lenses`. |
| `execution_mode` | yes | `manual_or_imported`, `fresh_spawned_lens_reviewers`, or `fresh_spawned_orchestrator`. |
| `events_path` | yes for detached | Repository-relative path to the run's `events.jsonl` trace. |
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
| `lock_state` | yes | One of `active`, `failing`, `passing_locked`, `rerun_required`, `converged_locked`. Keep this separate from `status`; `status` describes reviewer lifecycle outcome, while `lock_state` describes whether the lens still needs review. |
| `rerun_reason` | required for reruns | Why this lens is being rerun, tied to a material issue or domain-relevant plan/spec change. |
| `finding_decisions` | recommended after synthesis | Per-finding synthesis decisions: `accepted`, `rejected`, `downgraded`, or `deferred`, with a short reason when the decision affects rerun scope. |
| `previous_adjudications` | optional for reruns | Short list of previously rejected, downgraded, or non-material findings that fresh rerun reviewers may ignore unless the updated target reintroduces material evidence. |
| `artifact_path` | optional | Path where the review output or synthesis is stored, if any. |
| `closed` | yes for spawned agents | Whether the reviewer was closed after output capture. Keep this separate from `status`; `status` describes reviewer lifecycle outcome, while `closed` records cleanup. |

Synthesis owner:

- The parent orchestrator owns the ledger, final synthesis, materiality decisions, lens locking, rerun selection, and final completion decision.
- In `full_detached`, the fresh orchestrator owns those duties; the parent launcher reports only what the detached artifacts prove.
- Lens reviewers stay independent. They review only their assigned lens and do not coordinate convergence with other reviewers.
- The synthesis owner may reject or downgrade reviewer feedback that is unsupported, preference-only, duplicated, already addressed, or outside the lens domain. Record per-finding decisions in the synthesis or ledger when they affect rerun scope.

Review-output provenance:

- Review records store input evidence in `provenance.input_sources[]`.
- Each input source has `role`, `basis`, `paths_reviewed`, and `target_included`.
- Valid basis values are `direct_workspace_read`, `provided_packet`, `imported_archive`, and `fixture`.
- Mixed provenance is allowed. For example, an inline target can use `provided_packet` while supporting workflow files use `direct_workspace_read`.
- Direct workspace paths must be repository-relative, normalized, traversal-free, and existing at validation time.
- `fixture` basis is valid only on records with `fixture_kind`.
- Reviewer lifecycle remains top-level: `agent_id`, `closed`, and `output_captured` are not provenance fields.

Score discipline:

- A `5/5` score requires `score_challenges.<dimension>` with `would_make_this_a_4`, `why_not_present`, and `evidence_no_material_issue`.
- The challenge evidence is machine-readable in JSON. Markdown reviews should include concise score notes when the score supports a lock or completion claim.
- If prior accepted material findings are relevant, record them in `prior_material_findings_context`; do not infer them by broad archive scanning.
- Synthesis may treat reviewer outputs as lockable only when they are validated, current for the target revision, captured into artifacts, and closed. Unvalidated outputs remain advisory/imported and must be labeled that way.

Rerun protocol:

- A lens auto-locks only in `full` mode when all six scorecard dimensions are `5/5`, no material blockers remain, and every `5/5` score includes score-challenge evidence.
- A lens may also be marked `converged_locked` only in `full` mode when all six scorecard dimensions are `4/5` or better, no accepted material blocker remains, and the synthesis owner records that lower scores are caused only by non-material, rejected, downgraded, deferred, duplicate, or already-addressed feedback.
- Locked lenses are not rerun unless the target plan/spec changes in that lens's domain or the user explicitly asks to reopen that lens.
- After changing the plan/spec, spawn new fresh agents only for active, failing, or domain-affected lenses. Do not reuse prior reviewer agents for reruns.
- Before each rerun, add a rerun decision note for every selected lens: `rerun`, `passing_locked`, `converged_locked`, `not_affected`, `superseded`, or `error`, with a short reason.
- After three passes, the synthesis owner should stop rerunning a lens unless a fresh review identifies an accepted material issue. After five passes, continue only with explicit user approval or clearly new material evidence.
- A full clean rerun is exceptional. Use it only for broad plan rewrites, suspected reviewer contamination, corrupted/stale inputs, or explicit user request.
- Treat rerun outputs as current only if the reviewer read the updated workspace files directly and reported the current `target_revision`.
- If one lens finds a defect and the plan/spec changes, close completed reviewers from the prior pass before starting the next pass. Preserve locked lens outputs as current unless the change affects that lens's domain.
- If the same lens returns repeated non-material or preference-only findings after material fixes, record them as optional polish and stop rerunning that lens.
- The review is complete when every selected lens is either `passing_locked`, `converged_locked`, or has only accepted non-blocking issues, all material blockers are resolved or explicitly deferred by the synthesis owner, and all spawned agents are closed.
  Unqualified completion also requires `run_mode: full`, `run_scope: six_lens`, successful `completion_validation`, and no missing current reviewer evidence.

## Available Lenses

The standard process intentionally uses six lenses so all default reviewers can run in one parallel subagent pass in environments that cap a thread at six subagents. Do not add more default lenses unless you are replacing an existing lens or explicitly accepting a second review wave.

| Lens | File | Focus |
|------|------|-------|
| Architecture | `lenses/lens-architecture.md` | Boundaries, coupling, abstraction, ownership |
| Implementation | `lenses/lens-implementation.md` | Sequencing, feasibility, execution clarity |
| Risk | `lenses/lens-risk.md` | Failure modes, rollback, observability |
| Test Strategy | `lenses/lens-test-strategy.md` | Coverage, edge cases, verification |
| Product & UX | `lenses/lens-product-ux.md` | User-visible behavior, states, accessibility |
| Data Model | `lenses/lens-data-model.md` | Schema, migration, storage, contracts |

## Cross-Cutting Sweep

Every lens review must include a short cross-cutting sweep. The goal is to catch serious spec-review concerns without adding more default lenses or slowing the six-agent pass.

Primary and secondary owner lenses should evaluate their categories substantively. Non-owner lenses may write `Not applicable from this lens` unless they see clear material evidence. For each category, the reviewer must either report a material issue, report non-blocking polish, or write `Not applicable from this lens`.

| Category | Primary lens owner | Secondary lens owners |
|----------|--------------------|-----------------------|
| Security / privacy | Risk | Architecture, Data Model, Implementation |
| Accessibility | Product & UX | Test Strategy, Implementation |
| Performance | Architecture | Implementation, Test Strategy, Product & UX |
| Reliability / rollback | Risk | Test Strategy, Implementation |
| Observability / debuggability | Risk | Implementation, Test Strategy |
| Compatibility / platform constraints | Implementation | Architecture, Product & UX, Test Strategy |

Cross-cutting findings follow the same materiality rules as other findings. A category can block implementation only when the issue is material for the feature and review lens.

## Default Lens Selection

Use the smallest lens set that covers the risk, but do not skip the user-facing review path for workflow features.

- User-facing workflow plans should include at least Product & UX and Test Strategy.
- Persistence, saved-record, library, history, or schema plans should also include Data Model.
- Shared domain engines, services, or cross-module contract plans should also include Architecture and Implementation.
- Risky rollout, migration, or irreversible user-data changes should also include Risk.

## Standard Inputs

Every review receives these inputs. The template uses `{{double_curly}}` variable syntax to mark injection points.

| Variable | Description | Guidance |
|----------|-------------|----------|
| `{{feature_request}}` | What is being built and why | 1 to 3 paragraphs. Include user-facing goal and success criteria. |
| `{{pass_id}}` | Identifier for this review pass | Required for spawned-agent runs. Use the same value in every reviewer prompt for one pass. |
| `{{target_path}}` | Plan/spec file path under review | Required for spawned-agent runs. Use a repository-relative path; the host provides the workspace root separately. |
| `{{target_revision}}` | Deterministic content hash for the target plan/spec | Required for spawned-agent runs and reruns. Prefer `git hash-object -- <target_path>`. |
| `{{template_revision}}` | Deterministic content hash for `reviewer-template.md` | Recommended for stale-output detection. |
| `{{lens_revision}}` | Deterministic content hash for the lens file | Recommended for stale-output detection. |
| `{{proposed_plan}}` | The implementation plan under review | Full plan text. Ordered steps preferred. |
| `{{relevant_context}}` | Supporting material from the repo or specs | Keep it focused. Include only material needed to evaluate the plan. Prefer excerpts over full files. |
| `{{constraints}}` | Hard constraints, deadlines, or non-negotiables | List form. Include tech stack, timeline, backward-compatibility requirements, and non-goals where relevant. |
| `{{review_lens}}` | The lens file contents | Paste the full lens file. |
| `{{previous_adjudications}}` | Previously rejected, downgraded, or non-material findings | Optional. Use only for reruns and keep it short. Do not include raw prior review debate. |

The synthesis template (`synthesize-review-feedback.md`) uses one additional variable:

| Variable | Description | Guidance |
|----------|-------------|----------|
| `{{review_outputs}}` | Collected outputs from one or more reviews | Paste complete review outputs. Use the structure shown in `example-review-output.md`. |

## General Rules

- Critique the plan rather than replacing it unless replacement is necessary.
- Prefer concrete corrections over vague commentary.
- Call out missing steps, unsupported assumptions, sequencing problems, and meaningful risks.
- Review whether the plan is specific enough for a competent implementation
  agent to execute without inventing behavior. Missing ownership, current-vs-
  remaining scope, state reset rules, fallback precedence, visible copy or
  labels, validation pass/fail criteria, rollout gates, and command/API
  contracts are material when they can cause divergent implementation.
- Separate material blockers from non-blocking polish. A material blocker is something that would reasonably block implementation because it affects correctness, review convergence, reviewer independence, reproducibility, validation, maintainability, or ship safety.
- Preference-only polish, wording improvements, or optional refactors must not prevent a `Strong` verdict or `5/5` score when no material issue remains.
- Reruns are for material blockers, score-lowering gaps, or domain-relevant plan/spec changes. Do not spawn reruns only to chase nits.
- Reviewers must complete the cross-cutting sweep. Do not silently skip security/privacy, accessibility, performance, reliability/rollback, observability/debuggability, or compatibility/platform concerns.
- Do not invent repository details that are not present in the provided input.
- Optimize for safe, shippable implementation over theoretical elegance.

Final evidence before completion:

- Latest output, verdict, scorecard, and material-blocker status for each selected lens.
- Cross-cutting sweep status for each selected lens, including any `Not applicable from this lens` entries.
- Lock/rerun status for each selected lens, including why any locked lens was not rerun after plan/spec edits.
- Confirmation that each current reviewer read the current workspace files directly.
- Confirmation that every spawned reviewer has terminal status and is closed.
- Run mode, run scope, completion-validation result, and whether scores are lockable or advisory.
- A concise synthesis listing material fixes applied, accepted non-blocking issues, rejected or downgraded findings that affected rerun scope, and any explicitly deferred risks.

User-facing completion summary:

When reporting a completed review run to the user, the orchestrator must include a compact final summary. Do not require the user to open the archive to learn the outcome.

Required fields:

- Final assessment from synthesis.
- Target path and deterministic target revision reviewed.
- Review artifact path, plus whether the artifact is committed, ignored/local-only, or stored elsewhere.
- Per-lens score table with lens, verdict, all six score values, material-blocker status, and lock/rerun status.
- Accepted material findings and the plan changes or follow-up actions they require.
- Rejected, downgraded, deferred, or non-blocking findings that affect rerun scope.
- Verification evidence: reviewer outputs captured, reviewers terminal and closed, current reviewers read current workspace files directly, and any validator or stale-output checks that were run.

Use this table shape unless the host interface requires a shorter form:

| Lens | Verdict | Correctness | Completeness | Risk Awareness | Testability | Maintainability | Ship Readiness | Material Blockers | Status |
|------|---------|-------------|--------------|----------------|-------------|-----------------|----------------|-------------------|--------|
| Implementation | Usable with fixes | 4/5 | 3/5 | 4/5 | 4/5 | 4/5 | 3/5 | yes | rerun_required |

## Recommended Prompt Assembly

Assemble a single prompt containing:
1. The contents of `reviewer-template.md`
2. One lens file injected into the `{{review_lens}}` slot
3. The feature request, proposed plan, relevant context, and constraints in their respective slots

Then request output in exactly the structure specified in the template.

`reviews/scripts/run-plan-review.mjs` creates two reviewer-facing files per selected lens:

- `<lens>.prompt.md`: the assembled reviewer packet with the target plan, template, lens, constraints, and deterministic revisions.
- `<lens>.spawn.md`: the compact host-to-subagent handoff prompt. Use this as the spawned agent's initial prompt when the host can start the reviewer in the repository root.

For detached orchestration, `reviews/scripts/assemble-orchestrator-prompt.mjs` emits `<pass-id>.orchestrator.md`. The packet includes target path/revision, run mode, run scope, selected lenses, allowed files, required artifacts, stop conditions, and claim rules. It uses repository-relative paths only. `run-plan-review.mjs --execution-mode fresh_spawned_orchestrator` creates the ledger, event log, orchestrator packet, reviewer packets, and reviewer spawn handoffs in one setup pass.

For spawned-agent runs, prefer path-based assembly over pasted content when the agent has workspace access:

- `workspace`: host-provided working directory; do not embed absolute workspace paths in generated spawn prompts
- `target_plan`: path to the current plan/spec under review
- `pass_id`: current pass identifier
- `target_revision`: deterministic content hash of the target plan/spec, preferably from `git hash-object -- <target_plan>`
- `template_revision`: deterministic content hash of `reviews/reviewer-template.md`
- `lens_revision`: deterministic content hash of the selected lens file
- `template`: `reviews/reviewer-template.md`
- `lens`: one of the lens files listed above
- `previous_adjudications`: reruns only; short list of already-settled non-material findings
- `instructions`: read all of those files directly from disk, ignore inherited conversation context, and return only the structured review output

Generated spawn prompts should be outcome-first: role, goal, success criteria, context, and constraints. They should not duplicate the full review packet, include absolute local paths, or claim six-lens completion for selected-lens runs.

Reject or mark stale any review output whose reported target revision does not match the current target revision, unless the synthesis explicitly includes it as superseded historical context.
