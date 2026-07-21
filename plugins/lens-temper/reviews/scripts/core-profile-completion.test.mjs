import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { computeArtifactSha, readJsonFile, validateLedgerRecord } from "./validation-helpers.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const node = process.execPath;
const archiveRoot = join(root, "reviews", "archive");
const reviewInputPath = "reviews/examples/review-input.valid.json";

function repoPath(path) {
  return relative(root, path).replace(/\\/g, "/");
}

function run(args) {
  return execFileSync(node, args, { cwd: root, encoding: "utf8" });
}

function writeJson(path, record) {
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

function buildCompletedRun(targetText, expectedLensCount) {
  mkdirSync(archiveRoot, { recursive: true });
  const dir = mkdtempSync(join(archiveRoot, "core-profile-completion-test-"));
  const passId = `core-profile-${expectedLensCount}-lens`;
  const targetResolved = join(dir, "target.md");
  const targetPath = repoPath(targetResolved);
  writeFileSync(targetResolved, targetText, "utf8");
  const targetRevision = computeArtifactSha(root, targetPath);

  const selection = JSON.parse(run([
    "reviews/scripts/select-lenses.mjs",
    "--target", targetPath,
    "--pass-id", passId,
    "--review-input", reviewInputPath,
    "--core-profile", "standard-v2",
    "--json"
  ]));
  delete selection.event;
  assert.equal(selection.selected_lenses.length, expectedLensCount);
  const selectionResolved = join(dir, "lens-selection.json");
  const selectionPath = repoPath(selectionResolved);
  writeJson(selectionResolved, selection);

  const ledgerResolved = join(dir, "ledger.json");
  const ledgerPath = repoPath(ledgerResolved);
  const ledger = JSON.parse(run([
    "reviews/scripts/create-ledger.mjs",
    "--target", targetPath,
    "--pass-id", passId,
    "--run-mode", "full",
    "--review-input", reviewInputPath,
    "--lens-selection", selectionPath,
    "--lens", selection.selected_lenses.join(",")
  ]));
  writeJson(ledgerResolved, ledger);

  const baseReview = readJsonFile(join(root, "reviews", "examples", "review-output.valid-full.json"));
  const reviewMarkdownPath = "reviews/examples/artifacts/review-output.valid-full.md";
  const reviewMarkdownSha = computeArtifactSha(root, reviewMarkdownPath);
  const reviewIds = [];
  for (const lens of selection.selected_lenses) {
    const recordId = `review-${passId}-${lens}-1`;
    const reviewResolved = join(dir, `review-${lens}.json`);
    const reviewPath = repoPath(reviewResolved);
    const review = {
      ...baseReview,
      record_id: recordId,
      pass_id: passId,
      target_path: targetPath,
      target_revision: targetRevision,
      lens,
      lens_revision: `fixture-${lens}-revision`,
      agent_id: `agent-${lens}`,
      artifact_path: reviewPath,
      markdown_artifact_path: reviewMarkdownPath,
      markdown_artifact_sha: reviewMarkdownSha,
      provenance: {
        input_sources: [{
          role: "target",
          basis: "direct_workspace_read",
          paths_reviewed: [targetPath],
          target_included: true
        }]
      }
    };
    writeJson(reviewResolved, review);
    run(["reviews/scripts/update-ledger.mjs", "--ledger", ledgerPath, "--review", reviewPath, "--write", "--quiet"]);
    reviewIds.push(recordId);
  }

  const baseSynthesis = readJsonFile(join(root, "reviews", "examples", "synthesis-output.valid.json"));
  const synthesisResolved = join(dir, "synthesis.json");
  const synthesisPath = repoPath(synthesisResolved);
  const synthesisId = `synthesis-${passId}`;
  const synthesis = {
    ...baseSynthesis,
    record_id: synthesisId,
    pass_id: passId,
    target_path: targetPath,
    target_revision: targetRevision,
    included_review_record_ids: reviewIds,
    finding_decisions: [{
      finding_id: "no-material-blockers",
      source_lens: selection.selected_lenses[0],
      source_review_record_id: reviewIds[0],
      decision: "accepted",
      severity: "minor",
      affects_rerun_scope: false,
      reason: "Fixture reviews found no material blocker."
    }],
    lens_lock_decisions: selection.selected_lenses.map((lens) => ({
      lens,
      lock_state: "passing_locked",
      rerun_needed: false,
      reason: "The current validated review has no material blockers."
    })),
    artifact_path: synthesisPath,
    markdown_artifact_sha: computeArtifactSha(root, baseSynthesis.markdown_artifact_path),
    claim_flags: {
      completion: true,
      lock_state: true,
      all_5_lockable: true,
      review_complete: true
    }
  };
  writeJson(synthesisResolved, synthesis);
  run([
    "reviews/scripts/update-ledger.mjs",
    "--ledger", ledgerPath,
    "--synthesis", synthesisPath,
    "--finalize",
    "--write",
    "--quiet"
  ]);

  const finalized = readJsonFile(ledgerResolved);
  assert.deepEqual(finalized.completed_lens_ids, selection.selected_lenses);
  assert.equal(finalized.core_gate_passed, true);
  assert.equal(finalized.status, "completed");
  assert.deepEqual(finalized.completion_validation.validated_review_record_ids, reviewIds);
  assert.equal(finalized.completion_validation.validated_synthesis_record_id, synthesisId);
  assert.deepEqual(validateLedgerRecord(finalized, {
    artifactRoot: root,
    targetRevision,
    artifactPath: ledgerPath
  }), []);

  const summaryPath = repoPath(join(dir, "completion-summary.json"));
  run([
    "reviews/scripts/emit-completion-summary.mjs",
    "--ledger", ledgerPath,
    "--synthesis", synthesisPath,
    "--out", summaryPath,
    "--quiet"
  ]);
  const summary = JSON.parse(readFileSync(join(root, summaryPath), "utf8"));
  assert.equal(summary.core_gate_passed, true);
  assert.deepEqual(summary.completed_lens_ids, selection.selected_lenses);
  return { dir, finalized, selection, ledgerPath };
}

test("seven-lens core profile finalizes from validated artifacts", () => {
  const result = buildCompletedRun("Implement an internal deterministic utility.", 7);
  try {
    assert.equal(result.selection.selected_lenses.includes("natty"), false);
    const substituted = { ...result.finalized, core_profile_id: "future-profile" };
    const failures = validateLedgerRecord(substituted, {
      artifactRoot: root,
      targetRevision: substituted.target_revision,
      artifactPath: result.ledgerPath
    });
    assert.equal(failures.some((failure) => failure.field === "lens_selection.core_profile_id"), true);
  } finally {
    rmSync(result.dir, { recursive: true, force: true });
  }
});

test("triggered Natty is required by and included in the finalized core gate", () => {
  const result = buildCompletedRun("Feed tool output back into the model context before the decision.", 8);
  try {
    assert.equal(result.selection.selected_lenses.includes("natty"), true);
    assert.equal(result.finalized.required_lens_ids.includes("natty"), true);
    assert.equal(result.finalized.completed_lens_ids.includes("natty"), true);
    const nattyPath = result.finalized.review_record_artifacts.find((entry) => entry.record_id.includes("-natty-"))?.artifact_path;
    const natty = readJsonFile(join(root, nattyPath));
    writeJson(join(root, nattyPath), { ...natty, closed: false });
    const failures = validateLedgerRecord(result.finalized, {
      artifactRoot: root,
      targetRevision: result.finalized.target_revision,
      artifactPath: result.ledgerPath
    });
    assert.equal(failures.some((failure) => failure.field === "closed"), true);
    assert.equal(failures.some((failure) => failure.field === "completed_lens_ids"), true);
    assert.equal(failures.some((failure) => failure.field === "core_gate_passed"), true);
  } finally {
    rmSync(result.dir, { recursive: true, force: true });
  }
});
