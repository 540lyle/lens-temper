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
  validateSynthesisRecord
} from "./validation-helpers.mjs";

ensureNode18();

const scriptName = "validate-synthesis-output.mjs";
const usageText = "<synthesis-json> --ledger <ledger-json> [--root <path>] [--json] [--quiet]";

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
  if (opts.positional.length !== 1 || !opts.ledger) {
    process.stderr.write(`${usage(scriptName, usageText)}\n`);
    process.stderr.write(`validation error: missing required argument\n`);
    process.exit(EXIT_CODES.usage);
  }

  const root = projectRootFrom(opts);
  const inputPath = opts.positional[0];
  const record = readJsonFile(resolveInputPath(root, inputPath));
  const context = await loadValidatedRunContext(root, opts.ledger);
  const ledger = context.ledger;
  const failures = validateSynthesisRecord(record, {
    artifactRoot: root,
    targetRevision: ledger.target_revision,
    ledger,
    inputPath
  });

  if (failures.length > 0) {
    printFailures(failures, opts);
    process.exit(failures.some((f) => f.field === "target_revision" || f.field === "review_input_revision" || f.field === "markdown_artifact_sha") ? EXIT_CODES.stale : EXIT_CODES.validation);
  }
  if (opts.json) {
    process.stdout.write(`${JSON.stringify({ event: "valid", artifact_path: inputPath, record_id: record.record_id })}\n`);
  }
  process.exit(EXIT_CODES.ok);
} catch (error) {
  process.stderr.write(`${usage(scriptName, usageText)}\n`);
  process.stderr.write(`validation error: ${error.message}\n`);
  process.exit(error.exitCode || EXIT_CODES.internal);
}
