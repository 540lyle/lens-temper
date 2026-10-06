---
name: start-plan-review
description: Use first when a user asks LensTemper to review a plan, spec, proposal, or implementation approach, including full reviews, selected-lens reviews, reruns, or archived review runs.
---

# LensTemper Start Plan Review

Use `reviews/registry.json` from the skill package or repository root as the entry
point. Read `reviews/README.md`, `reviews/AGENT.md`, selected lens manifests,
and selected role manifests before running a review.

## Inputs

- Target plan or spec path.
- Repository-relative review input JSON containing the feature request,
  relevant context, constraints, optional previous adjudications, and an
  optional intent card (goals, non-goals, `must_not_grow`, decided trade-offs).
- Selected lenses, or enough context to select lenses.
- Pass id, deterministic target revision, and normalized review input revision.

## Outputs

- Ledger JSON.
- Trace event log (`events.jsonl`) when orchestration artifacts are generated.
- Per-lens prompt packets or reviewer instructions.
- Detached orchestrator packet when the host supports an independent
  orchestrator agent.
- Captured review outputs.
- Synthesis output.
- Rerun decisions and completion summary.

## Procedure

1. Resolve lens scope before creating the ledger or spawning reviewers:
   - If the user explicitly names lenses, validate each id against
     `reviews/registry.json` and use exactly that set. Do not add or remove
     lenses; stop on unknown or duplicate ids.
   - Otherwise, run the canonical selector against the normalized review input
     and current target; it selects the lenses of every matched domain. Use
     the full core profile (`--core-profile standard-v2`) only when the user
     asks for it or the work is irreversible: migrations, authorization,
     money, or tool authority.
   - The orchestrator may add registry-valid lenses through a validated
     `--lens-proposal`. Each addition needs a concise reason and concrete
     evidence from the canonical review input or target. Additions are unioned
     with the deterministic minimum and may never remove or replace it.
   - When no domain matches, the selector stops for clarification; ask the
     user to name lenses or opt into the core profile.
2. Create or update a ledger with deterministic target, template, and lens
   revisions plus the repository-relative review input path and normalized
   review input revision. Stop if the feature request is missing.
3. Use `full_hosted` by default, or `full_detached` when the user opts into an
   independent orchestrator. A request to run
   LensTemper, review with LensTemper, or run a full LensTemper review means
   detached-context reviewer subagents, one per selected lens. A
   detached-context reviewer subagent is fresh and receives none of the host,
   parent, or orchestrator conversation or history; it reads only the run
   packet and permitted workspace files.
   Host equivalents:
   - Codex: use the current detached-context subagent mechanism once per
     selected lens. See `docs/hosts/codex.md` for current mechanics.
   - Claude Code: each `Agent` (Task) invocation is already a fresh subagent
     with isolated context, so spawn one Agent call per selected lens -- no flag
     required.
   - Claude Desktop / Claude.ai: use only if the host can launch
     detached-context reviewer subagents and can provide the shared `reviews/`
     workflow resources. Otherwise stop full-review requests; inline/advisory
     mode is only valid when the user explicitly asks for a non-lockable
     advisory pass.
   - Cursor, plain CLI, and other manual hosts: use LensTemper materials as
     advisory unless a fresh independent-agent mechanism and artifact validation
     have been verified for that host.
   Do not perform an inline/advisory substitute unless the user explicitly asks
   for inline or advisory mode. If fresh subagents cannot be spawned, stop and
   report that the full review could not be completed.
4. Choose the run family:
   - `inline`: explicitly requested current-context advisory review, no lockable claims.
   - `full_hosted`: this agent orchestrates fresh lens reviewers.
   - `full_detached`: a fresh orchestrator owns ledger, reviewers, synthesis,
     reruns, archive, and completion claims.
5. For `full_detached`, make the parent agent a launcher/reporter. Generate
   the host-neutral packet with
   `reviews/scripts/assemble-orchestrator-prompt.mjs` or
   `reviews/scripts/run-plan-review.mjs --execution-mode fresh_spawned_orchestrator`,
   then hand that Markdown packet to the host's independent-agent mechanism.
6. Assemble reviewer prompts with `reviews/scripts/assemble-review-prompt.mjs`
   when possible. That script alone is the single-lens path with no ledger:
   one packet, one fresh reviewer, its findings delivered as written, and
   `decide-reruns.mjs --lens <id> --applied <finding>` after an edit. Use
   `run-plan-review.mjs --lens <id>` when the single-lens run needs a ledger.
7. Run reviewers as independent fresh agents only when the host supports that
   and artifact validation can prove the run. Codex and Claude may provide
   different spawning mechanics; Cursor, plain CLI, and manual hosts remain
   advisory until their fresh-agent path is verified.
   Reviewer execution may be concurrent or sequential. Each selected lens
   still requires its own detached-context reviewer subagent.
8. Attach each captured review with
   `reviews/scripts/update-ledger.mjs --ledger <run>/ledger.json --review <review.json> --write`,
   then validate it with
   `reviews/scripts/validate-review-output.mjs <review.json> --ledger <run>/ledger.json`.
   The validators accept only records the ledger already lists, so attach
   first. For full runs, bind validation to the run with `--ledger`; do not
   validate against free-standing revision strings.
   (`validate-review-fixtures.mjs` checks only the package's own fixtures.)
9. Assemble synthesis with
   `reviews/scripts/run-synthesis.mjs --ledger <run>/ledger.json`, attach the
   synthesis record with `update-ledger.mjs --synthesis <synthesis.json> --write`,
   and validate it with `validate-synthesis-output.mjs <synthesis.json> --ledger <run>/ledger.json`.
10. Finalize derived readiness state with
    `reviews/scripts/update-ledger.mjs --ledger <run>/ledger.json --finalize --write`.
    Do not author `completed_lens_ids`, `completion_validation`, ledger
    completion status, or `core_gate_passed` directly.
11. Write the summary with
    `reviews/scripts/emit-completion-summary.mjs --ledger <run>/ledger.json --synthesis <synthesis.json> --out <run>/final.md`,
    then archive with
    `reviews/scripts/archive-review-run.mjs --ledger <run>/ledger.json --final <run>/final.md`.
    The run directory is the pass's archive, so the pass keeps one ledger,
    `<run>/ledger.json`.

Report the result as `Review delivered: N blocking gaps, K minor issues, M questions`, listing
every question ranked by consequence and every minor issue. The review never
edits the target spec; applying fixes is the user's call, and rerunning a lens
after the user edits the spec is a supported user-driven action.

Runs are `interactive` by default: apply nothing and deliver every blocking
gap, question, and minor issue together. Only when the user opts into
`--apply-mode auto` may the host apply accepted blocking findings that cite a
stated goal, as `decided_by: policy`, followed by the one automatic rerun pass
of reopened lenses (`run-plan-review.mjs --parent-ledger`). Questions are never
applied. A third pass needs the user's approval, recorded with
`--human-approval`.

Log every edit to the target in the pass's ledger with
`update-ledger.mjs --ledger <run>/ledger.json --applied <finding-id> --summary "<what changed>" --write`
(`--host-initiated` for an edit no finding asked for; `--decided-by policy`
only where auto mode allows it).

For a plan in another project, run the package scripts with `--root <project>`
(default: the current directory); targets, run artifacts, and archives resolve
there.

The orchestrator may update ledger state. Lens reviewers may not.
Attaching a review or synthesis with `update-ledger.mjs` stamps the run's
provenance into the record; reviewers do not echo it. Detached orchestration
may not claim completion unless ledger, reviewer outputs, synthesis, and
archive evidence agree; `validate-ledger.mjs --audit` also checks
`events.jsonl` when the run's lifecycle must be shown.
A focused (selected-lens) run's claim is `Review delivered: ...`; unqualified
completion additionally requires `run_scope: core_profile`, a
registry-valid `core_profile_id`, every entry in `required_lens_ids` in
`completed_lens_ids`, and `core_gate_passed: true`.
