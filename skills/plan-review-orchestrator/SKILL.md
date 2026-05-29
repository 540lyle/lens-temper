---
name: plan-review-orchestrator
description: Legacy compatibility alias for LensTemper Start Plan Review. Use start-plan-review for new prompts.
---

# LensTemper Plan Review Orchestrator (Legacy Alias)

This skill is retained so existing `/lens-temper:plan-review-orchestrator`
invocations continue to work after the entrypoint rename.

For all behavior, read and follow `skills/start-plan-review/SKILL.md` from the
same package root. If that file is unavailable, use `reviews/registry.json` and
`reviews/README.md` to locate the Start Plan Review workflow.

Do not silently downgrade a requested full review to inline/advisory mode. A
non-lockable advisory pass is valid only when the user explicitly asks for it.
