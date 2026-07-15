#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  CONTRACT_VERSION,
  EXIT_CODES,
  ensureNode18,
  isRepoRelativePath,
  parseCommonArgs,
  readJsonFile,
  repoRootFrom,
  resolveReviewInput,
  resolveRepoPath,
  serializeReviewInput,
  usage,
  writeRunEvent
} from "./validation-helpers.mjs";

ensureNode18();

const scriptName = "run-plan-review.mjs";

const execFileAsync = promisify(execFile);

async function runNode(root, args) {
  const { stdout } = await execFileAsync(process.execPath, args, { cwd: root, encoding: "utf8" });
  return stdout;
}

function lensSetEquals(left, right) {
  return left.size === right.size && [...left].every((item) => right.has(item));
}

try {
  const opts = parseCommonArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(`${usage(scriptName, "--target <path> --pass-id <id> (--review-input <path> | --feature-request <text>) [--relevant-context <text>] [--constraints <text>] [--previous-adjudications <text>] [--lens a,b] [--execution-mode fresh_spawned_lens_reviewers|fresh_spawned_orchestrator] [--out <dir>]")}\n`);
    process.exit(EXIT_CODES.ok);
  }
  if (opts.version) {
    process.stdout.write(`${CONTRACT_VERSION}\n`);
    process.exit(EXIT_CODES.ok);
  }
  if (!opts.target || !opts.passId) {
    process.stderr.write(`${usage(scriptName, "--target <path> --pass-id <id> (--review-input <path> | --feature-request <text>) [--lens a,b] [--out <dir>]")}\n`);
    process.stderr.write(`validation error: missing --target or --pass-id\n`);
    process.exit(EXIT_CODES.usage);
  }
  const root = repoRootFrom(import.meta.url);
  const registry = readJsonFile(join(root, "reviews", "registry.json"));
  const lenses = opts.lens
    ? opts.lens.split(",").map((item) => item.trim()).filter(Boolean)
    : registry.lenses.map((entry) => entry.id);
  const registryLensIds = registry.lenses.map((entry) => entry.id);
  const registryLensSet = new Set(registryLensIds);
  const lensSet = new Set(lenses);
  if (lensSet.size !== lenses.length) {
    process.stderr.write(`validation error: --lens must not include duplicate lens ids\n`);
    process.exit(EXIT_CODES.usage);
  }
  for (const lens of lenses) {
    if (!registryLensSet.has(lens)) {
      process.stderr.write(`validation error: unknown lens ${lens}\n`);
      process.exit(EXIT_CODES.usage);
    }
  }
  const runScope = lensSetEquals(lensSet, registryLensSet) ? "six_lens" : "selected_lenses";
  const outDir = opts.out || `reviews/archive/${opts.passId}`;
  if (!isRepoRelativePath(outDir)) {
    process.stderr.write(`validation error: --out must be repository-relative\n`);
    process.exit(EXIT_CODES.usage);
  }
  const resolvedOutDir = resolveRepoPath(root, outDir);
  if (!resolvedOutDir) {
    process.stderr.write(`validation error: --out must resolve under the repository root\n`);
    process.exit(EXIT_CODES.usage);
  }
  const reviewInput = resolveReviewInput(root, opts);
  mkdirSync(resolvedOutDir, { recursive: true });
  const reviewInputPath = `${outDir}/review-input.json`;
  writeFileSync(resolveRepoPath(root, reviewInputPath), serializeReviewInput(reviewInput.record), "utf8");
  const ledgerPath = `${outDir}/ledger.json`;
  const eventsPath = `${outDir}/events.jsonl`;
  const executionMode = opts.executionMode || "fresh_spawned_lens_reviewers";
  writeFileSync(resolveRepoPath(root, eventsPath), "", "utf8");
  const targetRevision = (await runNode(root, ["reviews/scripts/hash-review-target.mjs", opts.target])).trim();
  await runNode(root, [
    "reviews/scripts/create-ledger.mjs",
    "--target", opts.target,
    "--pass-id", opts.passId,
    "--lens", lenses.join(","),
    "--run-mode", "full",
    "--execution-mode", executionMode,
    "--review-input", reviewInputPath,
    "--events-path", eventsPath,
    "--out", ledgerPath,
    "--quiet"
  ]);
  writeRunEvent(root, eventsPath, "ledger_created", {
    pass_id: opts.passId,
    role: executionMode === "fresh_spawned_orchestrator" ? "parent_launcher" : "hosted_orchestrator",
    target_revision: targetRevision,
    review_input_revision: reviewInput.revision,
    artifact_path: ledgerPath,
    status: "created"
  });
  let orchestratorPath = null;
  if (executionMode === "fresh_spawned_orchestrator") {
    orchestratorPath = `${outDir}/${opts.passId}.orchestrator.md`;
    await runNode(root, [
      "reviews/scripts/assemble-orchestrator-prompt.mjs",
      "--target", opts.target,
      "--pass-id", opts.passId,
      "--lens", lenses.join(","),
      "--ledger", ledgerPath,
      "--events-path", eventsPath,
      "--review-input", reviewInputPath,
      "--out", orchestratorPath,
      "--quiet"
    ]);
  }
  const preparedLenses = await Promise.all(lenses.map(async (lens) => {
    const promptPath = `${outDir}/${lens}.prompt.md`;
    await runNode(root, [
      "reviews/scripts/assemble-review-prompt.mjs",
      "--target", opts.target,
      "--lens", lens,
      "--pass-id", opts.passId,
      "--review-input", reviewInputPath,
      "--out", promptPath,
      "--quiet"
    ]);
    const spawnPath = `${outDir}/${lens}.spawn.md`;
    await runNode(root, [
      "reviews/scripts/assemble-spawn-prompt.mjs",
      "--target", opts.target,
      "--lens", lens,
      "--pass-id", opts.passId,
      "--input-packet", promptPath,
      "--review-input", reviewInputPath,
      "--run-scope", runScope,
      "--execution-mode", executionMode,
      "--out", spawnPath,
      "--quiet"
    ]);
    return { promptPath, spawnPath };
  }));
  // Event order is deterministic even though independent lens preparation is parallel.
  for (const { promptPath, spawnPath } of preparedLenses) {
    writeRunEvent(root, eventsPath, "prompt_packet_created", {
      pass_id: opts.passId,
      role: executionMode === "fresh_spawned_orchestrator" ? "parent_launcher" : "hosted_orchestrator",
      target_revision: targetRevision,
      review_input_revision: reviewInput.revision,
      artifact_path: promptPath,
      status: "created"
    });
    writeRunEvent(root, eventsPath, "spawn_prompt_created", {
      pass_id: opts.passId,
      role: executionMode === "fresh_spawned_orchestrator" ? "parent_launcher" : "hosted_orchestrator",
      target_revision: targetRevision,
      review_input_revision: reviewInput.revision,
      artifact_path: spawnPath,
      status: "created"
    });
  }
  const orchestratorText = orchestratorPath ? `, ${orchestratorPath}` : "";
  process.stdout.write(`created ${reviewInputPath}, ${ledgerPath}${orchestratorText}, ${eventsPath}, ${lenses.length} prompt files, and ${lenses.length} spawn prompt files\n`);
  process.stdout.write(`reviewer execution remains host-provided; spawn reviewers with the generated *.spawn.md handoffs\n`);
} catch (error) {
  process.stderr.write(`${usage(scriptName, "--target <path> --pass-id <id> (--review-input <path> | --feature-request <text>) [--lens a,b] [--out <dir>]")}\n`);
  process.stderr.write(`validation error: ${error.message}\n`);
  process.exit(error.exitCode || EXIT_CODES.internal);
}
