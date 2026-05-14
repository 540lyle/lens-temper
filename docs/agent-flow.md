# LensTemper Agent Flow

This diagram shows the high-level data and agent flow for a full LensTemper
review run. A host may either orchestrate the reviewer wave directly or launch a
detached orchestrator with a platform-neutral Markdown packet. The orchestrator
prepares the run, spawns independent read-only lens reviewers, captures their
outputs, validates the evidence, synthesizes findings, and either reruns
affected lenses or archives the completed review.

```mermaid
flowchart TD
  User["User requests plan review"] --> Launcher["Host launcher / reporter"]
  Launcher --> Mode{"Detached orchestrator available?"}
  Mode -- yes --> Packet["Generate <pass-id>.orchestrator.md"]
  Packet --> Detached["Fresh detached orchestrator"]
  Mode -- no --> Hosted["Hosted orchestrator"]
  Detached --> Orchestrator["Active orchestrator"]
  Hosted --> Orchestrator

  subgraph Inputs["Inputs"]
    Target["Target plan/spec"]
    Registry["Registry, workflow docs, reviewer template"]
    Lenses["Selected lens manifests and prompts"]
  end

  Orchestrator --> Inputs
  Inputs --> Prep["Create ledger, events.jsonl, and hash target"]
  Prep --> Generate["Generate per-lens prompt packets and spawn handoffs"]

  Generate --> Wave["Spawn fresh read-only lens reviewers in parallel<br/>Architecture, Implementation, Risk, Test Strategy, Product and UX, Data Model"]

  Wave --> Outputs["Capture structured reviewer outputs"]
  Outputs --> Close["Close reviewer agents"]
  Outputs --> Validate["Validate outputs and ledger evidence"]

  Validate --> Synthesis["Synthesize findings and score/rerun decisions"]
  Synthesis --> Rerun{"Material plan changes require rerun?"}

  Rerun -- yes --> Affected["Select affected lenses"]
  Affected --> Generate

  Rerun -- no --> Archive["Archive run artifacts and completion summary"]
  Archive --> Final["Final user-facing review summary"]

  Synthesis -. "finding decisions and lock states" .-> Prep
  Archive -. "artifact paths and hashes" .-> Prep
  Prep -. "trace events" .-> Trace["events.jsonl"]
  Generate -. "trace events" .-> Trace
  Outputs -. "trace events" .-> Trace
  Archive -. "trace events" .-> Trace
```

## Flow Notes

- `*.prompt.md` contains the full reviewer packet for one lens: target text,
  template, lens, constraints, and deterministic revisions.
- `*.spawn.md` is the compact host-to-subagent handoff. It uses
  repository-relative paths and tells the reviewer to read the packet from disk.
- `<pass-id>.orchestrator.md` is the optional detached-orchestrator packet. It
  uses repository-relative paths and describes selected lenses, required
  artifacts, stop conditions, and claim rules.
- `events.jsonl` records trace events for setup, reviewer lifecycle, validation,
  synthesis, reruns, archive, and completion reporting.
- Lens reviewers are independent, read-only, and limited to exactly one lens.
- The active orchestrator, hosted or detached, owns synthesis, ledger state,
  rerun selection, lens locking, archival, and completion claims.
- Reruns should target only lenses affected by material plan changes unless the
  user asks for a full clean rerun or the prior run is stale/corrupted.
- Detached completion claims require agreement among `events.jsonl`, ledger,
  reviewer outputs, synthesis, and archive evidence.
