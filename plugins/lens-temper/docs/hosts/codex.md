# Codex Host Guide

This guide is the Codex adapter for LensTemper. It does not change the portable
review contract: every selected lens still gets its own detached-context
reviewer subagent, and the same ledgers, review artifacts, synthesis, rerun, and
completion validators apply on Claude, Cursor, and other supported hosts.

## Detached Context

Current Codex releases expose `spawn_agent` with `fork_turns: "none"` to start a
reviewer without inheriting the parent conversation. For LensTemper, this is a
detached-context reviewer subagent: it receives none of the host, parent, or
orchestrator conversation or history and reads only its run packet and
permitted workspace files. Call `spawn_agent` once per selected lens with
`fork_turns: "none"`; never reuse one reviewer for multiple lenses.

## Codex Configuration

Current Multi-Agent V2 releases use a V2-specific concurrency setting and do
not use `agents.max_threads` for the V2 fanout limit. Keep the legacy setting as
a V1 fallback and set the V2 value explicitly:

```toml
[agents]
max_threads = 10 # Legacy/V1 fallback
max_depth = 2

[features.multi_agent_v2]
enabled = true
max_concurrent_threads_per_session = 10
```

If the file already has a `[features]` table, keep that declaration exactly
once and add `[features.multi_agent_v2]` after it. Do not create a second
`[features]` declaration. Values such as `memories` or `js_repl` stay in the
existing parent table.

The V2 maximum is the total number of active threads in the session, including
the root.
With `10`, the root and up to nine descendants may be active at once. A
six-lens `full_hosted` run uses seven slots; a six-lens `full_detached` run uses
eight: root, detached orchestrator, and six reviewers. `10` is therefore a
headroom recommendation, not a LensTemper invariant. Codex owns thread
scheduling, and reviewer execution may be concurrent or sequential without
changing claim authority.

`agents.max_depth = 2` is Codex-specific setup for the
root -> detached orchestrator -> reviewer path. It is not required for
`full_hosted`, where the root launches reviewers directly.

Restart Codex or start a fresh task after changing `config.toml`.

This configuration path was verified on 2026-07-15 with Codex CLI `0.144.1`
and Desktop runtime `0.144.2`. Recheck the current Codex release when those
interfaces or configuration keys change.

## Smoke Check

Before relying on `full_detached`, run a bounded host check:

1. Confirm the root can launch one fresh child.
2. Have that child launch one fresh grandchild.
3. Close both threads.
4. If testing direct-child concurrency, interpret the configured value as total
   active threads including the root. With `10`, expect at most nine active
   direct children, not ten.

If the direct-child check still stops at four total threads, verify the active
runtime loaded `[features.multi_agent_v2]` rather than only
`agents.max_threads`. If the grandchild check fails, use `full_hosted` unless
the user explicitly required detached orchestration; an explicitly requested
detached run must stop and report the nesting failure.

## Upstream References

- The pinned [Codex V2 configuration source](https://github.com/openai/codex/blob/38b064c31b1f7464b281006316ec878ed23fea77/codex-rs/core/src/config/mod.rs#L207-L208)
  defines separate legacy and Multi-Agent V2 concurrency defaults.
- The pinned [Codex session configuration source](https://github.com/openai/codex/blob/38b064c31b1f7464b281006316ec878ed23fea77/codex-rs/core/src/session/config_lock.rs#L180-L186)
  preserves `agents.max_threads` only when Multi-Agent V2 is disabled.
- [Codex issue #33039](https://github.com/openai/codex/issues/33039) records the
  four-total-thread symptom when only `agents.max_threads` is configured.
- [Codex issue #32245](https://github.com/openai/codex/issues/32245) records the
  V2-specific concurrency-key workaround.
- [Codex issue #32027](https://github.com/openai/codex/issues/32027) tracks
  separate depth-enforcement behavior.
