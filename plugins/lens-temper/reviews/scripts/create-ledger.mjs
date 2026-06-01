#!/usr/bin/env node
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  CONTRACT_VERSION,
  EXIT_CODES,
  archiveRunPath,
  computeArtifactSha,
  ensureNode18,
  isRepoRelativePath,
  normalizeRepoInputPath,
  parseCommonArgs,
  readJsonFile,
  repoRootFrom,
  resolveRepoPath,
  usage
} from "./validation-helpers.mjs";
import { EXECUTION_MODES, RUN_MODES, RUN_SCOPES } from "./validation-contracts.mjs";

ensureNode18();

const scriptName = "create-ledger.mjs";

function lensSetEquals(left, right) {
  return left.size === right.size && [...left].every((item) => right.has(item));
}

try {
  const opts = parseCommonArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(`${usage(scriptName, "--target <path> --pass-id <id> [--lens a,b] [--run-mode inline|advisory|full] [--execution-mode manual_or_imported|fresh_spawned_lens_reviewers|fresh_spawned_orchestrator] [--out <path>] [--json]")}\n`);
    process.exit(EXIT_CODES.ok);
  }
  if (opts.version) {
    process.stdout.write(`${CONTRACT_VERSION}\n`);
    process.exit(EXIT_CODES.ok);
  }
  if (!opts.target || !opts.passId) {
    process.stderr.write(`${usage(scriptName, "--target <path> --pass-id <id> [--lens a,b] [--out <path>]")}\n`);
    process.stderr.write(`validation error: missing --target or --pass-id\n`);
    process.exit(EXIT_CODES.usage);
  }
  const root = repoRootFrom(import.meta.url);
  const targetPath = normalizeRepoInputPath(root, opts.target);
  if (!targetPath) {
    process.stderr.write(`validation error: --target must resolve under the repository root\n`);
    process.exit(EXIT_CODES.usage);
  }
  const registry = readJsonFile(join(root, "reviews", "registry.json"));
  const selected = opts.lens
    ? opts.lens.split(",").map((item) => item.trim()).filter(Boolean)
    : registry.lenses.map((entry) => entry.id);
  const knownLenses = new Set(registry.lenses.map((entry) => entry.id));
  const selectedSet = new Set(selected);
  if (selectedSet.size !== selected.length) {
    process.stderr.write(`validation error: --lens must not include duplicate lens ids\n`);
    process.exit(EXIT_CODES.usage);
  }
  for (const lens of selected) {
    if (!knownLenses.has(lens)) {
      process.stderr.write(`validation error: unknown lens ${lens}\n`);
      process.exit(EXIT_CODES.usage);
    }
  }
  const targetRevision = computeArtifactSha(root, targetPath);
  const allLensIds = registry.lenses.map((entry) => entry.id);
  const runMode = opts.runMode || "inline";
  if (!RUN_MODES.includes(runMode)) {
    process.stderr.write(`validation error: --run-mode must be one of ${RUN_MODES.join(", ")}\n`);
    process.exit(EXIT_CODES.usage);
  }
  const allLensSet = new Set(allLensIds);
  const selectedIsSixLens = lensSetEquals(selectedSet, allLensSet);
  const runScope = opts.runScope || (selectedIsSixLens ? "six_lens" : "selected_lenses");
  if (!RUN_SCOPES.includes(runScope)) {
    process.stderr.write(`validation error: --run-scope must be one of ${RUN_SCOPES.join(", ")}\n`);
    process.exit(EXIT_CODES.usage);
  }
  if (runScope === "six_lens" && !selectedIsSixLens) {
    process.stderr.write(`validation error: six_lens run-scope requires exactly the registry lens set\n`);
    process.exit(EXIT_CODES.usage);
  }
  const defaultExecutionMode = runMode === "full" ? "fresh_spawned_lens_reviewers" : "manual_or_imported";
  const executionMode = opts.executionMode || defaultExecutionMode;
  if (!EXECUTION_MODES.includes(executionMode)) {
    process.stderr.write(`validation error: --execution-mode must be one of ${EXECUTION_MODES.join(", ")}\n`);
    process.exit(EXIT_CODES.usage);
  }
  if (runMode === "full" && !["fresh_spawned_lens_reviewers", "fresh_spawned_orchestrator"].includes(executionMode)) {
    process.stderr.write(`validation error: full run mode requires spawned reviewer or detached orchestrator execution\n`);
    process.exit(EXIT_CODES.usage);
  }
  if ((runMode === "inline" || runMode === "advisory") && executionMode !== "manual_or_imported") {
    process.stderr.write(`validation error: inline/advisory run modes require manual_or_imported execution\n`);
    process.exit(EXIT_CODES.usage);
  }
  const eventsPath = opts.eventsPath || (opts.out ? opts.out.replace(/[^/]+$/, "events.jsonl") : archiveRunPath(targetPath, opts.passId).replace(/\/?$/, "/events.jsonl"));
  if (!isRepoRelativePath(eventsPath)) {
    process.stderr.write(`validation error: --events-path must be repository-relative\n`);
    process.exit(EXIT_CODES.usage);
  }
  const ledger = {
    schema_version: 1,
    pass_id: opts.passId,
    target_path: targetPath,
    target_revision: targetRevision,
    status: "active",
    run_mode: runMode,
    run_scope: runScope,
    execution_mode: executionMode,
    events_path: eventsPath,
    selected_lenses: selected,
    current_review_record_ids: [],
    superseded_review_record_ids: [],
    synthesis_record_ids: [],
    archive_paths: [archiveRunPath(targetPath, opts.passId)],
    artifact_visibility: "public_safe",
    completion_validation: {
      validator_name: "validate-completion-summary",
      validator_contract_version: CONTRACT_VERSION,
      passed: false,
      validated_review_record_ids: [],
      validated_synthesis_record_id: "",
      failures: []
    },
    review_record_artifacts: [],
    synthesis_record_artifacts: []
  };
  const output = `${JSON.stringify(ledger, null, 2)}\n`;
  if (opts.out) {
    if (!isRepoRelativePath(opts.out)) {
      process.stderr.write(`validation error: --out must be repository-relative\n`);
      process.exit(EXIT_CODES.usage);
    }
    const outPath = resolveRepoPath(root, opts.out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, output, "utf8");
    if (!opts.quiet) process.stdout.write(`wrote ${opts.out}\n`);
  } else {
    process.stdout.write(output);
  }
} catch (error) {
  process.stderr.write(`${usage(scriptName, "--target <path> --pass-id <id> [--lens a,b] [--out <path>]")}\n`);
  process.stderr.write(`validation error: ${error.message}\n`);
  process.exit(error.exitCode || EXIT_CODES.internal);
}
