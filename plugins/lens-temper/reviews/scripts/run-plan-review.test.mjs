import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { computeArtifactSha } from "./validation-helpers.mjs";

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

test("omitted --lens uses the canonical selector and binds its audit artifact", () => {
  const outDir = makeOutDir();
  try {
    execFileSync(node, [
      "reviews/scripts/run-plan-review.mjs",
      "--target", target,
      "--pass-id", "runner-auto-selection",
      "--out", repoPath(outDir),
      "--feature-request", "Add a user-facing dialog with an error state."
    ], { cwd: repoRoot, encoding: "utf8" });
    const selection = JSON.parse(readFileSync(join(outDir, "lens-selection.json"), "utf8"));
    const ledger = JSON.parse(readFileSync(join(outDir, "ledger.json"), "utf8"));
    assert.equal(selection.status, "resolved");
    assert.equal(selection.matched_domains.some((entry) => entry.domain === "user-facing-workflow"), true);
    assert.deepEqual(ledger.selected_lenses, selection.selected_lenses);
    assert.equal(ledger.lens_selection_path, `${repoPath(outDir)}/lens-selection.json`);
    assert.match(ledger.lens_selection_revision, /^(git|sha256):[a-f0-9]+$/);

    selection.mode = "deterministic";
    selection.matched_domains = [];
    selection.deterministic_lenses = ["implementation"];
    selection.llm_proposal_path = null;
    selection.llm_proposal_revision = null;
    selection.llm_additions = [];
    selection.selected_lenses = ["implementation"];
    writeFileSync(join(outDir, "lens-selection.json"), `${JSON.stringify(selection, null, 2)}\n`, "utf8");
    ledger.selected_lenses = ["implementation"];
    ledger.lens_selection_revision = computeArtifactSha(repoRoot, `${repoPath(outDir)}/lens-selection.json`);
    writeFileSync(join(outDir, "ledger.json"), `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
    const stale = spawnSync(node, [
      "reviews/scripts/validate-ledger.mjs",
      `${repoPath(outDir)}/ledger.json`,
      "--target-revision", ledger.target_revision
    ], { cwd: repoRoot, encoding: "utf8" });
    assert.notEqual(stale.status, 0);
    assert.match(stale.stderr, /lens_selection\.(deterministic_lenses|matched_domains)/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("default selection follows the spec's domains like select-lenses, and the core profile is opt-in", () => {
  const focusedOut = makeOutDir();
  const ambiguousOut = makeOutDir();
  const coreOut = makeOutDir();
  const emptyOut = makeOutDir();
  const sourceDir = makeOutDir();
  try {
    const request = "Add a user-facing dialog with an error state.";
    const selected = execFileSync(node, [
      "reviews/scripts/select-lenses.mjs",
      "--target", target,
      "--feature-request", request
    ], { cwd: repoRoot, encoding: "utf8" }).trim().split("\n");
    execFileSync(node, [
      "reviews/scripts/run-plan-review.mjs",
      "--target", target,
      "--pass-id", "runner-focused-selection",
      "--out", repoPath(focusedOut),
      "--feature-request", request
    ], { cwd: repoRoot, encoding: "utf8" });
    const focused = JSON.parse(readFileSync(join(focusedOut, "ledger.json"), "utf8"));
    assert.deepEqual(focused.selected_lenses, selected, "both scripts pick the same lenses for the same input");
    assert.equal(focused.run_scope, "selected_lenses");
    assert.equal(JSON.parse(readFileSync(join(focusedOut, "lens-selection.json"), "utf8")).mode, "deterministic");

    const ambiguousTarget = join(sourceDir, "ambiguous.md");
    writeFileSync(ambiguousTarget, "# Internal Fixture\n\nNo domain details supplied.\n", "utf8");
    const ambiguousArgs = [
      "reviews/scripts/run-plan-review.mjs",
      "--target", repoPath(ambiguousTarget),
      "--pass-id", "runner-ambiguous-selection",
      "--feature-request", "Build an internal fixture."
    ];
    const ambiguous = spawnSync(node, [...ambiguousArgs, "--out", repoPath(ambiguousOut)], { cwd: repoRoot, encoding: "utf8" });
    assert.equal(ambiguous.status, 2);
    assert.match(ambiguous.stderr, /clarification required: .*--core-profile standard-v2/);
    assert.deepEqual(readdirSync(ambiguousOut), []);

    execFileSync(node, [...ambiguousArgs, "--out", repoPath(coreOut), "--core-profile", "standard-v2"], { cwd: repoRoot, encoding: "utf8" });
    const coreLedger = JSON.parse(readFileSync(join(coreOut, "ledger.json"), "utf8"));
    assert.equal(coreLedger.run_scope, "core_profile");
    assert.equal(coreLedger.core_profile_id, "standard-v2");
    assert.equal(coreLedger.required_lens_ids.length, 7);
    assert.equal(coreLedger.required_lens_ids.includes("security"), true);
    assert.equal(coreLedger.required_lens_ids.includes("natty"), false);

    const empty = spawnSync(node, [
      "reviews/scripts/run-plan-review.mjs",
      "--target", target,
      "--pass-id", "runner-empty-selection",
      "--out", repoPath(emptyOut),
      "--feature-request", "User-facing workflow.",
      "--lens", " , "
    ], { cwd: repoRoot, encoding: "utf8" });
    assert.equal(empty.status, 2);
    assert.match(empty.stderr, /must contain at least one lens id/);
    assert.deepEqual(readdirSync(emptyOut), []);
  } finally {
    for (const dir of [focusedOut, ambiguousOut, coreOut, emptyOut, sourceDir]) rmSync(dir, { recursive: true, force: true });
  }
});

test("a focused selection that touches irreversible work names the opt-in core profile", () => {
  const outDir = makeOutDir();
  try {
    const output = execFileSync(node, [
      "reviews/scripts/run-plan-review.mjs",
      "--target", target,
      "--pass-id", "runner-irreversible-hint",
      "--out", repoPath(outDir),
      "--feature-request", "Run a schema change with a backfill of stored records."
    ], { cwd: repoRoot, encoding: "utf8" });
    assert.match(output, /hint: the plan touches [^;]*migration-and-data[^;]*; .*--core-profile standard-v2/);
    assert.equal(JSON.parse(readFileSync(join(outDir, "ledger.json"), "utf8")).run_scope, "selected_lenses");
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("runner supports explicit all-lenses scope as a valid selected-lens run", () => {
  const outDir = makeOutDir();
  try {
    execFileSync(node, [
      "reviews/scripts/run-plan-review.mjs",
      "--target", target,
      "--pass-id", "runner-all-lenses",
      "--out", repoPath(outDir),
      "--feature-request", "Narrow implementation plan.",
      "--all-lenses"
    ], { cwd: repoRoot, encoding: "utf8" });
    const selection = JSON.parse(readFileSync(join(outDir, "lens-selection.json"), "utf8"));
    const ledger = JSON.parse(readFileSync(join(outDir, "ledger.json"), "utf8"));
    assert.equal(selection.mode, "all_lenses");
    assert.equal(selection.selected_lenses.length, 8);
    // The core profile is opt-in: every lens is still a selected-lens run.
    assert.equal(ledger.run_scope, "selected_lenses");
    assert.equal(ledger.core_profile_id, undefined);
    execFileSync(node, ["reviews/scripts/validate-ledger.mjs", `${repoPath(outDir)}/ledger.json`, "--target-revision", ledger.target_revision], { cwd: repoRoot, encoding: "utf8" });
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("runner unions a validated evidence-backed lens proposal", () => {
  const outDir = makeOutDir();
  const sourceDir = makeOutDir();
  try {
    const proposalPath = join(sourceDir, "proposal.json");
    writeFileSync(proposalPath, `${JSON.stringify({
      schema_version: 1,
      additions: [{
        lens: "natty",
        reason: "A specialist should inspect the proposed model-owned state decision.",
        evidence: "Target: a model-owned state decision is proposed in the review packet."
      }]
    }, null, 2)}\n`, "utf8");
    execFileSync(node, [
      "reviews/scripts/run-plan-review.mjs",
      "--target", target,
      "--pass-id", "runner-lens-proposal",
      "--out", repoPath(outDir),
      "--feature-request", "Resolve the deferred restore state transition.",
      "--lens-proposal", repoPath(proposalPath)
    ], { cwd: repoRoot, encoding: "utf8" });
    const selection = JSON.parse(readFileSync(join(outDir, "lens-selection.json"), "utf8"));
    assert.equal(selection.mode, "deterministic_plus_llm_additions");
    assert.equal(selection.deterministic_lenses.includes("natty"), false);
    assert.equal(selection.selected_lenses.includes("natty"), true);
    assert.equal(selection.llm_additions[0].evidence.includes("Target:"), true);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
    rmSync(sourceDir, { recursive: true, force: true });
  }
});

test("the standalone orchestrator packet defaults to the same focused selection", () => {
  const outDir = makeOutDir();
  try {
    const args = ["--target", target, "--review-input", reviewInput];
    const selected = execFileSync(node, ["reviews/scripts/select-lenses.mjs", ...args], { cwd: repoRoot, encoding: "utf8" }).trim().split("\n");
    execFileSync(node, [
      "reviews/scripts/assemble-orchestrator-prompt.mjs", ...args,
      "--pass-id", "orchestrator-default-selection",
      "--out", `${repoPath(outDir)}/orchestrator.md`
    ], { cwd: repoRoot, encoding: "utf8" });
    const packet = readFileSync(join(outDir, "orchestrator.md"), "utf8");
    const listed = [...packet.matchAll(/^- ([a-z-]+): manifest /gm)].map((match) => match[1]);
    assert.deepEqual(listed, selected);
    assert.match(packet, /Run scope: `selected_lenses`/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("events log and detached lifecycle checks are an opt-in audit", () => {
  const outDir = makeOutDir();
  try {
    const ledger = JSON.parse(readFileSync(join(repoRoot, "reviews", "examples", "review-ledger.valid-detached-completed.json"), "utf8"));
    const events = readFileSync(join(repoRoot, ledger.events_path), "utf8").split("\n").filter((line) => line && !line.includes("reviewer_closed"));
    writeFileSync(join(outDir, "events.jsonl"), `${events.join("\n")}\n`, "utf8");
    writeFileSync(join(outDir, "ledger.json"), `${JSON.stringify({ ...ledger, events_path: `${repoPath(outDir)}/events.jsonl` }, null, 2)}\n`, "utf8");
    const validate = (extra = []) => spawnSync(node, [
      "reviews/scripts/validate-ledger.mjs", `${repoPath(outDir)}/ledger.json`,
      "--target-revision", ledger.target_revision,
      ...extra
    ], { cwd: repoRoot, encoding: "utf8" });
    assert.equal(validate().status, 0, "a detached run without reviewer_closed events passes the default check");
    const audited = validate(["--audit"]);
    assert.equal(audited.status, 1);
    assert.match(audited.stderr, /event reviewer_closed/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});
