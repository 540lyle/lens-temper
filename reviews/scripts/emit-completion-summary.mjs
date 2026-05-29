#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  CONTRACT_VERSION,
  EXIT_CODES,
  ensureNode18,
  isRepoRelativePath,
  parseCommonArgs,
  readJsonFile,
  repoRootFrom,
  resolveRepoPath,
  usage,
  validateCompletionSummaryRecord,
  validateReviewRecord
} from "./validation-helpers.mjs";

ensureNode18();

const scriptName = "emit-completion-summary.mjs";

function averageScore(scorecard) {
  const values = Object.values(scorecard || {}).filter((value) => Number.isInteger(value));
  if (values.length === 0) return "";
  return (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1);
}

function collectLensScores(root, ledger) {
  const rows = [];
  for (const entry of ledger.review_record_artifacts || []) {
    const resolved = resolveRepoPath(root, entry.artifact_path);
    if (!resolved) {
      throw Object.assign(new Error(`invalid review artifact path ${entry.artifact_path}`), { exitCode: EXIT_CODES.validation });
    }
    const review = readJsonFile(resolved);
    const failures = validateReviewRecord(review, {
      artifactRoot: root,
      targetRevision: ledger.target_revision,
      artifactPath: entry.artifact_path
    });
    if (failures.length > 0) {
      throw Object.assign(new Error(`review artifact failed validation ${entry.artifact_path}`), { exitCode: EXIT_CODES.validation });
    }
    rows.push({
      record_id: review.record_id,
      lens: review.lens,
      verdict: review.verdict,
      material_blockers: review.material_blockers,
      scorecard: review.scorecard,
      average_score: averageScore(review.scorecard)
    });
  }
  return rows.sort((a, b) => a.lens.localeCompare(b.lens));
}

function asMarkdown(ledger, synthesis, synthesisPath, lensScores) {
  const lines = [];
  if (ledger.run_mode === "inline") {
    lines.push("Inline LensTemper-style review");
    lines.push("Not independently reviewed");
    lines.push("No spawned reviewers used");
    lines.push("Scores are advisory, not lockable");
    lines.push("");
  } else if (ledger.run_mode === "advisory") {
    lines.push("Advisory LensTemper critique");
    lines.push("Not a completed LensTemper pass");
    lines.push("No lock states available");
    lines.push("Scores, if present, are advisory only");
    lines.push("");
  } else if (ledger.run_mode === "full" && ledger.run_scope === "selected_lenses") {
    lines.push("Full LensTemper review for selected lenses only");
    lines.push("");
  } else if (ledger.run_mode === "full" && ledger.run_scope === "six_lens") {
    lines.push("LensTemper pass complete");
    lines.push("");
  }
  lines.push(`Final assessment: ${synthesis.final_assessment || "not recorded"}`);
  lines.push(`Target: ${ledger.target_path} at ${ledger.target_revision}`);
  lines.push(`Artifact storage: ${(ledger.archive_paths || []).join(", ") || "not archived"}`);
  lines.push("");
  lines.push("| Lens | Verdict | Average score | Material blockers |");
  lines.push("|------|---------|---------------|-------------------|");
  for (const row of lensScores) {
    const blockers = row.material_blockers?.present
      ? `${row.material_blockers.count}: ${row.material_blockers.summary}`
      : "none";
    lines.push(`| ${row.lens} | ${row.verdict} | ${row.average_score}/5 | ${blockers} |`);
  }
  lines.push("");
  lines.push("| Lens | Status | Rerun needed | Reason |");
  lines.push("|------|--------|--------------|--------|");
  for (const lock of synthesis.lens_lock_decisions || []) {
    lines.push(`| ${lock.lens} | ${lock.lock_state} | ${lock.rerun_needed ? "yes" : "no"} | ${lock.reason || ""} |`);
  }
  lines.push("");
  lines.push("Accepted findings:");
  for (const decision of synthesis.finding_decisions || []) {
    if (decision.decision === "accepted") lines.push(`- ${decision.finding_id}: ${decision.reason}`);
  }
  lines.push("");
  lines.push("Verification evidence: reviewer outputs captured, current records validated, synthesis emitted.");
  lines.push(`Synthesis artifact: ${synthesisPath}`);
  return `${lines.join("\n")}\n`;
}

try {
  const opts = parseCommonArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(`${usage(scriptName, "--ledger <ledger-json> --synthesis <synthesis-json> [--out <path.md|path.json>] [--json] [--quiet]")}\n`);
    process.exit(EXIT_CODES.ok);
  }
  if (opts.version) {
    process.stdout.write(`${CONTRACT_VERSION}\n`);
    process.exit(EXIT_CODES.ok);
  }
  if (!opts.ledger || !opts.synthesis) {
    process.stderr.write(`${usage(scriptName, "--ledger <ledger-json> --synthesis <synthesis-json> [--out <path.md|path.json>]")}\n`);
    process.stderr.write(`validation error: missing --ledger or --synthesis\n`);
    process.exit(EXIT_CODES.usage);
  }
  const root = repoRootFrom(import.meta.url);
  const ledger = readJsonFile(opts.ledger);
  const synthesis = readJsonFile(opts.synthesis);
  const lensScores = collectLensScores(root, ledger);
  const summary = {
    schema_version: 1,
    run_mode: ledger.run_mode,
    run_scope: ledger.run_scope,
    final_assessment: synthesis.final_assessment,
    target_path: ledger.target_path,
    target_revision: ledger.target_revision,
    claim_flags: synthesis.claim_flags || {
      completion: false,
      lock_state: false,
      all_5_lockable: false,
      review_complete: false
    },
    artifact_storage: ledger.archive_paths || [],
    lens_scores: lensScores,
    accepted_findings: (synthesis.finding_decisions || []).filter((entry) => entry.decision === "accepted"),
    rerun_or_lock_status: synthesis.lens_lock_decisions || [],
    verification_evidence: "reviewer outputs captured and validators passed"
  };
  const text = asMarkdown(ledger, synthesis, opts.synthesis, lensScores);
  summary.summary_text = text;
  const summaryFailures = validateCompletionSummaryRecord(summary, {
    artifactRoot: root,
    targetRevision: ledger.target_revision,
    artifactPath: "emit-completion-summary"
  });
  if (summaryFailures.length > 0) {
    process.stderr.write(summaryFailures.map((failure) => `${failure.artifact_path} field=${failure.field} expected=${failure.expected} actual=${failure.actual}`).join("\n"));
    process.stderr.write("\n");
    process.exit(EXIT_CODES.validation);
  }
  if (opts.out) {
    if (!isRepoRelativePath(opts.out)) {
      process.stderr.write(`validation error: --out must be repository-relative\n`);
      process.exit(EXIT_CODES.usage);
    }
    const outPath = resolveRepoPath(root, opts.out);
    mkdirSync(dirname(outPath), { recursive: true });
    const writesJson = opts.json || opts.out.toLowerCase().endsWith(".json");
    writeFileSync(outPath, writesJson ? `${JSON.stringify(summary, null, 2)}\n` : text, "utf8");
    if (!opts.quiet) process.stdout.write(`wrote ${opts.out}\n`);
  } else if (opts.json) {
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  } else {
    process.stdout.write(text);
  }
} catch (error) {
  process.stderr.write(`${usage(scriptName, "--ledger <ledger-json> --synthesis <synthesis-json> [--out <path.md|path.json>]")}\n`);
  process.stderr.write(`validation error: ${error.message}\n`);
  process.exit(error.exitCode || EXIT_CODES.internal);
}
