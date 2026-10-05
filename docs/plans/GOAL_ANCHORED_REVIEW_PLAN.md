# Goal-Anchored Review Plan: LensTemper

Status: Proposed. Phase 0 complete; Phase 1 next.

## Intent

**Goal.** LensTemper finds real gaps in a plan without changing what the plan is
for, and a user can trust the result whether they run one lens or the full set.

**Success signals.**

- A sound plan comes out of review with its stated goal intact and no accepted
  findings that add scope the goal did not ask for.
- Seeded omissions (missing backfill, missing authorization boundary, unsafe
  model-to-write path, and similar) are still found.
- Decisions that belong to the plan's author reach the author as questions
  instead of being resolved by editing the spec.

**Non-goals.**

- No new lenses and no new orchestration features.
- No change to the detached, fresh-context reviewer model. Independence from the
  host and orchestrator stays the core design.
- No smarter iterate-until-pass loop. The loop is bounded, not tuned.
- No deletion of existing machinery in early phases. Defaults change first;
  removal happens only when evidence shows nothing depends on it.

**Heuristic, not a gate.** When a change adds a probe or rule to a prompt, check
whether an older one can be retired. Every past miss added a question and none
removed one.

## Problem

Across several review rounds, a host agent applied every accepted finding to the
spec and reran lenses until the run "passed". Each finding was correct in its
own lens and wrong for the plan's goal. The spec accreted scope and detail until
it no longer matched what its author wanted. Findings from a structural review of
this repository, refined by Phase 0 evidence:

1. **The materiality bar rewards exhaustiveness.** "Flag every place the
   implementation agent would have to invent behavior", including copy and
   labels, is the strongest and most repeated reviewer instruction
   (`reviews/reviewer-template.md`, `reviews/README.md`,
   `reviews/scripts/assemble-spawn-prompt.mjs`). Each fix adds surface, which
   creates new open choices, so an iterate-to-pass loop has no stable stop short
   of a spec as detailed as the code.
2. **The goal is not an active anchor.** `feature_request` is a single required
   string, non-goals are optional prose, nothing records the round-0 intent, and
   no reviewer step or synthesis rule judges a finding against the goal.
3. **Synthesis merges and adds.** Rule 7 lets reviewer feedback alone support a
   new requirement. There is no rejection reason for "conflicts with the goal"
   or "adds unrequested scope", and no output slot for removals.
4. **Open questions become edits.** Reviewers write Open Questions and synthesis
   has an Unresolved Questions section, but questions are paired with "define X"
   directives and reviewers recommend answers to decisions the plan marks as
   pending. The host's only actionable signal is "fix it", which usually means
   "add it".
5. **Rerun mechanics cascade.** Locks are bound to a whole-file hash, so any edit
   stales every lens. `decide-reruns.mjs` trusts a caller-supplied lens list
   that overrides lock state. Pass caps exist only in prose.
6. **"Pass complete" means every lens ran,** not that the spec is ready. No role
   or gate owns the step where findings become spec edits.
7. **Evals check the fixtures, not a model.** `run-review-evals.mjs` greps the
   fixture files; recall and precision are `not_measured`, and seven fixtures
   contain their own expected answer.
8. **Scripts resolve paths against the package root,** so a spec in a separate
   project cannot be hashed or archived.
9. **The Natty trigger fires on non-LLM specs.** The bare word "model" plus
   "state", "json" or "write" selects Natty for mechanical models such as torque
   curves.

## Usage Model To Support

- **Composable single-lens runs are a primary use.** Product & UX run alone is
  the most common case. Everything below must work for one lens with no ledger.
- **Full runs finish, then ask.** The user may be away. A run completes and then
  presents blocking gaps and questions together.
- **Two modes.**
  - *Interactive (default):* nothing is applied; the user gets one list.
  - *Auto (opt-in):* blocking fixes that cite a stated goal are applied before
    the user returns. Questions are never converted into edits.
- **Targeted reruns stay.** After the host or user edits the spec, rerunning the
  lens whose findings were applied is a legitimate workflow.

## Phases

Each phase ships as its own PR. After every edit under `reviews/`, `skills/` or
the plugin manifests, run `node reviews/scripts/sync-codex-plugin-payload.mjs`
so `plugins/lens-temper/` stays in sync, then `node reviews/scripts/validate-all.mjs`
and the package tests.

### Phase 0: Evidence, not scores

Evals are smoke detectors. The same build on the same spec varies run to run,
so results are reported as rates over repeated runs and read by a human, never
as a deterministic pass or fail.

- Drift analysis on archived real reviews from a consumer project: for each
  accepted finding, did it serve the plan's stated goal, add scope, or settle a
  decision that belonged to the author? In multi-round runs, did later rounds
  review text earlier rounds added? (Consumer-project content stays out of this
  repository.)
- Baseline capture: run current lenses repeatedly on an unreviewed real plan
  with an explicit goal and pending owner decisions, and classify the findings.
- Fixture hygiene: remove the "Expected review finding" lines that leak answers,
  and rename the keyword lane to `fixture-lint` so it is not mistaken for a
  model eval.
**Result (2026-10).** Across 95 classified findings from two archived real runs
and a fresh baseline: about 23% served the plan's goal, 37% were implementer
discretion, 28% settled or should have asked about author decisions, and 12%
added scope. About 77% of blocking findings in the baseline did not meet the
"goal fails without this" bar. Half of later-round findings targeted text an
earlier round added. Goals survived as text; scope and detail grew (one plan
2.35x). No goal inversion was observed; accretion was. Some growth bypassed
synthesis entirely through unlogged host edits. Same-lens runs shared about
60-75% of themes, verdict labels flipped with identical scores, and goal-relevant
gaps were the most stable output.

**Provenance and limits.** Only the baseline exercised the current prompts with
fresh-context reviewers. Both archived runs predate the detached orchestration
and the implementation-agent rule, ran in-thread with no reviewer subagents, and
left no ledger, so the scripts, hashes, locks and rerun decider were never
exercised in any observed run. The archives show loop and host behavior, not
current prompt behavior. Accretion appeared before the implementation-agent rule
existed, so the iterate-to-pass loop drives growth independently of prompt
wording. The first classification pass was not blind to this plan's hypotheses;
a blind re-classification by independent raters is the check on that.

What the evidence supports, contradicts and leaves untested:

- *Supported (current prompts):* the materiality bar yields mostly non-goal
  findings; reviewers settle pending owner decisions; Product & UX skews toward
  scope and discretion.
- *Supported (older, in-thread runs):* iterating to pass turns review into spec
  writing; later rounds review earlier rounds' additions; questions become edits.
- *Contradicted:* goal inversion (accretion was observed instead); synthesis
  lacking a questions section; rule 7 as a growth driver (no evidence).
- *Untested:* script-level mechanics as a cause of observed behavior; the
  detached-independence thesis.

- Keep the capture repeatable without new tooling: the same reviewer prompts,
  the same target plans, repeated runs, and a fixed classification rubric
  (serves goal / adds scope / author decision / implementer discretion). Build
  a live eval script only if the manual capture proves too slow to repeat.

**Exit:** met. Later captures use at least 3 runs per lens, include one
synthesis pass, snapshot the round-0 plan, and report theme recall ("found in k
of n runs") rather than raw counts.

### Phase 1: Stop rewarding drift (prompt changes)

Product & UX changes land first because it is the most common single-lens run
and the lens most likely to add scope.

- **Goal gate at the top of every reviewer prompt.** The reviewer restates the
  goal and non-goals in one line each (inferred from the spec when no intent
  card exists, so the user can correct them). A finding is material only if,
  left unaddressed, a stated goal fails, data is lost, a trust boundary is
  crossed, accessibility regresses, or competent implementers would build
  incompatible behavior the goal depends on. A finding whose fix adds
  unrequested surface is not material. Zero findings is the expected result
  for a sound plan.
- **Replace the implementation-agent rule** with a goal-relative test:
  implementer discretion is expected; copy, labels, layout details and ordinary
  defaults are discretion unless a goal is about them.
- **A place for subtraction.** Every reviewer output gets a "Goal fit /
  Recommended removals" section that may be empty. Product & UX's output line
  becomes "add, clarify, or remove".
- **Agent-implementability** lives in the Implementation lens, behind the goal
  gate: ambiguous sources of truth, missing cross-module contracts, conflicting
  readings. Not copy and defaults.
- **Redefine done.** "Review delivered: N blocking gaps, M questions." The
  review never edits the target spec. Remove wording that invites looping: the
  "Rerun After Fixes" example, "implementation-ready without more human
  interpretation", the lock promise, the "clearly new material evidence" escape
  clause, the `[minor]` and "Optional polish" lines in the Strong example.
- **Questions stay questions.** If the plan marks a decision as pending or
  owner-owned, a finding asks the question and does not recommend an answer. An
  item may not appear in both Open Questions and recommended changes. A declared
  pending decision does not lower Completeness or the verdict. The goal-gate
  restatement lists the plan's declared open decisions so reviewers route to
  them instead of inventing parallel questions.
- **Severity follows the goal gate.** `major` or blocking applies only when the
  gate is met.
- **Keep the incompatible-implementations clause** when replacing the
  implementation-agent rule; the stable goal-relevant gaps in Phase 0 all fell
  under it.
- **Natty trigger** requires "llm" or "language model", not the bare "model".
  This is a structural fix and does not count toward the Phase 1 exit.

**Exit (directional, at least 3 runs per lens):** the blocking share of
implementer-discretion, author-decision and scope-adding findings drops; fewer
pending decisions are settled per run; goal-relevant gaps found in Phase 0 are
still found.

### Phase 2: Intent card and output contract

- **Intent card (optional, schema v3).** `goals[{id, text, success_signal}]`,
  `non_goals[]`, `must_not_grow[]`, `decided_tradeoffs[]`. When present it is
  hashed separately from the spec, and a change requires `amended_by: human`.
  When absent, reviewers infer goals per Phase 1.
- **Synthesis as a filter.** Delete "or reviewer feedback" from rule 7. Add
  `change_type: clarify | add | remove` and `serves_goal` per finding decision;
  an accepted ADD must name the goal it serves. Add rejection reasons
  `conflicts_with_goal`, `adds_unrequested_scope`, `implementer_discretion`. Add
  a Scope delta section; if a reductive goal's net surface grows, the verdict is
  Goal drift.
- **Three output groups.** Blocking gaps (the goal fails without a fix),
  Questions for the author (scope, trade-offs, intent, including reviewer Open
  Questions), Notes (archived, not pushed to the host).
- **`decided_by`** on every applied decision (`human` or `policy`), and every
  host edit to the target cites a finding id or is logged as host-initiated, so
  growth that bypasses synthesis is visible.
- Deleting "or reviewer feedback" from rule 7 is consistent cleanup; Phase 0 did
  not show it driving growth.

### Phase 3: Mechanics

Deprioritized. These defects are real in code, but no observed run used the
scripts; real usage followed the prose. Do this phase after a real run shows the
scripts in use, or fold the parts that matter into the prose in Phases 1-2.

- **Lighter locks.** Each lens is `open` or `settled`. A lens reopens only when
  one of its own findings was applied, another lens's applied finding names it
  as affected, or the user reopens it. Content hashes stay for the audit trail,
  not for staleness. Lens verdicts become `blocking: yes/no` and
  `goal_fit: ok/at_risk/violated`. Works for a single lens with no ledger.
- **Reruns from applied findings,** never from a caller-asserted domain list.
- **One automatic rerun, then ask.** `pass_index` and `parent_pass_id` in the
  ledger; further passes need `human_approval`.
- **Interactive and auto modes** as described above.
- **`--root`** (default: current directory) separate from the package root, with
  a test that runs from a project outside the package.

### Phase 4: Defaults

- Default lens selection follows the spec's domains; the full core profile is
  opt-in for irreversible work (migrations, authorization, money, tool
  authority).
- Security gets a "no security surface changed" exit.
- One owner for the stateful sweep; non-owner lenses skip cross-cutting
  categories.
- Scripts stamp provenance instead of models echoing it.
- `full_detached` and lifecycle event validation become an opt-in audit mode.
- Add a reductive-goal example input packet and correct the UI refresh example.

### Phase 5: Validate the independence thesis

Compare detached single-lens reviewers with an inline review on the same real
plans. The expectation is that detached reviewers, now anchored to the goal,
find gaps inline review misses. Results are directional given run-to-run
variance.

## Decisions Made

- Locks: lighter `open`/`settled` states (Phase 3), not deletion and not
  section hashing.
- Autonomy: interactive by default, auto opt-in, questions always reach the user.
- Natty keeps its scope (LLM features in the product). Agent-implementability is
  an Implementation concern.
- Change defaults before removing anything.
- Token cost is recorded, not gated.
