#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  CONTRACT_VERSION,
  EXIT_CODES,
  ensureNode18,
  isRepoRelativePath,
  loadValidatedRunContext,
  normalizeRepoInputPath,
  lensStateOf,
  parseCommonArgs,
  projectRootFrom,
  readJsonFile,
  readTextFile,
  resolveRepoPath,
  usage,
  validateCompletionSummaryRecord,
  validateSynthesisRecord,
  validationError
} from "./validation-helpers.mjs";
import { SCORECARD_KEYS } from "./validation-contracts.mjs";

ensureNode18();

const scriptName = "emit-completion-summary.mjs";
const usageText = "--ledger <ledger-json> --synthesis <synthesis-json> [--out <path.md|path.json>] [--root <path>] [--json] [--quiet]";

function averageScore(scorecard) {
  const values = Object.values(scorecard || {}).filter((value) => Number.isInteger(value));
  if (values.length === 0) return "";
  return (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1);
}

function collectLensScores(reviews) {
  const rows = [];
  for (const { record: review } of reviews) {
    rows.push({
      record_id: review.record_id,
      lens: review.lens,
      verdict: review.verdict,
      blocking: review.blocking || (review.material_blockers?.present ? "yes" : "no"),
      goal_fit: review.goal_fit || "not recorded",
      material_blockers: review.material_blockers,
      scorecard: review.scorecard,
      average_score: averageScore(review.scorecard)
    });
  }
  return rows.sort((a, b) => a.lens.localeCompare(b.lens));
}

const DELIVERED_LINE = /^Review delivered: (\d+) blocking gaps?, (\d+) minor issues?, (\d+) questions?\s*$/m;
const isBlockingGap = (entry) => entry.decision === "accepted" && entry.severity !== "minor";
const isMinorIssue = (entry) => (entry.decision === "accepted" && entry.severity === "minor") || entry.decision === "downgraded";

// The synthesis ends with its own delivered line, counting its Blocking Gaps,
// Minor Issues, and Questions for the Author. Reviewer Open Questions exist
// only in that Markdown, so its line wins; without one, the counts come from
// the finding decisions.
function deliveredCounts(root, synthesis) {
  const markdownPath = synthesis.markdown_artifact_path ? resolveRepoPath(root, synthesis.markdown_artifact_path) : null;
  const match = markdownPath && existsSync(markdownPath) ? readTextFile(markdownPath).match(DELIVERED_LINE) : null;
  if (match) return { blocking_gaps: Number(match[1]), minor_issues: Number(match[2]), questions: Number(match[3]) };
  const decisions = synthesis.finding_decisions || [];
  return {
    blocking_gaps: decisions.filter(isBlockingGap).length,
    minor_issues: decisions.filter(isMinorIssue).length,
    questions: decisions.filter((entry) => entry.decision === "needs_author").length
  };
}

function asMarkdown(ledger, synthesis, synthesisPath, lensScores, delivered) {
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
    // A focused run delivers a review; it does not claim a complete pass.
    lines.push(`Full LensTemper review for selected lenses only: ${(ledger.selected_lenses || []).join(", ")}`);
    lines.push("");
  } else if (ledger.run_mode === "full" && ledger.run_scope === "core_profile" && ledger.core_gate_passed) {
    lines.push("LensTemper pass complete");
    lines.push(`Core profile: ${ledger.core_profile_id}`);
    lines.push("");
  }
  lines.push(`Review delivered: ${delivered.blocking_gaps} blocking gaps, ${delivered.minor_issues} minor issues, ${delivered.questions} questions`);
  lines.push(`Final assessment: ${synthesis.final_assessment || "not recorded"}`);
  lines.push(`Target: ${ledger.target_path} at ${ledger.target_revision}`);
  if (ledger.review_input_revision) lines.push(`Review input revision: ${ledger.review_input_revision}`);
  lines.push(`Artifact storage: ${(ledger.archive_paths || []).join(", ") || "not archived"}`);
  lines.push("");
  const states = new Map((synthesis.lens_lock_decisions || []).map((entry) => [entry.lens, entry]));
  lines.push("| Lens | Verdict | Goal Fit | Correctness | Completeness | Risk Awareness | Testability | Maintainability | Ship Readiness | Material Blockers | State |");
  lines.push("|------|---------|----------|-------------|--------------|----------------|-------------|-----------------|----------------|-------------------|-------|");
  for (const row of lensScores) {
    const blockers = row.material_blockers?.present
      ? `${row.material_blockers.count}: ${row.material_blockers.summary}`
      : "none";
    const scores = SCORECARD_KEYS.map((key) => (Number.isInteger(row.scorecard?.[key]) ? `${row.scorecard[key]}/5` : "-"));
    const state = states.has(row.lens) ? lensStateOf(states.get(row.lens)) : "not recorded";
    lines.push(`| ${row.lens} | ${row.verdict} | ${row.goal_fit} | ${scores.join(" | ")} | ${blockers} | ${state} |`);
  }
  lines.push("");
  lines.push("| Lens | Rerun needed | Reason |");
  lines.push("|------|--------------|--------|");
  for (const entry of synthesis.lens_lock_decisions || []) {
    lines.push(`| ${entry.lens} | ${lensStateOf(entry) === "open" ? "yes" : "no"} | ${entry.reason || ""} |`);
  }
  lines.push("");
  // Every decision the owner must see is listed; only rejected findings stay
  // in the synthesis alone, each with its reason.
  const decisions = synthesis.finding_decisions || [];
  const groups = [
    ["Accepted findings:", isBlockingGap],
    ["Minor issues:", isMinorIssue],
    ["Deferred risks:", (entry) => entry.decision === "deferred"],
    ["Questions for the author (reviewer Open Questions are also in the synthesis Questions for the Author section):", (entry) => entry.decision === "needs_author"]
  ];
  for (const [heading, matches] of groups) {
    const entries = decisions.filter(matches);
    lines.push(heading);
    if (entries.length === 0) lines.push("- None");
    for (const entry of entries) lines.push(`- ${entry.finding_id}: ${entry.reason}`);
    lines.push("");
  }
  lines.push("Verification evidence: reviewer outputs captured, current records validated, synthesis emitted.");
  lines.push(`Synthesis artifact: ${synthesisPath}`);
  return `${lines.join("\n")}\n`;
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
  if (!opts.ledger || !opts.synthesis) {
    process.stderr.write(`${usage(scriptName, usageText)}\n`);
    process.stderr.write(`validation error: missing --ledger or --synthesis\n`);
    process.exit(EXIT_CODES.usage);
  }
  const root = projectRootFrom(opts);
  const context = await loadValidatedRunContext(root, opts.ledger);
  const ledger = context.ledger;
  const synthesisPath = normalizeRepoInputPath(root, opts.synthesis);
  const synthesisResolved = synthesisPath ? resolveRepoPath(root, synthesisPath) : null;
  if (!synthesisResolved) throw Object.assign(new Error(`--synthesis must resolve under the project root ${root}`), { exitCode: EXIT_CODES.usage });
  const synthesis = readJsonFile(synthesisResolved);
  const synthesisFailures = validateSynthesisRecord(synthesis, {
    artifactRoot: root,
    targetRevision: ledger.target_revision,
    reviewInputRevision: ledger.review_input_revision,
    ledger,
    artifactPath: synthesisPath
  });
  if (synthesisFailures.length > 0) throw validationError(synthesisFailures, "synthesis trust chain failed");
  if (!(ledger.synthesis_record_ids || []).includes(synthesis.record_id)) {
    throw Object.assign(new Error(`synthesis ${synthesis.record_id} is not current in the ledger`), { exitCode: EXIT_CODES.validation });
  }
  const lensScores = collectLensScores(context.reviews);
  const delivered = deliveredCounts(root, synthesis);
  // The summary claims completion only for what the ledger proves: a full run
  // whose core-profile gate passed. The synthesis need not claim it.
  const coreGatePassed = ledger.run_mode === "full" && ledger.run_scope === "core_profile" && ledger.core_gate_passed === true;
  const summary = {
    schema_version: ledger.schema_version,
    run_mode: ledger.run_mode,
    run_scope: ledger.run_scope,
    ...(ledger.run_scope === "core_profile" ? {
      core_profile_id: ledger.core_profile_id,
      required_lens_ids: ledger.required_lens_ids,
      completed_lens_ids: ledger.completed_lens_ids,
      core_gate_passed: ledger.core_gate_passed
    } : {}),
    final_assessment: synthesis.final_assessment,
    target_path: ledger.target_path,
    target_revision: ledger.target_revision,
    ...(ledger.review_input_revision ? { review_input_revision: ledger.review_input_revision } : {}),
    claim_flags: {
      lock_state: false,
      all_5_lockable: false,
      ...synthesis.claim_flags,
      completion: coreGatePassed,
      review_complete: coreGatePassed
    },
    delivered,
    artifact_storage: ledger.archive_paths || [],
    lens_scores: lensScores,
    accepted_findings: (synthesis.finding_decisions || []).filter((entry) => entry.decision === "accepted"),
    rerun_or_lock_status: (synthesis.lens_lock_decisions || []).map((entry) => ({ ...entry, lens_state: lensStateOf(entry) })),
    verification_evidence: "reviewer outputs captured, review records validated, synthesis emitted"
  };
  const text = asMarkdown(ledger, synthesis, opts.synthesis, lensScores, delivered);
  summary.summary_text = text;
  const summaryFailures = validateCompletionSummaryRecord(summary, {
    artifactRoot: root,
    targetRevision: ledger.target_revision,
    reviewInputRevision: ledger.review_input_revision,
    ledger,
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
  process.stderr.write(`${usage(scriptName, usageText)}\n`);
  process.stderr.write(`validation error: ${error.message}\n`);
  process.exit(error.exitCode || EXIT_CODES.internal);
}
