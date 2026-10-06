import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  deriveRerunDecisions,
  lensStateOf,
  readJsonFile,
  validateReviewRecord,
  validateSynthesisRecord
} from "./validation-helpers.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const archiveRoot = join(repoRoot, "reviews", "archive");
const targetRevision = "git:73eaed921475be235f6684abdd2ce19a4e367c7f";
const example = (name) => readJsonFile(join(repoRoot, "reviews", "examples", name));
const fields = (failures) => failures.map((failure) => failure.field);

function repoPath(path) {
  return relative(repoRoot, path).replace(/\\/g, "/");
}

function withTempDir(run) {
  mkdirSync(archiveRoot, { recursive: true });
  const dir = mkdtempSync(join(archiveRoot, "lens-state-test-"));
  try {
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function writeJson(path, record) {
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, "utf8");
}

function decideReruns(args) {
  return spawnSync(process.execPath, ["reviews/scripts/decide-reruns.mjs", ...args, "--json"], { cwd: repoRoot, encoding: "utf8" });
}

function decisionsOf(result) {
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function finding(changes) {
  return {
    source_review_record_id: "review-implementation-1",
    decision: "accepted",
    severity: "major",
    affects_rerun_scope: true,
    change_type: "clarify",
    serves_goal: "G1",
    reason: "Fixture decision.",
    ...changes
  };
}

test("legacy lock states map onto open and settled", () => {
  assert.equal(lensStateOf({ lock_state: "passing_locked", rerun_needed: false }), "settled");
  assert.equal(lensStateOf({ lock_state: "converged_locked", rerun_needed: true }), "settled");
  assert.equal(lensStateOf({ lock_state: "not_affected", rerun_needed: false }), "settled");
  assert.equal(lensStateOf({ lock_state: "rerun_required", rerun_needed: true }), "open");
  assert.equal(lensStateOf({ lock_state: "failing", rerun_needed: false }), "settled");
  assert.equal(lensStateOf({ lock_state: "error", rerun_needed: true }), "open");
  assert.equal(lensStateOf({ lens_state: "open" }), "open");
});

test("synthesis lens decisions use lens_state, and legacy lock_state records stay valid", () => {
  const synthesis = example("synthesis-output.valid.json");
  const check = (lens_lock_decisions) => fields(validateSynthesisRecord({ ...synthesis, lens_lock_decisions }, { artifactRoot: repoRoot, targetRevision }));
  assert.deepEqual(check([{ lens: "implementation", lens_state: "settled", reason: "Delivered." }]), []);
  assert.deepEqual(check([{ lens: "implementation", lens_state: "open", rerun_needed: true, reason: "Reviewer errored." }]), []);
  assert.deepEqual(check([{ lens: "implementation", lock_state: "converged_locked", rerun_needed: false, reason: "Legacy." }]), []);
  assert.deepEqual(check([{ lens: "implementation", lens_state: "locked", reason: "x" }]), ["lens_lock_decisions[0].lens_state"]);
  assert.deepEqual(check([{ lens: "implementation", reason: "No state." }]), ["lens_lock_decisions[0].lens_state"]);
  assert.deepEqual(check([{ lens: "implementation", lens_state: "settled", rerun_needed: true, reason: "x" }]), ["lens_lock_decisions[0].rerun_needed"]);
  assert.deepEqual(check([{ lens: "implementation", lens_state: "open", lock_state: "passing_locked", rerun_needed: false, reason: "x" }]), ["lens_lock_decisions[0].lens_state"]);
});

test("a settled lens in a full run needs a current review, but not perfect scores", () => {
  const ledger = example("review-ledger.valid.json");
  const synthesis = example("synthesis-output.valid.json");
  const check = (lens_lock_decisions) => fields(validateSynthesisRecord({ ...synthesis, lens_lock_decisions }, { artifactRoot: repoRoot, targetRevision, ledger }));
  assert.deepEqual(check([{ lens: "implementation", lens_state: "settled", reason: "Delivered." }]), []);
  assert.deepEqual(check([{ lens: "risk", lens_state: "settled", reason: "No review." }]), ["lens_lock_decisions.risk.source_review"]);
  assert.deepEqual(check([{ lens: "risk", lens_state: "open", reason: "No review yet." }]), []);
});

test("lens verdicts record blocking and goal fit for a single review without a ledger", () => {
  const review = example("review-output.valid-full.json");
  const check = (changes) => fields(validateReviewRecord({ ...review, ...changes }, { artifactRoot: repoRoot, targetRevision }));
  assert.deepEqual(check({}), []);
  const { blocking: _blocking, goal_fit: _goalFit, ...legacy } = review;
  assert.deepEqual(fields(validateReviewRecord(legacy, { artifactRoot: repoRoot, targetRevision })), []);
  assert.deepEqual(check({ goal_fit: "at_risk" }), []);
  assert.deepEqual(check({ blocking: "yes" }), ["blocking", "goal_fit"]);
  assert.deepEqual(check({ blocking: "maybe", goal_fit: "fine" }), ["blocking", "goal_fit"]);
  const blocked = { material_blockers: { present: true, summary: "Goal G1 fails without a backfill.", count: 1 } };
  assert.deepEqual(check({ ...blocked, blocking: "yes", goal_fit: "violated" }), []);
  assert.deepEqual(check({ ...blocked, blocking: "yes", goal_fit: "ok" }), ["goal_fit"]);
});

test("affected lenses are unique registry lens ids, including lenses outside the pass", () => {
  const ledger = example("review-ledger.valid.json");
  const synthesis = example("synthesis-output.valid.json");
  const check = (affected_lenses) => fields(validateSynthesisRecord({
    ...synthesis,
    finding_decisions: [{ ...synthesis.finding_decisions[0], affected_lenses }]
  }, { artifactRoot: repoRoot, targetRevision, ledger }));
  assert.deepEqual(check(["risk"]), []);
  assert.deepEqual(check(["risk", "risk"]), ["finding_decisions[0].affected_lenses"]);
  assert.deepEqual(check("risk"), ["finding_decisions[0].affected_lenses"]);
  assert.deepEqual(check(["not-a-lens"]), ["finding_decisions[0].affected_lenses"]);
});

test("affects_rerun_scope is legacy and optional; reruns no longer read it", () => {
  const synthesis = example("synthesis-output.valid.json");
  const { affects_rerun_scope: _legacy, ...current } = synthesis.finding_decisions[0];
  const check = (decision) => fields(validateSynthesisRecord({ ...synthesis, finding_decisions: [decision] }, { artifactRoot: repoRoot, targetRevision }));
  assert.deepEqual(check(current), []);
  assert.deepEqual(check({ ...current, affects_rerun_scope: true }), []);
  assert.deepEqual(check({ ...current, affects_rerun_scope: "yes" }), ["finding_decisions[0].affects_rerun_scope"]);
});

test("reruns follow applied findings and user reopens, never target edits alone", () => {
  const lenses = ["implementation", "risk", "product-ux", "security"];
  const findings = new Map([
    ["impl-gap", { source_lens: "implementation", affected_lenses: ["risk"] }],
    ["pux-gap", { source_lens: "product-ux" }]
  ]);
  const lensEntries = [
    { lens: "implementation", lens_state: "settled", reason: "Delivered." },
    { lens: "risk", lock_state: "passing_locked", rerun_needed: false, reason: "Legacy lock." },
    { lens: "product-ux", lens_state: "settled", reason: "Delivered." },
    { lens: "security", lens_state: "open", reason: "Reviewer errored." }
  ];
  const decide = (applied, reopen = []) => Object.fromEntries(deriveRerunDecisions({ lenses, lensEntries, findings, applied, reopen })
    .map((entry) => [entry.lens, entry.lens_state]));
  assert.deepEqual(decide([]), { implementation: "settled", risk: "settled", "product-ux": "settled", security: "open" });
  assert.deepEqual(decide(["impl-gap"]), { implementation: "open", risk: "open", "product-ux": "settled", security: "open" });
  assert.deepEqual(decide([], ["product-ux"]), { implementation: "settled", risk: "settled", "product-ux": "open", security: "open" });
  // A lens settled in an earlier pass of the lineage is added when reopened.
  assert.deepEqual(decide([], ["natty"]), { implementation: "settled", risk: "settled", "product-ux": "settled", security: "open", natty: "open" });
  const outsidePass = deriveRerunDecisions({ lenses: ["risk"], findings: new Map([["risk-gap", { source_lens: "risk", affected_lenses: ["data-model"] }]]), applied: ["risk-gap"] });
  assert.deepEqual(outsidePass.map((entry) => [entry.lens, entry.lens_state]), [["risk", "open"], ["data-model", "open"]]);
  assert.throws(() => decide(["unknown"]), /no synthesis decision/);
  const [single] = deriveRerunDecisions({ lenses: ["product-ux"], applied: ["any-finding"] });
  assert.deepEqual(single, { lens: "product-ux", lens_state: "open", rerun_needed: true, reason: "own finding any-finding was applied" });
});

test("decide-reruns works for one lens without a ledger", () => {
  const settled = decisionsOf(decideReruns(["--lens", "product-ux"]));
  assert.deepEqual(settled.decisions.map((entry) => entry.lens_state), ["settled"]);
  assert.equal(settled.next_pass, undefined);
  const applied = decisionsOf(decideReruns(["--lens", "product-ux", "--applied", "pux-copy"]));
  assert.equal(applied.decisions[0].lens_state, "open");
  assert.match(applied.decisions[0].reason, /own finding pux-copy/);
  assert.deepEqual(applied.next_pass, { pass_index: 2, human_approval_required: false });
  const reopened = decisionsOf(decideReruns(["--lens", "product-ux", "--reopen", "product-ux"]));
  assert.equal(reopened.decisions[0].reason, "reopened by the user");

  const changedDomains = decideReruns(["--lens", "product-ux", "--changed-domains", "product-ux"]);
  assert.equal(changedDomains.status, 2);
  assert.match(changedDomains.stderr, /unsupported option --changed-domains/);
  assert.equal(decideReruns(["--lens", "not-a-lens"]).status, 2);
  assert.equal(decideReruns(["--lens", "product-ux", "--reopen", "not-a-lens"]).status, 2);
  assert.equal(decideReruns(["--lens", "product-ux", "--write"]).status, 2);
});

test("decide-reruns reads applied findings from the ledger's target edits", () => withTempDir((dir) => {
  const synthesisPath = repoPath(join(dir, "synthesis.json"));
  const ledgerPath = repoPath(join(dir, "ledger.json"));
  writeJson(join(repoRoot, synthesisPath), {
    ...example("synthesis-output.valid.json"),
    artifact_path: synthesisPath,
    finding_decisions: [
      finding({ finding_id: "impl-gap", source_lens: "implementation", affected_lenses: ["risk"] }),
      finding({ finding_id: "pux-question", source_lens: "product-ux", decision: "needs_author", change_type: undefined })
    ],
    lens_lock_decisions: ["implementation", "risk", "product-ux"].map((lens) => ({ lens, lens_state: "settled", reason: "Delivered." }))
  });
  const ledger = {
    ...example("review-ledger.valid.json"),
    selected_lenses: ["implementation", "risk", "product-ux"],
    synthesis_record_artifacts: [{ record_id: "synthesis-1", artifact_path: synthesisPath }],
    target_edits: [{ host_initiated: true, decided_by: "human", summary: "Owner fixed a typo." }]
  };
  writeJson(join(repoRoot, ledgerPath), ledger);
  const hostOnly = decisionsOf(decideReruns(["--ledger", ledgerPath]));
  assert.deepEqual(hostOnly.decisions.map((entry) => entry.lens_state), ["settled", "settled", "settled"]);

  ledger.target_edits.push({ finding_id: "impl-gap", decided_by: "human", summary: "Owner applied the blocking fix." });
  writeJson(join(repoRoot, ledgerPath), ledger);
  const applied = decisionsOf(decideReruns(["--ledger", ledgerPath]));
  assert.deepEqual(applied.decisions.map((entry) => [entry.lens, entry.lens_state]), [["implementation", "open"], ["risk", "open"], ["product-ux", "settled"]]);
  assert.match(applied.decisions[1].reason, /impl-gap from implementation names this lens as affected/);
  assert.deepEqual(applied.next_pass, { pass_index: 2, parent_pass_id: "example-pass", human_approval_required: false });

  writeJson(join(repoRoot, ledgerPath), { ...ledger, pass_index: 2, parent_pass_id: "example-pass-0", parent_intent_revision: "none" });
  assert.equal(decisionsOf(decideReruns(["--ledger", ledgerPath])).next_pass.human_approval_required, true);

  const withApplied = decideReruns(["--ledger", ledgerPath, "--applied", "impl-gap"]);
  assert.equal(withApplied.status, 2);
  assert.match(withApplied.stderr, /target_edits/);

  execFileSync(process.execPath, ["reviews/scripts/decide-reruns.mjs", "--ledger", ledgerPath, "--write", "--quiet"], { cwd: repoRoot });
  const written = readJsonFile(join(repoRoot, ledgerPath));
  assert.deepEqual(written.rerun_decisions.filter((entry) => entry.rerun_needed).map((entry) => entry.lens), ["implementation", "risk"]);
}));

test("without a synthesis, a ledger lens is settled once it has a current review", () => withTempDir((dir) => {
  const ledgerPath = repoPath(join(dir, "ledger.json"));
  writeJson(join(repoRoot, ledgerPath), {
    ...example("review-ledger.valid.json"),
    selected_lenses: ["implementation", "risk"],
    synthesis_record_ids: [],
    synthesis_record_artifacts: []
  });
  const result = decisionsOf(decideReruns(["--ledger", ledgerPath]));
  assert.deepEqual(result.decisions.map((entry) => [entry.lens, entry.lens_state]), [["implementation", "settled"], ["risk", "open"]]);
}));
