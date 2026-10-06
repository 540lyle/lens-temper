#!/usr/bin/env node
import {
  CONTRACT_VERSION,
  EXIT_CODES,
  ensureNode18,
  loadValidatedRunContext,
  parseCommonArgs,
  printFailures,
  printValid,
  readJsonFile,
  projectRootFrom,
  resolveInputPath,
  usage,
  validateCompletionSummaryRecord
} from "./validation-helpers.mjs";

ensureNode18();

const scriptName = "validate-completion-summary.mjs";
const usageText = "<completion-summary-json> [--ledger <ledger-json> | --target-revision <hash> [not for run_mode full]] [--root <path>] [--json] [--quiet]";

try {
  const opts = parseCommonArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(`${usage(scriptName, usageText)}\n`);
    process.exit(EXIT_CODES.ok);
  }
  if (opts.version) {
    process.stdout.write(`${CONTRACT_VERSION}\n`);
    process.exit(EXIT_CODES.ok);
  }
  if (opts.positional.length !== 1) {
    process.stderr.write(`${usage(scriptName, usageText)}\n`);
    process.stderr.write(`validation error: missing required argument\n`);
    process.exit(EXIT_CODES.usage);
  }

  const root = projectRootFrom(opts);
  const inputPath = opts.positional[0];
  const record = readJsonFile(resolveInputPath(root, inputPath));
  const context = opts.ledger ? await loadValidatedRunContext(root, opts.ledger) : null;
  if (record.run_mode === "full" && !context) {
    throw Object.assign(new Error("full completion validation requires --ledger"), { exitCode: EXIT_CODES.usage });
  }
  const failures = validateCompletionSummaryRecord(record, {
    artifactRoot: root,
    targetRevision: context?.ledger.target_revision || opts.targetRevision,
    reviewInputRevision: context?.ledger.review_input_revision || opts.reviewInputRevision,
    ledger: context?.ledger,
    inputPath
  });

  if (failures.length > 0) {
    printFailures(failures, opts);
    process.exit(failures.some((f) => f.field === "target_revision" || f.field === "review_input_revision") ? EXIT_CODES.stale : EXIT_CODES.validation);
  }
  printValid(opts, `valid completion summary ${inputPath} run_mode=${record.run_mode}${context ? ` ledger=${opts.ledger}` : ""}`, { artifact_path: inputPath, run_mode: record.run_mode });
  process.exit(EXIT_CODES.ok);
} catch (error) {
  process.stderr.write(`${usage(scriptName, usageText)}\n`);
  process.stderr.write(`validation error: ${error.message}\n`);
  process.exit(error.exitCode || EXIT_CODES.internal);
}
