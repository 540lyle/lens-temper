#!/usr/bin/env node
import {
  CONTRACT_VERSION,
  EXIT_CODES,
  ensureNode18,
  loadValidatedRunContext,
  parseCommonArgs,
  printFailures,
  readJsonFile,
  projectRootFrom,
  resolveInputPath,
  usage,
  validateReviewRecord
} from "./validation-helpers.mjs";

ensureNode18();

const scriptName = "validate-review-output.mjs";

try {
  const opts = parseCommonArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(`${usage(scriptName, "<review-json> (--ledger <ledger-json> | --target-revision <hash>) [--root <path>] [--json] [--quiet]")}\n`);
    process.exit(EXIT_CODES.ok);
  }
  if (opts.version) {
    process.stdout.write(`${CONTRACT_VERSION}\n`);
    process.exit(EXIT_CODES.ok);
  }
  if (opts.positional.length !== 1 || (!opts.targetRevision && !opts.ledger)) {
    process.stderr.write(`${usage(scriptName, "<review-json> (--ledger <ledger-json> | --target-revision <hash>) [--root <path>]")}\n`);
    process.stderr.write(`validation error: missing required argument\n`);
    process.exit(EXIT_CODES.usage);
  }

  const root = projectRootFrom(opts);
  const inputPath = opts.positional[0];
  const record = readJsonFile(resolveInputPath(root, inputPath));
  const context = opts.ledger ? await loadValidatedRunContext(root, opts.ledger) : null;
  if (record.run_mode === "full" && !context) {
    throw Object.assign(new Error("full review validation requires --ledger"), { exitCode: EXIT_CODES.usage });
  }
  const failures = validateReviewRecord(record, {
    artifactRoot: root,
    targetRevision: context?.ledger.target_revision || opts.targetRevision,
    reviewInputRevision: context?.ledger.review_input_revision || opts.reviewInputRevision,
    inputPath
  });
  if (context && !context.ledger.current_review_record_ids.includes(record.record_id)) {
    failures.push({ artifact_path: inputPath, record_id: record.record_id, field: "record_id", expected: "current ledger review", actual: record.record_id });
  }

  if (failures.length > 0) {
    printFailures(failures, opts);
    process.exit(failures.some((f) => f.field === "target_revision" || f.field === "review_input_revision" || f.field === "markdown_artifact_sha") ? EXIT_CODES.stale : EXIT_CODES.validation);
  }
  if (opts.json) {
    process.stdout.write(`${JSON.stringify({ event: "valid", artifact_path: inputPath, record_id: record.record_id })}\n`);
  }
  process.exit(EXIT_CODES.ok);
} catch (error) {
  process.stderr.write(`${usage(scriptName, "<review-json> (--ledger <ledger-json> | --target-revision <hash>) [--root <path>]")}\n`);
  process.stderr.write(`validation error: ${error.message}\n`);
  process.exit(error.exitCode || EXIT_CODES.internal);
}
