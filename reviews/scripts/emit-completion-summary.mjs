#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  CONTRACT_VERSION,
  EXIT_CODES,
  deliveredFromDecisions,
  ensureNode18,
  formatDelivered,
  isBlockingGapDecision,
  isMinorIssueDecision,
  isQuestionDecision,
  isRepoRelativePath,
  loadValidatedRunContext,
  normalizeRepoInputPath,
  lensStateOf,
  parseCommonArgs,
  projectRootFrom,
  readJsonFile,
  readSynthesisDeliveredLine,
  registeredArtifactFailures,
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

// Blocking gaps are counted from the finding decisions. Reviewer Open
// Questions, and minor issues without a decision, exist only in the synthesis
// Markdown, so its line may raise those two counts; the synthesis validator has
// already checked that line against the decisions.
function deliveredCounts(root, synthesis) {
  const counted = deliveredFromDecisions(synthesis.finding_decisions);
  const line = readSynthesisDeliveredLine(root, synthesis);
  return {
    blocking_gaps: counted.blocking_gaps,
    minor_issues: Math.max(counted.minor_issues, line?.minor_issues ?? 0),
    questions: Math.max(counted.questions, line?.questions ?? 0)
  };
}

function git(root, args) {
  try {
    return { ok: true, out: execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }) };
  } catch (error) {
    return { ok: false, status: error.status };
  }
}

// Whether the run's artifacts are committed, ignored/local-only, or stored
// outside git, as the completion summary must say.
function artifactStatus(root, paths) {
  if (paths.length === 0) return "not archived";
  if (!git(root, ["rev-parse", "--is-inside-work-tree"]).ok) return "stored outside git (the project root is not a git work tree)";
  return paths.map((path) => {
    if (git(root, ["check-ignore", "-q", "--", path]).ok) return `${path}: ignored/local-only`;
    const tracked = (git(root, ["ls-files", "--", path]).out || "").trim();
    const changes = (git(root, ["status", "--porcelain", "--untracked-files=all", "--", path]).out || "").trim();
    if (!tracked) return `${path}: not committed (untracked; commit it or keep it local-only)`;
    if (changes) return `${path}: committed, with uncommitted changes`;
    return `${path}: committed`;
  }).join("; ");
}

// Reviewer closure and direct-read evidence come from the validated current
// review records, not from a fixed sentence.
function verificationEvidence(ledger, reviews, synthesis) {
  const records = reviews.map((entry) => entry.record);
  const total = records.length;
  const spawned = records.filter((record) => ["fresh_spawned_lens_reviewers", "fresh_spawned_orchestrator"].includes(record.execution_mode));
  const closed = spawned.filter((record) => record.status === "completed" && record.closed === true && record.output_captured === true);
  const direct = records.filter((record) => (record.provenance?.input_sources || []).some((source) => source.basis === "direct_workspace_read"
    && source.target_included === true && (source.paths_reviewed || []).includes(record.target_path)));
  const closure = spawned.length > 0
    ? `reviewers terminal and closed: ${closed.length}/${spawned.length} spawned reviewers completed, captured, and closed`
    : `reviewers terminal and closed: not applicable (execution_mode ${ledger.execution_mode}; no spawned reviewers)`;
  return [
    `reviewer outputs captured: ${total}/${(ledger.selected_lenses || []).length} selected lenses`,
    closure,
    `current reviewers read current workspace files directly: ${direct.length}/${total} read ${ledger.target_path} at ${ledger.target_revision}`,
    `validators run: ledger, ${total} current review records, and synthesis ${synthesis.record_id} validated; Review delivered line checked against its finding decisions`
  ].join("; ");
}

function asMarkdown(ledger, synthesis, synthesisPath, lensScores, delivered, status, evidence) {
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
  lines.push(formatDelivered(delivered));
  lines.push(`Final assessment: ${synthesis.final_assessment || "not recorded"}`);
  lines.push(`Target: ${ledger.target_path} at ${ledger.target_revision}`);
  if (ledger.review_input_revision) lines.push(`Review input revision: ${ledger.review_input_revision}`);
  lines.push(`Artifact storage: ${(ledger.archive_paths || []).join(", ") || "not archived"}`);
  lines.push(`Artifact status: ${status}`);
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
    ["Accepted findings:", isBlockingGapDecision],
    ["Minor issues:", isMinorIssueDecision],
    ["Deferred risks:", (entry) => entry.decision === "deferred"],
    ["Questions for the author (reviewer Open Questions are also in the synthesis Questions for the Author section):", isQuestionDecision]
  ];
  for (const [heading, matches] of groups) {
    const entries = decisions.filter(matches);
    lines.push(heading);
    if (entries.length === 0) lines.push("- None");
    for (const entry of entries) lines.push(`- ${entry.finding_id}: ${entry.reason}`);
    lines.push("");
  }
  lines.push(`Verification evidence: ${evidence}.`);
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
    throw Object.assign(new Error(`synthesis ${synthesis.record_id} is not current in the ledger; attach it first with update-ledger.mjs --ledger ${opts.ledger} --synthesis ${opts.synthesis} --write`), { exitCode: EXIT_CODES.validation });
  }
  const registeredFailures = registeredArtifactFailures(root, ledger, "synthesis", synthesis, opts.synthesis);
  if (registeredFailures.length > 0) throw validationError(registeredFailures, "synthesis trust chain failed");
  const lensScores = collectLensScores(context.reviews);
  const delivered = deliveredCounts(root, synthesis);
  const status = artifactStatus(root, ledger.archive_paths || []);
  const evidence = verificationEvidence(ledger, context.reviews, synthesis);
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
    synthesis_record_id: synthesis.record_id,
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
    artifact_status: status,
    lens_scores: lensScores,
    accepted_findings: (synthesis.finding_decisions || []).filter((entry) => entry.decision === "accepted"),
    rerun_or_lock_status: (synthesis.lens_lock_decisions || []).map((entry) => ({ ...entry, lens_state: lensStateOf(entry) })),
    verification_evidence: evidence
  };
  const text = asMarkdown(ledger, synthesis, opts.synthesis, lensScores, delivered, status, evidence);
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
