# LensTemper

LensTemper is a multi-agent critique system for spec-driven development.

It helps you review specs, implementation plans, and design proposals before
code is written. Independent reviewer agents examine the same spec through
focused lenses, then their findings are synthesized into a clear decision:
ready, ready with small fixes, or needs revision.

Use LensTemper when a spec is important enough that one inline critique is not
enough: cross-module changes, user-facing workflows, persistence changes,
migrations, release-risky work, or any feature where vague review feedback would
be costly.

## Why Use It?

The common critique-agent pattern adds one independent reviewer after a coding
agent produces output. LensTemper moves that critique earlier and makes it
systematic: review the spec before implementation, separate the review into
focused lenses, and make completion claims depend on evidence.

Normal spec reviews often blur together architecture, test strategy, product
behavior, rollout risk, and data contracts. LensTemper separates those concerns
so each reviewer has one responsibility and material gaps are easier to catch.

Unlike a generic critique prompt, LensTemper treats review as a controlled run:
each lens gets a separate prompt, fresh workspace read, structured output,
stale-spec detection, synthesis, and explicit completion rules.

LensTemper is designed to make reviews:

- independent: detached-context reviewers receive no host or orchestrator
  conversation history
- grounded: reviewers read the current spec directly from the workspace
- host-portable: reviewer execution may be concurrent or sequential without
  changing the review contract
- auditable: prompts, outputs, synthesis, and completion evidence can be stored
- composable: use all lenses for broad work or selected lenses for focused work
- explicit: inline/advisory reviews are allowed only when you ask for them

## Beyond A Single Critique Agent

LensTemper turns the critique-agent pattern into a spec-review system:

- one reviewer per lens, not one generic critic
- detached-context subagents that receive no planning conversation or history
- reviewers read the current spec directly from the workspace
- narrower per-reviewer context, with an explicit multi-agent token tradeoff
- explicit scoring and materiality rules
- reruns only for lenses affected by spec changes
- validated artifacts before completion claims
- full, selected-lens, and inline modes with clear claim boundaries

## Why Detached Reviewer Context Matters

The planning conversation often contains assumptions: why a decision was made,
which tradeoffs felt settled, what the author believes is obvious, and which
risks have already been mentally discounted. A reviewer that inherits that
conversation can inherit those assumptions too.

LensTemper avoids that by spawning detached-context reviewer subagents. Each
reviewer reads the current spec directly from the workspace, through one
assigned lens, without the host thread's planning history or another reviewer's
conclusions.

That has a token tradeoff: a full run pays some base context cost per subagent.
In exchange, each reviewer carries a smaller, cleaner working context and gives
a more independent critique. For spec-driven development, that independence is
the point.

## Quick Start

Start here:

1. Install LensTemper as a skill package for your agent host. See
   [Installing As A Skill](#installing-as-a-skill).
2. Restart or refresh your host so the review entrypoint appears. Host labels
   vary: Claude Code plugin installs show `/lens-temper:start-plan-review`;
   display-label pickers may show `LensTemper: Start Plan Review`.
3. Run: `Use LensTemper to review docs/plans/my-plan.md.`

In a full-review host such as Codex or Claude Code, the simplest prompt is:

```text
Use LensTemper to review docs/plans/my-plan.md.
```

By default, LensTemper should run a full review with one detached-context
reviewer subagent per selected lens, using the host's equivalent mechanism. A
detached-context reviewer receives none of the host, parent, or orchestrator
conversation or history and reads only its run packet and permitted workspace
files. If the host cannot provide that isolation, the review should stop instead
of silently falling back to inline/advisory mode.

To force all default lenses:

```text
Run a full LensTemper six-lens review of docs/plans/my-plan.md.
```

To limit the scope:

```text
Run a full LensTemper review of docs/plans/my-plan.md using only Product & UX,
Test Strategy, and Data Model.
```

To intentionally use a quick current-context critique:

```text
Run an inline LensTemper-style review of docs/plans/my-plan.md.
```

Inline/advisory output can guide planning, but it is not independently reviewed
and cannot produce lockable completion claims.

## What Should I Run?

| Need | Use |
|------|-----|
| Highest-confidence spec review | Full six-lens review |
| Narrow risk area | Selected-lens full review |
| Fast early feedback | Inline advisory review |
| Verify fixes after review | Rerun decider, then rerun affected lenses |

## What You Get Back

A normal LensTemper run should give you:

- per-lens findings with material blockers separated from polish
- a synthesized readiness assessment
- recommended spec changes before implementation starts
- rerun guidance after the spec changes
- artifact and validation evidence for any completion claim

The goal is not more review theater. The goal is a clearer spec and fewer
surprises when a coding agent or engineer starts implementation.

## Which Skill Should I Choose?

If you are using a skill picker, start with the start-plan-review entrypoint:

- Claude Code plugin installs: `/lens-temper:start-plan-review`
- Display-label pickers: `LensTemper: Start Plan Review`
- Legacy installs may still expose `/lens-temper:plan-review-orchestrator` as a
  compatibility alias.

Use this first for normal reviews. It selects lenses, prepares reviewer prompts,
spawns or directs detached-context reviewers, tracks outputs, and drives
synthesis/reruns.

The other skills are specialist roles:

- `LensTemper: Lens Reviewer` - use only for a spawned reviewer assigned to one
  lens.
- `LensTemper: Synthesize Review Feedback` - use after reviewer outputs exist
  and you only need consolidation.
- `LensTemper: Rerun Decider` - use after plan edits to decide which lenses need
  another pass.
- `LensTemper: Verification Runner` - use when an orchestrator or reviewer asks
  for shell checks or validation commands.

If you are unsure, pick `Start Plan Review`.

## How It Works

LensTemper has three run families:

- `full_hosted`: the current agent orchestrates fresh lens-reviewer subagents.
- `full_detached`: a fresh orchestrator owns the run, reviewers, synthesis,
  reruns, archive, and completion claims.
- `inline`: a current-context advisory review. Use this only when explicitly
  requested.

A full run typically follows this path:

1. Choose lenses based on the plan's risk.
2. Hash the target plan/spec so stale review output can be detected.
3. Create a ledger and prompt packets for the selected lenses.
4. Spawn one detached-context reviewer subagent per selected lens.
5. Capture structured reviewer outputs.
6. Synthesize findings, decide materiality, and select reruns if needed.
7. Archive final artifacts and report what the evidence supports.

The detailed agent-facing contract lives in [reviews/README.md](reviews/README.md).
The high-level flow diagram is in [docs/agent-flow.md](docs/agent-flow.md).

## Tradeoffs

Use LensTemper when review quality and traceability matter more than speed. It
is heavier than a single critique prompt:

- full runs spawn multiple agents
- each subagent has its own base context cost
- review artifacts and validation evidence take time to produce
- the host must support detached-context reviewers for lockable full-review claims

For rough sketches, small changes, or early brainstorming, use inline advisory
review and label it as advisory.

## The Default Lenses

LensTemper ships with six default lenses:

| Lens | Use it for |
|------|------------|
| Architecture | Boundaries, ownership, coupling, abstraction, maintainability |
| Implementation | Sequencing, feasibility, missing engineering work, execution clarity |
| Risk | Rollout risk, regressions, failure modes, observability, recovery |
| Test Strategy | Coverage, edge cases, validation, regression prevention |
| Product & UX | User-visible behavior, states, copy, recovery paths, accessibility |
| Data Model | Schemas, storage, migrations, compatibility, integrity |

## When To Use All Lenses

Use the full six-lens pass when the plan is broad, high-risk, or intended to
be implementation-ready without more human interpretation. Examples:

- a new user-facing workflow
- persistence or saved-state behavior
- cross-module contracts
- migrations or irreversible data changes
- release or rollout plans
- work that already had regressions or disputed review feedback

Only a full six-lens run may make an unqualified `LensTemper pass complete`
claim, and only when the artifacts validate.

## When To Compose Individual Lenses

Use selected lenses when the spec risk is narrow. Explicit lens ids are exact;
otherwise the canonical selector establishes a deterministic minimum and the
orchestrator may add evidence-backed lenses without removing that minimum.
The policy, ambiguity behavior, and current domain mappings live in
[`reviews/README.md`](reviews/README.md#lens-selection-contract) rather than
being duplicated here.

Selected-lens reviews can still be full reviews, but they must be labeled as
selected-lens scope rather than a complete LensTemper pass.

## When Not To Use LensTemper

LensTemper is probably too much process for:

- tiny edits where the expected behavior is already obvious
- throwaway experiments
- mechanical refactors with good existing tests
- tasks where no host can spawn detached-context reviewers and you need lockable claims

Use inline/advisory mode for quick feedback, but label it honestly.

## Examples

### Full Plan Review

```text
Use LensTemper to run a full six-lens review of
docs/plans/saved-setups-v2.md. Spawn detached-context reviewer subagents, one
per lens, and do not fall back to inline review.
```

### Focused Review

```text
Use LensTemper to review docs/plans/import-export.md with Data Model,
Implementation, and Test Strategy only.
```

### Rerun After Fixes

```text
Use LensTemper to decide which lenses need rerun after the edits to
docs/plans/import-export.md, then rerun only affected lenses.
```

### Inline Advisory Review

```text
Run an inline LensTemper advisory critique of docs/plans/rough-sketch.md.
Do not spawn reviewers.
```

## Repository Layout

```text
.agents/plugins/marketplace.json Codex repo marketplace catalog
.claude-plugin/marketplace.json Claude Code repo marketplace catalog
.claude-plugin/plugin.json      Claude Code plugin metadata
.codex-plugin/plugin.json       Codex plugin metadata
plugins/lens-temper/            Packaged Codex plugin payload for repo marketplace installs
skills/                         Portable skill entrypoints (host-neutral)
reviews/README.md               Agent-facing workflow contract
reviews/lenses/                 Lens prompts
reviews/reviewer-template.md    Required per-lens review format
reviews/synthesize-review-feedback.md
reviews/scripts/                Validators and prompt/ledger helpers
docs/agent-flow.md              Full-run flow diagram
```

## Tooling

Validate the reusable review contract and fixtures:

```powershell
node reviews/scripts/validate-review-fixtures.mjs
node reviews/scripts/sync-codex-plugin-payload.mjs
node reviews/scripts/validate-package.mjs
```

Useful helpers:

```powershell
node reviews/scripts/run-plan-review.mjs --target docs/plans/my-plan.md --pass-id my-pass --review-input docs/plans/my-plan.review-input.json
node reviews/scripts/assemble-review-prompt.mjs --target docs/plans/my-plan.md --lens implementation --pass-id my-pass --review-input docs/plans/my-plan.review-input.json
node reviews/scripts/run-review-evals.mjs
```

`run-plan-review.mjs` validates and snapshots the review contract, resolves or
validates lens scope, records `lens-selection.json`, then prepares ledgers and
prompt packets. Omitting `--lens` invokes the canonical selector; use
`--all-lenses` for an explicit complete-registry run. Reviewer execution is
still provided by the host, such as Codex subagents, Claude subagents, Cursor
Background Agents, or another verified fresh-agent mechanism. Cursor is
conditional full only when its run proves fresh reviewer isolation and artifact
validation; Copilot remains advisory/reference.

## Installing As A Skill

LensTemper installs as a skill/workflow package. In this README, skill package
means the portable source tree: the root metadata plus the reusable `skills/`
and `reviews/` directories. Plugin manifests, rules files, and instruction
files are host adapters that load or point at that portable source.

For copy-paste install and update commands, see
[docs/INSTALL.md](docs/INSTALL.md).

The canonical portable entrypoints are:

```text
skills/
reviews/
```

Full LensTemper requires `skills/` and `reviews/` together. Installing only one
skill folder is advisory unless the package embeds the shared `reviews/`
resources that the skills reference.

Each host loads the same source tree through its own mechanism:

- `.claude-plugin/plugin.json` for Claude Code plugins.
- `.codex-plugin/plugin.json` for Codex.
- Personal Cursor install at `~/.cursor/skills/lens-temper/` (not
  `~/.cursor/skills-cursor/`), with `.cursor/rules/lens-temper.mdc` as an
  optional project-copied requestable adapter. See
  [docs/INSTALL.md](docs/INSTALL.md#cursor).
- `.github/copilot-instructions.md` or `AGENTS.md` as a Copilot
  advisory/reference adapter.
- `skills/` as standalone skill folders where the host supports that layout,
  with the `reviews/` resources packaged beside them.

The manifests live next to the same root `skills/` and `reviews/` content. One
source tree provides the portable workflow, but each host packages or loads it
slightly differently.

### Host Support Matrix

| Host | Support | Requirements |
|------|---------|--------------|
| Claude Code | Full review supported | Plugin plus Claude Code `Agent` tool, with `skills/` and `reviews/` available together. |
| Codex | Full review supported when detached-context subagents are available | Plugin/skills with `skills/` and `reviews/` available together. See the [Codex host guide](docs/hosts/codex.md) for current mechanics. |
| Claude Desktop / Claude.ai | Conditional | Needs packaged `reviews/` resources and verified fresh reviewer isolation before claiming full review support. |
| Cursor | Conditional full | Requires detached orchestration, fresh reviewer isolation, JSON artifacts, ledger/events, synthesis/rerun/completion validators, and a parent-chat-only secret scan; otherwise advisory/reference. See `docs/hosts/cursor.md`. |
| Copilot | Advisory/reference | Use `.github/copilot-instructions.md` or `AGENTS.md` for reference guidance only. |

### Claude Code (CLI)

For a persistent install across sessions, add this repository as a plugin
marketplace and install the plugin from it:

```bash
claude plugin marketplace add 540lyle/lens-temper
claude plugin install lens-temper@lens-temper
```

Interactively, the same flow is `/plugin marketplace add 540lyle/lens-temper`
followed by `/plugin install lens-temper@lens-temper`. Update later with
`claude plugin marketplace update lens-temper`.

For local development, clone the repo and load it as a local plugin instead:

```bash
git clone https://github.com/540lyle/lens-temper.git
claude --plugin-dir ./lens-temper
```

Skills appear in the picker under the plugin namespace, for example
`/lens-temper:start-plan-review`. After editing a checkout, run
`/reload-plugins` inside Claude Code to pick up changes without restarting.

See the Claude Code
[plugins guide](https://code.claude.com/docs/en/plugins) and
[marketplaces guide](https://code.claude.com/docs/en/plugin-marketplaces).

Claude Code's `Agent` (Task) tool is the fresh-subagent mechanism LensTemper
expects — no extra configuration is required. A typical first prompt:

```text
Use LensTemper to review docs/plans/my-plan.md.
```

#### Standalone skills (no plugin)

If you only want the skills available in one project without the plugin
wrapper, copy or symlink the `skills/` directory contents into a project-local
`.claude/skills/` or user-level `~/.claude/skills/`. Skill names appear without
the `lens-temper:` namespace in standalone mode. The plugin install above is
the recommended path for full LensTemper use because it also exposes
`reviews/` and the plugin manifest.

### Claude Desktop / Claude.ai

Claude Desktop and Claude.ai use the Skills feature rather than the Claude Code
plugin manifest. Custom skill packaging may require a ZIP rooted at a skill
folder, so do not assume the full repository layout is available unless your
package includes the shared `reviews/` resources the skill reads.

For LensTemper:

1. Enable Skills in Settings (organization admins may need to enable this
   first).
2. Package the relevant LensTemper skill together with the `reviews/` workflow
   resources it references, or use a filesystem-capable host such as Claude Code
   for full repo-backed reviews.
3. Verify that the host can launch detached-context reviewer subagents before
   treating the result as a full LensTemper review. If it cannot, stop for
   full-review requests; only run inline/advisory mode when the user explicitly
   asks for a non-lockable advisory pass.
4. Refer to the current
   [Claude Skills documentation](https://support.claude.com/) for the latest
   upload procedure, which may change between releases.

The host-neutral skill content under `skills/` and the workflow under
`reviews/` are still the source of truth; the packaging question is whether
your Desktop/web skill bundle includes both.

### Codex

For Codex, "install the LensTemper skill" means install the `lens-temper` plugin
from this repository's marketplace; the plugin exposes the LensTemper skills.
Use the repo marketplace catalog in `.agents/plugins/marketplace.json`; see
[docs/INSTALL.md](docs/INSTALL.md) for the current install and update commands.
The marketplace installs the packaged Codex payload in `plugins/lens-temper/`,
which mirrors `.codex-plugin/`, `skills/`, `reviews/`, and the Codex host guide
for Codex's plugin cache. Full LensTemper reviews also require Codex support for
detached-context reviewer subagents. If that is unavailable, a full review
cannot be completed; only run inline/advisory mode when the user explicitly
asks for a non-lockable advisory pass. See [the Codex host guide](docs/hosts/codex.md)
for the currently verified tool, configuration, and nested-spawn smoke check.
These are Codex adapter details; the portable LensTemper workflow and other host
paths are unchanged.

### Cursor, plain CLI, and other hosts

Skill-aware hosts can load `skills/` directly via their native mechanism when
the full package is available in the workspace. Keep `reviews/` beside `skills/`
so the workflow contracts, lenses, manifests, and validators resolve.

For Cursor, install the full package under `~/.cursor/skills/lens-temper/` so
nested `skills/*/SKILL.md` files and `reviews/` stay together. Do not install
under `~/.cursor/skills-cursor/`. The packaged `.cursor/rules/lens-temper.mdc`
is requestable claim discipline only after it is copied or symlinked into a
project's `.cursor/rules/`; it is not a replacement for the portable skills.
See [docs/INSTALL.md](docs/INSTALL.md#cursor) and `docs/hosts/cursor.md` for
install steps, prompt examples, and the Background Agents path. Cursor output
is full only for a detached run that produces validator-backed artifacts and
passes the parent-chat-only isolation scan; otherwise it remains
advisory/reference.

Plain CLI or manual hosts can still drive the workflow by reading
`reviews/README.md` and assembling prompts with the scripts under
`reviews/scripts/`.

Restart or refresh the host after editing a source checkout — picker metadata
and skill descriptions are read at host startup.

## License

MIT. See [LICENSE](LICENSE).
