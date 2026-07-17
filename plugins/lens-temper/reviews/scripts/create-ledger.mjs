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
  resolveReviewInput,
  resolveRepoPath,
  usage
} from "./validation-helpers.mjs";
import { EXECUTION_MODES, LEDGER_SCHEMA_VERSION, RUN_MODES, RUN_SCOPES } from "./validation-contracts.mjs";
import { validateLensSelectionRecord } from "./lens-selection.mjs";

ensureNode18();

const scriptName = "create-ledger.mjs";

function lensSetEquals(left, right) {
  return left.size === right.size && [...left].every((item) => right.has(item));
}

try {
  const opts = parseCommonArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(`${usage(scriptName, "--target <path> --pass-id <id> [--review-input <path>] [--lens-selection <path>] [--lens a,b] [--run-mode inline|advisory|full] [--execution-mode manual_or_imported|fresh_spawned_lens_reviewers|fresh_spawned_orchestrator] [--out <path>] [--json]")}\n`);
    process.exit(EXIT_CODES.ok);
  }
  if (opts.version) {
    process.stdout.write(`${CONTRACT_VERSION}\n`);
    process.exit(EXIT_CODES.ok);
  }
  if (!opts.target || !opts.passId) {
    process.stderr.write(`${usage(scriptName, "--target <path> --pass-id <id> [--review-input <path>] [--lens a,b] [--out <path>]")}\n`);
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
  const coreProfileId = opts.coreProfile || registry.default_core_profile_id;
  const coreProfile = (registry.core_profiles || []).find((entry) => entry.id === coreProfileId);
  if (!coreProfile || !Array.isArray(coreProfile.required_lens_ids) || coreProfile.required_lens_ids.length === 0) {
    process.stderr.write(`validation error: registry default core profile is invalid\n`);
    process.exit(EXIT_CODES.usage);
  }
  const runMode = opts.runMode || "inline";
  if (!RUN_MODES.includes(runMode)) {
    process.stderr.write(`validation error: --run-mode must be one of ${RUN_MODES.join(", ")}\n`);
    process.exit(EXIT_CODES.usage);
  }
  const coreLensSet = new Set(coreProfile.required_lens_ids);
  const selectedIncludesCore = [...coreLensSet].every((lens) => selectedSet.has(lens));
  const runScope = opts.runScope || (runMode === "full" && selectedIncludesCore ? "core_profile" : "selected_lenses");
  if (!RUN_SCOPES.includes(runScope)) {
    process.stderr.write(`validation error: --run-scope must be one of ${RUN_SCOPES.join(", ")}\n`);
    process.exit(EXIT_CODES.usage);
  }
  if (runScope === "core_profile" && !selectedIncludesCore) {
    process.stderr.write(`validation error: core_profile run-scope requires every ${coreProfileId} core lens\n`);
    process.exit(EXIT_CODES.usage);
  }
  if (runScope === "core_profile" && runMode !== "full") {
    process.stderr.write(`validation error: core_profile run-scope requires full run mode\n`);
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
  if (runMode === "full" && !opts.reviewInput) {
    process.stderr.write(`validation error: full run mode requires --review-input\n`);
    process.exit(EXIT_CODES.usage);
  }
  if (runMode === "full" && !opts.lensSelection) {
    process.stderr.write(`validation error: full run mode requires --lens-selection\n`);
    process.exit(EXIT_CODES.usage);
  }
  const reviewInput = opts.reviewInput ? resolveReviewInput(root, opts) : null;
  let lensSelection = null;
  let lensSelectionPath = null;
  if (opts.lensSelection) {
    lensSelectionPath = normalizeRepoInputPath(root, opts.lensSelection);
    if (!lensSelectionPath) {
      process.stderr.write(`validation error: --lens-selection must resolve under the repository root\n`);
      process.exit(EXIT_CODES.usage);
    }
    lensSelection = readJsonFile(resolveRepoPath(root, lensSelectionPath));
    const selectionFailures = validateLensSelectionRecord(root, lensSelection, registry, {
      pass_id: opts.passId,
      target_path: targetPath,
      target_revision: targetRevision,
      review_input_path: reviewInput?.sourcePath,
      review_input_revision: reviewInput?.revision
    });
    if (!lensSetEquals(new Set(lensSelection.selected_lenses || []), selectedSet)) {
      selectionFailures.push("selected_lenses do not match --lens");
    }
    if (selectionFailures.length > 0) {
      process.stderr.write(`validation error: invalid lens selection: ${selectionFailures.join("; ")}\n`);
      process.exit(EXIT_CODES.usage);
    }
  }
  const eventsPath = opts.eventsPath || (opts.out ? opts.out.replace(/[^/]+$/, "events.jsonl") : archiveRunPath(targetPath, opts.passId).replace(/\/?$/, "/events.jsonl"));
  if (!isRepoRelativePath(eventsPath)) {
    process.stderr.write(`validation error: --events-path must be repository-relative\n`);
    process.exit(EXIT_CODES.usage);
  }
  const ledger = {
    schema_version: LEDGER_SCHEMA_VERSION,
    pass_id: opts.passId,
    target_path: targetPath,
    target_revision: targetRevision,
    ...(reviewInput ? {
      review_input_path: reviewInput.sourcePath,
      review_input_revision: reviewInput.revision
    } : {}),
    ...(lensSelection ? {
      lens_selection_path: lensSelectionPath,
      lens_selection_revision: computeArtifactSha(root, lensSelectionPath)
    } : {}),
    status: "active",
    run_mode: runMode,
    run_scope: runScope,
    ...(runScope === "core_profile" ? {
      core_profile_id: coreProfileId,
      required_lens_ids: selected,
      completed_lens_ids: [],
      core_gate_passed: false
    } : {}),
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
  process.stderr.write(`${usage(scriptName, "--target <path> --pass-id <id> [--review-input <path>] [--lens a,b] [--out <path>]")}\n`);
  process.stderr.write(`validation error: ${error.message}\n`);
  process.exit(error.exitCode || EXIT_CODES.internal);
}
