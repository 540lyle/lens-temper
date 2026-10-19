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
  STAMPED_REVIEW_FIELDS,
  usage,
  validateReviewRecord
} from "./validation-helpers.mjs";

ensureNode18();

const scriptName = "validate-review-output.mjs";
const usageText = "<review-json> (--ledger <ledger-json> | --target-revision <hash> [not for run_mode full]) [--root <path>] [--json] [--quiet]";

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
  if (opts.positional.length !== 1 || (!opts.targetRevision && !opts.ledger)) {
    process.stderr.write(`${usage(scriptName, usageText)}\n`);
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
  if (context && !(context.ledger.current_review_record_ids || []).includes(record.record_id)) {
    // An unattached record is usually also unstamped; attaching fills most of
    // the other failures, so this hint leads.
    // Fields that attaching stamps are not reported as missing before it.
    const stampable = STAMPED_REVIEW_FIELDS.filter((field) => record[field] === undefined);
    const pending = failures.filter((failure) => !stampable.includes(failure.field));
    failures.length = 0;
    failures.push({ lead: true, artifact_path: inputPath, record_id: record.record_id, field: "record_id", expected: `a review attached to the ledger (attach it first with update-ledger.mjs --ledger ${opts.ledger} --review ${inputPath} --write, which also stamps ${stampable.length > 0 ? stampable.join(", ") : "the run provenance"}, then validate again)`, actual: `${record.record_id} not attached` }, ...pending);
  } else if (context) {
    failures.push(...registeredArtifactFailures(root, context.ledger, "review", record, inputPath));
  }

  if (failures.length > 0) {
    printFailures(failures, opts);
    // An unattached record is not stale, only unattached (and so unstamped).
    process.exit(failures.some((f) => f.lead) ? EXIT_CODES.validation : failures.some((f) => f.field === "target_revision" || f.field === "review_input_revision" || f.field === "markdown_artifact_sha") ? EXIT_CODES.stale : EXIT_CODES.validation);
  }
  printValid(opts, `valid review ${inputPath} record=${record.record_id}${context ? ` ledger=${opts.ledger}` : ""}`, { artifact_path: inputPath, record_id: record.record_id });
  process.exit(EXIT_CODES.ok);
} catch (error) {
  process.stderr.write(`${usage(scriptName, usageText)}\n`);
  process.stderr.write(`validation error: ${error.message}\n`);
  process.exit(error.exitCode || EXIT_CODES.internal);
}
