# Subagent Spawn Prompt Design

Date: 2026-05-12
Status: approved design
Scope: LensTemper fresh lens-reviewer spawn prompt only

## Goal

Improve the host-to-subagent spawn prompt for LensTemper selected-lens review
runs. The prompt should be shorter, outcome-first, and aligned with GPT-5.5
prompting guidance while preserving LensTemper's deterministic review contract.

This slice does not change the generated review packet, reviewer template,
ledger schema, validators, or archive helpers.

## Current Problem

The current spawn prompt works, but it behaves like a second reviewer prompt. It
front-loads absolute paths, metadata, and ordered instructions before stating the
review outcome. That makes the prompt noisier than necessary and duplicates
responsibility already carried by:

- `reviews/reviewer-template.md`
- `reviews/lenses/<lens>.md`
- `reviews/manifests/lenses/<lens>.json`
- the assembled `input.packet.md`
- the parent ledger and archive state

The spawn prompt should instead be a compact handoff contract.

## Design Principles

- Use repo-relative paths only.
- Treat the current repository checkout as the source of truth.
- Keep the prompt outcome-first: role, goal, success criteria, context,
  constraints.
- Preserve deterministic target, template, and lens revision checks.
- Keep review content in the assembled packet and repo workflow files.
- Do not instruct the reviewer to read files in a rigid sequence unless ordering
  materially matters.
- Keep reviewer authority read-only.
- Keep selected-lens runs honest: no six-lens completion claim.

## Proposed Spawn Prompt Shape

```text
Role: You are a fresh LensTemper lens reviewer for one selected lens.

# Goal
Review `<target-path>` through the `<lens-id>` lens and return a valid
LensTemper reviewer-template response.

# Success Criteria
- Treat the current repository checkout as the source of truth.
- Read the prompt packet at `<prompt-packet-path>`.
- Verify the target, template, and lens revisions before reviewing.
- Review exactly one lens: `<lens-id>`.
- Return exactly the sections required by `reviews/reviewer-template.md`.
- Complete the cross-cutting sweep and stateful workflow sweep.
- Include score-challenge evidence for every `5/5`.
- Report missing files or revision mismatches as input problems.

# Context
Pass ID: `<pass-id>`
Run mode: `full`
Run scope: `selected_lenses`
Execution mode: `fresh_spawned_lens_reviewers`

Paths:
- target: `<target-path>`
- template: `reviews/reviewer-template.md`
- lens manifest: `<lens-manifest-path>`
- lens prompt: `<lens-prompt-path>`
- prompt packet: `<prompt-packet-path>`

Revisions:
- target: `git:<target-hash>`
- template: `git:<template-hash>`
- lens: `git:<lens-hash>`

# Constraints
Read-only. Do not edit files, update ledgers, inspect sibling review outputs, or
synthesize multi-review feedback.
Ignore inherited conversation context.
```

## Data Flow

1. Parent orchestrator selects the target and lens.
2. Parent creates or updates the ledger.
3. Parent assembles `input.packet.md` with deterministic target, template, and
   lens revisions.
4. Parent spawns a fresh reviewer with `fork_context: false` or host equivalent.
5. Spawn prompt gives the reviewer only the outcome, repo-relative inputs,
   revision checks, and authority constraints.
6. Reviewer reads the packet and any repo workflow files needed to satisfy the
   success criteria.
7. Reviewer returns only the `reviews/reviewer-template.md` section structure.
8. Parent captures output, closes reviewer, and updates ledger/archive state.

## Host Assumption

The spawn prompt intentionally does not include an absolute workspace path. The
host must start the subagent in the repository root or otherwise provide the
working directory outside the prompt.

If the host cannot guarantee repository-root execution, that is a host
orchestration issue, not a reviewer prompt concern.

## Error Handling

The reviewer should report an input problem instead of guessing when:

- the prompt packet is missing or unreadable
- the target path is missing
- the template path is missing
- the lens manifest or lens prompt is missing
- target, template, or lens hashes do not match the prompt metadata
- the requested lens id does not match the lens manifest or packet

The reviewer should not repair files, update the ledger, synthesize other lens
outputs, or rerun the review under a different lens.

## Validation

A manual validation pass should confirm:

- the prompt contains no absolute local paths
- all paths are repo-relative
- the prompt names exactly one lens
- the prompt includes target, template, and lens revisions
- the prompt preserves read-only reviewer constraints
- the prompt asks for exactly the reviewer-template output structure
- the prompt does not duplicate the full packet content
- the prompt does not claim six-lens completion

Future automated validation could add a fixture assertion over generated spawn
prompts, but that is out of scope for this first prompt-design slice.

## Non-Goals

- Do not change `reviews/reviewer-template.md`.
- Do not change lens prompts.
- Do not change packet assembly behavior.
- Do not add a `handoff.json` or `spawn.packet.md` artifact yet.
- Do not add tracing or telemetry.
- Do not change ledger schemas or validators.

## Follow-Up Ideas

- Generate a repo-relative `handoff.json` sidecar once the prompt shape proves
  useful.
- Add prompt-size and elapsed-time measurements to compare old and new spawn
  prompts.
- Add a validator fixture that rejects absolute paths in spawn prompts.
- Add a parent-side capture helper for `agent_id`, `output_captured`, `closed`,
  verdict, scorecard, and material-blocker status.
