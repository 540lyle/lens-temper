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
- [ ] Confirm ignored local artifacts are absent from package candidates with
  `git status --ignored --short --untracked-files=all` and
  `node reviews/scripts/validate-package.mjs`.

## Remaining Public-Release Work

- [ ] Add CI that runs fixture validation, evals, and script syntax checks.
- [ ] Decide whether to add marketplace submission assets such as screenshots
  or platform-specific manifests.
- [ ] Review maintainer identity, support channels, and release tagging before
  publishing broadly.
