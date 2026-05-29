# Installing LensTemper

LensTemper is portable source, not a host-specific installer. A usable package
root contains both `skills/` and `reviews/` beside the root metadata files.
Installing only one skill folder is advisory unless the package also embeds the
shared `reviews/` resources.

## Package Root

Clone or copy this repository where your host can read it:

```bash
git clone https://github.com/540lyle/lens-temper.git
cd lens-temper
node reviews/scripts/validate-package.mjs
```

The package root is valid when `skills/`, `reviews/`,
`lens-temper.package.json`, and the host adapter you use are present.

## Claude Code

Load the repository as a local plugin:

```bash
git clone https://github.com/540lyle/lens-temper.git
claude --plugin-dir ./lens-temper
```

After changing the checkout, run `/reload-plugins` inside Claude Code. Claude
Code plugin installs expose the review entrypoint as
`/lens-temper:start-plan-review`. Existing workflows that call
`/lens-temper:plan-review-orchestrator` continue through a legacy compatibility
alias.

## Claude Desktop / Claude.ai

Claude Desktop and Claude.ai use Skills packaging rather than the Claude Code
plugin manifest. Package one or more skill folders rooted at `SKILL.md`, and
include the `reviews/` workflow resources those skills reference inside the
bundle or another location the host can read.

Do not claim a full LensTemper review in Desktop or Claude.ai until the host can
launch fresh, isolated reviewer agents and the packaged `reviews/` resources are
verified for that run. Without that, stop full-review requests; only run
inline/advisory mode when the user explicitly asks for a non-lockable advisory
pass.

## Codex

Codex reads `.codex-plugin/plugin.json` and the root `skills/` directory. Full
LensTemper reviews also require `spawn_agent` or an equivalent fresh-subagent
tool. If that is unavailable, a full review cannot be completed; only run
inline/advisory mode when the user explicitly asks for a non-lockable advisory
pass.

If Codex is using a cached local plugin copy, refresh the active installed cache
path after edits. On Windows, discover the installed path first:

```powershell
Get-ChildItem "$env:USERPROFILE\.codex\plugins\cache\local\lens-temper" -Directory
```

Then mirror into the directory Codex is actually using:

```powershell
robocopy <path-to-checkout> <installed-cache-path> /MIR /XD .git .claude .codex .cache node_modules dist coverage reviews\archive /XF *.log /NFL /NDL /NJH /NJS /NP
```

Use your actual checkout path and installed cache path. The cache directory
version segment may lag the plugin manifest version.

## Cursor

Cursor can use project rules from `.cursor/rules/`, and `AGENTS.md` is a
supported instruction format. The included `.cursor/rules/lens-temper.mdc`
adapter is requestable claim discipline and workflow guidance; it is not a
replacement for the portable `skills/` and `reviews/` package.

For advisory use, keep the LensTemper package root in the workspace and read
`docs/hosts/cursor.md`, `reviews/README.md`, and the selected lens files. For
skill-picker use, use the host's current skill-loading mechanism for `skills/`
while keeping `reviews/` available at the package root. Do not claim a lockable
full LensTemper pass in Cursor until fresh reviewer isolation and artifact
validation are verified.

## Copilot

`.github/copilot-instructions.md` is advisory reference material. If the
consuming repository already uses `AGENTS.md`, point it at this install guide,
`reviews/README.md`, and the rule that full LensTemper requires `skills/` plus
`reviews/` together.

Copilot-only guidance should not claim full LensTemper review completion because
fresh reviewer isolation has not been verified there.

## Updating

Update the package root, then rerun validation:

```bash
git pull
node reviews/scripts/validate-package.mjs
node reviews/scripts/validate-review-fixtures.mjs
```

Refresh or restart the host after updating if it caches plugin metadata, skill
descriptions, or rule files.

## Prompt To Reuse

```text
Install LensTemper from <repo>: clone it at the workspace root, ensure skills/
and reviews/ are available together, then run
node reviews/scripts/validate-package.mjs.
```
