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
  registeredArtifactFailures,
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
  // An unattached record is usually also unstamped; attaching fills most of
  // the other failures, so this hint leads.
  const attach = failures.find((failure) => failure.field === "record_id" && !(ledger.synthesis_record_ids || []).includes(record.record_id));
  if (attach) {
    attach.lead = true;
    attach.expected = `a synthesis record attached to the ledger (attach it first with update-ledger.mjs --ledger ${opts.ledger} --synthesis ${inputPath} --write, which also stamps the run provenance, then validate again)`;
    attach.actual = `${record.record_id} not attached`;
  } else {
    failures.push(...registeredArtifactFailures(root, ledger, "synthesis", record, inputPath));
  }

  if (failures.length > 0) {
    printFailures(failures, opts);
    // An unattached record is not stale, only unattached (and so unstamped).
    process.exit(failures.some((f) => f.lead) ? EXIT_CODES.validation : failures.some((f) => f.field === "target_revision" || f.field === "review_input_revision" || f.field === "markdown_artifact_sha") ? EXIT_CODES.stale : EXIT_CODES.validation);
  }
  printValid(opts, `valid synthesis ${inputPath} record=${record.record_id} ledger=${opts.ledger}`, { artifact_path: inputPath, record_id: record.record_id });
  process.exit(EXIT_CODES.ok);
} catch (error) {
  process.stderr.write(`${usage(scriptName, usageText)}\n`);
  process.stderr.write(`validation error: ${error.message}\n`);
  process.exit(error.exitCode || EXIT_CODES.internal);
}
