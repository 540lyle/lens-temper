---
name: rerun-decider
description: Use after a LensTemper review and later plan edits when the task is only to decide which completed or affected lenses need another pass.
---

# LensTemper Rerun Decider

Use `reviews/scripts/decide-reruns.mjs --ledger <run>/ledger.json` when a
ledger exists, or `--lens <id>` for a run without one. Follow the rerun
protocol in `reviews/README.md` from the skill package or repository root.

## Inputs

- Ledger state, including `target_edits` and `pass_index`.
- Synthesis decisions, including each finding's source lens and
  `affected_lenses`.
- Findings applied without a ledger (`--applied`), and lenses the user
  explicitly reopens (`--reopen`).

## Outputs

- One decision per lens: `open` (rerun) or `settled`, with a reason.
- The next pass index and whether it needs the user's recorded approval.

A settled lens reopens only when one of its own findings was applied, another
lens's applied finding names it as affected, or the user reopens it. An edit to
the target does not reopen a lens by itself. Pass 2 is the one automatic rerun;
a later pass needs `--human-approval` from the user.
