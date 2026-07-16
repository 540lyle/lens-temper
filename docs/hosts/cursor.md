# Cursor Host Guide

Cursor support is conditional full when a detached run proves fresh reviewer
isolation and artifact validation; otherwise Cursor support is
advisory/reference. The Cursor adapter helps users run LensTemper-shaped reviews
inside Cursor, but it does not by itself prove lockable LensTemper completion.

## Advisory Quick Start

1. Install the full LensTemper package at `~/.cursor/skills/lens-temper/`
   (not `~/.cursor/skills-cursor/`). See `docs/INSTALL.md#cursor`.
2. Confirm nested skills are present, especially
   `skills/start-plan-review/SKILL.md`, with `reviews/` beside `skills/`.
3. Restart or reload Cursor, then start normal review requests through
   `skills/start-plan-review/SKILL.md` when the skill picker exposes it.
4. Optionally copy or symlink `.cursor/rules/lens-temper.mdc` into a
   consuming project's `.cursor/rules/` if you want the requestable rule
   adapter in that workspace.
5. For package development, you can instead open a LensTemper checkout as the
   workspace and run `node reviews/scripts/validate-package.mjs` from that
   package root.
6. Confirm any non-gated output is labeled advisory/reference and does not
   claim full LensTemper completion.

For host installation details, see `docs/INSTALL.md#cursor`.

## Entrypoints

- Rule-only advisory: request `.cursor/rules/lens-temper.mdc` and use the
  prompts in this guide. This is enough for claim discipline and a
  LensTemper-shaped review.
- Skill-assisted advisory: use `skills/start-plan-review/SKILL.md` when Cursor
  has loaded the skill folders. This may help assemble per-lens prompts, but it
  remains advisory/reference until the conditional full gates below pass.
- Conditional full: launch a detached orchestrator subagent and have that
  orchestrator spawn one independent reviewer per selected lens. Save
  validator-backed artifacts and run the isolation falsification check before
  making any full-support claim.
- Legacy alias: `skills/plan-review-orchestrator/SKILL.md` forwards old
  invocations to `start-plan-review`.

All entrypoints require `reviews/` at the package root. Installing one skill
folder without the shared `reviews/` resources is advisory-only.

## Adapter

The packaged `.cursor/rules/lens-temper.mdc` is requestable claim discipline and
workflow guidance. It is not a replacement for the portable `skills/` and
`reviews/` package, and it does nothing as a Cursor rule until it is present in
a project's `.cursor/rules/` (or otherwise loaded by the host). For global
skill-picker use, rely on the personal install under
`~/.cursor/skills/lens-temper/`; copy or symlink the rule into projects that
need the adapter.

It should not be an always-on rule because LensTemper guidance is only relevant
when the user asks for plan/spec review.

Full LensTemper materials require `skills/` and `reviews/` together at the
package root used for the run.

If Cursor creates project-local `.cursor/skills/` links or junctions to expose
skill folders, treat those as local install artifacts. They should stay ignored
by `.gitignore`, must not be included in a LensTemper package, and are checked
by `node reviews/scripts/validate-package.mjs`. Never install user skills under
`~/.cursor/skills-cursor/`.

## Advisory Review Prompt

```text
Use the LensTemper Cursor advisory adapter to review docs/plans/my-plan.md.
Read docs/hosts/cursor.md, reviews/README.md, reviews/AGENT.md,
reviews/registry.json, the selected lens prompts under reviews/lenses/, the
selected lens manifests under reviews/manifests/lenses/, and
reviews/reviewer-template.md. Label the result advisory/reference and do not
claim full LensTemper completion.
```

For a selected-lens pass:

```text
Use the LensTemper Cursor advisory adapter to review docs/plans/my-plan.md with
the implementation and test-strategy lenses only. Read
reviews/lenses/lens-implementation.md,
reviews/lenses/lens-test-strategy.md,
reviews/manifests/lenses/implementation.json, and
reviews/manifests/lenses/test-strategy.json. Label the result
advisory/reference and include the lens names in the output.
```

Lens display names map to `reviews/lenses/lens-<slug>.md` and
`reviews/manifests/lenses/<slug>.json`.

## Expected Cursor Output

Cursor advisory output should:

- Identify the target file and selected lenses.
- Use the finding severity language from `reviews/reviewer-template.md`.
- Follow the section structure in `reviews/reviewer-template.md`, including
  `### Provenance`, `### Verdict`, and `### Scorecard`.
- Separate findings from open questions.
- State that the result is advisory/reference.
- Avoid lockable claims such as "full LensTemper review complete".

## Advisory Verification Checklist

Treat a Cursor advisory run as usable only if:

- The output names the target path and selected lens or lenses.
- The output includes the phrase `advisory/reference` or an equivalent clear
  advisory label.
- The output does not claim full LensTemper completion.
- The output cites the lens prompt files or manifests it used.
- Findings use LensTemper severity language.
- Open questions are separated from findings.
- Any saved Markdown review outputs are stored under an ignored
  `reviews/archive/` run directory or another clearly local artifact location.

If a Cursor run emits JSON review records, validate them with
`node reviews/scripts/validate-review-output.mjs <path> --ledger <run>/ledger.json`. Markdown-only
advisory outputs are manually checked against this section and
`reviews/reviewer-template.md`; `validate-review-fixtures.mjs` validates repo
fixtures, not arbitrary live Cursor Markdown.

## Conditional Full Gates

Cursor Background Agents can satisfy the conditional full gate only through a
detached experiment that proves all of the following:

- A parent launcher creates the archive directory and launches a detached
  orchestrator subagent.
- The detached orchestrator launches one fresh reviewer per selected lens.
- Reviewers do not inherit the parent chat context. Include an isolation
  falsification test, such as a parent-chat-only secret, and fail the run if any
  reviewer output or archive artifact references it.
- Each reviewer reads the target, `reviews/registry.json`, selected lens prompt,
  selected lens manifest entry, and `reviews/reviewer-template.md` from the
  LensTemper package root.
- Per-lens outputs are persisted as `*.review.json` and `*.review.md`, with one
  artifact pair for each selected lens.
- `ledger.json` and `events.jsonl` are produced. Events must record reviewer
  spawn identity, completion, validation, synthesis, rerun selection, and close
  events.
- `ledger.json` records the real archive path; archive path consistency is
  required between `ledger.archive_paths`, saved artifacts, and the completion
  summary.
- `node reviews/scripts/validate-review-output.mjs <review.json> --ledger <run>/ledger.json` passes for each JSON review
  artifact.
- `node reviews/scripts/validate-ledger.mjs` passes for the run ledger.
- `node reviews/scripts/validate-synthesis-output.mjs` passes for synthesis.
- `node reviews/scripts/decide-reruns.mjs` records rerun or lock decisions.
- `node reviews/scripts/emit-completion-summary.mjs --out <run>/completion-summary.json`
  writes `completion-summary.json`.
- `node reviews/scripts/validate-completion-summary.mjs <completion.json> --ledger <run>/ledger.json` passes for final
  completion metadata.
- `node reviews/scripts/validate-review-fixtures.mjs` still passes for the repo
  fixture suite after any host-support changes.

If any gate fails, keep the run advisory/reference and archive the failed
evidence as a local artifact rather than a package candidate.

## Background Agents Experiment Prompt

```text
Run a full LensTemper review of docs/plans/my-plan.md with the orchestrator as a
detached subagent. The orchestrator must spawn one independent lens reviewer per
selected lens, persist JSON and Markdown artifacts, produce ledger.json and
events.jsonl, run synthesis, run decide-reruns, emit completion-summary.json,
and validate the run. Do not claim full support unless the parent launcher also
passes the parent-chat-only secret isolation scan across the archive.
```

Do not include any parent-only isolation token in orchestrator prompts, reviewer
prompts, packets, ledgers, events, or summaries. The parent launcher performs
the post-run scan and reports pass/fail.

## Maintainer Checks

After editing Cursor support files, run:

```bash
node reviews/scripts/validate-package.mjs
node --test reviews/scripts/validate-package.test.mjs
```

Run the full LensTemper validation suite before claiming the branch is ready.
