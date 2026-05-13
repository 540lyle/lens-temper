---
name: plan-review-orchestrator
description: Use when selecting lenses, assembling prompts, tracking reviewer state, synthesizing outputs, deciding reruns, or archiving a LensTemper plan review.
---

# LensTemper Plan Review Orchestrator

Use `reviews/registry.json` from the plugin or repository root as the entry
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
3. Choose the run family:
   - `inline`: current-context advisory review, no lockable claims.
   - `full_hosted`: this agent orchestrates fresh lens reviewers.
   - `full_detached`: a fresh orchestrator owns ledger, reviewers, synthesis,
     reruns, archive, and completion claims.
4. For `full_detached`, make the parent agent a launcher/reporter. Generate
   the host-neutral packet with
   `reviews/scripts/assemble-orchestrator-prompt.mjs` or
   `reviews/scripts/run-plan-review.mjs --execution-mode fresh_spawned_orchestrator`,
   then hand that Markdown packet to the host's independent-agent mechanism.
5. Assemble reviewer prompts with `reviews/scripts/assemble-review-prompt.mjs`
   when possible.
6. Run reviewers as independent fresh agents when the host supports that.
   Codex, Claude, Cursor, plain CLI, or manual hosts may provide different
   spawning mechanics; LensTemper itself only requires repository-relative
   Markdown, JSON, and JSONL artifacts.
7. Validate review, synthesis, and ledger JSON with
   `reviews/scripts/validate-review-fixtures.mjs` or the individual validators.
8. Archive completed runs with `reviews/scripts/archive-review-run.mjs`.

The orchestrator may update ledger state. Lens reviewers may not.
Detached orchestration may not claim completion unless `events.jsonl`, ledger,
reviewer outputs, synthesis, and archive evidence agree.
