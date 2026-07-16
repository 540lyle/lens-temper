import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const node = process.execPath;
const archiveRoot = join(repoRoot, "reviews", "archive");
const target = "reviews/examples/artifacts/target.valid.md";

function repoPath(path) {
  return relative(repoRoot, path).replace(/\\/g, "/");
}

function createLedger(args = []) {
  const stdout = execFileSync(node, [
    "reviews/scripts/create-ledger.mjs",
    "--target", target,
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
  mkdirSync(archiveRoot, { recursive: true });
  const dir = mkdtempSync(join(archiveRoot, "create-ledger-test-"));
  try {
    const raw = execFileSync(node, [
      "reviews/scripts/select-lenses.mjs",
      "--target", target,
      "--pass-id", "create-ledger-test",
      "--review-input", "reviews/examples/review-input.valid.json",
      "--all-lenses",
      "--json"
    ], { cwd: repoRoot, encoding: "utf8" });
    const selection = JSON.parse(raw);
    delete selection.event;
    const selectionPath = join(dir, "lens-selection.json");
    writeFileSync(selectionPath, `${JSON.stringify(selection, null, 2)}\n`, "utf8");
    const ledger = createLedger([
      "--run-mode", "full",
      "--review-input", "reviews/examples/review-input.valid.json",
      "--lens-selection", repoPath(selectionPath)
    ]);
    assert.equal(ledger.run_mode, "full");
    assert.equal(ledger.execution_mode, "fresh_spawned_lens_reviewers");
    assert.equal(ledger.review_input_path, "reviews/examples/review-input.valid.json");
    assert.match(ledger.review_input_revision, /^sha256:[a-f0-9]{64}$/);
    assert.equal(ledger.lens_selection_path, repoPath(selectionPath));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("create-ledger full mode fails without a selection binding", () => {
  const result = spawnSync(node, [
    "reviews/scripts/create-ledger.mjs",
    "--target", target,
    "--pass-id", "create-ledger-missing-selection",
    "--run-mode", "full",
    "--review-input", "reviews/examples/review-input.valid.json"
  ], { cwd: repoRoot, encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /requires --lens-selection/);
});
