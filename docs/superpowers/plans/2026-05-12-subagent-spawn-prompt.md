# Subagent Spawn Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate repo-relative, outcome-first LensTemper subagent spawn prompts beside selected-lens review packets.

**Architecture:** Add a dependency-light Node helper that resolves the selected lens through the registry, computes deterministic revisions, and writes a compact spawn prompt. Update the host coordinator script to emit both review packets and spawn prompts while preserving the existing packet/template workflow.

**Tech Stack:** Node 18+ `.mjs` scripts, existing LensTemper registry/manifests, Markdown docs.

---

### Task 1: Add Spawn Prompt Generator

**Files:**
- Create: `reviews/scripts/assemble-spawn-prompt.mjs`
- Modify: `reviews/registry.json`

- [ ] **Step 1: Create `reviews/scripts/assemble-spawn-prompt.mjs`**

Create a script that accepts `--target`, `--lens`, `--pass-id`, `--input-packet`, and optional `--out` / `--json`. It must output the approved outcome-first spawn prompt using only repo-relative paths.

- [ ] **Step 2: Register the script**

Add a `scripts` registry entry:

```json
{
  "id": "assemble-spawn-prompt",
  "path": "reviews/scripts/assemble-spawn-prompt.mjs"
}
```

- [ ] **Step 3: Validate the script compiles**

Run: `node --check reviews/scripts/assemble-spawn-prompt.mjs`

Expected: no output and exit code `0`.

### Task 2: Integrate With Plan Review Coordinator

**Files:**
- Modify: `reviews/scripts/run-plan-review.mjs`

- [ ] **Step 1: Emit spawn prompts beside review packets**

For each selected lens, keep writing the existing `${lens}.prompt.md`, then call `assemble-spawn-prompt.mjs` to write `${lens}.spawn.md`.

- [ ] **Step 2: Update coordinator output**

Change the final status text so it reports ledger, prompt files, and spawn prompt files.

- [ ] **Step 3: Smoke test coordinator**

Run:

```powershell
node reviews/scripts/run-plan-review.mjs --target docs/plans/FORWARD_PLAN.md --pass-id spawn-prompt-smoke --lens implementation --out reviews/archive/spawn-prompt-smoke
```

Expected: status says it created a ledger, one prompt file, and one spawn prompt file.

### Task 3: Document The New Handoff

**Files:**
- Modify: `reviews/README.md`
- Modify: `docs/plans/FORWARD_PLAN.md`

- [ ] **Step 1: Update workflow docs**

Document that generated selected-lens review runs now include `${lens}.spawn.md`, and that spawn prompts use repo-relative paths only.

- [ ] **Step 2: Update forward plan status**

Add the spawn-prompt helper to Phase 4/7 context as completed host handoff scaffolding.

### Task 4: Validate

**Files:**
- Generated ignored smoke artifacts under `reviews/archive/spawn-prompt-smoke/`

- [ ] **Step 1: Confirm no absolute paths in generated spawn prompt**

Run:

```powershell
Select-String -Path reviews/archive/spawn-prompt-smoke/implementation.spawn.md -Pattern "C:\\|^[A-Za-z]:|Workspace:"
```

Expected: no matches.

- [ ] **Step 2: Run review fixture validation**

Run:

```powershell
node reviews/scripts/validate-review-fixtures.mjs
```

Expected: all review validators passed.

- [ ] **Step 3: Run eval harness**

Run:

```powershell
node reviews/scripts/run-review-evals.mjs
```

Expected: recommendation is `keep`.

- [ ] **Step 4: Check whitespace**

Run:

```powershell
git diff --check
```

Expected: no output and exit code `0`.
