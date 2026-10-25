# Contributing

Keep LensTemper portable across Codex, Claude Code, Cursor, and agents that can
only read repository files directly.

Before opening a change:

- Preserve the Markdown-first workflow in `reviews/`.
- Keep schemas, fixtures, validators, and registry entries in sync.
- Avoid product-specific paths or private workspace references in tracked docs.
- Run the review fixture validator and script syntax checks.
- Raise the version if the change ships to users (see below).

## Versioning

Claude Code caches an installed plugin by its version, so a change merged
without a new version never reaches people who already installed LensTemper
from the marketplace. Any pull request that changes `skills/`, `reviews/`, `assets/`,
the host guides in `docs/hosts/`, `plugins/lens-temper/`,
`.claude-plugin/plugin.json`, `.codex-plugin/`, `lens-temper.package.json`, or
the Cursor and Copilot adapters must raise the version in the same pull
request: a patch bump for fixes that keep existing records valid, a minor bump
for new behavior (including prompt changes that change what reviewers report)
or stricter validation. Changes to only tests, CI, or other docs may skip it;
test files copied into `plugins/lens-temper/` by the sync don't count.

Set the new version in `lens-temper.package.json`, `.claude-plugin/plugin.json`,
and `.codex-plugin/plugin.json`, then run
`node reviews/scripts/sync-codex-plugin-payload.mjs` to update the packaged
copy. Leave `metadata.version` in `.claude-plugin/marketplace.json` alone: it
versions the marketplace catalog, not the plugin, and Claude Code does not use
it to detect plugin updates. `validate-package.mjs` fails if the plugin
versions disagree, and CI fails a
pull request that changes shipped files without raising the version above
`main`'s. The full rule, which agents also follow, is in
[AGENTS.md](AGENTS.md).

## Checks

Useful checks:

```powershell
node reviews/scripts/validate-package.mjs
node reviews/scripts/validate-review-fixtures.mjs
node reviews/scripts/run-review-evals.mjs  # fixture-lint: fixture integrity only, not a model eval
Get-ChildItem reviews/scripts -Filter *.mjs | ForEach-Object { node --check $_.FullName }
node --test .github/scripts/check-version-bump.test.mjs
node .github/scripts/check-version-bump.mjs --base origin/main
git diff --check
```
