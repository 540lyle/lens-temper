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
- Feature request and constraints.
- Selected lenses, or enough context to select lenses.
- Pass id and deterministic target revision.

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

1. Select the smallest lens set that covers the plan risk.
2. Create or update a ledger with deterministic target, template, and lens
   revisions.
3. Use `full_hosted` or `full_detached` by default. A request to run
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
   when possible.
7. Run reviewers as independent fresh agents only when the host supports that
   and artifact validation can prove the run. Codex and Claude may provide
   different spawning mechanics; Cursor, plain CLI, and manual hosts remain
   advisory until their fresh-agent path is verified.
   Reviewer execution may be concurrent or sequential. Each selected lens
   still requires its own detached-context reviewer subagent.
8. Validate review, synthesis, and ledger JSON with
   `reviews/scripts/validate-review-fixtures.mjs` or the individual validators.
9. Archive completed runs with `reviews/scripts/archive-review-run.mjs`.

The orchestrator may update ledger state. Lens reviewers may not.
Detached orchestration may not claim completion unless `events.jsonl`, ledger,
reviewer outputs, synthesis, and archive evidence agree.
