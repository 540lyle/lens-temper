import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

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
  const runDir = join(project, "reviews", "archive", "outside-pass");
  const ledger = JSON.parse(readFileSync(join(runDir, "ledger.json"), "utf8"));
  assert.equal(ledger.target_path, "plan.md");
  assert.equal(ledger.review_input_path, "reviews/archive/outside-pass/review-input.json");
  assert.deepEqual(ledger.selected_lenses, ["product-ux"]);
  assert.equal(ledger.apply_mode, "interactive");
  const packet = readFileSync(join(runDir, "product-ux.prompt.md"), "utf8");
  assert.match(packet, /Add a user-facing export dialog/);
  assert.match(packet, /## Goal Gate/);
  assert.match(readFileSync(join(runDir, "product-ux.spawn.md"), "utf8"), /relative to the LensTemper package, not this project/);

  // An explicit --root from another working directory resolves the same files.
  const hash = execFileSync(node, [script("hash-review-target.mjs"), "plan.md", "--root", project], { cwd: packageRoot, encoding: "utf8" }).trim();
  assert.equal(hash, ledger.target_revision);
  inProject(project, "validate-ledger.mjs", ["reviews/archive/outside-pass/ledger.json", "--target-revision", hash]);

  const decisions = JSON.parse(execFileSync(node, [
    script("decide-reruns.mjs"),
    "--ledger", "reviews/archive/outside-pass/ledger.json",
    "--root", project,
    "--json"
  ], { cwd: packageRoot, encoding: "utf8" }));
  assert.deepEqual(decisions.decisions.map((entry) => [entry.lens, entry.lens_state]), [["product-ux", "open"]]);

  assert.match(inProject(project, "run-synthesis.mjs", ["--ledger", "reviews/archive/outside-pass/ledger.json"]), /Add a user-facing export dialog/);

  // Archives land under the project, and an edited target no longer blocks them.
  // Synthesis still refuses, because it hands the target text to a model.
  writeFileSync(join(project, "plan.md"), "# Export Plan\n\nEdited after delivery.\n", "utf8");
  const synthesis = spawnSync(node, [script("run-synthesis.mjs"), "--ledger", "reviews/archive/outside-pass/ledger.json"], { cwd: project, encoding: "utf8" });
  assert.notEqual(synthesis.status, 0);
  assert.match(synthesis.stderr, /field=target_revision/);
  const archived = inProject(project, "archive-review-run.mjs", ["--ledger", "reviews/archive/outside-pass/ledger.json"]);
  const archivePath = archived.match(/archived (\S+)/)[1];
  assert.equal(existsSync(join(project, archivePath, "ledger.json")), true);
  const stale = spawnSync(node, [script("validate-ledger.mjs"), "reviews/archive/outside-pass/ledger.json", "--target-revision", inProject(project, "hash-review-target.mjs", ["plan.md"]).trim()], { cwd: project, encoding: "utf8" });
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

test("a target outside the project root is refused", () => withProject((project) => {
  const result = spawnSync(node, [script("hash-review-target.mjs"), join(packageRoot, "README.md"), "--root", project], { cwd: project, encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /under the project root/);
}));
