import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const node = process.execPath;
const tempDir = "reviews/archive/.tmp-emit-completion-summary-test";
const ledger = "reviews/examples/review-ledger.valid-detached-completed.json";
const synthesis = "reviews/examples/synthesis-output.valid-detached.json";

function cleanup() {
  rmSync(resolve(repoRoot, tempDir), { recursive: true, force: true });
}

function emitSummary(outPath) {
  execFileSync(node, [
    "reviews/scripts/emit-completion-summary.mjs",
    "--ledger", ledger,
    "--synthesis", synthesis,
    "--out", outPath,
    "--quiet"
  ], {
    cwd: repoRoot,
    encoding: "utf8"
  });
}

test("--out ending in .json writes a valid completion-summary JSON record", () => {
  const outPath = `${tempDir}/completion-summary.json`;
  cleanup();
  try {
    emitSummary(outPath);
    const summary = JSON.parse(readFileSync(resolve(repoRoot, outPath), "utf8"));
    assert.equal(summary.schema_version, 1);
    assert.equal(summary.target_revision, "example-target-revision");
    assert.equal(summary.run_mode, "full");
    assert.doesNotMatch(summary.verification_evidence, /validators passed/i);
    assert.match(summary.verification_evidence, /review records validated/i);
    execFileSync(node, [
      "reviews/scripts/validate-completion-summary.mjs",
      outPath,
      "--target-revision", "example-target-revision"
    ], {
      cwd: repoRoot,
      encoding: "utf8"
    });
  } finally {
    cleanup();
  }
});

test("--out ending in .md keeps the human-readable Markdown summary", () => {
  const outPath = `${tempDir}/completion-summary.md`;
  cleanup();
  try {
    emitSummary(outPath);
    const summary = readFileSync(resolve(repoRoot, outPath), "utf8");
    assert.match(summary, /^Full LensTemper review for selected lenses only/m);
    assert.match(summary, /^Final assessment: Ready to implement/m);
  } finally {
    cleanup();
  }
});
