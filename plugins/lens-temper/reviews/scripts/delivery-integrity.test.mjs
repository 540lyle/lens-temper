import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  archiveRunPath,
  computeArtifactSha,
  isGoalContractReview,
  readJsonFile,
  validateReviewRecord
} from "./validation-helpers.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const examples = join(packageRoot, "reviews", "examples");
const node = process.execPath;
const script = (name) => join(packageRoot, "reviews", "scripts", name);

// A git project outside the package, with the plan committed, as a host would
// have it.
function withProject(run) {
  const project = realpathSync(mkdtempSync(join(tmpdir(), "lens-temper-delivery-")));
  try {
    writeFileSync(join(project, "plan.md"), "# Export Plan\n\nAdd a user-facing export dialog with an error state.\n", "utf8");
    const git = (...args) => execFileSync("git", ["-c", "user.email=test@example.com", "-c", "user.name=Test", ...args], { cwd: project, stdio: "ignore" });
    git("init", "-q");
    git("add", "plan.md");
    git("commit", "-q", "-m", "plan");
    return run(project);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
}

const runIn = (project, name, args) => spawnSync(node, [script(name), ...args], { cwd: project, encoding: "utf8" });
function ok(project, name, args) {
  const result = runIn(project, name, args);
  assert.equal(result.status, 0, `${name} ${args.join(" ")}\n${result.stderr}`);
  return result;
}
const writeJson = (project, path, record) => {
  mkdirSync(dirname(join(project, path)), { recursive: true });
  writeFileSync(join(project, path), `${JSON.stringify(record, null, 2)}\n`, "utf8");
};
const readProjectJson = (project, path) => JSON.parse(readFileSync(join(project, path), "utf8"));

// Prepares a one-lens run, writes the captured review where the README says
// (reviews/<record-id>.json under the run directory), and returns the paths.
function prepareRun(project, passId) {
  ok(project, "run-plan-review.mjs", ["--target", "plan.md", "--pass-id", passId, "--lens", "implementation", "--feature-request", "Let users export their data."]);
  const run = archiveRunPath("plan.md", passId);
  const ledgerPath = `${run}/ledger.json`;
  const ledger = readProjectJson(project, ledgerPath);
  const recordId = `${passId}-implementation-1`;
  const reviewPath = `${run}/reviews/${recordId}.json`;
  const reviewMarkdown = `${run}/reviews/${recordId}.md`;
  mkdirSync(join(project, run, "reviews"), { recursive: true });
  cpSync(join(examples, "artifacts", "review-output.valid-full.md"), join(project, reviewMarkdown));
  const {
    pass_id: _pass, target_path: _path, target_revision: _revision, review_input_revision: _input, template_revision: _template,
    lens_revision: _lens, run_mode: _mode, execution_mode: _execution, markdown_artifact_sha: _sha, ...authored
  } = readJsonFile(join(examples, "review-output.valid-full.json"));
  writeJson(project, reviewPath, {
    ...authored,
    record_id: recordId,
    artifact_path: reviewPath,
    markdown_artifact_path: reviewMarkdown,
    provenance: { input_sources: [{ role: "target", basis: "direct_workspace_read", paths_reviewed: ["plan.md"], target_included: true }] }
  });
  return { run, ledgerPath, ledger, recordId, reviewPath };
}

function writeSynthesis(project, { run, ledger, recordId }, { decisions, deliveredLine }) {
  const synthesisId = `${ledger.pass_id}-synthesis-1`;
  const synthesisPath = `${run}/synthesis/${synthesisId}.json`;
  const markdownPath = `${run}/synthesis/${synthesisId}.md`;
  mkdirSync(join(project, run, "synthesis"), { recursive: true });
  const markdown = readFileSync(join(examples, "artifacts", "synthesis-output.valid.md"), "utf8")
    .replace(/^Review delivered: .*$/m, deliveredLine);
  writeFileSync(join(project, markdownPath), markdown, "utf8");
  const { markdown_artifact_sha: _sha, ...authored } = readJsonFile(join(examples, "synthesis-output.valid.json"));
  writeJson(project, synthesisPath, {
    ...authored,
    record_id: synthesisId,
    pass_id: ledger.pass_id,
    target_path: "plan.md",
    target_revision: ledger.target_revision,
    review_input_revision: ledger.review_input_revision,
    included_review_record_ids: [recordId],
    finding_decisions: decisions.map((entry) => ({ source_lens: "implementation", source_review_record_id: recordId, affects_rerun_scope: false, ...entry })),
    lens_lock_decisions: [{ lens: "implementation", lens_state: "settled", reason: "Current validated review delivered." }],
    final_assessment: decisions.some((entry) => entry.decision === "accepted" && entry.severity !== "minor") ? "Needs revision" : "Ready to implement",
    artifact_path: synthesisPath,
    markdown_artifact_path: markdownPath
  });
  return synthesisPath;
}

const majorGap = { finding_id: "IMP-1", decision: "accepted", severity: "major", change_type: "clarify", serves_goal: "export", reason: "Export fails without an error state." };
const minorIssue = { finding_id: "IMP-2", decision: "accepted", severity: "minor", reason: "Name the retry limit." };
const question = { finding_id: "IMP-3", decision: "needs_author", reason: "Which formats ship first?" };

test("validators lead with the attach-first hint, confirm success, and reject a different file reusing a registered id", () => withProject((project) => {
  const pass = prepareRun(project, "attach");

  // N6: an unattached, unstamped review leads with the attach hint and no
  // "target_path undefined" line.
  const unattached = runIn(project, "validate-review-output.mjs", [pass.reviewPath, "--ledger", pass.ledgerPath]);
  assert.equal(unattached.status, 1);
  assert.match(unattached.stderr.split("\n")[0], /field=record_id .*attach it first with update-ledger\.mjs --ledger \S+ledger\.json --review \S+ --write.* actual=attach-implementation-1 not attached/);
  assert.doesNotMatch(unattached.stderr, /undefined/);

  ok(project, "update-ledger.mjs", ["--ledger", pass.ledgerPath, "--review", pass.reviewPath, "--write", "--quiet"]);
  const entry = readProjectJson(project, pass.ledgerPath).review_record_artifacts[0];
  assert.equal(entry.artifact_sha, computeArtifactSha(project, pass.reviewPath), "attaching registers the record's content hash");

  // Success line, silenced by --quiet.
  assert.match(ok(project, "validate-review-output.mjs", [pass.reviewPath, "--ledger", pass.ledgerPath]).stdout, /^valid review \S+ record=attach-implementation-1 ledger=/);
  assert.equal(ok(project, "validate-review-output.mjs", [pass.reviewPath, "--ledger", pass.ledgerPath, "--quiet"]).stdout, "");
  assert.match(ok(project, "validate-ledger.mjs", [pass.ledgerPath, "--target-revision", pass.ledger.target_revision]).stdout, /^valid ledger \S+ pass=attach/);

  // V2: a copy of the registered review with a different verdict fails; an
  // identical copy is the same record.
  const registered = readProjectJson(project, pass.reviewPath);
  writeJson(project, "probes/same.json", registered);
  ok(project, "validate-review-output.mjs", ["probes/same.json", "--ledger", pass.ledgerPath]);
  writeJson(project, "probes/v2.json", { ...registered, verdict: "High risk" });
  const reused = runIn(project, "validate-review-output.mjs", ["probes/v2.json", "--ledger", pass.ledgerPath]);
  assert.equal(reused.status, 1);
  assert.match(reused.stderr, /field=record_id expected=the review the ledger registered for attach-implementation-1/);

  // Editing the registered file after attachment breaks the ledger's hash.
  writeJson(project, pass.reviewPath, { ...registered, verdict: "High risk" });
  const edited = runIn(project, "validate-ledger.mjs", [pass.ledgerPath, "--target-revision", pass.ledger.target_revision]);
  assert.equal(edited.status, 1);
  assert.match(edited.stderr, /review_record_artifacts\[0\]\.artifact_sha .*changed after it was attached/);
  writeJson(project, pass.reviewPath, registered);
  ok(project, "validate-ledger.mjs", [pass.ledgerPath, "--target-revision", pass.ledger.target_revision]);
}));

test("the Review delivered line is checked against the finding decisions", () => withProject((project) => {
  const pass = prepareRun(project, "delivered");
  ok(project, "update-ledger.mjs", ["--ledger", pass.ledgerPath, "--review", pass.reviewPath, "--write", "--quiet"]);

  // N1: an accepted major under a "0 blocking gaps" headline is refused at
  // attachment, by the synthesis validator, and therefore at finalization.
  const lying = writeSynthesis(project, pass, { decisions: [majorGap], deliveredLine: "Review delivered: 0 blocking gaps, 0 minor issues, 0 questions" });
  const attach = runIn(project, "update-ledger.mjs", ["--ledger", pass.ledgerPath, "--synthesis", lying, "--finalize", "--write"]);
  assert.equal(attach.status, 1);
  assert.match(attach.stderr, /field=markdown\.review_delivered\.blocking_gaps expected=1/);

  // Minor issues and questions may exceed the decisions (reviewer Open
  // Questions live only in the Markdown), never fall short.
  const honest = writeSynthesis(project, pass, { decisions: [majorGap, minorIssue, question], deliveredLine: "Review delivered: 1 blocking gaps, 1 minor issues, 2 questions" });
  ok(project, "update-ledger.mjs", ["--ledger", pass.ledgerPath, "--synthesis", honest, "--finalize", "--write", "--quiet"]);
  assert.match(ok(project, "validate-synthesis-output.mjs", [honest, "--ledger", pass.ledgerPath]).stdout, /^valid synthesis /);

  ok(project, "emit-completion-summary.mjs", ["--ledger", pass.ledgerPath, "--synthesis", honest, "--out", `${pass.run}/final.md`, "--quiet"]);
  const final = readFileSync(join(project, pass.run, "final.md"), "utf8");
  assert.match(final, /^Review delivered: 1 blocking gaps, 1 minor issues, 2 questions$/m);
  // N2: artifact status and reviewer-closure evidence, as the README requires.
  assert.match(final, /^Artifact status: reviews\/archive\/\S+: not committed \(untracked; commit it or keep it local-only\)$/m);
  assert.match(final, /^Verification evidence: reviewer outputs captured: 1\/1 selected lenses; reviewers terminal and closed: 1\/1 spawned reviewers completed, captured, and closed; current reviewers read current workspace files directly: 1\/1 read plan\.md at /m);

  const summaryPath = `${pass.run}/completion-summary.json`;
  ok(project, "emit-completion-summary.mjs", ["--ledger", pass.ledgerPath, "--synthesis", honest, "--out", summaryPath, "--quiet"]);
  assert.match(ok(project, "validate-completion-summary.mjs", [summaryPath, "--ledger", pass.ledgerPath]).stdout, /^valid completion summary /);
  const summary = readProjectJson(project, summaryPath);
  assert.deepEqual(summary.delivered, { blocking_gaps: 1, minor_issues: 1, questions: 2 });
  const tampered = {
    ...summary,
    delivered: { blocking_gaps: 0, minor_issues: 1, questions: 2 },
    summary_text: summary.summary_text.replace(/^Review delivered: 1 blocking gaps/m, "Review delivered: 0 blocking gaps")
  };
  writeJson(project, summaryPath, tampered);
  const claim = runIn(project, "validate-completion-summary.mjs", [summaryPath, "--ledger", pass.ledgerPath]);
  assert.equal(claim.status, 1);
  assert.match(claim.stderr, /field=review_delivered\.blocking_gaps expected=1/);
  writeJson(project, summaryPath, { ...summary, delivered: { ...summary.delivered, questions: 5 } });
  assert.match(runIn(project, "validate-completion-summary.mjs", [summaryPath, "--ledger", pass.ledgerPath]).stderr, /field=summary_text\.review_delivered/);

  // Committed artifacts report as committed.
  execFileSync("git", ["-c", "user.email=test@example.com", "-c", "user.name=Test", "add", "-A"], { cwd: project });
  execFileSync("git", ["-c", "user.email=test@example.com", "-c", "user.name=Test", "commit", "-q", "-m", "run"], { cwd: project });
  const committed = ok(project, "emit-completion-summary.mjs", ["--ledger", pass.ledgerPath, "--synthesis", honest]).stdout;
  assert.match(committed, /^Artifact status: reviews\/archive\/\S+: committed$/m);
}));

test("archiving moves captured records into place and leaves no validating orphan", () => withProject((project) => {
  const pass = prepareRun(project, "orphans");
  // A host that captured the review under its own name inside the run directory.
  const captured = `${pass.run}/implementation.review.json`;
  const record = readProjectJson(project, pass.reviewPath);
  writeJson(project, captured, { ...record, artifact_path: captured });
  rmSync(join(project, pass.reviewPath));
  ok(project, "update-ledger.mjs", ["--ledger", pass.ledgerPath, "--review", captured, "--write", "--quiet"]);
  const stamped = readProjectJson(project, captured);
  const synthesis = writeSynthesis(project, pass, { decisions: [minorIssue], deliveredLine: "Review delivered: 0 blocking gaps, 1 minor issues, 0 questions" });
  ok(project, "update-ledger.mjs", ["--ledger", pass.ledgerPath, "--synthesis", synthesis, "--finalize", "--write", "--quiet"]);

  assert.match(ok(project, "archive-review-run.mjs", ["--ledger", pass.ledgerPath]).stdout, /moved=1 captured record file/);
  assert.equal(existsSync(join(project, captured)), false, "the captured copy is moved, not duplicated");
  const ledger = readProjectJson(project, pass.ledgerPath);
  assert.equal(ledger.review_record_artifacts[0].artifact_path, pass.reviewPath);
  assert.equal(ledger.review_record_artifacts[0].artifact_sha, computeArtifactSha(project, pass.reviewPath));
  ok(project, "validate-ledger.mjs", [pass.ledgerPath, "--target-revision", ledger.target_revision, "--audit"]);
  ok(project, "validate-review-output.mjs", [pass.reviewPath, "--ledger", pass.ledgerPath]);

  // A stale copy that a host kept elsewhere no longer validates as current.
  writeJson(project, "probes/stale.json", stamped);
  const stale = runIn(project, "validate-review-output.mjs", ["probes/stale.json", "--ledger", pass.ledgerPath]);
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /the review the ledger registered for orphans-implementation-1/);
}));

test("target edits: dry runs say to pass --write, mistaken records are removable, and the stale message explains the edit", () => withProject((project) => {
  const pass = prepareRun(project, "edits");
  ok(project, "update-ledger.mjs", ["--ledger", pass.ledgerPath, "--review", pass.reviewPath, "--write", "--quiet"]);
  const synthesis = writeSynthesis(project, pass, { decisions: [majorGap, minorIssue], deliveredLine: "Review delivered: 1 blocking gaps, 1 minor issues, 0 questions" });
  ok(project, "update-ledger.mjs", ["--ledger", pass.ledgerPath, "--synthesis", synthesis, "--finalize", "--write", "--quiet"]);
  const update = (args) => runIn(project, "update-ledger.mjs", ["--ledger", pass.ledgerPath, ...args]);
  const edits = () => readProjectJson(project, pass.ledgerPath).target_edits;

  // N4: a dry run writes nothing and says so.
  const dry = update(["--applied", "IMP-1", "--summary", "Added the error state."]);
  assert.equal(dry.status, 0);
  assert.match(dry.stderr, /dry run: \S+ not written; would record target_edits\[0\] .*\(pass --write to save\)/);
  assert.equal(edits(), undefined);

  assert.match(update(["--applied", "IMP-1", "--summary", "Added the error state.", "--write"]).stdout, /updated \S+: target_edits\[0\]/);
  update(["--applied", "IMP-2", "--summary", "Applied by mistake.", "--write"]);
  ok(project, "decide-reruns.mjs", ["--ledger", pass.ledgerPath, "--write", "--quiet"]);
  assert.equal(update(["--remove-edit", "7", "--write"]).status, 2);
  assert.match(update(["--remove-edit", "IMP-9", "--write"]).stderr, /no target_edits entry applies that finding; recorded: 0=IMP-1, 1=IMP-2/);
  assert.equal(update(["--remove-edit", "IMP-2", "--summary", "x", "--write"]).status, 2, "removal takes no other edit option");
  const removed = update(["--remove-edit", "IMP-2", "--write"]);
  assert.equal(removed.status, 0, removed.stderr);
  assert.match(removed.stdout, /removal of target_edits\[1\] .*cleared rerun_decisions/);
  assert.deepEqual(edits().map((edit) => edit.finding_id), ["IMP-1"]);
  assert.equal(readProjectJson(project, pass.ledgerPath).rerun_decisions, undefined);
  ok(project, "update-ledger.mjs", ["--ledger", pass.ledgerPath, "--remove-edit", "0", "--write", "--quiet"]);
  assert.equal(edits(), undefined);

  // N5: after an edit, validating at the current revision explains why.
  update(["--applied", "IMP-1", "--summary", "Added the error state.", "--write"]);
  writeFileSync(join(project, "plan.md"), "# Export Plan\n\nAdd a user-facing export dialog with an error state and a retry.\n", "utf8");
  const current = execFileSync(node, [script("hash-review-target.mjs"), "plan.md"], { cwd: project, encoding: "utf8" }).trim();
  const stale = runIn(project, "validate-ledger.mjs", [pass.ledgerPath, "--target-revision", current]);
  assert.equal(stale.status, 4);
  assert.match(stale.stderr, new RegExp(`the target was edited after delivery \\(1 target_edits recorded\\); .*validate it with --target-revision ${pass.ledger.target_revision}`));
}));

test("decide-reruns refuses to reopen a lens a single-lens run never reviewed and labels one outside a ledger's pass", () => withProject((project) => {
  const single = runIn(project, "decide-reruns.mjs", ["--lens", "product-ux", "--reopen", "architecture"]);
  assert.equal(single.status, 2);
  assert.match(single.stderr, /--reopen architecture names a lens this run never reviewed \(reviewed: product-ux\)/);
  assert.equal(ok(project, "decide-reruns.mjs", ["--lens", "product-ux", "--reopen", "product-ux"]).status, 0);

  const pass = prepareRun(project, "reopen");
  const decisions = JSON.parse(ok(project, "decide-reruns.mjs", ["--ledger", pass.ledgerPath, "--reopen", "architecture"]).stdout).decisions;
  const architecture = decisions.find((entry) => entry.lens === "architecture");
  assert.equal(architecture.reviewed_in_pass, false);
  assert.match(architecture.reason, /not reviewed in pass reopen/);
}));

test("review Markdown under the goal-anchored contract needs the Goal Gate and Goal Fit sections", () => withProject((project) => {
  const markdown = readFileSync(join(examples, "artifacts", "review-output.valid-full.md"), "utf8")
    .replace(/^### Goal Gate\n[\s\S]*?(?=^### )/m, "")
    .replace(/^### Goal Fit \/ Recommended Removals\n[\s\S]*?(?=^### )/m, "");
  writeFileSync(join(project, "review.md"), markdown, "utf8");
  const base = {
    ...readJsonFile(join(examples, "review-output.valid-full.json")),
    target_path: "plan.md",
    markdown_artifact_path: "review.md",
    markdown_artifact_sha: computeArtifactSha(project, "review.md"),
    provenance: { input_sources: [{ role: "target", basis: "direct_workspace_read", paths_reviewed: ["plan.md"], target_included: true }] }
  };
  const sections = (record) => validateReviewRecord(record, { artifactRoot: project }).filter((failure) => failure.field === "markdown_section").map((failure) => failure.expected);
  const goalSections = ["### Goal Gate", "### Goal Fit / Recommended Removals"];
  assert.deepEqual(sections(base), goalSections, "a review recording goal_fit is under the current contract");
  const { blocking: _blocking, goal_fit: _goalFit, ...legacy } = base;
  assert.equal(isGoalContractReview(legacy), false);
  assert.deepEqual(sections(legacy), [], "a review written before the goal contract keeps the older sections");
  const currentTemplate = computeArtifactSha(packageRoot, "reviews/reviewer-template.md");
  assert.deepEqual(sections({ ...legacy, template_revision: currentTemplate }), goalSections, "a review stamped with the current template is under the current contract");
}));

test("a closed output pipe does not crash a script", () => {
  const program = `import { ensureNode18 } from ${JSON.stringify(script("validation-helpers.mjs"))};
ensureNode18();
const line = "x".repeat(65536) + "\\n";
for (let i = 0; i < 64; i += 1) process.stdout.write(line);`;
  const result = spawnSync("bash", ["-c", `set -o pipefail; "${node}" --input-type=module -e '${program.replace(/'/g, "'\\''")}' | head -c 1 >/dev/null`], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /EPIPE|Error/);
});
