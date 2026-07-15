import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const node = process.execPath;

function createLedger(args = []) {
  const stdout = execFileSync(node, [
    "reviews/scripts/create-ledger.mjs",
    "--target", "README.md",
    "--pass-id", "create-ledger-test",
    ...args
  ], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  return JSON.parse(stdout);
}

test("create-ledger defaults to inline manual/imported mode", () => {
  const ledger = createLedger();
  assert.equal(ledger.run_mode, "inline");
  assert.equal(ledger.execution_mode, "manual_or_imported");
});

test("create-ledger supports explicit full spawned reviewer mode", () => {
  const ledger = createLedger([
    "--run-mode", "full",
    "--review-input", "reviews/examples/review-input.valid.json"
  ]);
  assert.equal(ledger.run_mode, "full");
  assert.equal(ledger.execution_mode, "fresh_spawned_lens_reviewers");
  assert.equal(ledger.review_input_path, "reviews/examples/review-input.valid.json");
  assert.match(ledger.review_input_revision, /^sha256:[a-f0-9]{64}$/);
});
