---
name: rerun-decider
description: Use after a LensTemper review and later plan edits when the task is only to decide which completed or affected lenses need another pass.
---

# LensTemper Rerun Decider

Use `reviews/scripts/decide-reruns.mjs` when a ledger exists. Otherwise follow
the rerun protocol in `reviews/README.md` from the skill package or repository
root.

## Inputs

- Ledger state.
- Synthesis decisions.
- Current target revision.
- Domains changed by the latest plan/spec edit.
- Previous adjudications.

## Outputs

- Rerun decisions.
- Reasons for selected, skipped, locked, stale, and superseded lenses.
- Previous adjudications for rerun prompts.

Locked lenses stay locked unless the target changed in their domain or the user
explicitly reopens them.
