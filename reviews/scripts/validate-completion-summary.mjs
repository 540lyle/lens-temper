#!/usr/bin/env node
import { resolve } from "node:path";
import {
  CONTRACT_VERSION,
  EXIT_CODES,
  ensureNode18,
  loadValidatedRunContext,
  parseCommonArgs,
  printFailures,
  readJsonFile,
  repoRootFrom,
  usage,
  validateCompletionSummaryRecord
} from "./validation-helpers.mjs";

ensureNode18();

const scriptName = "validate-completion-summary.mjs";

try {
  const opts = parseCommonArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(`${usage(scriptName, "<completion-summary-json> [--ledger <ledger-json> | --target-revision <hash>] [--artifact-root <path>] [--json] [--quiet]")}\n`);
    process.exit(EXIT_CODES.ok);
  }
  if (opts.version) {
    process.stdout.write(`${CONTRACT_VERSION}\n`);
    process.exit(EXIT_CODES.ok);
  }
  if (opts.positional.length !== 1) {
    process.stderr.write(`${usage(scriptName, "<completion-summary-json> [--target-revision <hash>] [--artifact-root <path>]")}\n`);
    process.stderr.write(`validation error: missing required argument\n`);
    process.exit(EXIT_CODES.usage);
  }

  const root = opts.artifactRoot ? resolve(opts.artifactRoot) : repoRootFrom(import.meta.url);
  const inputPath = opts.positional[0];
  const record = readJsonFile(inputPath);
  const context = opts.ledger ? await loadValidatedRunContext(root, opts.ledger) : null;
  if (record.run_mode === "full" && !context) {
    throw Object.assign(new Error("full completion validation requires --ledger"), { exitCode: EXIT_CODES.usage });
  }
  const failures = validateCompletionSummaryRecord(record, {
    artifactRoot: root,
    targetRevision: context?.ledger.target_revision || opts.targetRevision,
    reviewInputRevision: context?.ledger.review_input_revision || opts.reviewInputRevision,
    inputPath
  });

  if (failures.length > 0) {
    printFailures(failures, opts);
    process.exit(failures.some((f) => f.field === "target_revision" || f.field === "review_input_revision") ? EXIT_CODES.stale : EXIT_CODES.validation);
  }
  if (opts.json) {
    process.stdout.write(`${JSON.stringify({ event: "valid", artifact_path: inputPath, run_mode: record.run_mode })}\n`);
  }
  process.exit(EXIT_CODES.ok);
} catch (error) {
  process.stderr.write(`${usage(scriptName, "<completion-summary-json> [--target-revision <hash>] [--artifact-root <path>]")}\n`);
  process.stderr.write(`validation error: ${error.message}\n`);
  process.exit(error.exitCode || EXIT_CODES.internal);
}
