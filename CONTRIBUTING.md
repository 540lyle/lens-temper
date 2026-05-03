# Contributing

Keep LensTemper portable across Codex, Claude Code, Cursor, and agents that can
only read repository files directly.

Before opening a change:

- Preserve the Markdown-first workflow in `reviews/`.
- Keep schemas, fixtures, validators, and registry entries in sync.
- Avoid product-specific paths or private workspace references in tracked docs.
- Run the review fixture validator and script syntax checks.

Useful checks:

```powershell
node reviews/scripts/validate-review-fixtures.mjs
node reviews/scripts/run-review-evals.mjs
Get-ChildItem reviews/scripts -Filter *.mjs | ForEach-Object { node --check $_.FullName }
git diff --check
```
