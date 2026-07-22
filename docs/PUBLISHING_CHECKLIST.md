# Publishing Checklist

## Current Cleanup

- [x] Add a root `LICENSE` file matching the plugin manifest.
- [x] Replace placeholder marketplace privacy and terms links.
- [x] Pin `.mjs` files to LF line endings.
- [x] Remove stale legacy layout wording from reviewer-facing docs.
- [x] Reword the fabricated all-`5/5` example so it does not imply a single
  per-lens output is lockable.
- [x] Move the internal forward plan out of the repository root.
- [x] Remove ignored local review-run archives from the working copy.
- [ ] Verify platform-specific installation notes for Codex active-cache
  discovery, Claude Code, Claude Desktop / Claude.ai, Cursor, and Copilot.
- [ ] Validate registry, package metadata, manifest targets, package candidates,
  and nested artifact exclusions stay in sync.
- [ ] Run `node reviews/scripts/sync-codex-plugin-payload.mjs` before package
  validation when root `skills/`, `reviews/`, or `.codex-plugin/` content
  changes.
- [ ] Confirm ignored local artifacts are absent from package candidates with
  `git status --ignored --short --untracked-files=all` and
  `node reviews/scripts/validate-package.mjs`.

## Remaining Public-Release Work

- [x] Add CI that runs fixture validation, evals, and script syntax checks.
  (`.github/workflows/validate.yml` runs syntax checks, payload-sync
  verification, and `validate-all.mjs`.)
- [ ] Decide whether to add marketplace submission assets such as screenshots
  or platform-specific manifests.
- [ ] Review maintainer identity, support channels, and release tagging before
  publishing broadly.

## Release Distribution Checklist

- [ ] Bump `lens-temper.package.json`, `.codex-plugin/plugin.json`, and
  `.claude-plugin/plugin.json` versions together.
- [ ] Run the full validation suite:
  `node reviews/scripts/sync-codex-plugin-payload.mjs`,
  `node --test reviews/scripts/*.test.mjs`,
  `node reviews/scripts/validate-package.mjs`,
  `node reviews/scripts/validate-review-fixtures.mjs`,
  `node reviews/scripts/run-review-evals.mjs`,
  `node --check reviews/scripts/*.mjs`, and `git diff --check`.
- [ ] Verify `.agents/plugins/marketplace.json` is valid JSON and exposes the
  `lens-temper` plugin.
- [ ] Verify `.agents/plugins/marketplace.json` uses
  `source.source: "local"` and `source.path: "./plugins/lens-temper"`.
- [ ] Verify `plugins/lens-temper/` contains the packaged Codex plugin manifest,
  `skills/`, and `reviews/`, and that package validation reports no drift from
  the root source files.
- [ ] Verify `.agents/plugins/marketplace.json` has explicit
  `policy.installation`, `policy.authentication`, and `category` values.
- [ ] Verify `lens-temper.package.json` includes
  `.agents/plugins/marketplace.json` in `packageCandidates`.
- [ ] Verify `docs/INSTALL.md` presents Codex repo marketplace install before
  any local cache-copy fallback.
- [ ] Tag stable releases as `vX.Y.Z`.
- [ ] Recommend stable users install from release tags.
- [ ] Recommend development users install from `main`.
- [ ] Note that hosts may require reload, restart, or a new thread after
  package updates.
- [ ] Keep official curated marketplace submission separate from repo
  marketplace distribution.
