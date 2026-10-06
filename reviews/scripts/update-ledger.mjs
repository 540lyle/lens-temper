#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import {
  computeArtifactSha,
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
  fileExistsAt,
  stampRunProvenance,
  usage,
  validateLedgerRecord
} from "./validation-helpers.mjs";

ensureNode18();

const scriptName = "update-ledger.mjs";
const usageText = "--ledger <ledger-json> ([--review <review-json>] [--synthesis <synthesis-json>] [--finalize] | (--applied <finding-id> | --host-initiated) --summary <text> [--decided-by human|policy] | --remove-edit <index|finding-id>) [--root <path>] --write (without --write: dry run, prints the ledger it would write)";

// A target edit to remove is named by its index in target_edits or by the
// finding id it applied, which must then match exactly one entry.
function findEditIndex(edits, selector) {
  if (/^\d+$/.test(selector)) {
    const index = Number(selector);
    if (index >= edits.length) throw Object.assign(new Error(`--remove-edit ${selector}: target_edits has ${edits.length} entr${edits.length === 1 ? "y" : "ies"} (indexes 0..${edits.length - 1})`), { exitCode: EXIT_CODES.usage });
    return index;
  }
  const matches = edits.flatMap((edit, index) => (edit.finding_id === selector ? [index] : []));
  if (matches.length === 0) throw Object.assign(new Error(`--remove-edit ${selector}: no target_edits entry applies that finding; recorded: ${edits.map((edit, index) => `${index}=${edit.finding_id || "host-initiated"}`).join(", ") || "none"}`), { exitCode: EXIT_CODES.usage });
  if (matches.length > 1) throw Object.assign(new Error(`--remove-edit ${selector}: ${matches.length} entries apply that finding (indexes ${matches.join(", ")}); name one by index`), { exitCode: EXIT_CODES.usage });
  return matches[0];
}

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
  const removesEdit = opts.removeEdit !== null;
  if (removesEdit && (attaches || opts.finalize || recordsEdit || opts.summary || opts.decidedBy)) {
    throw Object.assign(new Error("remove a target edit in its own call: --remove-edit <index|finding-id> takes no other edit, attach, or finalize option"), { exitCode: EXIT_CODES.usage });
  }
  if (!opts.ledger || (!attaches && !opts.finalize && !recordsEdit && !removesEdit)) {
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
  let change = null;
  if (recordsEdit) {
    const edit = {
      ...(opts.applied ? { finding_id: opts.applied } : { host_initiated: true }),
      decided_by: opts.decidedBy || "human",
      summary: opts.summary
    };
    ledger.target_edits = [...(ledger.target_edits || []), edit];
    change = `target_edits[${ledger.target_edits.length - 1}] ${JSON.stringify(edit)}`;
  }
  // A mistaken edit record is removed by the same CLI that recorded it. Stored
  // rerun decisions were derived from the old list, so they must be redone.
  if (removesEdit) {
    const edits = Array.isArray(ledger.target_edits) ? ledger.target_edits : [];
    const index = findEditIndex(edits, String(opts.removeEdit));
    const [removed] = edits.splice(index, 1);
    if (edits.length === 0) delete ledger.target_edits;
    else ledger.target_edits = edits;
    change = `removal of target_edits[${index}] ${JSON.stringify(removed)}`;
    if (ledger.rerun_decisions !== undefined) {
      delete ledger.rerun_decisions;
      change += "; cleared rerun_decisions derived from it (run decide-reruns.mjs --ledger <ledger> --write again)";
    }
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
  // The ledger registers each record's content hash, so a different file that
  // reuses the record id, or a later edit of this one, fails validation.
  const registration = (recordId, artifactPath) => ({
    record_id: recordId,
    artifact_path: artifactPath,
    ...(isRepoRelativePath(artifactPath) && fileExistsAt(root, artifactPath) ? { artifact_sha: computeArtifactSha(root, artifactPath) } : {})
  });
  if (opts.review) {
    const review = stampRecord(opts.review, "review");
    ledger.review_record_artifacts = ledger.review_record_artifacts || [];
    ledger.current_review_record_ids = ledger.current_review_record_ids || [];
    if (!ledger.current_review_record_ids.includes(review.record_id)) ledger.current_review_record_ids.push(review.record_id);
    ledger.review_record_artifacts = ledger.review_record_artifacts.filter((entry) => entry.record_id !== review.record_id);
    ledger.review_record_artifacts.push(registration(review.record_id, opts.review));
  }
  if (opts.synthesis) {
    const synthesis = stampRecord(opts.synthesis, "synthesis");
    ledger.synthesis_record_ids = ledger.synthesis_record_ids || [];
    ledger.synthesis_record_artifacts = ledger.synthesis_record_artifacts || [];
    if (!ledger.synthesis_record_ids.includes(synthesis.record_id)) ledger.synthesis_record_ids.push(synthesis.record_id);
    ledger.synthesis_record_artifacts = ledger.synthesis_record_artifacts.filter((entry) => entry.record_id !== synthesis.record_id);
    ledger.synthesis_record_artifacts.push(registration(synthesis.record_id, opts.synthesis));
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
    if (!opts.quiet) process.stdout.write(`updated ${opts.ledger}${change ? `: ${change}` : ""}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(ledger, null, 2)}\n`);
    if (!opts.quiet) process.stderr.write(`dry run: ${opts.ledger} not written${change ? `; would record ${change}` : ""} (pass --write to save)\n`);
  }
} catch (error) {
  process.stderr.write(`${usage(scriptName, usageText)}\n`);
  process.stderr.write(`validation error: ${error.message}\n`);
  process.exit(error.exitCode || EXIT_CODES.internal);
}
