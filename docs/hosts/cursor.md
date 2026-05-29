# Cursor Host Guide

Cursor support is advisory/reference in this package version. The Cursor adapter
helps users run LensTemper-shaped reviews in Cursor, but it does not by itself
prove fresh reviewer isolation or lockable LensTemper completion.

## Advisory Quick Start

1. Open a workspace that contains the LensTemper package root.
2. Run `node reviews/scripts/validate-package.mjs` from the package root.
3. Confirm `skills/` and `reviews/` are available together.
4. Use `.cursor/rules/lens-temper.mdc` as a requestable project rule when the
   user asks for LensTemper review.
5. If Cursor exposes `skills/`, start normal review requests through
   `skills/start-plan-review/SKILL.md`; if it does not, use the rule-only
   advisory prompt below.
6. Confirm the output is labeled advisory/reference and does not claim full
   LensTemper completion.

For host installation details, see `docs/INSTALL.md#cursor`.

## Entrypoints

- Rule-only advisory: request `.cursor/rules/lens-temper.mdc` and use the
  prompts in this guide. This is enough for claim discipline and a
  LensTemper-shaped review.
- Skill-assisted advisory: use `skills/start-plan-review/SKILL.md` when Cursor
  has loaded the skill folders. This may help assemble per-lens prompts, but it
  remains advisory in Cursor until the full-review experiment passes.
- Legacy alias: `skills/plan-review-orchestrator/SKILL.md` forwards old
  invocations to `start-plan-review`.

All entrypoints require `reviews/` at the package root. Installing one skill
folder without the shared `reviews/` resources is advisory-only.

## Adapter

Use `.cursor/rules/lens-temper.mdc` as a requestable project rule. It should not
be an always-on rule because LensTemper guidance is only relevant when the user
asks for plan/spec review.

Keep the LensTemper package root available in the workspace. Full LensTemper
materials require `skills/` and `reviews/` together.

If Cursor creates `.cursor/skills/` links or junctions to expose the skill
folders, treat those as local install artifacts. They should stay ignored by
`.gitignore`, must not be included in a LensTemper package, and are checked by
`node reviews/scripts/validate-package.mjs`.

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
`node reviews/scripts/validate-review-output.mjs <path>`. Markdown-only
advisory outputs are manually checked against this section and
`reviews/reviewer-template.md`; `validate-review-fixtures.mjs` validates repo
fixtures, not arbitrary live Cursor Markdown.

## Full-Review Experiment

Cursor Background Agents may become a possible full-review backend, but that is
an experiment, not current support. Do not claim full Cursor support until a
run proves all of the following:

- One fresh isolated reviewer is launched per selected lens.
- Reviewers do not inherit the parent chat context. Include an isolation
  falsification test, such as a parent-chat-only secret, and fail the run if any
  reviewer output references it.
- Each reviewer reads the target, `reviews/registry.json`, selected lens prompt,
  selected lens manifest entry, and `reviews/reviewer-template.md` from the
  LensTemper package root.
- Per-lens outputs are persisted as review artifacts, with one artifact for
  each selected lens.
- `ledger.json` and `events.jsonl` are produced or an equivalent Cursor host
  evidence log records reviewer spawn identity, target revision, lens set,
  validator stdout, and validator stderr.
- `node reviews/scripts/validate-review-output.mjs` passes for each JSON review
  artifact, if JSON artifacts are produced.
- `node reviews/scripts/validate-ledger.mjs` passes for the run ledger.
- `node reviews/scripts/validate-synthesis-output.mjs` passes for synthesis.
- `node reviews/scripts/validate-completion-summary.mjs` passes for final
  completion metadata.
- `node reviews/scripts/validate-review-fixtures.mjs` still passes for the repo
  fixture suite after any host-support changes.

If any experiment step fails, keep Cursor support advisory/reference and archive
the failed evidence as a local run artifact rather than a package candidate.

## Maintainer Checks

After editing Cursor support files, run:

```bash
node reviews/scripts/validate-package.mjs
node --test reviews/scripts/validate-package.test.mjs
```

Run the full LensTemper validation suite before claiming the branch is ready.
