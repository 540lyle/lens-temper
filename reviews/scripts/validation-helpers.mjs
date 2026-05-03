import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
  ARTIFACT_VISIBILITY,
  CLAIM_FLAG_KEYS,
  COMPLETION_SUMMARY_REQUIRED_FIELDS,
  CONTRACT_VERSION,
  CROSS_CUTTING_KEYS,
  CROSS_CUTTING_STATUS_VALUES,
  EXECUTION_MODES,
  EXIT_CODES,
  FINAL_ASSESSMENTS,
  FINDING_DECISIONS,
  FINDING_SEVERITIES,
  LEDGER_REQUIRED_FIELDS,
  LEDGER_STATUSES,
  LOCK_STATES,
  PROVENANCE_BASIS_VALUES,
  REQUIRED_MARKDOWN_SECTIONS,
  REVIEW_COMPLETED_REQUIRED_FIELDS,
  REVIEW_REQUIRED_FIELDS,
  REVIEW_STATUSES,
  REVIEW_VERDICTS,
  RUN_MODES,
  RUN_SCOPES,
  SCHEMA_VERSION,
  SCORE_CHALLENGE_KEYS,
  SCORECARD_KEYS,
  SYNTHESIS_REQUIRED_FIELDS
} from "./validation-contracts.mjs";

export { CONTRACT_VERSION, EXIT_CODES };

export function repoRootFrom(importMetaUrl = import.meta.url) {
  const here = dirname(fileURLToPath(importMetaUrl));
  return resolve(here, "../..");
}

export function usage(scriptName, argsText) {
  return `Usage: node reviews/scripts/${scriptName} ${argsText}`;
}

export function parseCommonArgs(argv) {
  const opts = {
    positional: [],
    artifactRoot: null,
    targetRevision: null,
    ledger: null,
    quiet: false,
    json: false,
    help: false,
    version: false,
    updateCounts: false,
    out: null,
    lens: null,
    passId: null,
    target: null,
    featureRequest: "",
    relevantContext: "",
    constraints: "",
    previousAdjudications: "",
    write: false,
    synthesis: null,
    title: null,
    review: null,
    inputPacket: null,
    final: null,
    archiveRoot: null,
    changedDomains: "",
    runMode: null,
    runScope: null
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help") opts.help = true;
    else if (arg === "--version") opts.version = true;
    else if (arg === "--quiet") opts.quiet = true;
    else if (arg === "--json") opts.json = true;
    else if (arg === "--update-counts") opts.updateCounts = true;
    else if (arg === "--write") opts.write = true;
    else if (arg.startsWith("--")) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      if (!(key in opts)) {
        throw Object.assign(new Error(`unsupported option ${arg}`), { exitCode: EXIT_CODES.usage });
      }
      i += 1;
      if (i >= argv.length) {
        throw Object.assign(new Error(`missing value for ${arg}`), { exitCode: EXIT_CODES.usage });
      }
      opts[key] = argv[i];
    } else {
      opts.positional.push(arg);
    }
  }
  return opts;
}

export function readJsonFile(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw Object.assign(new Error(`cannot read JSON: ${error.message}`), { exitCode: EXIT_CODES.read });
  }
}

export function readTextFile(path) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    throw Object.assign(new Error(`cannot read file: ${error.message}`), { exitCode: EXIT_CODES.read });
  }
}

export function isRepoRelativePath(value) {
  if (typeof value !== "string" || value.length === 0) return false;
  if (value.includes("\\")) return false;
  if (value === "." || value.includes("../") || value.includes("/..")) return false;
  if (value.includes("/./") || value.startsWith("./")) return false;
  if (/^[A-Za-z]:/.test(value)) return false;
  if (isAbsolute(value)) return false;
  return true;
}

export function resolveRepoPath(root, value) {
  const resolved = resolve(root, value);
  const rel = relative(root, resolved);
  if (rel.startsWith("..") || isAbsolute(rel)) return null;
  return resolved;
}

export function toRepoPath(root, filePath) {
  return relative(root, resolve(filePath)).replace(/\\/g, "/");
}

export function normalizeRepoInputPath(root, value) {
  if (typeof value !== "string" || value.length === 0) return null;
  if (isRepoRelativePath(value)) return value;
  const resolved = resolve(value);
  const rel = relative(root, resolved);
  if (rel.startsWith("..") || isAbsolute(rel)) return null;
  return rel.replace(/\\/g, "/");
}

export function makeTargetSlug(targetPath) {
  const withoutExtension = targetPath.replace(/\.[^/.]+$/, "");
  const slug = withoutExtension
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "target";
}

export function archiveRunPath(targetPath, passId, date = new Date()) {
  const day = date.toISOString().slice(0, 10);
  const safePassId = String(passId || "pass")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `reviews/archive/${day}-${makeTargetSlug(targetPath)}-${safePassId || "pass"}`;
}

export function makeFailure(artifactPath, record, field, expected, actual, message) {
  return {
    artifact_path: artifactPath,
    record_id: record && record.record_id ? record.record_id : undefined,
    field,
    expected,
    actual,
    message
  };
}

export function formatFailure(failure) {
  const parts = [
    failure.artifact_path || "artifact",
    failure.record_id ? `record=${failure.record_id}` : null,
    `field=${failure.field}`,
    `expected=${failure.expected}`,
    `actual=${String(failure.actual)}`,
    failure.message ? `message=${failure.message}` : null
  ].filter(Boolean);
  return parts.join(" ");
}

export function printFailures(failures, opts = {}) {
  const sorted = [...failures].sort((a, b) => formatFailure(a).localeCompare(formatFailure(b)));
  for (const failure of sorted) {
    if (opts.json) {
      process.stdout.write(`${JSON.stringify({ event: "validation_error", ...failure })}\n`);
    } else {
      process.stderr.write(`${formatFailure(failure)}\n`);
    }
  }
}

export function requireFields(record, required, artifactPath, failures) {
  for (const field of required) {
    if (!(field in record)) {
      failures.push(makeFailure(artifactPath, record, field, "present", "missing"));
    }
  }
}

export function validateEnum(value, allowed, artifactPath, record, field, failures) {
  if (!allowed.includes(value)) {
    failures.push(makeFailure(artifactPath, record, field, allowed.join("|"), value));
  }
}

export function validateSchemaVersion(record, artifactPath, failures) {
  if (record.schema_version !== SCHEMA_VERSION) {
    failures.push(makeFailure(artifactPath, record, "schema_version", SCHEMA_VERSION, record.schema_version));
  }
}

export function validatePathField(root, artifactPath, record, field, failures, options = {}) {
  const value = record[field];
  if (!isRepoRelativePath(value)) {
    failures.push(makeFailure(artifactPath, record, field, "repository-relative path", value));
    return null;
  }
  const resolved = resolveRepoPath(root, value);
  if (!resolved) {
    failures.push(makeFailure(artifactPath, record, field, "path under artifact root", value));
    return null;
  }
  if (options.mustExist && !existsSync(resolved)) {
    failures.push(makeFailure(artifactPath, record, field, "existing path", value));
  }
  return resolved;
}

export function computeArtifactSha(root, repoPath) {
  const resolved = resolveRepoPath(root, repoPath);
  if (!resolved || !existsSync(resolved)) {
    throw new Error(`artifact not found: ${repoPath}`);
  }
  try {
    const out = execFileSync("git", ["hash-object", "--", repoPath], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    if (out) return `git:${out}`;
  } catch {
    // Fall through to sha256.
  }
  const hash = createHash("sha256").update(readFileSync(resolved)).digest("hex");
  return `sha256:${hash}`;
}

export function validateMarkdownBinding(root, artifactPath, record, sectionKind, failures, options = {}) {
  if (!record.markdown_artifact_path && !record.markdown_artifact_sha) {
    if (options.required) {
      for (const field of REVIEW_COMPLETED_REQUIRED_FIELDS) {
        failures.push(makeFailure(artifactPath, record, field, "present for completed record", record[field]));
      }
    }
    return;
  }
  if (!record.markdown_artifact_path || !record.markdown_artifact_sha) {
    failures.push(makeFailure(artifactPath, record, "markdown_artifact_sha", "present when markdown_artifact_path is present", record.markdown_artifact_sha));
    return;
  }
  const resolved = validatePathField(root, artifactPath, record, "markdown_artifact_path", failures, { mustExist: true });
  if (!resolved || !existsSync(resolved)) return;

  let actual;
  try {
    actual = computeArtifactSha(root, record.markdown_artifact_path);
  } catch (error) {
    failures.push(makeFailure(artifactPath, record, "markdown_artifact_sha", "computed hash", error.message));
    return;
  }
  if (actual !== record.markdown_artifact_sha) {
    failures.push(makeFailure(artifactPath, record, "markdown_artifact_sha", record.markdown_artifact_sha, actual));
  }

  const text = readTextFile(resolved);
  for (const section of REQUIRED_MARKDOWN_SECTIONS[sectionKind] || []) {
    if (!text.includes(section)) {
      failures.push(makeFailure(artifactPath, record, "markdown_section", section, "missing"));
    }
  }
}

export function validateScorecard(record, artifactPath, failures) {
  if (!record.scorecard || typeof record.scorecard !== "object") {
    failures.push(makeFailure(artifactPath, record, "scorecard", "object", record.scorecard));
    return;
  }
  for (const key of SCORECARD_KEYS) {
    const value = record.scorecard[key];
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      failures.push(makeFailure(artifactPath, record, `scorecard.${key}`, "integer 1..5", value));
    }
  }
}

export function validateCrossCutting(record, artifactPath, failures) {
  if (!record.cross_cutting_status || typeof record.cross_cutting_status !== "object") {
    failures.push(makeFailure(artifactPath, record, "cross_cutting_status", "object", record.cross_cutting_status));
    return;
  }
  for (const key of CROSS_CUTTING_KEYS) {
    validateEnum(record.cross_cutting_status[key], CROSS_CUTTING_STATUS_VALUES, artifactPath, record, `cross_cutting_status.${key}`, failures);
  }
}

export function validateMaterialBlockers(record, artifactPath, failures) {
  const mb = record.material_blockers;
  if (!mb || typeof mb !== "object") {
    failures.push(makeFailure(artifactPath, record, "material_blockers", "object", mb));
    return;
  }
  if (typeof mb.present !== "boolean") {
    failures.push(makeFailure(artifactPath, record, "material_blockers.present", "boolean", mb.present));
  }
  if (!Number.isInteger(mb.count) || mb.count < 0) {
    failures.push(makeFailure(artifactPath, record, "material_blockers.count", "non-negative integer", mb.count));
  }
  if (typeof mb.summary !== "string" || mb.summary.length === 0) {
    failures.push(makeFailure(artifactPath, record, "material_blockers.summary", "non-empty string", mb.summary));
  }
}

export function validateRunMode(record, artifactPath, failures, options = {}) {
  validateEnum(record.run_mode, RUN_MODES, artifactPath, record, "run_mode", failures);
  if (record.run_scope !== undefined) {
    validateEnum(record.run_scope, RUN_SCOPES, artifactPath, record, "run_scope", failures);
  }
  if (!record.execution_mode) return;
  if (record.run_mode === "full" && record.execution_mode !== "fresh_spawned_lens_reviewers") {
    failures.push(makeFailure(artifactPath, record, "execution_mode", "fresh_spawned_lens_reviewers for full run_mode", record.execution_mode));
  }
  if ((record.run_mode === "inline" || record.run_mode === "advisory") && record.execution_mode !== "manual_or_imported") {
    failures.push(makeFailure(artifactPath, record, "execution_mode", "manual_or_imported for inline/advisory run_mode", record.execution_mode));
  }
  if (options.ledger && record.run_mode && record.run_mode !== options.ledger.run_mode) {
    failures.push(makeFailure(artifactPath, record, "run_mode", `matching ledger run_mode ${options.ledger.run_mode}`, record.run_mode));
  }
}

export function validateClaimFlags(record, artifactPath, failures) {
  const flags = record.claim_flags;
  if (!flags || typeof flags !== "object" || Array.isArray(flags)) {
    failures.push(makeFailure(artifactPath, record, "claim_flags", "object", flags));
    return;
  }
  for (const key of CLAIM_FLAG_KEYS) {
    if (typeof flags[key] !== "boolean") {
      failures.push(makeFailure(artifactPath, record, `claim_flags.${key}`, "boolean", flags[key]));
    }
  }
  if (record.run_mode === "inline" || record.run_mode === "advisory") {
    for (const key of CLAIM_FLAG_KEYS) {
      if (flags[key] === true) {
        failures.push(makeFailure(artifactPath, record, `claim_flags.${key}`, false, true, "non-full runs cannot make lockable or completion claims"));
      }
    }
  }
}

export function validateScoreChallenges(record, artifactPath, failures) {
  const challenges = record.score_challenges || {};
  if (record.score_challenges !== undefined && (typeof record.score_challenges !== "object" || Array.isArray(record.score_challenges))) {
    failures.push(makeFailure(artifactPath, record, "score_challenges", "object", record.score_challenges));
    return;
  }
  for (const key of SCORECARD_KEYS) {
    if (record.scorecard?.[key] !== 5) continue;
    const challenge = challenges[key];
    if (!challenge || typeof challenge !== "object" || Array.isArray(challenge)) {
      failures.push(makeFailure(artifactPath, record, `score_challenges.${key}`, "object for 5/5 score", challenge));
      continue;
    }
    for (const field of SCORE_CHALLENGE_KEYS) {
      if (typeof challenge[field] !== "string" || challenge[field].trim().length === 0) {
        failures.push(makeFailure(artifactPath, record, `score_challenges.${key}.${field}`, "non-empty string", challenge[field]));
      }
    }
  }
}

export function validateProvenance(record, root, artifactPath, failures) {
  const provenance = record.provenance;
  if (!provenance || typeof provenance !== "object" || Array.isArray(provenance)) {
    failures.push(makeFailure(artifactPath, record, "provenance", "object", provenance));
    return;
  }
  const sources = provenance.input_sources;
  if (!Array.isArray(sources) || sources.length === 0) {
    failures.push(makeFailure(artifactPath, record, "provenance.input_sources", "non-empty array", sources));
    return;
  }
  let targetIncluded = false;
  for (const [index, source] of sources.entries()) {
    const prefix = `provenance.input_sources[${index}]`;
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      failures.push(makeFailure(artifactPath, record, prefix, "object", source));
      continue;
    }
    if (typeof source.role !== "string" || source.role.trim().length === 0) {
      failures.push(makeFailure(artifactPath, record, `${prefix}.role`, "non-empty string", source.role));
    }
    validateEnum(source.basis, PROVENANCE_BASIS_VALUES, artifactPath, record, `${prefix}.basis`, failures);
    if (typeof source.target_included !== "boolean") {
      failures.push(makeFailure(artifactPath, record, `${prefix}.target_included`, "boolean", source.target_included));
    }
    if (source.target_included === true) targetIncluded = true;
    if (!Array.isArray(source.paths_reviewed)) {
      failures.push(makeFailure(artifactPath, record, `${prefix}.paths_reviewed`, "array", source.paths_reviewed));
      continue;
    }
    if (source.basis === "direct_workspace_read" && source.paths_reviewed.length === 0) {
      failures.push(makeFailure(artifactPath, record, `${prefix}.paths_reviewed`, "at least one direct workspace path", "empty"));
    }
    if (source.basis !== "direct_workspace_read" && source.paths_reviewed.length > 0) {
      failures.push(makeFailure(artifactPath, record, `${prefix}.paths_reviewed`, "empty for non-direct input basis", source.paths_reviewed.join("|")));
    }
    if (source.basis === "fixture" && !record.fixture_kind) {
      failures.push(makeFailure(artifactPath, record, `${prefix}.basis`, "fixture_kind present for fixture basis", "missing"));
    }
    for (const [pathIndex, repoPath] of source.paths_reviewed.entries()) {
      const field = `${prefix}.paths_reviewed[${pathIndex}]`;
      if (!isRepoRelativePath(repoPath)) {
        failures.push(makeFailure(artifactPath, record, field, "repository-relative path", repoPath));
        continue;
      }
      const resolved = resolveRepoPath(root, repoPath);
      if (!resolved || !existsSync(resolved)) {
        failures.push(makeFailure(artifactPath, record, field, "existing path", repoPath));
      }
    }
    if (source.basis === "direct_workspace_read" && source.target_included === true && record.status === "completed" && !source.paths_reviewed.includes(record.target_path)) {
      failures.push(makeFailure(artifactPath, record, `${prefix}.paths_reviewed`, `includes target_path ${record.target_path}`, source.paths_reviewed.join("|")));
    }
  }
  if (!targetIncluded) {
    failures.push(makeFailure(artifactPath, record, "provenance.input_sources", "one source with target_included=true", "none"));
  }
}

export function validateFindingDecisions(record, artifactPath, failures) {
  if (!Array.isArray(record.finding_decisions)) {
    failures.push(makeFailure(artifactPath, record, "finding_decisions", "array", record.finding_decisions));
    return;
  }
  for (const [index, decision] of record.finding_decisions.entries()) {
    const prefix = `finding_decisions[${index}]`;
    if (!decision.finding_id) failures.push(makeFailure(artifactPath, record, `${prefix}.finding_id`, "stable slug", decision.finding_id));
    if (!decision.source_lens) failures.push(makeFailure(artifactPath, record, `${prefix}.source_lens`, "source lens id", decision.source_lens));
    if (!decision.source_review_record_id) failures.push(makeFailure(artifactPath, record, `${prefix}.source_review_record_id`, "source review record id", decision.source_review_record_id));
    validateEnum(decision.decision, FINDING_DECISIONS, artifactPath, record, `${prefix}.decision`, failures);
    if (decision.severity !== undefined) {
      validateEnum(decision.severity, FINDING_SEVERITIES, artifactPath, record, `${prefix}.severity`, failures);
    }
    if (typeof decision.affects_rerun_scope !== "boolean") {
      failures.push(makeFailure(artifactPath, record, `${prefix}.affects_rerun_scope`, "boolean", decision.affects_rerun_scope));
    }
    if (!decision.reason) failures.push(makeFailure(artifactPath, record, `${prefix}.reason`, "short reason", decision.reason));
  }
}

export function validateLensLocks(record, artifactPath, failures) {
  if (!Array.isArray(record.lens_lock_decisions)) {
    failures.push(makeFailure(artifactPath, record, "lens_lock_decisions", "array", record.lens_lock_decisions));
    return;
  }
  for (const [index, lock] of record.lens_lock_decisions.entries()) {
    const prefix = `lens_lock_decisions[${index}]`;
    if (!lock.lens) failures.push(makeFailure(artifactPath, record, `${prefix}.lens`, "lens id", lock.lens));
    validateEnum(lock.lock_state, LOCK_STATES, artifactPath, record, `${prefix}.lock_state`, failures);
    if (typeof lock.rerun_needed !== "boolean") {
      failures.push(makeFailure(artifactPath, record, `${prefix}.rerun_needed`, "boolean", lock.rerun_needed));
    }
    if (!lock.reason) failures.push(makeFailure(artifactPath, record, `${prefix}.reason`, "short reason", lock.reason));
  }
}

function validatePriorMaterialFindings(record, artifactPath, failures) {
  if (!Array.isArray(record.prior_material_findings_context)) {
    failures.push(makeFailure(artifactPath, record, "prior_material_findings_context", "array", record.prior_material_findings_context));
    return;
  }
  for (const [index, finding] of record.prior_material_findings_context.entries()) {
    const prefix = `prior_material_findings_context[${index}]`;
    for (const field of ["source_record_id", "finding_id", "source_target_path", "source_target_revision"]) {
      if (typeof finding?.[field] !== "string" || finding[field].trim().length === 0) {
        failures.push(makeFailure(artifactPath, record, `${prefix}.${field}`, "non-empty string", finding?.[field]));
      }
    }
    validateEnum(finding?.decision, FINDING_DECISIONS, artifactPath, record, `${prefix}.decision`, failures);
    validateEnum(finding?.severity, FINDING_SEVERITIES, artifactPath, record, `${prefix}.severity`, failures);
  }
}

function validateSynthesisLockClaims(record, currentReviewsByLens, artifactPath, failures) {
  for (const lock of record.lens_lock_decisions || []) {
    if (!["passing_locked", "converged_locked"].includes(lock.lock_state)) continue;
    if (record.run_mode !== "full") {
      failures.push(makeFailure(artifactPath, record, `lens_lock_decisions.${lock.lens}.lock_state`, "full run_mode for lockable state", record.run_mode));
      continue;
    }
    const review = currentReviewsByLens.get(lock.lens);
    if (!review) {
      failures.push(makeFailure(artifactPath, record, `lens_lock_decisions.${lock.lens}.source_review`, "current included review for locked lens", "missing"));
      continue;
    }
    if (review.material_blockers?.present !== false) {
      failures.push(makeFailure(artifactPath, review, "material_blockers.present", false, review.material_blockers?.present));
    }
    const scores = SCORECARD_KEYS.map((key) => review.scorecard?.[key]);
    if (lock.lock_state === "passing_locked" && !scores.every((score) => score === 5)) {
      failures.push(makeFailure(artifactPath, review, "scorecard", "all scores 5 for passing_locked", JSON.stringify(review.scorecard)));
    }
    if (lock.lock_state === "converged_locked" && !scores.every((score) => Number.isInteger(score) && score >= 4)) {
      failures.push(makeFailure(artifactPath, review, "scorecard", "all scores >=4 for converged_locked", JSON.stringify(review.scorecard)));
    }
  }
}

function validateCompletionValidation(record, artifactPath, failures) {
  const validation = record.completion_validation;
  if (!validation || typeof validation !== "object" || Array.isArray(validation)) {
    failures.push(makeFailure(artifactPath, record, "completion_validation", "object", validation));
    return;
  }
  for (const field of ["validator_name", "validator_contract_version", "validated_synthesis_record_id"]) {
    if (typeof validation[field] !== "string" || validation[field].trim().length === 0) {
      failures.push(makeFailure(artifactPath, record, `completion_validation.${field}`, "non-empty string", validation[field]));
    }
  }
  if (typeof validation.passed !== "boolean") {
    failures.push(makeFailure(artifactPath, record, "completion_validation.passed", "boolean", validation.passed));
  }
  for (const field of ["validated_review_record_ids", "failures"]) {
    if (!Array.isArray(validation[field])) {
      failures.push(makeFailure(artifactPath, record, `completion_validation.${field}`, "array", validation[field]));
    }
  }
  if (record.status === "completed" && record.run_mode === "full" && validation.passed !== true) {
    failures.push(makeFailure(artifactPath, record, "completion_validation.passed", true, validation.passed));
  }
}

export function validateReviewRecord(record, options = {}) {
  const root = options.artifactRoot || repoRootFrom();
  const artifactPath = options.artifactPath || options.inputPath || record.artifact_path || "review-output";
  const failures = [];
  requireFields(record, REVIEW_REQUIRED_FIELDS, artifactPath, failures);
  validateSchemaVersion(record, artifactPath, failures);
  validateEnum(record.verdict, REVIEW_VERDICTS, artifactPath, record, "verdict", failures);
  validateEnum(record.execution_mode, EXECUTION_MODES, artifactPath, record, "execution_mode", failures);
  validateEnum(record.status, REVIEW_STATUSES, artifactPath, record, "status", failures);
  validateRunMode(record, artifactPath, failures);
  validatePathField(root, artifactPath, record, "target_path", failures, { mustExist: false });
  validatePathField(root, artifactPath, record, "artifact_path", failures, { mustExist: false });
  if (options.targetRevision && record.target_revision !== options.targetRevision) {
    failures.push(makeFailure(artifactPath, record, "target_revision", options.targetRevision, record.target_revision));
  }
  if (!Number.isInteger(record.attempt) || record.attempt < 1) {
    failures.push(makeFailure(artifactPath, record, "attempt", "positive integer", record.attempt));
  }
  validateScorecard(record, artifactPath, failures);
  validateScoreChallenges(record, artifactPath, failures);
  validateCrossCutting(record, artifactPath, failures);
  validateMaterialBlockers(record, artifactPath, failures);
  validateProvenance(record, root, artifactPath, failures);
  const requiresMarkdown = record.status === "completed" || record.fixture_kind !== "schema_only_minimal";
  validateMarkdownBinding(root, artifactPath, record, "review", failures, { required: requiresMarkdown });

  if (record.execution_mode === "fresh_spawned_lens_reviewers" && record.status === "completed") {
    if (!record.agent_id) failures.push(makeFailure(artifactPath, record, "agent_id", "present", record.agent_id));
    if (record.closed !== true) failures.push(makeFailure(artifactPath, record, "closed", true, record.closed));
    if (record.output_captured !== true) failures.push(makeFailure(artifactPath, record, "output_captured", true, record.output_captured));
  }
  return failures;
}

export function validateSynthesisRecord(record, options = {}) {
  const root = options.artifactRoot || repoRootFrom();
  const artifactPath = options.artifactPath || options.inputPath || record.artifact_path || "synthesis-output";
  const failures = [];
  requireFields(record, SYNTHESIS_REQUIRED_FIELDS, artifactPath, failures);
  validateSchemaVersion(record, artifactPath, failures);
  validateEnum(record.final_assessment, FINAL_ASSESSMENTS, artifactPath, record, "final_assessment", failures);
  validateRunMode(record, artifactPath, failures, { ledger: options.ledger });
  validateClaimFlags(record, artifactPath, failures);
  validatePathField(root, artifactPath, record, "target_path", failures, { mustExist: false });
  validatePathField(root, artifactPath, record, "artifact_path", failures, { mustExist: false });
  for (const field of ["included_review_record_ids", "superseded_review_record_ids"]) {
    if (!Array.isArray(record[field])) {
      failures.push(makeFailure(artifactPath, record, field, "array", record[field]));
    }
  }
  if (options.targetRevision && record.target_revision !== options.targetRevision) {
    failures.push(makeFailure(artifactPath, record, "target_revision", options.targetRevision, record.target_revision));
  }
  validateFindingDecisions(record, artifactPath, failures);
  validateLensLocks(record, artifactPath, failures);
  validatePriorMaterialFindings(record, artifactPath, failures);
  validateMarkdownBinding(root, artifactPath, record, "synthesis", failures);

  if (options.ledger) {
    const currentIds = new Set(options.ledger.current_review_record_ids || []);
    const reviewArtifacts = new Map((options.ledger.review_record_artifacts || []).map((entry) => [entry.record_id, entry.artifact_path]));
    const currentReviewsByLens = new Map();
    for (const id of record.included_review_record_ids || []) {
      if (!currentIds.has(id)) {
        failures.push(makeFailure(artifactPath, record, "included_review_record_ids", "current ledger review id", id));
        continue;
      }
      const reviewPath = reviewArtifacts.get(id);
      if (!reviewPath) {
        failures.push(makeFailure(artifactPath, record, "included_review_record_ids", "current ledger artifact mapping", id));
        continue;
      }
      if (!isRepoRelativePath(reviewPath)) {
        failures.push(makeFailure(artifactPath, record, "review_record_artifacts.artifact_path", "repository-relative path", reviewPath));
        continue;
      }
      const resolved = resolveRepoPath(root, reviewPath);
      if (!resolved || !existsSync(resolved)) {
        failures.push(makeFailure(artifactPath, record, "review_record_artifacts.artifact_path", "existing path", reviewPath));
        continue;
      }
      const review = readJsonFile(resolved);
      failures.push(...validateReviewRecord(review, {
        artifactRoot: root,
        targetRevision: record.target_revision,
        artifactPath: reviewPath
      }));
      if (review.status !== "completed") {
        failures.push(makeFailure(artifactPath, review, "status", "completed included review", review.status));
      }
      if (review.status === "completed" && review.lens) {
        currentReviewsByLens.set(review.lens, review);
      }
    }
    validateSynthesisLockClaims(record, currentReviewsByLens, artifactPath, failures);
  }
  return failures;
}

export function validateLedgerRecord(record, options = {}) {
  const root = options.artifactRoot || repoRootFrom();
  const artifactPath = options.artifactPath || options.inputPath || "review-ledger";
  const failures = [];
  requireFields(record, LEDGER_REQUIRED_FIELDS, artifactPath, failures);
  validateSchemaVersion(record, artifactPath, failures);
  validateEnum(record.status, LEDGER_STATUSES, artifactPath, record, "status", failures);
  validateEnum(record.execution_mode, EXECUTION_MODES, artifactPath, record, "execution_mode", failures);
  validateRunMode(record, artifactPath, failures);
  validateEnum(record.artifact_visibility, ARTIFACT_VISIBILITY, artifactPath, record, "artifact_visibility", failures);
  validatePathField(root, artifactPath, record, "target_path", failures, { mustExist: false });
  validateCompletionValidation(record, artifactPath, failures);
  if (options.targetRevision && record.target_revision !== options.targetRevision) {
    failures.push(makeFailure(artifactPath, record, "target_revision", options.targetRevision, record.target_revision));
  }
  for (const field of ["selected_lenses", "current_review_record_ids", "superseded_review_record_ids", "synthesis_record_ids", "archive_paths", "review_record_artifacts", "synthesis_record_artifacts"]) {
    if (!Array.isArray(record[field])) {
      failures.push(makeFailure(artifactPath, record, field, "array", record[field]));
    }
  }
  for (const archivePath of record.archive_paths || []) {
    if (!isRepoRelativePath(archivePath)) {
      failures.push(makeFailure(artifactPath, record, "archive_paths", "repository-relative path", archivePath));
    }
  }

  const reviewArtifacts = new Map((record.review_record_artifacts || []).map((entry) => [entry.record_id, entry.artifact_path]));
  const synthesisArtifacts = new Map((record.synthesis_record_artifacts || []).map((entry) => [entry.record_id, entry.artifact_path]));
  const seenCurrentTuples = new Set();
  const currentIds = new Set(record.current_review_record_ids || []);

  for (const id of currentIds) {
    const reviewPath = reviewArtifacts.get(id);
    if (!reviewPath) {
      failures.push(makeFailure(artifactPath, record, "current_review_record_ids", "artifact mapping", id));
      continue;
    }
    if (!isRepoRelativePath(reviewPath)) {
      failures.push(makeFailure(artifactPath, record, "review_record_artifacts.artifact_path", "repository-relative path", reviewPath));
      continue;
    }
    const resolved = resolveRepoPath(root, reviewPath);
    if (!resolved || !existsSync(resolved)) {
      failures.push(makeFailure(artifactPath, record, "review_record_artifacts.artifact_path", "existing path", reviewPath));
      continue;
    }
    const review = readJsonFile(resolved);
    const reviewFailures = validateReviewRecord(review, {
      artifactRoot: root,
      targetRevision: record.target_revision,
      artifactPath: reviewPath
    });
    failures.push(...reviewFailures);
    if (review.run_mode !== record.run_mode) {
      failures.push(makeFailure(artifactPath, review, "run_mode", `matching ledger run_mode ${record.run_mode}`, review.run_mode));
    }
    if (review.status !== "completed") {
      failures.push(makeFailure(artifactPath, review, "status", "completed current review", review.status));
    }
    const tuple = `${review.pass_id}|${review.target_revision}|${review.lens}|${review.attempt}`;
    if (seenCurrentTuples.has(tuple)) {
      failures.push(makeFailure(artifactPath, review, "attempt", "unique current pass/target/lens/attempt", tuple));
    }
    seenCurrentTuples.add(tuple);
  }

  for (const id of record.synthesis_record_ids || []) {
    const synthesisPath = synthesisArtifacts.get(id);
    if (!synthesisPath) {
      failures.push(makeFailure(artifactPath, record, "synthesis_record_ids", "artifact mapping", id));
      continue;
    }
    if (!isRepoRelativePath(synthesisPath)) {
      failures.push(makeFailure(artifactPath, record, "synthesis_record_artifacts.artifact_path", "repository-relative path", synthesisPath));
      continue;
    }
    const resolved = resolveRepoPath(root, synthesisPath);
    if (!resolved || !existsSync(resolved)) {
      failures.push(makeFailure(artifactPath, record, "synthesis_record_artifacts.artifact_path", "existing path", synthesisPath));
      continue;
    }
    const synthesis = readJsonFile(resolved);
    failures.push(...validateSynthesisRecord(synthesis, {
      artifactRoot: root,
      targetRevision: record.target_revision,
      ledger: record,
      artifactPath: synthesisPath
    }));
  }

  return failures;
}

export function validateCompletionSummaryRecord(record, options = {}) {
  const root = options.artifactRoot || repoRootFrom();
  const artifactPath = options.artifactPath || options.inputPath || "completion-summary";
  const failures = [];
  requireFields(record, COMPLETION_SUMMARY_REQUIRED_FIELDS, artifactPath, failures);
  validateSchemaVersion(record, artifactPath, failures);
  validateRunMode(record, artifactPath, failures);
  validateEnum(record.run_scope, RUN_SCOPES, artifactPath, record, "run_scope", failures);
  validatePathField(root, artifactPath, record, "target_path", failures, { mustExist: false });
  if (options.targetRevision && record.target_revision !== options.targetRevision) {
    failures.push(makeFailure(artifactPath, record, "target_revision", options.targetRevision, record.target_revision));
  }
  validateClaimFlags(record, artifactPath, failures);

  const text = String(record.summary_text || "");
  const forbiddenClaims = [
    ["completion", /\bLensTemper pass complete\b/i],
    ["review_complete", /\breview complete\b/i],
    ["all_5_lockable", /\ball\s*5\/5\b/i],
    ["lock_state", /\bpassing_locked\b|\bconverged_locked\b/i]
  ];
  if (record.run_mode !== "full") {
    for (const [claimType, pattern] of forbiddenClaims) {
      if (pattern.test(text)) {
        failures.push(makeFailure(artifactPath, record, `summary_text.${claimType}`, "no lockable/completion wording for non-full run", "forbidden phrase"));
      }
    }
  }
  if (record.run_mode === "inline") {
    for (const phrase of ["Inline LensTemper-style review", "Not independently reviewed", "No spawned reviewers used", "Scores are advisory, not lockable"]) {
      if (!text.includes(phrase)) {
        failures.push(makeFailure(artifactPath, record, "summary_text.inline_fallback", phrase, "missing"));
      }
    }
  }
  if (record.run_mode === "advisory") {
    for (const phrase of ["Advisory LensTemper critique", "Not a completed LensTemper pass", "No lock states available", "Scores, if present, are advisory only"]) {
      if (!text.includes(phrase)) {
        failures.push(makeFailure(artifactPath, record, "summary_text.advisory_fallback", phrase, "missing"));
      }
    }
  }
  if (record.run_mode === "full" && record.run_scope === "selected_lenses" && text.includes("LensTemper pass complete") && !text.includes("Full LensTemper review for selected lenses only")) {
    failures.push(makeFailure(artifactPath, record, "summary_text.scope_label", "selected-lens scope label", "missing"));
  }
  return failures;
}

export function ensureNode18() {
  const major = Number.parseInt(process.versions.node.split(".")[0], 10);
  if (major < 18) {
    process.stderr.write(`Node 18+ required, actual=${process.versions.node}\n`);
    process.exit(EXIT_CODES.internal);
  }
}

export function writeJsonLinesEvent(event, data) {
  process.stdout.write(`${JSON.stringify({ event, ...data })}\n`);
}

export function ensureParentDirectoryPath(root, repoPath) {
  const resolved = resolveRepoPath(root, repoPath);
  if (!resolved) return null;
  return normalize(resolved);
}

export function fileExistsAt(root, repoPath) {
  const resolved = resolveRepoPath(root, repoPath);
  return Boolean(resolved && existsSync(resolved) && statSync(resolved).isFile());
}
