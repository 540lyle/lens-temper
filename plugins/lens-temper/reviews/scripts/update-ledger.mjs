#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import {
  CONTRACT_VERSION,
  deriveCoreProfileCompletionState,
  EXIT_CODES,
  ensureNode18,
  isRepoRelativePath,
  parseCommonArgs,
  projectRootFrom,
  readJsonFile,
  resolveInputPath,
  resolveRepoPath,
  stampRunProvenance,
  usage,
  validateLedgerRecord
} from "./validation-helpers.mjs";

ensureNode18();

const scriptName = "update-ledger.mjs";
const usageText = "--ledger <ledger-json> ([--review <review-json>] [--synthesis <synthesis-json>] [--finalize] | (--applied <finding-id> | --host-initiated) --summary <text> [--decided-by human|policy]) [--root <path>] --write";

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
  const attaches = Boolean(opts.review || opts.synthesis);
  const recordsEdit = Boolean(opts.applied) || opts.hostInitiated;
  if (!opts.ledger || (!attaches && !opts.finalize && !recordsEdit)) {
    process.stderr.write(`${usage(scriptName, usageText)}\n`);
    process.stderr.write(`validation error: missing ledger or artifact path\n`);
    process.exit(EXIT_CODES.usage);
  }
  if (recordsEdit && (attaches || opts.finalize)) {
    throw Object.assign(new Error("record a target edit in its own call, without --review, --synthesis, or --finalize"), { exitCode: EXIT_CODES.usage });
  }
  if (opts.applied && opts.hostInitiated) {
    throw Object.assign(new Error("a target edit applies one finding (--applied) or is --host-initiated, not both"), { exitCode: EXIT_CODES.usage });
  }
  if (recordsEdit && !opts.summary) {
    throw Object.assign(new Error("a target edit needs --summary describing what changed"), { exitCode: EXIT_CODES.usage });
  }
  const root = projectRootFrom(opts);
  const ledger = readJsonFile(resolveInputPath(root, opts.ledger));
  if (attaches && ledger.run_scope === "core_profile" && ledger.core_gate_passed === true && !opts.finalize) {
    throw Object.assign(new Error("the core-profile ledger is already finalized; pass --finalize with --review or --synthesis to attach and finalize again"), { exitCode: EXIT_CODES.usage });
  }
  // The review never edits the target. An edit made after delivery is logged
  // here so that reruns follow applied findings and host growth stays visible.
  if (recordsEdit) {
    ledger.target_edits = [...(ledger.target_edits || []), {
      ...(opts.applied ? { finding_id: opts.applied } : { host_initiated: true }),
      decided_by: opts.decidedBy || "human",
      summary: opts.summary
    }];
  }
  // Attaching stamps the provenance the run already knows into the record;
  // with --write the stamped record is saved before the ledger validates it.
  const stampRecord = (input, kind) => {
    const path = resolveInputPath(root, input);
    const record = readJsonFile(path);
    const stamped = stampRunProvenance(root, ledger, record, kind);
    if (stamped.length > 0) {
      if (opts.write) writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, "utf8");
      if (!opts.quiet) process.stderr.write(`${opts.write ? "stamped" : "would stamp (pass --write)"} ${input}: ${stamped.join(", ")}\n`);
    }
    return record;
  };
  if (opts.review) {
    const review = stampRecord(opts.review, "review");
    ledger.review_record_artifacts = ledger.review_record_artifacts || [];
    ledger.current_review_record_ids = ledger.current_review_record_ids || [];
    if (!ledger.current_review_record_ids.includes(review.record_id)) ledger.current_review_record_ids.push(review.record_id);
    ledger.review_record_artifacts = ledger.review_record_artifacts.filter((entry) => entry.record_id !== review.record_id);
    ledger.review_record_artifacts.push({ record_id: review.record_id, artifact_path: opts.review });
  }
  if (opts.synthesis) {
    const synthesis = stampRecord(opts.synthesis, "synthesis");
    ledger.synthesis_record_ids = ledger.synthesis_record_ids || [];
    ledger.synthesis_record_artifacts = ledger.synthesis_record_artifacts || [];
    if (!ledger.synthesis_record_ids.includes(synthesis.record_id)) ledger.synthesis_record_ids.push(synthesis.record_id);
    ledger.synthesis_record_artifacts = ledger.synthesis_record_artifacts.filter((entry) => entry.record_id !== synthesis.record_id);
    ledger.synthesis_record_artifacts.push({ record_id: synthesis.record_id, artifact_path: opts.synthesis });
  }
  if (ledger.run_scope === "core_profile" && attaches) {
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
  process.stderr.write(`${usage(scriptName, usageText)}\n`);
  process.stderr.write(`validation error: ${error.message}\n`);
  process.exit(error.exitCode || EXIT_CODES.internal);
}
