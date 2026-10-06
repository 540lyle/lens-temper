#!/usr/bin/env node
import { existsSync, writeFileSync } from "node:fs";
import {
  CONTRACT_VERSION,
  EXIT_CODES,
  deriveRerunDecisions,
  ensureNode18,
  isRepoRelativePath,
  parseCommonArgs,
  projectRootFrom,
  readJsonFile,
  readRegistry,
  resolveInputPath,
  resolveRepoPath,
  usage
} from "./validation-helpers.mjs";
import { AUTOMATIC_PASS_LIMIT } from "./validation-contracts.mjs";

ensureNode18();

const scriptName = "decide-reruns.mjs";
const usageText = "(--ledger <ledger-json> | --lens <id> [--applied f1,f2]) [--synthesis <synthesis-json>] [--reopen a,b] [--root <path>] [--write] [--json]";

function list(value) {
  return (value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function readArtifact(root, repoPath) {
  const resolved = isRepoRelativePath(repoPath) ? resolveRepoPath(root, repoPath) : null;
  return resolved && existsSync(resolved) ? readJsonFile(resolved) : null;
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
  if (Boolean(opts.ledger) === Boolean(opts.lens)) {
    throw Object.assign(new Error("supply --ledger, or --lens for a run without a ledger"), { exitCode: EXIT_CODES.usage });
  }
  if (opts.ledger && opts.applied) {
    throw Object.assign(new Error("with a ledger, applied findings come from its target_edits; record the edit with update-ledger.mjs --ledger <ledger> --applied <finding-id> --summary <text> --write"), { exitCode: EXIT_CODES.usage });
  }
  if (opts.write && !opts.ledger) {
    throw Object.assign(new Error("--write requires --ledger"), { exitCode: EXIT_CODES.usage });
  }
  const root = projectRootFrom(opts);
  const ledger = opts.ledger ? readJsonFile(resolveInputPath(root, opts.ledger)) : null;
  const lenses = ledger ? ledger.selected_lenses || [] : list(opts.lens);
  const known = new Set(readRegistry().lenses.map((entry) => entry.id));
  const unknown = [...lenses, ...list(opts.reopen)].filter((lens) => !known.has(lens));
  if (unknown.length > 0) throw Object.assign(new Error(`unknown lens ${unknown.join(", ")}`), { exitCode: EXIT_CODES.usage });
  const syntheses = (ledger?.synthesis_record_artifacts || []).map((entry) => readArtifact(root, entry.artifact_path)).filter(Boolean);
  if (opts.synthesis) syntheses.push(readJsonFile(resolveInputPath(root, opts.synthesis)));
  const findings = new Map(syntheses.flatMap((record) => record.finding_decisions || []).map((entry) => [entry.finding_id, entry]));

  // Without a synthesis, a lens in a ledger is settled once it has a current
  // review and open until then.
  let lensEntries = syntheses.at(-1)?.lens_lock_decisions || [];
  if (syntheses.length === 0 && ledger) {
    const currentIds = new Set(ledger.current_review_record_ids || []);
    const reviewed = new Set((ledger.review_record_artifacts || [])
      .filter((entry) => currentIds.has(entry.record_id))
      .map((entry) => readArtifact(root, entry.artifact_path)?.lens)
      .filter(Boolean));
    lensEntries = lenses.map((lens) => reviewed.has(lens)
      ? { lens, lens_state: "settled", reason: "current review delivered" }
      : { lens, lens_state: "open", reason: "no current review for this lens" });
  }

  const applied = ledger
    ? (ledger.target_edits || []).map((edit) => edit.finding_id).filter(Boolean)
    : list(opts.applied);
  const decisions = deriveRerunDecisions({ lenses, lensEntries, findings, applied, reopen: list(opts.reopen) });
  const passIndex = (ledger?.pass_index ?? 1) + 1;
  const output = {
    ...(ledger ? {
      pass_id: ledger.pass_id,
      target_revision: ledger.target_revision,
      ...(ledger.review_input_revision ? { review_input_revision: ledger.review_input_revision } : {})
    } : {}),
    decisions,
    ...(decisions.some((entry) => entry.rerun_needed) ? {
      next_pass: {
        pass_index: passIndex,
        ...(ledger ? { parent_pass_id: ledger.pass_id } : {}),
        human_approval_required: passIndex > AUTOMATIC_PASS_LIMIT
      }
    } : {})
  };
  if (opts.write) {
    ledger.rerun_decisions = decisions;
    writeFileSync(resolveInputPath(root, opts.ledger), `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
    if (!opts.quiet) process.stdout.write(`updated ${opts.ledger}\n`);
  } else if (opts.json) {
    process.stdout.write(`${JSON.stringify({ event: "rerun_decisions", ...output })}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  }
} catch (error) {
  process.stderr.write(`${usage(scriptName, usageText)}\n`);
  process.stderr.write(`validation error: ${error.message}\n`);
  process.exit(error.exitCode || EXIT_CODES.internal);
}
