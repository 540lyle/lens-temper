import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { archiveRunPath } from "./validation-helpers.mjs";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const node = process.execPath;
const script = (name) => join(packageRoot, "reviews", "scripts", name);

function withProject(run) {
  const project = realpathSync(mkdtempSync(join(tmpdir(), "lens-temper-project-")));
  assert.equal(relative(packageRoot, project).startsWith(".."), true, "project must sit outside the package");
  try {
    return run(project);
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
}

function inProject(project, name, args) {
  return execFileSync(node, [script(name), ...args], { cwd: project, encoding: "utf8" });
}

test("scripts review, hash, rerun-decide, and archive a plan in a project outside the package", () => withProject((project) => {
  writeFileSync(join(project, "plan.md"), "# Export Plan\n\nAdd a user-facing export dialog with an error state.\n", "utf8");
  const packageArchive = join(packageRoot, "reviews", "archive");

  // Default root is the current directory.
  inProject(project, "run-plan-review.mjs", [
    "--target", "plan.md",
    "--pass-id", "outside-pass",
    "--lens", "product-ux",
    "--feature-request", "Let users export their data."
  ]);
  // The default run directory is the pass's dated archive directory.
  const run = archiveRunPath("plan.md", "outside-pass");
  const runLedger = `${run}/ledger.json`;
  const runDir = join(project, run);
  const ledger = JSON.parse(readFileSync(join(runDir, "ledger.json"), "utf8"));
  assert.equal(ledger.target_path, "plan.md");
  assert.equal(ledger.review_input_path, `${run}/review-input.json`);
  assert.deepEqual(ledger.archive_paths, [run]);
  assert.deepEqual(ledger.selected_lenses, ["product-ux"]);
  assert.equal(ledger.apply_mode, "interactive");
  const packet = readFileSync(join(runDir, "product-ux.prompt.md"), "utf8");
  assert.match(packet, /Add a user-facing export dialog/);
  assert.match(packet, /## Goal Gate/);
  assert.match(readFileSync(join(runDir, "product-ux.spawn.md"), "utf8"), /relative to the LensTemper package, not this project/);

  // An explicit --root from another working directory resolves the same files.
  const hash = execFileSync(node, [script("hash-review-target.mjs"), "plan.md", "--root", project], { cwd: packageRoot, encoding: "utf8" }).trim();
  assert.equal(hash, ledger.target_revision);
  inProject(project, "validate-ledger.mjs", [runLedger, "--target-revision", hash]);

  const decisions = JSON.parse(execFileSync(node, [
    script("decide-reruns.mjs"),
    "--ledger", runLedger,
    "--root", project,
    "--json"
  ], { cwd: packageRoot, encoding: "utf8" }));
  assert.deepEqual(decisions.decisions.map((entry) => [entry.lens, entry.lens_state]), [["product-ux", "open"]]);

  assert.match(inProject(project, "run-synthesis.mjs", ["--ledger", runLedger]), /Add a user-facing export dialog/);

  // Archives land under the project, and an edited target no longer blocks them.
  // Synthesis still refuses, because it hands the target text to a model.
  writeFileSync(join(project, "plan.md"), "# Export Plan\n\nEdited after delivery.\n", "utf8");
  const synthesis = spawnSync(node, [script("run-synthesis.mjs"), "--ledger", runLedger], { cwd: project, encoding: "utf8" });
  assert.notEqual(synthesis.status, 0);
  assert.match(synthesis.stderr, /field=target_revision/);
  const archived = inProject(project, "archive-review-run.mjs", ["--ledger", runLedger]);
  assert.equal(archived.match(/archived (\S+)/)[1], run, "archiving completes the run directory in place");
  assert.deepEqual(readdirSync(join(project, "reviews", "archive")), [basename(run)], "the pass keeps one run directory and one ledger");
  assert.match(readFileSync(join(runDir, "product-ux.prompt.md"), "utf8"), /Add a user-facing export dialog/, "prompt packets stay in the archive");
  const stale = spawnSync(node, [script("validate-ledger.mjs"), runLedger, "--target-revision", inProject(project, "hash-review-target.mjs", ["plan.md"]).trim()], { cwd: project, encoding: "utf8" });
  assert.equal(stale.status, 4, "an explicit current revision still reports the edit");

  const packageRuns = existsSync(packageArchive) ? readdirSync(packageArchive).filter((name) => name.includes("outside-pass")) : [];
  assert.deepEqual(packageRuns, [], "nothing from the project run lands in the package archive");
}));

test("an edit after delivery stales no completed review; only synthesis needs the reviewed text", () => withProject((project) => {
  cpSync(join(packageRoot, "reviews", "examples"), join(project, "reviews", "examples"), { recursive: true });
  const ledger = "reviews/examples/review-ledger.valid-detached-completed.json";
  const synthesis = "reviews/examples/synthesis-output.valid-detached.json";
  const review = "reviews/examples/review-output.valid-detached.json";
  appendFileSync(join(project, "reviews", "examples", "artifacts", "target.valid.md"), "\nApplied an accepted finding after delivery.\n", "utf8");

  inProject(project, "validate-review-output.mjs", [review, "--ledger", ledger]);
  inProject(project, "validate-synthesis-output.mjs", [synthesis, "--ledger", ledger]);
  const summary = JSON.parse(inProject(project, "emit-completion-summary.mjs", ["--ledger", ledger, "--synthesis", synthesis, "--json"]));
  assert.deepEqual(summary.rerun_or_lock_status.map((entry) => [entry.lens, entry.lens_state]), [["implementation", "settled"]]);
  const decisions = JSON.parse(inProject(project, "decide-reruns.mjs", ["--ledger", ledger, "--json"]));
  assert.deepEqual(decisions.decisions.map((entry) => entry.lens_state), ["settled"], "an edit alone reopens nothing");

  const rerunSynthesis = spawnSync(node, [script("run-synthesis.mjs"), "--ledger", ledger], { cwd: project, encoding: "utf8" });
  assert.notEqual(rerunSynthesis.status, 0);
  assert.match(rerunSynthesis.stderr, /field=target_revision/);
}));

test("a missing target is a usage error that names the root it resolved against", () => withProject((project) => {
  const result = spawnSync(node, [script("hash-review-target.mjs"), "docs/plan.md"], { cwd: project, encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /--root <path>/, "the usage line on error lists --root");
  assert.ok(result.stderr.includes(`not found: docs/plan.md (resolved against ${project}`));
  const fixtures = spawnSync(node, [script("validate-review-fixtures.mjs"), "--root", project], { cwd: project, encoding: "utf8" });
  assert.equal(fixtures.status, 2, "package fixture validation does not pretend to check a project run");
  assert.match(fixtures.stderr, /package's own fixtures/);
}));

test("a target outside the project root is refused", () => withProject((project) => {
  const result = spawnSync(node, [script("hash-review-target.mjs"), join(packageRoot, "README.md"), "--root", project], { cwd: project, encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /under the project root/);
}));

test("a pass keeps one ledger from preparation through archive, edit log, and rerun", () => withProject((project) => {
  const examples = join(packageRoot, "reviews", "examples");
  writeFileSync(join(project, "plan.md"), "# Export Plan\n\nAdd a user-facing export dialog with an error state.\n", "utf8");
  inProject(project, "run-plan-review.mjs", ["--target", "plan.md", "--pass-id", "one-ledger", "--lens", "implementation", "--feature-request", "Let users export their data."]);
  const run = archiveRunPath("plan.md", "one-ledger");
  const ledgerPath = `${run}/ledger.json`;
  const readLedger = () => JSON.parse(readFileSync(join(project, ledgerPath), "utf8"));
  const ledger = readLedger();
  const writeJson = (path, record) => writeFileSync(join(project, path), `${JSON.stringify(record, null, 2)}\n`, "utf8");
  const copyMarkdown = (name) => {
    cpSync(join(examples, "artifacts", name), join(project, run, name));
    return { markdown_artifact_path: `${run}/${name}`, markdown_artifact_sha: inProject(project, "hash-review-target.mjs", [`${run}/${name}`]).trim() };
  };

  const reviewPath = `${run}/implementation.review.json`;
  const review = {
    ...JSON.parse(readFileSync(join(examples, "review-output.valid-full.json"), "utf8")),
    record_id: "one-ledger-implementation-1",
    pass_id: "one-ledger",
    target_path: "plan.md",
    target_revision: ledger.target_revision,
    review_input_revision: ledger.review_input_revision,
    artifact_path: reviewPath,
    ...copyMarkdown("review-output.valid-full.md"),
    provenance: { input_sources: [{ role: "target", basis: "direct_workspace_read", paths_reviewed: ["plan.md"], target_included: true }] }
  };
  writeJson(reviewPath, review);
  // A review is attached to the ledger before it validates against it.
  const unattached = spawnSync(node, [script("validate-review-output.mjs"), reviewPath, "--ledger", ledgerPath], { cwd: project, encoding: "utf8" });
  assert.equal(unattached.status, 1);
  assert.match(unattached.stderr, /attach it first with update-ledger\.mjs/);
  inProject(project, "update-ledger.mjs", ["--ledger", ledgerPath, "--review", reviewPath, "--write"]);
  inProject(project, "validate-review-output.mjs", [reviewPath, "--ledger", ledgerPath]);

  const synthesisPath = `${run}/synthesis.json`;
  writeJson(synthesisPath, {
    ...JSON.parse(readFileSync(join(examples, "synthesis-output.valid.json"), "utf8")),
    record_id: "one-ledger-synthesis-1",
    pass_id: "one-ledger",
    target_path: "plan.md",
    target_revision: ledger.target_revision,
    review_input_revision: ledger.review_input_revision,
    included_review_record_ids: [review.record_id],
    finding_decisions: [{ finding_id: "IMP-1", source_lens: "implementation", source_review_record_id: review.record_id, decision: "accepted", severity: "minor", reason: "Keep fixture and schema validation in lockstep." }],
    lens_lock_decisions: [{ lens: "implementation", lens_state: "settled", reason: "Current validated review delivered." }],
    artifact_path: synthesisPath,
    ...copyMarkdown("synthesis-output.valid.md")
  });
  inProject(project, "update-ledger.mjs", ["--ledger", ledgerPath, "--synthesis", synthesisPath, "--finalize", "--write"]);
  inProject(project, "emit-completion-summary.mjs", ["--ledger", ledgerPath, "--synthesis", synthesisPath, "--out", `${run}/final.md`]);
  assert.match(readFileSync(join(project, run, "final.md"), "utf8"), /^Review delivered: 0 blocking gaps, 1 minor issues, 0 questions$/m);

  // Archiving completes the run directory in place: one ledger for the pass.
  assert.equal(inProject(project, "archive-review-run.mjs", ["--ledger", ledgerPath, "--final", `${run}/final.md`]).match(/archived (\S+)/)[1], run);
  assert.deepEqual(readdirSync(join(project, "reviews", "archive")), [basename(run)]);
  inProject(project, "validate-ledger.mjs", [ledgerPath, "--target-revision", ledger.target_revision]);

  // The owner applies the finding; the edit is logged on the same ledger.
  writeFileSync(join(project, "plan.md"), "# Export Plan\n\nAdd a user-facing export dialog with an error state and a retry.\n", "utf8");
  const updateLedger = (args) => spawnSync(node, [script("update-ledger.mjs"), "--ledger", ledgerPath, ...args], { cwd: project, encoding: "utf8" });
  assert.equal(updateLedger(["--applied", "IMP-1", "--write"]).status, 2, "an edit needs a summary");
  assert.equal(updateLedger(["--applied", "IMP-9", "--summary", "Unknown finding.", "--write"]).status, 1);
  assert.equal(updateLedger(["--applied", "IMP-1", "--decided-by", "policy", "--summary", "Interactive runs apply nothing by policy.", "--write"]).status, 1);
  assert.equal(updateLedger(["--applied", "IMP-1", "--summary", "Owner added a retry to the error state.", "--write"]).status, 0);
  assert.equal(updateLedger(["--host-initiated", "--summary", "Owner fixed a typo.", "--write"]).status, 0);
  assert.deepEqual(readLedger().target_edits, [
    { finding_id: "IMP-1", decided_by: "human", summary: "Owner added a retry to the error state." },
    { host_initiated: true, decided_by: "human", summary: "Owner fixed a typo." }
  ]);

  inProject(project, "decide-reruns.mjs", ["--ledger", ledgerPath, "--write"]);
  assert.deepEqual(readLedger().rerun_decisions.map((entry) => [entry.lens, entry.lens_state]), [["implementation", "open"]]);
  inProject(project, "run-plan-review.mjs", ["--target", "plan.md", "--pass-id", "one-ledger-2", "--feature-request", "Let users export their data.", "--parent-ledger", ledgerPath]);
  const rerun = JSON.parse(readFileSync(join(project, archiveRunPath("plan.md", "one-ledger-2"), "ledger.json"), "utf8"));
  assert.equal(rerun.pass_index, 2);
  assert.deepEqual(rerun.selected_lenses, ["implementation"]);
}));

test("attaching a review stamps the provenance the run already knows", () => withProject((project) => {
  const examples = join(packageRoot, "reviews", "examples");
  writeFileSync(join(project, "plan.md"), "# Export Plan\n\nAdd a user-facing export dialog with an error state.\n", "utf8");
  inProject(project, "run-plan-review.mjs", ["--target", "plan.md", "--pass-id", "stamped", "--lens", "product-ux", "--feature-request", "Let users export their data."]);
  const run = archiveRunPath("plan.md", "stamped");
  const ledgerPath = `${run}/ledger.json`;
  const ledger = JSON.parse(readFileSync(join(project, ledgerPath), "utf8"));
  // The reviewer's Markdown carries no Provenance section; the script knows those values.
  const markdown = readFileSync(join(examples, "artifacts", "review-output.valid-full.md"), "utf8").replace(/^### Provenance\n[\s\S]*?(?=^### Verdict)/m, "");
  assert.doesNotMatch(markdown, /### Provenance/);
  writeFileSync(join(project, run, "product-ux.review.md"), markdown, "utf8");
  const reviewPath = `${run}/product-ux.review.json`;
  const {
    pass_id, target_path, target_revision, review_input_revision, template_revision, lens_revision,
    run_mode, execution_mode, markdown_artifact_sha, cross_cutting_status, ...authored
  } = JSON.parse(readFileSync(join(examples, "review-output.valid-full.json"), "utf8"));
  writeFileSync(join(project, reviewPath), `${JSON.stringify({
    ...authored,
    record_id: "stamped-product-ux-1",
    lens: "product-ux",
    artifact_path: reviewPath,
    markdown_artifact_path: `${run}/product-ux.review.md`,
    cross_cutting_status: { accessibility: "non_blocking", performance: "not_applicable" },
    provenance: { input_sources: [{ role: "target", basis: "direct_workspace_read", paths_reviewed: ["plan.md"], target_included: true }] }
  }, null, 2)}\n`, "utf8");

  // Product & UX owns compatibility (secondary); an owned category the review
  // left out is the reviewer's to answer, so it is never filled in.
  const unanswered = spawnSync(node, [script("update-ledger.mjs"), "--ledger", ledgerPath, "--review", reviewPath, "--write", "--quiet"], { cwd: project, encoding: "utf8" });
  assert.equal(unanswered.status, 1);
  assert.match(unanswered.stderr, /field=cross_cutting_status\.compatibility_platform/);
  const partial = JSON.parse(readFileSync(join(project, reviewPath), "utf8"));
  assert.equal(partial.cross_cutting_status.compatibility_platform, undefined);
  partial.cross_cutting_status.compatibility_platform = "non_blocking";
  writeFileSync(join(project, reviewPath), `${JSON.stringify(partial, null, 2)}\n`, "utf8");

  inProject(project, "update-ledger.mjs", ["--ledger", ledgerPath, "--review", reviewPath, "--write", "--quiet"]);
  const stamped = JSON.parse(readFileSync(join(project, reviewPath), "utf8"));
  assert.equal(stamped.pass_id, "stamped");
  assert.equal(stamped.target_path, "plan.md");
  assert.equal(stamped.target_revision, ledger.target_revision);
  assert.equal(stamped.review_input_revision, ledger.review_input_revision);
  assert.equal(stamped.run_mode, "full");
  assert.equal(stamped.execution_mode, ledger.execution_mode);
  assert.equal(stamped.template_revision, execFileSync(node, [script("hash-review-target.mjs"), "reviews/reviewer-template.md"], { cwd: packageRoot, encoding: "utf8" }).trim());
  assert.equal(stamped.lens_revision, execFileSync(node, [script("hash-review-target.mjs"), "reviews/lenses/lens-product-ux.md"], { cwd: packageRoot, encoding: "utf8" }).trim());
  assert.equal(stamped.markdown_artifact_sha, inProject(project, "hash-review-target.mjs", [`${run}/product-ux.review.md`]).trim());
  assert.equal(stamped.cross_cutting_status.accessibility, "non_blocking", "a category the review covered keeps its status");
  assert.equal(stamped.cross_cutting_status.security_privacy, "not_applicable", "a skipped category the lens does not own is not applicable");
  inProject(project, "validate-review-output.mjs", [reviewPath, "--ledger", ledgerPath]);

  // A supplied value that disagrees with the run is not overwritten.
  writeFileSync(join(project, reviewPath), `${JSON.stringify({ ...stamped, target_revision: "git:0000000000000000000000000000000000000000" }, null, 2)}\n`, "utf8");
  const mismatch = spawnSync(node, [script("update-ledger.mjs"), "--ledger", ledgerPath, "--review", reviewPath, "--write"], { cwd: project, encoding: "utf8" });
  assert.equal(mismatch.status, 1);
  assert.match(mismatch.stderr, /field=target_revision/);
}));
