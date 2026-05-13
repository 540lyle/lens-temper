#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  CONTRACT_VERSION,
  EXIT_CODES,
  ensureNode18,
  parseCommonArgs,
  readJsonFile,
  repoRootFrom,
  usage,
  writeRunEvent
} from "./validation-helpers.mjs";

ensureNode18();

const scriptName = "run-plan-review.mjs";

function runNode(root, args) {
  return execFileSync(process.execPath, args, { cwd: root, encoding: "utf8" });
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
  const outDir = opts.out || `reviews/archive/${opts.passId}`;
  mkdirSync(join(root, outDir), { recursive: true });
  const ledgerPath = `${outDir}/ledger.json`;
  const eventsPath = `${outDir}/events.jsonl`;
  const executionMode = opts.executionMode || "fresh_spawned_lens_reviewers";
  writeFileSync(join(root, eventsPath), "", "utf8");
  const targetRevision = runNode(root, ["reviews/scripts/hash-review-target.mjs", opts.target]).trim();
  if (executionMode === "fresh_spawned_orchestrator") {
    writeRunEvent(root, eventsPath, "orchestrator_started", {
      pass_id: opts.passId,
      role: "parent_launcher",
      target_revision: targetRevision,
      artifact_path: `${outDir}/${opts.passId}.orchestrator.md`,
      status: "started"
    });
  }
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
      role: executionMode === "fresh_spawned_orchestrator" ? "detached_orchestrator" : "hosted_orchestrator",
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
      "--out", `${outDir}/${lens}.spawn.md`,
      "--quiet"
    ]);
    writeRunEvent(root, eventsPath, "spawn_prompt_created", {
      pass_id: opts.passId,
      role: executionMode === "fresh_spawned_orchestrator" ? "detached_orchestrator" : "hosted_orchestrator",
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
