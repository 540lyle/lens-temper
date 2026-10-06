import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  EMPTY_INTENT_CARD,
  computeArtifactSha,
  readJsonFile,
  resolveReviewInput,
  validateLedgerRecord,
  validateReviewInputRecord,
  validateSynthesisRecord
} from "./validation-helpers.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const archiveRoot = join(repoRoot, "reviews", "archive");
const targetRevision = "git:73eaed921475be235f6684abdd2ce19a4e367c7f";
const intentInput = "reviews/examples/review-input.valid-intent-card.json";
const example = (name) => readJsonFile(join(repoRoot, "reviews", "examples", name));
const fields = (failures) => failures.map((failure) => failure.field);

function repoPath(path) {
  return relative(repoRoot, path).replace(/\\/g, "/");
}

function withTempDir(run) {
  mkdirSync(archiveRoot, { recursive: true });
  const dir = mkdtempSync(join(archiveRoot, "goal-anchored-test-"));
  try {
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function synthesisFailures(changes) {
  const record = { ...example("synthesis-output.valid.json"), ...changes };
  return validateSynthesisRecord(record, { artifactRoot: repoRoot, targetRevision });
}

function decision(changes) {
  return [{
    finding_id: "f1",
    source_lens: "implementation",
    source_review_record_id: "review-implementation-1",
    decision: "accepted",
    severity: "major",
    affects_rerun_scope: false,
    reason: "Fixture decision.",
    ...changes
  }];
}

test("a review input without an intent card keeps its revision", () => {
  const ledger = example("review-ledger.valid.json");
  const input = resolveReviewInput(repoRoot, { reviewInput: ledger.review_input_path });
  assert.equal(input.revision, ledger.review_input_revision);
  assert.equal("intent" in input.record, false);
});

test("an intent card validates, is normalized, and is part of the review input revision", () => {
  const input = resolveReviewInput(repoRoot, { reviewInput: intentInput });
  assert.equal(input.record.intent.goals[0].id, "G1");
  const { intent, ...withoutIntent } = readJsonFile(join(repoRoot, intentInput));
  assert.ok(intent);
  assert.deepEqual(validateReviewInputRecord(withoutIntent), []);
  assert.notEqual(resolveReviewInput(repoRoot, { featureRequest: withoutIntent.feature_request }).revision, input.revision);
});

test("malformed intent cards fail closed", () => {
  assert.deepEqual(fields(validateReviewInputRecord(example("review-input.invalid-intent-card.json"))), [
    "intent.goals",
    "intent.decided_tradeoffs[0].why",
    "intent.amended_by"
  ]);
  const base = example("review-input.valid-intent-card.json");
  const duplicate = { ...base, intent: { goals: [{ id: "G1", text: "a" }, { id: "G1", text: "b" }], scope: "x" } };
  assert.deepEqual(fields(validateReviewInputRecord(duplicate)), ["intent.scope", "intent.goals[1].id"]);
  const badList = { ...base, intent: { ...base.intent, non_goals: [""] } };
  assert.deepEqual(fields(validateReviewInputRecord(badList)), ["intent.non_goals"]);
});

test("reviewer prompts render the intent card, or say none was supplied", () => {
  const assemble = (reviewInput) => execFileSync(process.execPath, [
    "reviews/scripts/assemble-review-prompt.mjs",
    "--target", "reviews/examples/artifacts/target.valid.md",
    "--lens", "product-ux",
    "--pass-id", "intent-card-test",
    "--review-input", reviewInput
  ], { cwd: repoRoot, encoding: "utf8" });
  const withCard = assemble(intentInput);
  assert.match(withCard, /### Intent Card\n<intent_card>\n\{"goals":\[\{"id":"G1"/);
  assert.match(withCard, /Keep advanced options behind a disclosure/);
  const withoutCard = assemble("reviews/examples/review-input.valid.json");
  assert.equal(withoutCard.includes(JSON.stringify(EMPTY_INTENT_CARD)), true);
  assert.doesNotMatch(withoutCard, /\{\{intent_card\}\}/);
});

test("synthesis accepts an added requirement only when it names the goal it serves", () => {
  assert.deepEqual(synthesisFailures({}), []);
  assert.deepEqual(fields(synthesisFailures({ finding_decisions: decision({ change_type: "add", serves_goal: null }) })), ["finding_decisions[0].serves_goal"]);
  assert.deepEqual(fields(synthesisFailures({ finding_decisions: decision({ change_type: "add" }) })), ["finding_decisions[0].serves_goal"]);
  assert.deepEqual(synthesisFailures({ finding_decisions: decision({ change_type: "add", serves_goal: "G1" }) }), []);
  assert.deepEqual(synthesisFailures({ finding_decisions: decision({ change_type: "remove", serves_goal: null }) }), []);
  assert.deepEqual(fields(synthesisFailures({ finding_decisions: decision({ change_type: "expand" }) })), ["finding_decisions[0].change_type"]);
});

test("a goal-anchored synthesis types every accepted blocking finding and records its scope delta", () => {
  assert.deepEqual(fields(synthesisFailures({ finding_decisions: decision({}) })), ["finding_decisions[0].change_type"]);
  assert.deepEqual(synthesisFailures({ finding_decisions: decision({ severity: "minor" }) }), []);
  assert.deepEqual(fields(synthesisFailures({ scope_delta: undefined })), ["scope_delta"]);
});

test("a question for the author is never also a plan change", () => {
  assert.deepEqual(synthesisFailures({ finding_decisions: decision({ decision: "needs_author" }) }), []);
  assert.deepEqual(fields(synthesisFailures({ finding_decisions: decision({ decision: "needs_author", change_type: "clarify" }) })), ["finding_decisions[0].change_type"]);
});

test("rejection reasons are goal-aware and only apply to rejected findings", () => {
  for (const reason of ["conflicts_with_goal", "adds_unrequested_scope", "implementer_discretion"]) {
    assert.deepEqual(synthesisFailures({ finding_decisions: decision({ decision: "rejected", rejection_reason: reason }) }), []);
  }
  assert.deepEqual(fields(synthesisFailures({ finding_decisions: decision({ change_type: "clarify", rejection_reason: "adds_unrequested_scope" }) })), ["finding_decisions[0].rejection_reason"]);
  assert.deepEqual(fields(synthesisFailures({ finding_decisions: decision({ decision: "rejected", rejection_reason: "too_long" }) })), ["finding_decisions[0].rejection_reason"]);
});

test("a reductive goal whose net surface grows is Goal drift", () => {
  const scope_delta = { added: ["advanced options disclosure"], removed: [], net: "grows", reductive_goal: true };
  assert.deepEqual(fields(synthesisFailures({ scope_delta })), ["final_assessment"]);
  assert.deepEqual(synthesisFailures({ scope_delta, final_assessment: "Goal drift" }), []);
  assert.deepEqual(synthesisFailures({ scope_delta: { ...scope_delta, reductive_goal: false } }), []);
  assert.deepEqual(fields(synthesisFailures({ scope_delta: { added: "x", removed: [], net: "more", reductive_goal: "yes" } })), [
    "scope_delta.added",
    "scope_delta.net",
    "scope_delta.reductive_goal"
  ]);
});

test("synthesis Markdown uses the output contract, and legacy Markdown stays valid", () => withTempDir((dir) => {
  const current = readFileSync(join(repoRoot, "reviews", "examples", "artifacts", "synthesis-output.valid.md"), "utf8");
  const check = (name, text, changes = {}) => {
    const path = join(dir, name);
    writeFileSync(path, text, "utf8");
    return synthesisFailures({ markdown_artifact_path: repoPath(path), markdown_artifact_sha: computeArtifactSha(repoRoot, repoPath(path)), ...changes });
  };
  const missing = check("missing.md", current.replace("### Questions for the Author", "### Open Items"));
  assert.deepEqual(missing.map((failure) => failure.expected), ["### Questions for the Author"]);
  const legacy = [
    "### Consolidated Critique",
    "### Synthesis Decisions",
    "### Reviewer Conflicts",
    "### Scorecard Reconciliation",
    "### Cross-Cutting Coverage",
    "### Lens Lock And Rerun Decisions",
    "### Recommended Plan Changes",
    "### Unresolved Questions",
    "### Final Assessment"
  ].join("\n\n- None.\n\n");
  assert.deepEqual(check("legacy.md", `${legacy}\n\nReady to implement\n`), []);
  assert.deepEqual(check("legacy-untyped.md", `${legacy}\n\nNeeds revision\n`, { scope_delta: undefined, finding_decisions: decision({}) }), []);
}));

test("every target edit cites a finding or is logged as host-initiated", () => {
  const ledger = example("review-ledger.valid.json");
  const check = (target_edits) => fields(validateLedgerRecord({ ...ledger, target_edits }, { artifactRoot: repoRoot, targetRevision }));
  assert.deepEqual(check([
    { host_initiated: true, decided_by: "human", summary: "Owner reworded the rollback step." },
    { finding_id: "no-material-blockers", decided_by: "human", summary: "Owner applied a minor issue." }
  ]), []);
  assert.deepEqual(check([{ decided_by: "human", summary: "Unattributed edit." }]), ["target_edits[0]"]);
  assert.deepEqual(check([{ finding_id: "no-material-blockers", host_initiated: true, decided_by: "human", summary: "Both." }]), ["target_edits[0]"]);
  assert.deepEqual(check([{ host_initiated: true, decided_by: "policy", summary: "Agent edit." }]), ["target_edits[0].decided_by"]);
  assert.deepEqual(check([{ finding_id: "no-material-blockers", decided_by: "policy", summary: "Minor auto-applied." }]), ["target_edits[0].decided_by"]);
  assert.deepEqual(check([{ host_initiated: true, decided_by: "agent", summary: "" }]), ["target_edits[0].decided_by", "target_edits[0].summary"]);
  assert.deepEqual(check([{ finding_id: "not-a-finding", decided_by: "human", summary: "Unknown finding." }]), ["target_edits[0].finding_id"]);
});

test("policy may apply an accepted blocking finding that names its goal", () => withTempDir((dir) => {
  const ledger = example("review-ledger.valid.json");
  const synthesisPath = repoPath(join(dir, "synthesis.json"));
  const synthesis = {
    ...example("synthesis-output.valid.json"),
    artifact_path: synthesisPath,
    finding_decisions: decision({ finding_id: "goal-gap", change_type: "clarify", serves_goal: "G1" })
  };
  writeFileSync(join(repoRoot, synthesisPath), `${JSON.stringify(synthesis, null, 2)}\n`, "utf8");
  const check = (findingDecisions) => {
    writeFileSync(join(repoRoot, synthesisPath), `${JSON.stringify({ ...synthesis, finding_decisions: findingDecisions }, null, 2)}\n`, "utf8");
    return fields(validateLedgerRecord({
      ...ledger,
      synthesis_record_artifacts: [{ record_id: "synthesis-1", artifact_path: synthesisPath }],
      target_edits: [{ finding_id: "goal-gap", decided_by: "policy", summary: "Auto mode applied a blocking fix." }]
    }, { artifactRoot: repoRoot, targetRevision }));
  };
  assert.deepEqual(check(synthesis.finding_decisions), []);
  assert.deepEqual(check(decision({ finding_id: "goal-gap", change_type: "clarify", serves_goal: null })), ["target_edits[0].decided_by"]);
  assert.deepEqual(check(decision({ finding_id: "goal-gap", decision: "needs_author" })), ["target_edits[0].decided_by"]);
}));
