import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
    assert.equal(summary.schema_version, 2);
    assert.equal(summary.target_revision, "git:73eaed921475be235f6684abdd2ce19a4e367c7f");
    assert.equal(summary.run_mode, "full");
    assert.doesNotMatch(summary.verification_evidence, /validators passed/i);
    assert.match(summary.verification_evidence, /review records validated/i);
    execFileSync(node, [
      "reviews/scripts/validate-completion-summary.mjs",
      outPath,
      "--ledger", ledger
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

test("completion rejects a synthesis bound to stale review input", () => {
  cleanup();
  try {
    mkdirSync(resolve(repoRoot, tempDir), { recursive: true });
    const stale = JSON.parse(readFileSync(resolve(repoRoot, synthesis), "utf8"));
    stale.review_input_revision = "sha256:stale";
    const stalePath = `${tempDir}/stale-synthesis.json`;
    writeFileSync(resolve(repoRoot, stalePath), `${JSON.stringify(stale, null, 2)}\n`, "utf8");
    const result = spawnSync(node, [
      "reviews/scripts/emit-completion-summary.mjs",
      "--ledger", ledger,
      "--synthesis", stalePath,
      "--out", `${tempDir}/must-not-exist.json`,
      "--quiet"
    ], { cwd: repoRoot, encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /synthesis trust chain failed/);
  } finally {
    cleanup();
  }
});
