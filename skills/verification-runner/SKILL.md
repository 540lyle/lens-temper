---
name: verification-runner
description: Use when executing validation commands, shell checks, or repository tests requested by LensTemper reviewers or orchestrators.
---

# LensTemper Verification Runner

The verification runner may execute shell commands and append verification
results to ledger state when the orchestrator asks it to.

## Inputs

- Verification request from a reviewer or orchestrator.
- Working directory.
- Command or validation script to run.
- Expected result.

## Outputs

- Command executed.
- Exit code.
- Key stdout/stderr evidence.
- Ledger-ready verification-result record when requested.

Do not change reviewer findings or synthesis decisions. Report evidence only.
