import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  intentRevision,
  readJsonFile,
  validateLedgerRecord,
  validatePassLineage,
  validateTargetEdits
} from "./validation-helpers.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const node = process.execPath;
const archiveRoot = join(repoRoot, "reviews", "archive");
const targetRevision = "git:73eaed921475be235f6684abdd2ce19a4e367c7f";
const target = "reviews/examples/artifacts/target.valid.md";
const parentLedger = "reviews/examples/review-ledger.valid.json";
const intentInput = "reviews/examples/review-input.valid-intent-card.json";
const example = (name) => readJsonFile(join(repoRoot, "reviews", "examples", name));
// The fixture synthesis Markdown's Review delivered line counts the fixture's
// own decisions; checks that swap in other decisions ignore that cross-check.
const fields = (failures) => failures.map((failure) => failure.field).filter((field) => !field.startsWith("markdown.review_delivered"));

function repoPath(path) {
  return relative(repoRoot, path).replace(/\\/g, "/");
}

function withTempDir(run) {
  mkdirSync(archiveRoot, { recursive: true });
  const dir = mkdtempSync(join(archiveRoot, "pass-lineage-test-"));
  try {
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function writeJson(path, record) {
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

function createLedger(args) {
  return spawnSync(node, ["reviews/scripts/create-ledger.mjs", "--target", target, ...args], { cwd: repoRoot, encoding: "utf8" });
}

test("pass lineage allows one automatic rerun, then needs recorded human approval", () => {
  const ledger = example("review-ledger.valid.json");
  const check = (changes) => fields(validateLedgerRecord({ ...ledger, ...changes }, { artifactRoot: repoRoot, targetRevision }));
  const pass2 = { pass_index: 2, parent_pass_id: "example-pass-1", parent_intent_revision: "none" };
  assert.deepEqual(check({ pass_index: 1 }), []);
  assert.deepEqual(check(pass2), []);
  assert.deepEqual(check({ pass_index: 2 }), ["parent_pass_id", "parent_intent_revision"]);
  assert.deepEqual(check({ ...pass2, parent_pass_id: "example-pass" }), ["parent_pass_id"]);
  assert.deepEqual(check({ pass_index: 0 }), ["pass_index"]);
  assert.deepEqual(check({ parent_pass_id: "orphan" }), ["parent_pass_id"]);
  assert.deepEqual(check({ ...pass2, pass_index: 3 }), ["human_approval"]);
  assert.deepEqual(check({ ...pass2, pass_index: 3, human_approval: { decided_by: "policy", summary: "Agent approved itself." } }), ["human_approval"]);
  assert.deepEqual(check({ ...pass2, pass_index: 3, human_approval: { decided_by: "human", summary: "Owner asked for a third pass on risk." } }), []);
});

test("a changed intent card across a lineage requires amended_by: human", () => {
  const card = example("review-input.valid-intent-card.json").intent;
  const pass2 = { pass_id: "p2", pass_index: 2, parent_pass_id: "p1", parent_intent_revision: intentRevision(card) };
  assert.deepEqual(validatePassLineage(pass2, card), []);
  const reordered = Object.fromEntries(Object.entries(card).reverse());
  assert.deepEqual(validatePassLineage(pass2, reordered), []);
  const changed = { ...card, goals: [...card.goals, { id: "G9", text: "A goal the reviewers proposed." }] };
  assert.deepEqual(fields(validatePassLineage(pass2, changed)), ["intent.amended_by"]);
  assert.deepEqual(validatePassLineage(pass2, { ...changed, amended_by: "human" }), []);
  assert.deepEqual(fields(validatePassLineage(pass2, undefined)), ["intent.amended_by"]);
  assert.equal(intentRevision({ ...card, amended_by: "human" }), intentRevision(card));
});

test("create-ledger records lineage and enforces approval and intent stability", () => withTempDir((dir) => {
  const pass2 = createLedger(["--pass-id", "lineage-2", "--parent-ledger", parentLedger]);
  assert.equal(pass2.status, 0, pass2.stderr);
  const ledger2 = JSON.parse(pass2.stdout);
  assert.equal(ledger2.pass_index, 2);
  assert.equal(ledger2.parent_pass_id, "example-pass");
  assert.equal(ledger2.parent_intent_revision, "none");
  assert.equal(ledger2.apply_mode, "interactive");

  const ledger2Path = repoPath(join(dir, "ledger-2.json"));
  writeJson(join(repoRoot, ledger2Path), ledger2);
  const pass3 = createLedger(["--pass-id", "lineage-3", "--parent-ledger", ledger2Path]);
  assert.equal(pass3.status, 2);
  assert.match(pass3.stderr, /human_approval/);
  assert.match(pass3.stderr, /--human-approval "<what the user approved>"/, "the refusal names the flag that fixes it");
  assert.match(pass3.stderr, /actual=missing/);
  assert.match(pass3.stderr, /--events-path <path>/, "the usage line on error is the full one");
  const approved = createLedger(["--pass-id", "lineage-3", "--parent-ledger", ledger2Path, "--human-approval", "Owner asked to rerun risk once more."]);
  assert.equal(approved.status, 0, approved.stderr);
  assert.deepEqual(JSON.parse(approved.stdout).human_approval, { decided_by: "human", summary: "Owner asked to rerun risk once more." });

  const unattached = createLedger(["--pass-id", "lineage-x", "--human-approval", "No parent."]);
  assert.equal(unattached.status, 2);
  const otherTarget = spawnSync(node, ["reviews/scripts/create-ledger.mjs", "--target", "reviews/evals/fixtures/rollback-missing.md", "--pass-id", "lineage-y", "--parent-ledger", parentLedger], { cwd: repoRoot, encoding: "utf8" });
  assert.equal(otherTarget.status, 2);
  assert.match(otherTarget.stderr, /--parent-ledger reviews/);

  const addedCard = createLedger(["--pass-id", "lineage-card", "--parent-ledger", parentLedger, "--review-input", intentInput]);
  assert.equal(addedCard.status, 2);
  assert.match(addedCard.stderr, /intent\.amended_by/);
  const amendedInput = repoPath(join(dir, "amended-input.json"));
  const input = example("review-input.valid-intent-card.json");
  writeJson(join(repoRoot, amendedInput), { ...input, intent: { ...input.intent, amended_by: "human" } });
  const amended = createLedger(["--pass-id", "lineage-card", "--parent-ledger", parentLedger, "--review-input", amendedInput]);
  assert.equal(amended.status, 0, amended.stderr);
}));

test("interactive mode applies nothing; auto applies only blocking fixes that cite a stated goal", () => withTempDir((dir) => {
  const ledger = example("review-ledger.valid.json");
  const synthesisPath = repoPath(join(dir, "synthesis.json"));
  const blocking = {
    finding_id: "goal-gap",
    source_lens: "implementation",
    source_review_record_id: "review-implementation-1",
    decision: "accepted",
    severity: "major",
    affects_rerun_scope: true,
    change_type: "clarify",
    serves_goal: "G1",
    reason: "Goal G1 fails without it."
  };
  writeJson(join(repoRoot, synthesisPath), { ...example("synthesis-output.valid.json"), artifact_path: synthesisPath, finding_decisions: [blocking] });
  const policyEdit = [{ finding_id: "goal-gap", decided_by: "policy", summary: "Auto mode applied the blocking fix." }];
  const check = (changes) => fields(validateLedgerRecord({
    ...ledger,
    synthesis_record_artifacts: [{ record_id: "synthesis-1", artifact_path: synthesisPath }],
    target_edits: policyEdit,
    ...changes
  }, { artifactRoot: repoRoot, targetRevision }));
  assert.deepEqual(check({ apply_mode: "auto" }), []);
  assert.deepEqual(check({}), [], "ledgers written before apply_mode keep the policy rule");
  assert.deepEqual(check({ apply_mode: "interactive" }), ["target_edits[0].decided_by"]);
  assert.deepEqual(check({ apply_mode: "interactive", target_edits: [{ ...policyEdit[0], decided_by: "human" }] }), []);
  assert.deepEqual(check({ apply_mode: "sometimes" }), ["apply_mode"]);
  // The automatic rerun and any later pass apply nothing by policy.
  const pass2 = { pass_index: 2, parent_pass_id: "example-pass-0", parent_intent_revision: "none" };
  assert.deepEqual(check({ apply_mode: "auto", ...pass2 }), ["target_edits[0].decided_by"]);
  assert.deepEqual(check({ apply_mode: "auto", ...pass2, target_edits: [{ ...policyEdit[0], decided_by: "human" }] }), []);

  const findings = new Map([["goal-gap", blocking], ["question", { ...blocking, decision: "needs_author", change_type: undefined }]]);
  const edits = (findingId, intent) => {
    const failures = [];
    validateTargetEdits({ apply_mode: "auto", target_edits: [{ finding_id: findingId, decided_by: "policy", summary: "Applied." }] }, findings, "ledger", failures, intent);
    return fields(failures);
  };
  const card = example("review-input.valid-intent-card.json").intent;
  assert.deepEqual(edits("goal-gap", card), []);
  assert.deepEqual(edits("goal-gap", { goals: [{ id: "G2", text: "Another goal." }] }), ["target_edits[0].decided_by"]);
  assert.deepEqual(edits("question", card), ["target_edits[0].decided_by"]);
}));

test("create-ledger and the orchestrator packet carry the apply mode", () => withTempDir((dir) => {
  assert.equal(JSON.parse(createLedger(["--pass-id", "mode-test", "--apply-mode", "auto"]).stdout).apply_mode, "auto");
  assert.equal(createLedger(["--pass-id", "mode-test", "--apply-mode", "yolo"]).status, 2);
  const run = (mode) => {
    const outDir = repoPath(join(dir, `run-${mode}`));
    execFileSync(node, [
      "reviews/scripts/run-plan-review.mjs",
      "--target", target,
      "--pass-id", `mode-${mode}`,
      "--lens", "implementation",
      "--review-input", "reviews/examples/review-input.valid.json",
      "--execution-mode", "fresh_spawned_orchestrator",
      ...(mode === "default" ? [] : ["--apply-mode", mode]),
      "--out", outDir
    ], { cwd: repoRoot, encoding: "utf8" });
    return {
      ledger: readJsonFile(join(repoRoot, outDir, "ledger.json")),
      packet: readFileSync(join(repoRoot, outDir, `mode-${mode}.orchestrator.md`), "utf8")
    };
  };
  const interactive = run("default");
  assert.equal(interactive.ledger.apply_mode, "interactive");
  assert.match(interactive.packet, /Apply mode: `interactive`/);
  assert.match(interactive.packet, /`interactive`: apply nothing/);
  assert.doesNotMatch(interactive.packet, /decided_by: policy/);
  const auto = run("auto");
  assert.equal(auto.ledger.apply_mode, "auto");
  assert.match(auto.packet, /Apply mode: `auto`/);
  assert.match(auto.packet, /`decided_by: policy`\. Never apply questions for the author or minor issues/);
  assert.match(auto.packet, /Pass 2 is the one automatic rerun/);
  assert.match(auto.packet, /run-plan-review\.mjs --target \S+ --review-input \S+ --parent-ledger \S+ --apply-mode auto --pass-id/);

  // The packet takes the apply mode from an existing ledger and refuses a contradicting flag.
  const assemble = (extra) => spawnSync(node, [
    "reviews/scripts/assemble-orchestrator-prompt.mjs",
    "--target", target,
    "--pass-id", "mode-auto",
    "--lens", "implementation",
    "--review-input", "reviews/examples/review-input.valid.json",
    "--ledger", repoPath(join(dir, "run-auto", "ledger.json")),
    "--out", repoPath(join(dir, "run-auto", "reassembled.orchestrator.md")),
    "--quiet",
    ...extra
  ], { cwd: repoRoot, encoding: "utf8" });
  assert.equal(assemble([]).status, 0);
  assert.match(readFileSync(join(dir, "run-auto", "reassembled.orchestrator.md"), "utf8"), /Apply mode: `auto`/);
  const contradicted = assemble(["--apply-mode", "interactive"]);
  assert.equal(contradicted.status, 2);
  assert.match(contradicted.stderr, /match the ledger's auto/);
}));

test("a rerun pass defaults to the lenses its parent reopened", () => withTempDir((dir) => {
  const parentPath = repoPath(join(dir, "parent-ledger.json"));
  const parent = { ...example("review-ledger.valid.json"), selected_lenses: ["implementation", "risk"] };
  writeJson(join(repoRoot, parentPath), parent);
  const rerun = (outName, extra = [], reviewInput = "reviews/examples/review-input.valid.json") => spawnSync(node, [
    "reviews/scripts/run-plan-review.mjs",
    "--target", target,
    "--pass-id", `rerun-${outName}`,
    "--review-input", reviewInput,
    "--parent-ledger", parentPath,
    "--out", repoPath(join(dir, outName)),
    ...extra
  ], { cwd: repoRoot, encoding: "utf8" });
  const none = rerun("none");
  assert.equal(none.status, 2);
  assert.match(none.stderr, /reopens no lens/);

  writeJson(join(repoRoot, parentPath), {
    ...parent,
    rerun_decisions: [
      { lens: "implementation", lens_state: "settled", rerun_needed: false, reason: "Delivered." },
      { lens: "risk", lens_state: "open", rerun_needed: true, reason: "reopened by the user" }
    ]
  });
  const reopened = rerun("reopened");
  assert.equal(reopened.status, 0, reopened.stderr);
  const ledger = readJsonFile(join(dir, "reopened", "ledger.json"));
  assert.deepEqual(ledger.selected_lenses, ["risk"]);
  assert.equal(ledger.run_scope, "selected_lenses");
  assert.equal(ledger.pass_index, 2);
  assert.equal(ledger.parent_pass_id, "example-pass");

  const autoRerun = rerun("auto", ["--apply-mode", "auto", "--execution-mode", "fresh_spawned_orchestrator"]);
  assert.equal(autoRerun.status, 0, autoRerun.stderr);
  const packet = readFileSync(join(dir, "auto", "rerun-auto.orchestrator.md"), "utf8");
  assert.match(packet, /`auto`, pass 2: this pass is the automatic rerun\. Apply nothing further and do not start another pass/);
  assert.doesNotMatch(packet, /decide-reruns\.mjs/);

  const changedCard = rerun("changed-card", ["--lens", "risk"], intentInput);
  assert.equal(changedCard.status, 2);
  assert.match(changedCard.stderr, /intent\.amended_by/);
  assert.equal(existsSync(join(dir, "changed-card")), false);
}));
