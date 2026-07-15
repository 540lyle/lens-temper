import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const node = process.execPath;
const target = "reviews/evals/fixtures/deferred-restore-save-race.md";
const reviewInput = "reviews/examples/review-input.valid.json";
const archiveRoot = join(repoRoot, "reviews", "archive");

function repoPath(path) {
  return relative(repoRoot, path).replace(/\\/g, "/");
}

function makeOutDir() {
  mkdirSync(archiveRoot, { recursive: true });
  return mkdtempSync(join(archiveRoot, "run-plan-review-test-"));
}

function runReview(outDir, extra = []) {
  return execFileSync(node, [
    "reviews/scripts/run-plan-review.mjs",
    "--target", target,
    "--pass-id", "runner-contract-test",
    "--lens", "implementation",
    "--out", repoPath(outDir),
    ...extra
  ], { cwd: repoRoot, encoding: "utf8" });
}

test("canonical runner propagates and validates the review input contract", () => {
  const outDir = makeOutDir();
  try {
    runReview(outDir, ["--review-input", reviewInput]);
    const ledger = JSON.parse(readFileSync(join(outDir, "ledger.json"), "utf8"));
    const normalizedInput = JSON.parse(readFileSync(join(outDir, "review-input.json"), "utf8"));
    const prompt = readFileSync(join(outDir, "implementation.prompt.md"), "utf8");
    const spawn = readFileSync(join(outDir, "implementation.spawn.md"), "utf8");

    assert.equal(normalizedInput.feature_request.includes("fictional review-input sentinel workflow"), true);
    assert.equal(prompt.includes(JSON.stringify(normalizedInput.feature_request)), true);
    assert.equal(prompt.includes(JSON.stringify(normalizedInput.relevant_context)), true);
    assert.equal(prompt.includes(JSON.stringify(normalizedInput.constraints)), true);
    assert.equal(prompt.includes(`Review Input Revision: ${ledger.review_input_revision}`), true);
    assert.equal(spawn.includes(ledger.review_input_revision), true);
    assert.equal(ledger.review_input_path, `${repoPath(outDir)}/review-input.json`);

    normalizedInput.constraints = "Changed after review setup";
    writeFileSync(join(outDir, "review-input.json"), `${JSON.stringify(normalizedInput, null, 2)}\n`, "utf8");
    const stale = spawnSync(node, [
      "reviews/scripts/validate-ledger.mjs",
      `${repoPath(outDir)}/ledger.json`,
      "--target-revision", ledger.target_revision
    ], { cwd: repoRoot, encoding: "utf8" });
    assert.equal(stale.status, 4);
    assert.match(stale.stderr, /review_input_revision/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("prompt assembly is single-pass when input contains a template token", () => {
  const outDir = makeOutDir();
  try {
    runReview(outDir, [
      "--feature-request", "Keep literal {{constraints}} text",
      "--constraints", "MUST_NOT_REPLACE_THE_LITERAL"
    ]);
    const prompt = readFileSync(join(outDir, "implementation.prompt.md"), "utf8");
    assert.match(prompt, /Keep literal \{\{constraints\}\} text/);
    assert.equal((prompt.match(/MUST_NOT_REPLACE_THE_LITERAL/g) || []).length, 1);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("review-input files fail when required fields are omitted", () => {
  const outDir = makeOutDir();
  try {
    const result = spawnSync(node, [
      "reviews/scripts/run-plan-review.mjs",
      "--target", target,
      "--pass-id", "runner-raw-input-contract",
      "--lens", "implementation",
      "--out", repoPath(outDir),
      "--review-input", "reviews/examples/review-input.invalid-missing-feature.json"
    ], { cwd: repoRoot, encoding: "utf8" });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /feature_request/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("detached orchestrator packet receives the same review input path and revision", () => {
  const outDir = makeOutDir();
  try {
    runReview(outDir, [
      "--review-input", reviewInput,
      "--execution-mode", "fresh_spawned_orchestrator"
    ]);
    const ledger = JSON.parse(readFileSync(join(outDir, "ledger.json"), "utf8"));
    const orchestrator = readFileSync(join(outDir, "runner-contract-test.orchestrator.md"), "utf8");
    assert.equal(orchestrator.includes(ledger.review_input_path), true);
    assert.equal(orchestrator.includes(ledger.review_input_revision), true);
    assert.match(orchestrator, /every current review, synthesis, event, and completion artifact/i);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("scalar compatibility materializes one normalized input and missing feature request fails closed", () => {
  const scalarOut = makeOutDir();
  const missingOut = makeOutDir();
  const mixedOut = makeOutDir();
  try {
    runReview(scalarOut, [
      "--feature-request", "Scalar feature request",
      "--relevant-context", "Scalar context with café and Δ",
      "--constraints", "Scalar constraint"
    ]);
    const normalized = JSON.parse(readFileSync(join(scalarOut, "review-input.json"), "utf8"));
    assert.equal(normalized.feature_request, "Scalar feature request");
    assert.equal(normalized.relevant_context, "Scalar context with café and Δ");
    assert.equal(normalized.constraints, "Scalar constraint");

    const missing = spawnSync(node, [
      "reviews/scripts/run-plan-review.mjs",
      "--target", target,
      "--pass-id", "runner-missing-input",
      "--lens", "implementation",
      "--out", repoPath(missingOut)
    ], { cwd: repoRoot, encoding: "utf8" });
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /feature_request/);
    assert.deepEqual(readdirSync(missingOut), []);

    const mixed = spawnSync(node, [
      "reviews/scripts/run-plan-review.mjs",
      "--target", target,
      "--pass-id", "runner-mixed-input",
      "--lens", "implementation",
      "--out", repoPath(mixedOut),
      "--review-input", reviewInput,
      "--feature-request", "Ambiguous override"
    ], { cwd: repoRoot, encoding: "utf8" });
    assert.equal(mixed.status, 2);
    assert.match(mixed.stderr, /cannot be combined/);
    assert.deepEqual(readdirSync(mixedOut), []);
  } finally {
    rmSync(scalarOut, { recursive: true, force: true });
    rmSync(missingOut, { recursive: true, force: true });
    rmSync(mixedOut, { recursive: true, force: true });
  }
});
