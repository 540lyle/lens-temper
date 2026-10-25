# Agent Instructions

Rules for any AI agent (Codex, Claude Code, Cursor, Copilot, Gemini, or other)
changing this repository. Human contributors follow the same rules in
[CONTRIBUTING.md](CONTRIBUTING.md).

This file is for working on LensTemper itself. It is not the LensTemper review
adapter: `.github/copilot-instructions.md` and `.cursor/rules/lens-temper.mdc`
ship to users' projects, so do not put contributor rules there.

## Bump the version with every shipped change

Claude Code and Codex cache an installed plugin by its version. If a change
merges without a new version, `claude plugin update` reports the plugin as
already current and users keep running the old code.

Any pull request that changes what users get must raise the version in the same
pull request. That covers changes under:

- `skills/`
- `reviews/` (prompts, lenses, manifests, templates, schemas, scripts)
- `assets/`
- `docs/hosts/` (host guides that the skills and adapters tell agents to read;
  the sync also copies `docs/hosts/codex.md` into the Codex payload)
- `plugins/lens-temper/`
- `.claude-plugin/plugin.json`, `.codex-plugin/`
- `lens-temper.package.json`
- `.cursor/rules/`, `.github/copilot-instructions.md`

A pull request may skip the bump only if it changes nothing but tests
(`*.test.mjs`), CI (`.github/workflows/`, `.github/scripts/`), or other docs
(`README.md`, `docs/` outside `docs/hosts/`, `CONTRIBUTING.md`, this file). If
unsure, bump.

`plugins/lens-temper/` is generated: classify a change by the source files you
edited, not by what the sync wrote there. A test-only change stays exempt even
though the sync copies the test into `plugins/lens-temper/reviews/scripts/`.

CI enforces this: `.github/scripts/check-version-bump.mjs` fails a pull
request that changes a shipped path unless `lens-temper.package.json` holds a
version above the base branch's. Run it locally with
`node .github/scripts/check-version-bump.mjs --base origin/main`. If you change
the list of shipped paths, change it in that script and here together.

Pick the number (the package is pre-1.0):

- Patch (`0.2.0` → `0.2.1`): bug fixes that restore intended behavior, and
  wording fixes (typos, clarity) that do not change what reviewers do, as long
  as every record, flag, and output that used to be valid is still valid.
- Minor (`0.2.0` → `0.3.0`): new behavior, including skill, lens, or template
  prompt changes that change what reviewers look for or report; new or changed
  record fields or CLI flags; and validators that now reject records they used
  to accept.

Set the same version in all four files:

1. `lens-temper.package.json` (the source of truth)
2. `.claude-plugin/plugin.json`
3. `.codex-plugin/plugin.json`
4. `plugins/lens-temper/.codex-plugin/plugin.json`, by running
   `node reviews/scripts/sync-codex-plugin-payload.mjs`

`node reviews/scripts/validate-package.mjs` fails if these disagree. The
`metadata.version` in `.claude-plugin/marketplace.json` versions the
marketplace catalog, not the plugin; leave it alone for plugin releases.

Bump once per pull request, not per commit. If `main` releases a version while
your pull request is open, raise yours above it before merging.

## Checks before opening a pull request

Edit source files only (`skills/`, `reviews/`, `assets/`, `docs/hosts/codex.md`,
`.codex-plugin/`), never the copies under `plugins/lens-temper/`: the sync
deletes and rewrites that tree. Then run
`node reviews/scripts/sync-codex-plugin-payload.mjs` and commit what it changes;
CI fails on payload drift.

Run every check listed in [CONTRIBUTING.md](CONTRIBUTING.md).
`node reviews/scripts/validate-all.mjs` runs the unit-test, package, fixture,
and fixture-lint lanes together, but not the syntax, whitespace, or version
checks, so it is not the whole gate.
