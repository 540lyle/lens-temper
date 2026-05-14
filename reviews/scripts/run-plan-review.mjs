#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  CONTRACT_VERSION,
  EXIT_CODES,
  ensureNode18,
  isRepoRelativePath,
  parseCommonArgs,
  readJsonFile,
  repoRootFrom,
  resolveRepoPath,
  usage,
  writeRunEvent
} from "./validation-helpers.mjs";

ensureNode18();

const scriptName = "run-plan-review.mjs";

function runNode(root, args) {
  return execFileSync(process.execPath, args, { cwd: root, encoding: "utf8" });
}

function lensSetEquals(left, right) {
  return left.size === right.size && [...left].every((item) => right.has(item));
}

try {
  const opts = parseCommonArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(`${usage(scriptName, "--target <path> --pass-id <id> [--lens a,b] [--execution-mode fresh_spawned_lens_reviewers|fresh_spawned_orchestrator] [--out <dir>]")}\n`);
    process.exit(EXIT_CODES.ok);
  }
  if (opts.version) {
    process.stdout.write(`${CONTRACT_VERSION}\n`);
    process.exit(EXIT_CODES.ok);
  }
  if (!opts.target || !opts.passId) {
    process.stderr.write(`${usage(scriptName, "--target <path> --pass-id <id> [--lens a,b] [--out <dir>]")}\n`);
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
  mkdirSync(resolvedOutDir, { recursive: true });
  const ledgerPath = `${outDir}/ledger.json`;
  const eventsPath = `${outDir}/events.jsonl`;
  const executionMode = opts.executionMode || "fresh_spawned_lens_reviewers";
  writeFileSync(resolveRepoPath(root, eventsPath), "", "utf8");
  const targetRevision = runNode(root, ["reviews/scripts/hash-review-target.mjs", opts.target]).trim();
  runNode(root, [
    "reviews/scripts/create-ledger.mjs",
    "--target", opts.target,
    "--pass-id", opts.passId,
    "--lens", lenses.join(","),
    "--run-mode", "full",
    "--execution-mode", executionMode,
    "--events-path", eventsPath,
    "--out", ledgerPath,
    "--quiet"
  ]);
  writeRunEvent(root, eventsPath, "ledger_created", {
    pass_id: opts.passId,
    role: executionMode === "fresh_spawned_orchestrator" ? "parent_launcher" : "hosted_orchestrator",
    target_revision: targetRevision,
    artifact_path: ledgerPath,
    status: "created"
  });
  let orchestratorPath = null;
  if (executionMode === "fresh_spawned_orchestrator") {
    orchestratorPath = `${outDir}/${opts.passId}.orchestrator.md`;
    runNode(root, [
      "reviews/scripts/assemble-orchestrator-prompt.mjs",
      "--target", opts.target,
      "--pass-id", opts.passId,
      "--lens", lenses.join(","),
      "--ledger", ledgerPath,
      "--events-path", eventsPath,
      "--out", orchestratorPath,
      "--quiet"
    ]);
  }
  for (const lens of lenses) {
    const promptPath = `${outDir}/${lens}.prompt.md`;
    runNode(root, [
      "reviews/scripts/assemble-review-prompt.mjs",
      "--target", opts.target,
      "--lens", lens,
      "--pass-id", opts.passId,
      "--out", promptPath,
      "--quiet"
    ]);
    writeRunEvent(root, eventsPath, "prompt_packet_created", {
      pass_id: opts.passId,
      role: executionMode === "fresh_spawned_orchestrator" ? "parent_launcher" : "hosted_orchestrator",
      target_revision: targetRevision,
      artifact_path: promptPath,
      status: "created"
    });
    runNode(root, [
      "reviews/scripts/assemble-spawn-prompt.mjs",
      "--target", opts.target,
      "--lens", lens,
      "--pass-id", opts.passId,
      "--input-packet", promptPath,
      "--run-scope", runScope,
      "--execution-mode", executionMode,
      "--out", `${outDir}/${lens}.spawn.md`,
      "--quiet"
    ]);
    writeRunEvent(root, eventsPath, "spawn_prompt_created", {
      pass_id: opts.passId,
      role: executionMode === "fresh_spawned_orchestrator" ? "parent_launcher" : "hosted_orchestrator",
      target_revision: targetRevision,
      artifact_path: `${outDir}/${lens}.spawn.md`,
      status: "created"
    });
  }
  const orchestratorText = orchestratorPath ? `, ${orchestratorPath}` : "";
  process.stdout.write(`created ${ledgerPath}${orchestratorText}, ${eventsPath}, ${lenses.length} prompt files, and ${lenses.length} spawn prompt files\n`);
  process.stdout.write(`reviewer execution remains host-provided; spawn reviewers with the generated *.spawn.md handoffs\n`);
} catch (error) {
  process.stderr.write(`${usage(scriptName, "--target <path> --pass-id <id> [--lens a,b] [--out <dir>]")}\n`);
  process.stderr.write(`validation error: ${error.message}\n`);
  process.exit(error.exitCode || EXIT_CODES.internal);
}
