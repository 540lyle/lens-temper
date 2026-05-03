import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
  ARTIFACT_VISIBILITY,
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
  REQUIRED_MARKDOWN_SECTIONS,
  REVIEW_COMPLETED_REQUIRED_FIELDS,
  REVIEW_REQUIRED_FIELDS,
  REVIEW_STATUSES,
  REVIEW_VERDICTS,
  SCHEMA_VERSION,
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
    changedDomains: ""
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

export function validateReviewRecord(record, options = {}) {
  const root = options.artifactRoot || repoRootFrom();
  const artifactPath = options.artifactPath || options.inputPath || record.artifact_path || "review-output";
  const failures = [];
  requireFields(record, REVIEW_REQUIRED_FIELDS, artifactPath, failures);
  validateSchemaVersion(record, artifactPath, failures);
  validateEnum(record.verdict, REVIEW_VERDICTS, artifactPath, record, "verdict", failures);
  validateEnum(record.execution_mode, EXECUTION_MODES, artifactPath, record, "execution_mode", failures);
  validateEnum(record.status, REVIEW_STATUSES, artifactPath, record, "status", failures);
  validatePathField(root, artifactPath, record, "target_path", failures, { mustExist: false });
  validatePathField(root, artifactPath, record, "artifact_path", failures, { mustExist: false });
  if (options.targetRevision && record.target_revision !== options.targetRevision) {
    failures.push(makeFailure(artifactPath, record, "target_revision", options.targetRevision, record.target_revision));
  }
  if (!Number.isInteger(record.attempt) || record.attempt < 1) {
    failures.push(makeFailure(artifactPath, record, "attempt", "positive integer", record.attempt));
  }
  validateScorecard(record, artifactPath, failures);
  validateCrossCutting(record, artifactPath, failures);
  validateMaterialBlockers(record, artifactPath, failures);
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
  validateMarkdownBinding(root, artifactPath, record, "synthesis", failures);

  if (options.ledger) {
    const currentIds = new Set(options.ledger.current_review_record_ids || []);
    const reviewArtifacts = new Map((options.ledger.review_record_artifacts || []).map((entry) => [entry.record_id, entry.artifact_path]));
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
    }
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
  validateEnum(record.artifact_visibility, ARTIFACT_VISIBILITY, artifactPath, record, "artifact_visibility", failures);
  validatePathField(root, artifactPath, record, "target_path", failures, { mustExist: false });
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
