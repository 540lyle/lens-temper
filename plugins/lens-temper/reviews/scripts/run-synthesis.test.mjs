import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("synthesis helper preserves the canonical review contract", () => {
  const prompt = execFileSync(process.execPath, [
    "reviews/scripts/run-synthesis.mjs",
    "--ledger", "reviews/examples/review-ledger.valid-detached-completed.json"
  ], { cwd: repoRoot, encoding: "utf8" });

  assert.match(prompt, /fictional review-input sentinel workflow/);
  assert.match(prompt, /Context sentinel/);
  assert.match(prompt, /Constraint sentinel/);
  assert.match(prompt, /sha256:[a-f0-9]{64}/);
  assert.match(prompt, /### Consolidated Critique/);
  assert.doesNotMatch(prompt, /\{\{(?:feature_request|relevant_context|constraints|review_outputs|review_input_revision)\}\}/);
});

test("full synthesis rejects loose review Markdown", () => {
  assert.throws(() => execFileSync(process.execPath, [
    "reviews/scripts/run-synthesis.mjs",
    "reviews/examples/artifacts/example-review-output.md",
    "--target", "docs/plans/FORWARD_PLAN.md",
    "--review-input", "reviews/examples/review-input.valid.json"
  ], { cwd: repoRoot, encoding: "utf8", stdio: "pipe" }), /Command failed/);
});
