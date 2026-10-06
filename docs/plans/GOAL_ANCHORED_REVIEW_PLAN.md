# Goal-Anchored Review Plan: LensTemper

Status: In progress. Phases 0 and 1 complete; Phases 2, 3, and 4 implemented, awaiting a run on a real plan.

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

**Blind check (two independent raters, rubric only).** Agreement with the
original pass was about 80% (kappa about 0.7), and the original rater was not
biased away from "serves goal". Held: most blocking findings do not serve the
goal (73-85% across raters); Product & UX produces all blocking scope-adding
findings. Weakened: reviewers do settle explicitly pending owner decisions in
the Implementation lens, but about 1-2 per run, not about 5. Two of the three
recall anchors are corroborated; the third is routine engineering. Baselines
below use the blind raters' conservative reading.

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
- **Redefine done.** "Review delivered: N blocking gaps, K minor issues, M
  questions" (minor issues added by the follow-up below). The
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
- **A pending decision** means one the plan explicitly hands to its owner (an
  open-questions or owner-decision list). Changing something the plan merely
  recommends is not settling a pending decision.
- **Natty trigger** requires "llm" or "language model", not the bare "model".
  This is a structural fix and does not count toward the Phase 1 exit.

**Exit (directional, at least 3 runs per lens):** the blocking share of
implementer-discretion, author-decision and scope-adding findings drops; fewer
pending decisions are settled per run; goal-relevant gaps found in Phase 0 are
still found.

**Result (2026-10, 3 old vs 3 new runs per lens, one blind rater, directional).**
Blocking findings fell from about 6.7 to 2.0 per run, and the share of blocking
findings that do not serve the goal fell from 62% to 25%. No new run settled a
pending owner decision. Reviewer Open Questions matched the plan's own owner
questions far more often (24 of 32, up from 3 of 27). Both recall anchors were
still found in the same number of runs, but some hits were downgraded to minor,
and two Product & UX runs gave Strong 5/5 while listing real minor issues.
Follow-up in the same phase: a severity self-check (if the reviewer's own impact
text says the goal's outcome would be wrong, the gate is met), declared non-goals
no longer discount unsafe output, minor issues are counted in the delivered line
and named in a Strong verdict. The Goal fit / Recommended removals section stayed
empty on a lean plan; it still needs a target with removable surface.

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
- **Questions for the author must earn the author's time.** Each question:
  changes what happens next (if every answer leads to the same action, take the
  conservative default and say so instead of asking); is written in plain
  language with enough background to answer without reading the spec; offers
  concrete choices and what each leads to; and is ranked by consequence, most
  consequential first. Every question is delivered: ranking orders attention, it
  never drops an issue, and a question answered by a stated default stays
  visible with that default. Evidence: a ten-question spot-check written for agents
  was unanswerable by the plan's owner, and only two answers would have changed
  anything.
- **`decided_by`** on every applied decision (`human` or `policy`), and every
  host edit to the target cites a finding id or is logged as host-initiated, so
  growth that bypasses synthesis is visible.
- Deleting "or reviewer feedback" from rule 7 is consistent cleanup; Phase 0 did
  not show it driving growth.

**Result (2026-10, contract only; no capture yet).**

- The intent card is an optional `intent` field on review input schema 2, not a
  new schema version: the field is additive, inputs without it keep their
  revision, and older readers already reject unknown fields. It is rendered
  into reviewer and synthesis prompts as the goal reference. `amended_by:
  human` exists and its rule is documented; hash-locking the card across
  passes waits for pass lineage (Phase 3).
- Synthesis is a filter. Finding decisions gain `needs_author`, `change_type`,
  `serves_goal` and `rejection_reason`; the validator rejects an accepted
  `add` without a goal, an untyped accepted blocking finding, a
  `needs_author` decision that is also a plan change, and a reductive
  `scope_delta` that grows without the `Goal drift` verdict.
- The synthesis output is Goal Reference, Blocking Gaps, Questions for the
  Author, Minor Issues, Notes, Recommended Plan Changes and Scope Delta, ahead
  of the audit sections. Synthesis Markdown in the old shape still validates.
- `decided_by` lives on the ledger's `target_edits` log. Policy may apply only
  an accepted blocking finding that names its goal; questions and minor
  issues reach the target only through a human.
- Not done: the completion summary lists minor issues, deferred risks and
  `needs_author` decisions but cannot list reviewer Open Questions, which
  exist only in synthesis Markdown. The
  exit check for this phase is a capture on a plan with a reductive goal.

**Result (2026-10, 2 old vs 2 new syntheses on the same reviewer outputs, blind
rater, directional).** Scope-adding directives fell from 3 per synthesis to 0-1,
and the one remaining was declared in the Scope delta. Pending owner decisions
answered by synthesis fell from 1-3 to 0. No Open Questions were dropped under
either prompt, but the old prompt converted some into directives and the new one
converted none. Question-and-change duplicates fell from 6 to 1. Owner
readability rose from about 2.5 to about 3.5 out of 5. Follow-up in the same
phase: questions are ordered by how much their answer changes, internal option
letters must be restated in plain words, and each question says what happens if
unanswered (the plan's own recommendation, a conservative default, or "work
waits on this answer") instead of "Default: none". The Goal fit / Recommended
removals section returned "None" on a review-grown UI plan in two runs; that is
defensible for that plan but does not yet show the section can find removals.
Intent-card locking across passes waits for Phase 3 lineage.

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

**Result (2026-10, mechanics only; no observed run yet).**

- Lens state is `open | settled` (`lens_state` on synthesis lens decisions).
  Legacy `lock_state` records still validate and map onto it: the two locked
  states are settled, any other state is open exactly when `rerun_needed` is
  true, which is what the old rerun decider did. Settling needs a current
  validated review in a full run, not scores. Review records gain optional
  `blocking: yes|no` (must match `material_blockers.present`) and
  `goal_fit: ok|at_risk|violated` (not `ok` when blocking), and the reviewer
  template asks for both.
- `decide-reruns.mjs` derives reruns from the ledger's `target_edits` and the
  synthesis decisions (`source_lens` plus new optional `affected_lenses`), plus
  `--reopen` for an explicit user reopen. `--changed-domains` is removed. A
  host-initiated edit reopens nothing. Without a ledger, `--lens <id>` with
  `--applied` or `--reopen` covers a single-lens run. A lens settled in an
  earlier pass can be reopened by a later pass's finding.
- Target revisions are an audit trail. Archiving, reporting, and the
  validators' `--ledger` mode no longer fail because the target changed after
  delivery, and lens-selection replay runs only against the reviewed text.
  `run-synthesis.mjs` still requires the live target to match, because it hands
  the text to a model; `validate-ledger.mjs --target-revision` still reports an
  edit when asked.
- Ledgers carry `pass_index`, `parent_pass_id`, `parent_intent_revision`, and
  `human_approval`. `create-ledger.mjs` and `run-plan-review.mjs` take
  `--parent-ledger` and `--human-approval`; a rerun without `--lens` reruns only
  the parent's reopened lenses. Pass 3 and later need a recorded
  `human_approval`. A changed intent card (canonical JSON, ignoring
  `amended_by`) needs `amended_by: human`; adding or removing a card counts as a
  change.
- `apply_mode: interactive | auto` is written on every new ledger (default
  `interactive`). Interactive rejects every `decided_by: policy` edit. Auto
  allows policy only on pass 1 and only for an accepted blocking finding whose
  `serves_goal` is an intent card goal id (or non-empty text when there is no
  card). Ledgers from before this field keep the Phase 2 rule. The orchestrator
  packet takes the mode from the ledger and, in auto mode, states the one
  automatic rerun. `affects_rerun_scope` on findings is legacy and optional.
- `--root` (default: current directory) is accepted by every script that takes
  a target or run artifact; the registry, manifests, lenses, templates, and
  lens-selection policy always resolve against the package. A test runs the
  runner, hasher, rerun decider, synthesis assembler, and archiver from a
  temporary project outside the package.
- Completion: "Review delivered" stays the claim. No validator path ties
  completion to locks; the remaining legacy claim flags `lock_state` and
  `all_5_lockable` are documented as legacy and the synthesis prompt leaves them
  false. The completion summary reports lens state instead of lock state.
- Fixed: legacy synthesis Markdown is recognized only when its first section is
  `### Consolidated Critique`.
- Not done: `run_scope: core_profile` still needs every required lens reviewed
  in one pass, so a partial rerun pass is a selected-lens run.

**Result (2026-10).** Implemented: open/settled lens states with legacy lock
states mapped, reruns derived from applied findings or a user reopen, pass
lineage with one automatic rerun before `human_approval`, intent-card amendment
enforced across a lineage, interactive and auto modes, and `--root` for every
target-taking script. An end-to-end run from a separate project passed every
step, including both guardrails, and was the first observed run to exercise the
scripts. It surfaced doc and CLI mismatches (single-lens path, selector defaults,
no CLI for recording target edits, the completion summary lacking the delivered
line, archive layout) that are fixed in a follow-up.

**Follow-up (2026-10, from the end-to-end run).**

- Single-lens path with no ledger: `assemble-review-prompt.mjs` is documented
  as that path; `run-plan-review.mjs --lens` remains the ledger-backed one.
- `update-ledger.mjs --applied <finding-id> | --host-initiated --summary
  [--decided-by]` records `target_edits`, validated like any ledger write.
- One ledger per pass: `run-plan-review.mjs` prepares the run in the dated
  archive directory, the ledger records its run directory as the archive, and
  `archive-review-run.mjs` completes that directory in place.
- `emit-completion-summary.mjs` writes the `Review delivered` line, taken from
  the synthesis Markdown or counted from the finding decisions, prints all six
  scores with goal fit and lens state, and derives its completion claim from
  the finalized ledger instead of requiring the synthesis to claim it.
- Error usage lines are the full usage text, including `--root`; a missing
  path names the root it resolved against and is a usage error.
- The stateful-workflow domain no longer matches a bare "load".
- Deferred to Phase 4: `select-lenses.mjs` without lens flags reports the
  focused domain selection while `run-plan-review.mjs` uses the default core
  profile. The README documents the difference; Phase 4 changes the defaults.

### Phase 4: Defaults

- Default lens selection follows the spec's domains; the full core profile is
  opt-in for irreversible work (migrations, authorization, money, tool
  authority). This also aligns `run-plan-review.mjs` with `select-lenses.mjs`,
  which today pick different lenses for the same input when no lens flag is
  given.
- Security gets a "no security surface changed" exit.
- One owner for the stateful sweep; non-owner lenses skip cross-cutting
  categories.
- Scripts stamp provenance instead of models echoing it.
- `full_detached` and lifecycle event validation become an opt-in audit mode.
- Add a reductive-goal example input packet and correct the UI refresh example.

**Result (2026-10, defaults only; no capture yet).**

- Default selection follows the spec's domains in `select-lenses.mjs`,
  `run-plan-review.mjs`, and the standalone orchestrator packet, which now
  pick the same lenses. A zero-match input stops for clarification, naming
  `--lens`, `--core-profile`, and `--selection-fallback all`. The core profile
  is opt-in (`--core-profile standard-v2`), documented for migrations,
  authorization, money, and tool authority, and a focused selection that
  matches a migration, security, or model-authority domain prints a hint
  naming it. `run_scope: core_profile` comes only from that opt-in; every other
  set, including `--all-lenses`, is a selected-lens run (an `--all-lenses`
  ledger used to fail validation).
- Claims: a focused run's unqualified claim is `Review delivered: N blocking
  gaps, K minor issues, M questions` plus each lens's state; its summary is
  labeled `Full LensTemper review for selected lenses only: <lenses>` and its
  completion flags stay false. `LensTemper pass complete` stays core-profile
  only.
- Selector: the stateful-workflow domain matches `load saved`, `loads saved`,
  `load a saved`, `load the saved`, `load state`, and `reload`, not a bare
  `load` in a compound noun ("axle load", "peak load"). The security domain matches
  credential-style tokens (`access token`, `bearer token`, and similar), not a
  bare `token` ("design token", "revision token").
- Security has a `No security surface changed` exit.
- The Implementation lens owns the stateful workflow sweep; the other lenses
  keep a pointer. Each packet states the lens's cross-cutting categories from
  its manifest, and a lens skips the rest without `Not applicable` lines
  unless it sees a gate-level issue.
- `update-ledger.mjs --review | --synthesis` stamps the provenance the run
  knows (pass, target, revisions, modes, template and lens revisions, the
  Markdown hash, skipped categories the lens does not own) into the record. The
  reviewer template no longer asks for a Provenance section, and review
  Markdown no longer requires one.
- `events.jsonl` validation, including the detached lifecycle events, runs
  only with `validate-ledger.mjs --audit`; runs still record setup events.
  `full_detached` is described as opt-in.
- Added `reviews/examples/input-packets/settings-consolidation-review-inputs.md`
  (reductive goal, intent card, plan with removable surface). The UI refresh
  packet no longer asks for new states and defers lens choice to the selector.
- Not done: the `implementation plan` phrase in the implementation-complexity
  domain matches almost any plan and selects Implementation; it needs the same
  treatment as `load` and `token`, with evidence from real inputs.

**Result (2026-10).** Default selection now follows the spec's domains in both
`select-lenses` and `run-plan-review`, with the core profile opt-in; the stateful
trigger no longer fires on compound nouns like "chip load"; Security has a
no-surface exit; the stateful sweep has one owner; scripts stamp provenance;
detached and lifecycle-event validation is an opt-in audit mode; a reductive-goal
example packet was added. A second end-to-end run fixed all fourteen earlier
mismatches and found new ones (notably the delivered line is not checked against
finding decisions), fixed in a follow-up. Seeded removals probe: with an intent
card, a non-goal and a `must_not_grow` list, both Product & UX runs recommended
removing a deliberately off-goal dashboard section in full and marked goal fit
violated. The removals section works when a goal makes surface measurable.

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
