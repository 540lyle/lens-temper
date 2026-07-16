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

For Codex repo marketplace installs, the package root also includes
`.agents/plugins/marketplace.json` and a packaged Codex plugin payload under
`plugins/lens-temper/`.

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
launch detached-context reviewer subagents and the packaged `reviews/` resources
are verified for that run. Without that, stop full-review requests; only run
inline/advisory mode when the user explicitly asks for a non-lockable advisory
pass.

## Codex

For Codex, "install the LensTemper skill" means install the `lens-temper` plugin
from this repository's marketplace; the plugin exposes the LensTemper skills.

### Repo Marketplace Install

Register this repository marketplace, then install LensTemper from it:

```bash
git clone https://github.com/540lyle/lens-temper.git
cd lens-temper
node reviews/scripts/validate-package.mjs
codex plugin marketplace add <path-to-lens-temper-checkout>
codex plugin add lens-temper@lens-temper
```

On Windows, if a `codex` PATH shim fails with `Access is denied`, run the same
commands with the bundled `codex.exe` under
`%LOCALAPPDATA%\OpenAI\Codex\bin\<version>\codex.exe`.

Development users should install from a checkout of `main`. Stable users should
install from a checkout of a release tag such as `v0.1.1`.

Codex installs from `plugins/lens-temper/`, which contains the Codex plugin
manifest, packaged `skills/` and `reviews/` resources, and
`docs/hosts/codex.md`. Full LensTemper reviews also require Codex support for
detached-context reviewer subagents. If that is unavailable, a full review
cannot be completed; only run inline/advisory mode when the user explicitly
asks for a non-lockable advisory pass.

See the [Codex host guide](hosts/codex.md) for the currently verified subagent
tool, Multi-Agent V2 configuration, nested-depth requirement, and smoke check.
Those settings are a Codex adapter concern and do not change Claude, Cursor, or
other host adapters.

### Repo Marketplace Update

For Git-backed marketplace installs, refresh the marketplace snapshot, then
reinstall the plugin from that snapshot:

```powershell
codex plugin marketplace upgrade lens-temper
codex plugin remove lens-temper@lens-temper
codex plugin add lens-temper@lens-temper
```

The remove/add step is intentional. On Windows, `marketplace upgrade` can
refresh the Git marketplace snapshot while failing to replace the installed
plugin cache in place.

For local checkout installs, update and validate the checkout first, then run
the same remove/add plugin commands:

```bash
cd <path-to-lens-temper-checkout>
git pull --ff-only
node reviews/scripts/sync-codex-plugin-payload.mjs
node reviews/scripts/validate-package.mjs
```

After updating, start a new thread, reload the host, or restart Codex if cached
plugin metadata or skill descriptions do not refresh immediately.

## Local Development Fallback

Use this only when Codex is using a cached local plugin copy that must be
refreshed directly during local development. On Windows, discover the installed
path first:

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
while keeping `reviews/` available at the package root.

Cursor can be treated as conditional full only for a detached run that launches
one fresh reviewer per lens, saves JSON review artifacts, produces
`ledger.json`, `events.jsonl`, synthesis, rerun decisions, and
`completion-summary.json`, passes the relevant validators, and passes a
parent-chat-only secret isolation scan. If any gate is missing, label the run
advisory/reference.

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
node reviews/scripts/sync-codex-plugin-payload.mjs
node reviews/scripts/validate-package.mjs
node reviews/scripts/validate-review-fixtures.mjs
```

Refresh or restart the host after updating if it caches plugin metadata, skill
descriptions, or rule files.

## Prompt To Reuse

```text
Install LensTemper for Codex from <repo>: clone it at the workspace root,
validate it, register the repo marketplace, then install
`lens-temper@lens-temper`.
```
