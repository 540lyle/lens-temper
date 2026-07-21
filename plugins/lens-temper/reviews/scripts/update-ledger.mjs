#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import {
  CONTRACT_VERSION,
  deriveCoreProfileCompletionState,
  EXIT_CODES,
  ensureNode18,
  isRepoRelativePath,
  parseCommonArgs,
  readJsonFile,
  repoRootFrom,
  resolveRepoPath,
  usage,
  validateLedgerRecord
} from "./validation-helpers.mjs";

ensureNode18();

const scriptName = "update-ledger.mjs";

try {
  const opts = parseCommonArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(`${usage(scriptName, "--ledger <ledger-json> [--review <review-json>] [--synthesis <synthesis-json>] [--finalize] --write")}\n`);
    process.exit(EXIT_CODES.ok);
  }
  if (opts.version) {
    process.stdout.write(`${CONTRACT_VERSION}\n`);
    process.exit(EXIT_CODES.ok);
  }
  if (!opts.ledger || (!opts.review && !opts.synthesis && !opts.finalize)) {
    process.stderr.write(`${usage(scriptName, "--ledger <ledger-json> [--review <review-json>] [--synthesis <synthesis-json>] [--finalize] --write")}\n`);
    process.stderr.write(`validation error: missing ledger or artifact path\n`);
    process.exit(EXIT_CODES.usage);
  }
  const root = repoRootFrom(import.meta.url);
  const ledger = readJsonFile(opts.ledger);
  if (opts.review) {
    const review = readJsonFile(opts.review);
    ledger.review_record_artifacts = ledger.review_record_artifacts || [];
    ledger.current_review_record_ids = ledger.current_review_record_ids || [];
    if (!ledger.current_review_record_ids.includes(review.record_id)) ledger.current_review_record_ids.push(review.record_id);
    ledger.review_record_artifacts = ledger.review_record_artifacts.filter((entry) => entry.record_id !== review.record_id);
    ledger.review_record_artifacts.push({ record_id: review.record_id, artifact_path: opts.review });
  }
  if (opts.synthesis) {
    const synthesis = readJsonFile(opts.synthesis);
    ledger.synthesis_record_ids = ledger.synthesis_record_ids || [];
    ledger.synthesis_record_artifacts = ledger.synthesis_record_artifacts || [];
    if (!ledger.synthesis_record_ids.includes(synthesis.record_id)) ledger.synthesis_record_ids.push(synthesis.record_id);
    ledger.synthesis_record_artifacts = ledger.synthesis_record_artifacts.filter((entry) => entry.record_id !== synthesis.record_id);
    ledger.synthesis_record_artifacts.push({ record_id: synthesis.record_id, artifact_path: opts.synthesis });
  }
  if (ledger.run_scope === "core_profile") {
    const derived = deriveCoreProfileCompletionState(root, ledger);
    ledger.completed_lens_ids = derived.completed_lens_ids;
    ledger.core_gate_passed = false;
  }
  if (opts.finalize) {
    ledger.status = "completed";
    ledger.completion_validation = {
      validator_name: "validate-completion-summary",
      validator_contract_version: CONTRACT_VERSION,
      passed: true,
      validated_review_record_ids: [...(ledger.current_review_record_ids || [])],
      validated_synthesis_record_id: (ledger.synthesis_record_ids || []).at(-1) || "",
      failures: []
    };
    if (ledger.run_scope === "core_profile") {
      const derived = deriveCoreProfileCompletionState(root, ledger);
      ledger.completed_lens_ids = derived.completed_lens_ids;
      ledger.core_gate_passed = derived.core_gate_passed;
    }
  }
  const failures = validateLedgerRecord(ledger, { artifactRoot: root, targetRevision: ledger.target_revision, artifactPath: opts.ledger });
  if (failures.length > 0) {
    process.stderr.write(failures.map((failure) => `${failure.artifact_path} field=${failure.field} expected=${failure.expected} actual=${failure.actual}`).join("\n"));
    process.stderr.write("\n");
    process.exit(EXIT_CODES.validation);
  }
  if (opts.write) {
    if (!isRepoRelativePath(opts.ledger)) {
      process.stderr.write(`validation error: --ledger must be repository-relative when --write is used\n`);
      process.exit(EXIT_CODES.usage);
    }
    writeFileSync(resolveRepoPath(root, opts.ledger), `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
    if (!opts.quiet) process.stdout.write(`updated ${opts.ledger}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(ledger, null, 2)}\n`);
  }
} catch (error) {
    process.stderr.write(`${usage(scriptName, "--ledger <ledger-json> [--review <review-json>] [--synthesis <synthesis-json>] [--finalize] --write")}\n`);
  process.stderr.write(`validation error: ${error.message}\n`);
  process.exit(error.exitCode || EXIT_CODES.internal);
}
