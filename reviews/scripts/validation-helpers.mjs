import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
  ARTIFACT_VISIBILITY,
  CLAIM_FLAG_KEYS,
  COMPLETION_SUMMARY_REQUIRED_FIELDS,
  COMPLETION_SUMMARY_FULL_REQUIRED_FIELDS,
  COMPLETION_SUMMARY_CORE_PROFILE_REQUIRED_FIELDS,
  COMPLETION_SUMMARY_SCHEMA_VERSION,
  CONTRACT_VERSION,
  CROSS_CUTTING_KEYS,
  CROSS_CUTTING_STATUS_VALUES,
  EXECUTION_MODES,
  EXIT_CODES,
  FINAL_ASSESSMENTS,
  FINDING_DECISIONS,
  FINDING_SEVERITIES,
  LEDGER_REQUIRED_FIELDS,
  LEDGER_FULL_REQUIRED_FIELDS,
  LEDGER_CORE_PROFILE_REQUIRED_FIELDS,
  LEDGER_SCHEMA_VERSION,
  LEDGER_STATUSES,
  LOCK_STATES,
  PROVENANCE_BASIS_VALUES,
  REQUIRED_MARKDOWN_SECTIONS,
  REVIEW_COMPLETED_REQUIRED_FIELDS,
  REVIEW_FULL_REQUIRED_FIELDS,
  REVIEW_INPUT_REQUIRED_FIELDS,
  REVIEW_REQUIRED_FIELDS,
  REVIEW_STATUSES,
  REVIEW_VERDICTS,
  RUN_MODES,
  RUN_SCOPES,
  SCHEMA_VERSION,
  SCORE_CHALLENGE_KEYS,
  SCORECARD_KEYS,
  SYNTHESIS_REQUIRED_FIELDS,
  SYNTHESIS_FULL_REQUIRED_FIELDS,
  TRACE_EVENT_NAMES
} from "./validation-contracts.mjs";
import { evaluateLensPolicy, validateLensSelectionShape } from "./lens-selection-contract.mjs";

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
    reviewInput: null,
    reviewInputRevision: null,
    featureRequest: "",
    relevantContext: "",
    constraints: "",
    previousAdjudications: "",
    write: false,
    finalize: false,
    synthesis: null,
    title: null,
    review: null,
    inputPacket: null,
    final: null,
    archiveRoot: null,
    changedDomains: "",
    runMode: null,
    runScope: null,
    executionMode: null,
    eventsPath: null,
    allLenses: false,
    lensProposal: null,
    lensSelection: null,
    selectionFallback: null,
    coreProfile: null
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help") opts.help = true;
    else if (arg === "--version") opts.version = true;
    else if (arg === "--quiet") opts.quiet = true;
    else if (arg === "--json") opts.json = true;
    else if (arg === "--update-counts") opts.updateCounts = true;
    else if (arg === "--write") opts.write = true;
    else if (arg === "--finalize") opts.finalize = true;
    else if (arg === "--all-lenses") opts.allLenses = true;
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

export const EMPTY_RELEVANT_CONTEXT = "No additional context supplied beyond the target plan.";
export const EMPTY_CONSTRAINTS = "No additional constraints supplied.";
export const EMPTY_PREVIOUS_ADJUDICATIONS = "No previous adjudications supplied.";
export const MAX_REVIEW_INPUT_FIELD_BYTES = 200_000;
export const MAX_REVIEW_INPUT_TOTAL_BYTES = 500_000;

export function renderTemplate(template, values) {
  return template.replace(/\{\{([a-z0-9_]+)\}\}/gi, (match, key) => (
    Object.hasOwn(values, key) ? String(values[key] ?? "") : match
  ));
}

// Encode untrusted prompt data as a JSON string and neutralize markup delimiters.
// The model can read the value, but the value cannot close the surrounding tag.
function neutralizePromptJson(json) {
  return json
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
}

export function encodePromptData(value) {
  return neutralizePromptJson(JSON.stringify(String(value ?? "")));
}

export function encodePromptJson(value) {
  return neutralizePromptJson(JSON.stringify(value));
}

function normalizeOptionalReviewInputText(value, fallback) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "string" && value.trim().length === 0) return fallback;
  return value;
}

export function normalizeReviewInputRecord(record = {}) {
  return {
    schema_version: record.schema_version ?? SCHEMA_VERSION,
    feature_request: record.feature_request ?? "",
    relevant_context: normalizeOptionalReviewInputText(record.relevant_context, EMPTY_RELEVANT_CONTEXT),
    constraints: normalizeOptionalReviewInputText(record.constraints, EMPTY_CONSTRAINTS),
    previous_adjudications: normalizeOptionalReviewInputText(record.previous_adjudications, EMPTY_PREVIOUS_ADJUDICATIONS)
  };
}

export function serializeReviewInput(record) {
  return `${JSON.stringify(normalizeReviewInputRecord(record), null, 2)}\n`;
}

export function computeReviewInputRevision(record) {
  const hash = createHash("sha256").update(serializeReviewInput(record), "utf8").digest("hex");
  return `sha256:${hash}`;
}

export function validateReviewInputRecord(record, options = {}) {
  const artifactPath = options.artifactPath || options.inputPath || "review-input";
  const failures = [];
  requireFields(record, REVIEW_INPUT_REQUIRED_FIELDS, artifactPath, failures);
  validateSchemaVersion(record, artifactPath, failures);
  const allowed = new Set(REVIEW_INPUT_REQUIRED_FIELDS);
  for (const key of Object.keys(record || {})) {
    if (!allowed.has(key)) {
      failures.push(makeFailure(artifactPath, record, key, "supported review-input field", "unexpected"));
    }
  }
  for (const field of ["feature_request", "relevant_context", "constraints", "previous_adjudications"]) {
    if (typeof record[field] !== "string") {
      failures.push(makeFailure(artifactPath, record, field, "string", typeof record[field]));
    }
  }
  if (typeof record.feature_request !== "string" || record.feature_request.trim().length === 0) {
    failures.push(makeFailure(artifactPath, record, "feature_request", "non-empty string", record.feature_request));
  }
  let totalBytes = 0;
  for (const field of ["feature_request", "relevant_context", "constraints", "previous_adjudications"]) {
    if (typeof record[field] !== "string") continue;
    const bytes = Buffer.byteLength(record[field], "utf8");
    totalBytes += bytes;
    if (bytes > MAX_REVIEW_INPUT_FIELD_BYTES) {
      failures.push(makeFailure(artifactPath, record, field, `at most ${MAX_REVIEW_INPUT_FIELD_BYTES} UTF-8 bytes`, bytes));
    }
  }
  if (totalBytes > MAX_REVIEW_INPUT_TOTAL_BYTES) {
    failures.push(makeFailure(artifactPath, record, "review_input_total_bytes", `at most ${MAX_REVIEW_INPUT_TOTAL_BYTES}`, totalBytes));
  }
  return failures;
}

export function resolveReviewInput(root, opts = {}) {
  const scalarFields = ["featureRequest", "relevantContext", "constraints", "previousAdjudications"];
  const hasScalarInput = scalarFields.some((field) => typeof opts[field] === "string" && opts[field].length > 0);
  if (opts.reviewInput && hasScalarInput) {
    throw Object.assign(new Error("--review-input cannot be combined with scalar review input options"), { exitCode: EXIT_CODES.usage });
  }

  let sourcePath = null;
  let raw;
  if (opts.reviewInput) {
    sourcePath = normalizeRepoInputPath(root, opts.reviewInput);
    if (!sourcePath) {
      throw Object.assign(new Error("--review-input must resolve under the repository root"), { exitCode: EXIT_CODES.usage });
    }
    const resolved = resolveRepoPath(root, sourcePath);
    if (!resolved || !existsSync(resolved)) {
      throw Object.assign(new Error(`review input not found ${sourcePath}`), { exitCode: EXIT_CODES.read });
    }
    raw = readJsonFile(resolved);
  } else {
    raw = {
      schema_version: SCHEMA_VERSION,
      feature_request: opts.featureRequest || "",
      relevant_context: opts.relevantContext || EMPTY_RELEVANT_CONTEXT,
      constraints: opts.constraints || EMPTY_CONSTRAINTS,
      previous_adjudications: opts.previousAdjudications || EMPTY_PREVIOUS_ADJUDICATIONS
    };
  }

  const allowedFields = new Set(REVIEW_INPUT_REQUIRED_FIELDS);
  const unknownFields = Object.keys(raw || {}).filter((field) => !allowedFields.has(field));
  if (unknownFields.length > 0) {
    throw Object.assign(new Error(`unsupported review input fields: ${unknownFields.join(", ")}`), { exitCode: EXIT_CODES.usage });
  }
  // Files are contracts: validate the raw record so omitted required fields do
  // not silently acquire defaults. Scalar CLI input is intentionally normalized.
  if (sourcePath) {
    const rawFailures = validateReviewInputRecord(raw, { artifactPath: sourcePath });
    if (rawFailures.length > 0) {
      const error = new Error(rawFailures.map(formatFailure).join("; "));
      error.exitCode = EXIT_CODES.usage;
      throw error;
    }
  }
  const record = normalizeReviewInputRecord(raw);
  const failures = validateReviewInputRecord(record, { artifactPath: sourcePath || "scalar review input" });
  if (failures.length > 0) {
    const error = new Error(failures.map(formatFailure).join("; "));
    error.exitCode = EXIT_CODES.usage;
    throw error;
  }
  return {
    record,
    sourcePath,
    revision: computeReviewInputRevision(record)
  };
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

export function validationError(failures, message = "artifact validation failed") {
  const error = new Error(`${message}: ${failures.map(formatFailure).join("; ")}`);
  error.exitCode = EXIT_CODES.validation;
  error.failures = failures;
  return error;
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

export function validateSchemaVersion(record, artifactPath, failures, expected = SCHEMA_VERSION) {
  if (record.schema_version !== expected) {
    failures.push(makeFailure(artifactPath, record, "schema_version", expected, record.schema_version));
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

export async function loadValidatedRunContext(root, ledgerInput) {
  const ledgerPath = normalizeRepoInputPath(root, ledgerInput);
  const ledgerResolved = ledgerPath ? resolveRepoPath(root, ledgerPath) : null;
  if (!ledgerResolved || !existsSync(ledgerResolved)) {
    throw Object.assign(new Error(`ledger not found ${ledgerInput}`), { exitCode: EXIT_CODES.read });
  }
  const ledger = readJsonFile(ledgerResolved);
  const targetRevision = computeArtifactSha(root, ledger.target_path);
  const ledgerFailures = validateLedgerRecord(ledger, {
    artifactRoot: root,
    targetRevision,
    artifactPath: ledgerPath
  });
  if (ledgerFailures.length > 0) throw validationError(ledgerFailures, "ledger trust chain failed");

  const reviewArtifacts = new Map((ledger.review_record_artifacts || []).map((entry) => [entry.record_id, entry.artifact_path]));
  const reviews = await Promise.all((ledger.current_review_record_ids || []).map(async (recordId) => {
    const artifactPath = reviewArtifacts.get(recordId);
    if (!artifactPath) {
      throw Object.assign(new Error(`current review ${recordId} has no artifact mapping`), { exitCode: EXIT_CODES.validation });
    }
    const artifactResolved = resolveRepoPath(root, artifactPath);
    const record = JSON.parse(await readFile(artifactResolved, "utf8"));
    const markdownResolved = resolveRepoPath(root, record.markdown_artifact_path);
    const markdown = await readFile(markdownResolved, "utf8");
    return { record, artifactPath, markdown };
  }));

  return {
    ledger,
    ledgerPath,
    targetRevision,
    reviewInput: resolveReviewInput(root, { reviewInput: ledger.review_input_path }),
    reviews
  };
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
  if (record.run_mode === "full" && !["fresh_spawned_lens_reviewers", "fresh_spawned_orchestrator"].includes(record.execution_mode)) {
    failures.push(makeFailure(artifactPath, record, "execution_mode", "fresh_spawned_lens_reviewers or fresh_spawned_orchestrator for full run_mode", record.execution_mode));
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
  for (const field of ["validator_name", "validator_contract_version"]) {
    if (typeof validation[field] !== "string" || validation[field].trim().length === 0) {
      failures.push(makeFailure(artifactPath, record, `completion_validation.${field}`, "non-empty string", validation[field]));
    }
  }
  if (record.status === "completed" && validation.validator_contract_version !== CONTRACT_VERSION) {
    failures.push(makeFailure(artifactPath, record, "completion_validation.validator_contract_version", CONTRACT_VERSION, validation.validator_contract_version));
  }
  if (record.status === "completed" && (typeof validation.validated_synthesis_record_id !== "string" || validation.validated_synthesis_record_id.trim().length === 0)) {
    failures.push(makeFailure(artifactPath, record, "completion_validation.validated_synthesis_record_id", "non-empty string for completed ledger", validation.validated_synthesis_record_id));
  } else if (validation.validated_synthesis_record_id !== undefined && typeof validation.validated_synthesis_record_id !== "string") {
    failures.push(makeFailure(artifactPath, record, "completion_validation.validated_synthesis_record_id", "string", validation.validated_synthesis_record_id));
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

function setEquals(left, right) {
  return left.size === right.size && [...left].every((item) => right.has(item));
}

function validateUniqueArrayItems(record, field, artifactPath, failures) {
  const values = record[field];
  if (!Array.isArray(values)) return new Set();
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) {
      failures.push(makeFailure(artifactPath, record, field, "unique values", value));
    }
    seen.add(value);
  }
  return seen;
}

function validateLedgerLensScope(root, record, artifactPath, failures) {
  const registry = readJsonFile(join(root, "reviews", "registry.json"));
  const registryLensIds = registry.lenses.map((entry) => entry.id);
  const registryLensSet = new Set(registryLensIds);
  const selectedLensSet = validateUniqueArrayItems(record, "selected_lenses", artifactPath, failures);
  for (const lens of record.selected_lenses || []) {
    if (!registryLensSet.has(lens)) {
      failures.push(makeFailure(artifactPath, record, "selected_lenses", "known registry lens id", lens));
    }
  }
  if (record.run_scope === "core_profile") {
    if (record.run_mode !== "full") failures.push(makeFailure(artifactPath, record, "run_mode", "full for core_profile scope", record.run_mode));
    const profile = (registry.core_profiles || []).find((entry) => entry.id === record.core_profile_id);
    if (!profile) {
      failures.push(makeFailure(artifactPath, record, "core_profile_id", "known registry core profile", record.core_profile_id));
      return;
    }
    const coreLensSet = new Set(profile.required_lens_ids || []);
    for (const lens of coreLensSet) {
      if (!selectedLensSet.has(lens)) {
        failures.push(makeFailure(artifactPath, record, "selected_lenses", `include core profile lens ${lens}`, (record.selected_lenses || []).join(",")));
      }
    }
    const requiredLensSet = validateUniqueArrayItems(record, "required_lens_ids", artifactPath, failures);
    const completedLensSet = validateUniqueArrayItems(record, "completed_lens_ids", artifactPath, failures);
    if (!setEquals(requiredLensSet, selectedLensSet)) {
      failures.push(makeFailure(artifactPath, record, "required_lens_ids", "exact selected_lenses for a core-profile run", (record.required_lens_ids || []).join(",")));
    }
    const derived = deriveCoreProfileCompletionState(root, record);
    if (JSON.stringify(record.completed_lens_ids) !== JSON.stringify(derived.completed_lens_ids)) {
      failures.push(makeFailure(artifactPath, record, "completed_lens_ids", JSON.stringify(derived.completed_lens_ids), JSON.stringify(record.completed_lens_ids)));
    }
    if (typeof record.core_gate_passed !== "boolean") {
      failures.push(makeFailure(artifactPath, record, "core_gate_passed", "boolean", record.core_gate_passed));
    }
    if (record.core_gate_passed !== derived.core_gate_passed) {
      failures.push(makeFailure(artifactPath, record, "core_gate_passed", derived.core_gate_passed, record.core_gate_passed));
    }
    if (record.status === "completed" && record.run_mode === "full" && record.core_gate_passed !== true) {
      failures.push(makeFailure(artifactPath, record, "core_gate_passed", true, record.core_gate_passed));
    }
  }
}

function validateCompletionValidationReferences(record, artifactPath, failures) {
  if (record.status !== "completed" || record.run_mode !== "full" || record.completion_validation?.passed !== true) return;
  const currentIds = new Set(record.current_review_record_ids || []);
  const validatedReviewIds = record.completion_validation.validated_review_record_ids || [];
  const validatedIds = new Set(validatedReviewIds);
  if (validatedIds.size !== validatedReviewIds.length) {
    failures.push(makeFailure(artifactPath, record, "completion_validation.validated_review_record_ids", "unique values", validatedReviewIds.join(",")));
  }
  if (!setEquals(validatedIds, currentIds)) {
    failures.push(makeFailure(
      artifactPath,
      record,
      "completion_validation.validated_review_record_ids",
      `exact current_review_record_ids: ${[...currentIds].join(",")}`,
      [...validatedIds].join(",")
    ));
  }
  const synthesisIds = new Set(record.synthesis_record_ids || []);
  const validatedSynthesisId = record.completion_validation.validated_synthesis_record_id;
  if (!synthesisIds.has(validatedSynthesisId)) {
    failures.push(makeFailure(
      artifactPath,
      record,
      "completion_validation.validated_synthesis_record_id",
      `one of synthesis_record_ids: ${[...synthesisIds].join(",")}`,
      validatedSynthesisId
    ));
  }
}

export function validateReviewRecord(record, options = {}) {
  const root = options.artifactRoot || repoRootFrom();
  const artifactPath = options.artifactPath || options.inputPath || record.artifact_path || "review-output";
  const failures = [];
  requireFields(record, REVIEW_REQUIRED_FIELDS, artifactPath, failures);
  if (record.run_mode === "full") requireFields(record, REVIEW_FULL_REQUIRED_FIELDS, artifactPath, failures);
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
  if (options.reviewInputRevision && record.review_input_revision !== options.reviewInputRevision) {
    failures.push(makeFailure(artifactPath, record, "review_input_revision", options.reviewInputRevision, record.review_input_revision));
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

  if (["fresh_spawned_lens_reviewers", "fresh_spawned_orchestrator"].includes(record.execution_mode) && record.status === "completed") {
    if (!record.agent_id) failures.push(makeFailure(artifactPath, record, "agent_id", "present", record.agent_id));
    if (record.closed !== true) failures.push(makeFailure(artifactPath, record, "closed", true, record.closed));
    if (record.output_captured !== true) failures.push(makeFailure(artifactPath, record, "output_captured", true, record.output_captured));
  }
  return failures;
}

export function deriveCoreProfileCompletionState(root, record) {
  if (record.run_scope !== "core_profile") return null;
  const required = Array.isArray(record.required_lens_ids) ? record.required_lens_ids : [];
  const requiredSet = new Set(required);
  const reviewArtifacts = new Map((record.review_record_artifacts || []).map((entry) => [entry.record_id, entry.artifact_path]));
  const completed = new Set();
  for (const reviewId of new Set(record.current_review_record_ids || [])) {
    const reviewPath = reviewArtifacts.get(reviewId);
    if (!isRepoRelativePath(reviewPath)) continue;
    const resolved = resolveRepoPath(root, reviewPath);
    if (!resolved || !existsSync(resolved)) continue;
    const review = readJsonFile(resolved);
    const reviewFailures = validateReviewRecord(review, {
      artifactRoot: root,
      targetRevision: record.target_revision,
      reviewInputRevision: record.review_input_revision,
      artifactPath: reviewPath
    });
    if (reviewFailures.length > 0) continue;
    if (review.status !== "completed" || review.pass_id !== record.pass_id || review.target_path !== record.target_path) continue;
    if (review.run_mode !== record.run_mode || review.execution_mode !== record.execution_mode) continue;
    if (requiredSet.has(review.lens)) completed.add(review.lens);
  }
  const completedLensIds = required.filter((lens) => completed.has(lens));
  const allRequiredCompleted = completedLensIds.length === required.length && new Set(completedLensIds).size === requiredSet.size;
  return {
    completed_lens_ids: completedLensIds,
    core_gate_passed: record.status === "completed" && record.completion_validation?.passed === true && allRequiredCompleted
  };
}

export function writeRunEvent(root, eventsPath, event, data = {}) {
  if (!TRACE_EVENT_NAMES.includes(event)) {
    throw Object.assign(new Error(`unsupported event ${event}`), { exitCode: EXIT_CODES.usage });
  }
  if (!isRepoRelativePath(eventsPath)) {
    throw Object.assign(new Error(`events path must be repository-relative: ${eventsPath}`), { exitCode: EXIT_CODES.usage });
  }
  const resolved = resolveRepoPath(root, eventsPath);
  if (!resolved) {
    throw Object.assign(new Error(`events path must resolve under repository root: ${eventsPath}`), { exitCode: EXIT_CODES.usage });
  }
  const artifactPath = data.artifact_path;
  if (artifactPath !== undefined && artifactPath !== null && !isRepoRelativePath(artifactPath)) {
    throw Object.assign(new Error(`event artifact_path must be repository-relative: ${artifactPath}`), { exitCode: EXIT_CODES.usage });
  }
  const record = {
    event,
    pass_id: data.pass_id,
    timestamp: data.timestamp || new Date().toISOString(),
    role: data.role || "orchestrator",
    target_revision: data.target_revision,
    review_input_revision: data.review_input_revision,
    artifact_path: artifactPath || null,
    status: data.status || "created"
  };
  appendFileSync(resolved, `${JSON.stringify(record)}\n`, "utf8");
}

function validateEventsLog(root, ledger, artifactPath, failures) {
  const eventsPath = ledger.events_path;
  if (!isRepoRelativePath(eventsPath)) {
    failures.push(makeFailure(artifactPath, ledger, "events_path", "repository-relative path", eventsPath));
    return [];
  }
  const resolved = resolveRepoPath(root, eventsPath);
  if (!resolved || !existsSync(resolved)) {
    failures.push(makeFailure(artifactPath, ledger, "events_path", "existing events.jsonl", eventsPath));
    return [];
  }
  const events = [];
  for (const [index, line] of readTextFile(resolved).split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch (error) {
      failures.push(makeFailure(artifactPath, ledger, `events_path.line_${index + 1}`, "valid JSON object", error.message));
      continue;
    }
    events.push(event);
    validateEnum(event.event, TRACE_EVENT_NAMES, artifactPath, event, "event", failures);
    for (const field of ["pass_id", "timestamp", "role", "target_revision", "status"]) {
      if (typeof event[field] !== "string" || event[field].trim().length === 0) {
        failures.push(makeFailure(artifactPath, event, field, "non-empty string", event[field]));
      }
    }
    if (event.pass_id !== ledger.pass_id) {
      failures.push(makeFailure(artifactPath, event, "pass_id", ledger.pass_id, event.pass_id));
    }
    if (event.target_revision !== ledger.target_revision) {
      failures.push(makeFailure(artifactPath, event, "target_revision", ledger.target_revision, event.target_revision));
    }
    if (ledger.review_input_revision) {
      if (typeof event.review_input_revision !== "string" || event.review_input_revision.trim().length === 0) {
        failures.push(makeFailure(artifactPath, event, "review_input_revision", "non-empty string", event.review_input_revision));
      } else if (event.review_input_revision !== ledger.review_input_revision) {
        failures.push(makeFailure(artifactPath, event, "review_input_revision", ledger.review_input_revision, event.review_input_revision));
      }
    }
    if (event.artifact_path !== null && event.artifact_path !== undefined && !isRepoRelativePath(event.artifact_path)) {
      failures.push(makeFailure(artifactPath, event, "artifact_path", "repository-relative path or null", event.artifact_path));
    }
  }
  return events;
}

function eventMatches(event, expected = {}) {
  for (const [field, value] of Object.entries(expected)) {
    if (event[field] !== value) return false;
  }
  return true;
}

function requireDetachedEvent(events, artifactPath, record, eventName, expected, failures) {
  const found = events.some((event) => event.event === eventName && eventMatches(event, expected));
  if (!found) {
    const qualifier = Object.entries(expected).map(([key, value]) => `${key}=${value}`).join(", ");
    failures.push(makeFailure(artifactPath, record, "events_path", `event ${eventName}${qualifier ? ` with ${qualifier}` : ""}`, "missing"));
  }
}

export function validateSynthesisRecord(record, options = {}) {
  const root = options.artifactRoot || repoRootFrom();
  const artifactPath = options.artifactPath || options.inputPath || record.artifact_path || "synthesis-output";
  const failures = [];
  requireFields(record, SYNTHESIS_REQUIRED_FIELDS, artifactPath, failures);
  if (record.run_mode === "full") requireFields(record, SYNTHESIS_FULL_REQUIRED_FIELDS, artifactPath, failures);
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
  const expectedReviewInputRevision = options.reviewInputRevision || options.ledger?.review_input_revision;
  if (expectedReviewInputRevision && record.review_input_revision !== expectedReviewInputRevision) {
    failures.push(makeFailure(artifactPath, record, "review_input_revision", expectedReviewInputRevision, record.review_input_revision));
  }
  validateFindingDecisions(record, artifactPath, failures);
  validateLensLocks(record, artifactPath, failures);
  validatePriorMaterialFindings(record, artifactPath, failures);
  validateMarkdownBinding(root, artifactPath, record, "synthesis", failures);

  if (options.ledger) {
    const synthesisArtifacts = new Map((options.ledger.synthesis_record_artifacts || []).map((entry) => [entry.record_id, entry.artifact_path]));
    if (!(options.ledger.synthesis_record_ids || []).includes(record.record_id)) {
      failures.push(makeFailure(artifactPath, record, "record_id", "current ledger synthesis record", record.record_id));
    } else if (synthesisArtifacts.get(record.record_id) !== record.artifact_path) {
      failures.push(makeFailure(artifactPath, record, "artifact_path", synthesisArtifacts.get(record.record_id), record.artifact_path));
    }
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
        reviewInputRevision: expectedReviewInputRevision,
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
  if (record.run_mode === "full") requireFields(record, LEDGER_FULL_REQUIRED_FIELDS, artifactPath, failures);
  if (record.run_scope === "core_profile") requireFields(record, LEDGER_CORE_PROFILE_REQUIRED_FIELDS, artifactPath, failures);
  validateSchemaVersion(record, artifactPath, failures, LEDGER_SCHEMA_VERSION);
  validateEnum(record.status, LEDGER_STATUSES, artifactPath, record, "status", failures);
  validateEnum(record.execution_mode, EXECUTION_MODES, artifactPath, record, "execution_mode", failures);
  validateRunMode(record, artifactPath, failures);
  validateEnum(record.artifact_visibility, ARTIFACT_VISIBILITY, artifactPath, record, "artifact_visibility", failures);
  validatePathField(root, artifactPath, record, "target_path", failures, { mustExist: false });
  if (record.review_input_path !== undefined) {
    validatePathField(root, artifactPath, record, "review_input_path", failures, { mustExist: true });
    try {
      const reviewInput = resolveReviewInput(root, { reviewInput: record.review_input_path });
      if (record.review_input_revision !== reviewInput.revision) {
        failures.push(makeFailure(artifactPath, record, "review_input_revision", reviewInput.revision, record.review_input_revision));
      }
    } catch (error) {
      failures.push(makeFailure(artifactPath, record, "review_input_path", "valid review input", error.message));
    }
  }
  if ((record.lens_selection_path === undefined) !== (record.lens_selection_revision === undefined)) {
    failures.push(makeFailure(artifactPath, record, "lens_selection", "path and revision supplied together", "partial binding"));
  } else if (record.lens_selection_path !== undefined) {
    const selectionPath = validatePathField(root, artifactPath, record, "lens_selection_path", failures, { mustExist: true });
    if (selectionPath) {
      try {
        const actualRevision = computeArtifactSha(root, record.lens_selection_path);
        if (record.lens_selection_revision !== actualRevision) {
          failures.push(makeFailure(artifactPath, record, "lens_selection_revision", actualRevision, record.lens_selection_revision));
        }
        const selection = readJsonFile(selectionPath);
        const registry = readJsonFile(join(root, "reviews", "registry.json"));
        for (const reason of validateLensSelectionShape(selection, registry)) {
          failures.push(makeFailure(artifactPath, selection, "lens_selection", "valid selection contract", reason));
        }
        for (const [field, expected] of [
          ["pass_id", record.pass_id],
          ["target_path", record.target_path],
          ["target_revision", record.target_revision],
          ["review_input_revision", record.review_input_revision]
        ]) {
          if (selection[field] !== expected) failures.push(makeFailure(artifactPath, selection, `lens_selection.${field}`, expected, selection[field]));
        }
        if (JSON.stringify(selection.selected_lenses) !== JSON.stringify(record.selected_lenses)) {
          failures.push(makeFailure(artifactPath, selection, "lens_selection.selected_lenses", JSON.stringify(record.selected_lenses), JSON.stringify(selection.selected_lenses)));
        }
        if (record.run_scope === "core_profile") {
          if (!["core_profile", "core_profile_plus_llm_additions"].includes(selection.mode)) {
            failures.push(makeFailure(artifactPath, selection, "lens_selection.mode", "core-profile selection mode", selection.mode));
          }
          if (selection.core_profile_id !== record.core_profile_id) {
            failures.push(makeFailure(artifactPath, selection, "lens_selection.core_profile_id", record.core_profile_id, selection.core_profile_id));
          }
        }
        if (selection.review_input_path !== record.review_input_path) {
          failures.push(makeFailure(artifactPath, selection, "lens_selection.review_input_path", record.review_input_path, selection.review_input_path));
        }
        if (selection.policy_path !== "reviews/manifests/lens-selection.json") {
          failures.push(makeFailure(artifactPath, selection, "lens_selection.policy_path", "reviews/manifests/lens-selection.json", selection.policy_path));
        } else {
          const policyRevision = computeArtifactSha(root, selection.policy_path);
          if (selection.policy_revision !== policyRevision) failures.push(makeFailure(artifactPath, selection, "lens_selection.policy_revision", policyRevision, selection.policy_revision));
        }
        if (["deterministic", "deterministic_plus_llm_additions"].includes(selection.mode) && selection.review_input_path) {
          const replayInput = resolveReviewInput(root, { reviewInput: selection.review_input_path });
          const replayPolicy = readJsonFile(join(root, selection.policy_path));
          const replay = evaluateLensPolicy(replayPolicy, registry, replayInput.record, readTextFile(join(root, selection.target_path)));
          if (JSON.stringify(selection.deterministic_lenses) !== JSON.stringify(replay.deterministicLenses)) {
            failures.push(makeFailure(artifactPath, selection, "lens_selection.deterministic_lenses", JSON.stringify(replay.deterministicLenses), JSON.stringify(selection.deterministic_lenses)));
          }
          if (JSON.stringify(selection.matched_domains) !== JSON.stringify(replay.matchedDomains)) {
            failures.push(makeFailure(artifactPath, selection, "lens_selection.matched_domains", JSON.stringify(replay.matchedDomains), JSON.stringify(selection.matched_domains)));
          }
        }
        if (["core_profile", "core_profile_plus_llm_additions"].includes(selection.mode) && selection.review_input_path) {
          const profile = (registry.core_profiles || []).find((entry) => entry.id === selection.core_profile_id);
          if (!profile) {
            failures.push(makeFailure(artifactPath, selection, "lens_selection.core_profile_id", "known registry core profile", selection.core_profile_id));
          } else {
            const replayInput = resolveReviewInput(root, { reviewInput: selection.review_input_path });
            const replayPolicy = readJsonFile(join(root, selection.policy_path));
            const replay = evaluateLensPolicy(replayPolicy, registry, replayInput.record, readTextFile(join(root, selection.target_path)));
            const expectedSet = new Set([...profile.required_lens_ids, ...replay.deterministicLenses]);
            const expected = registry.lenses.map((entry) => entry.id).filter((id) => expectedSet.has(id));
            if (JSON.stringify(selection.deterministic_lenses) !== JSON.stringify(expected)) {
              failures.push(makeFailure(artifactPath, selection, "lens_selection.deterministic_lenses", JSON.stringify(expected), JSON.stringify(selection.deterministic_lenses)));
            }
            if (JSON.stringify(selection.matched_domains) !== JSON.stringify(replay.matchedDomains)) {
              failures.push(makeFailure(artifactPath, selection, "lens_selection.matched_domains", JSON.stringify(replay.matchedDomains), JSON.stringify(selection.matched_domains)));
            }
          }
        }
        if (selection.llm_proposal_path) {
          const proposalPath = validatePathField(root, artifactPath, selection, "llm_proposal_path", failures, { mustExist: true });
          if (proposalPath) {
            const proposalRevision = computeArtifactSha(root, selection.llm_proposal_path);
            if (selection.llm_proposal_revision !== proposalRevision) failures.push(makeFailure(artifactPath, selection, "lens_selection.llm_proposal_revision", proposalRevision, selection.llm_proposal_revision));
            const proposal = readJsonFile(proposalPath);
            if (proposal.schema_version !== 1 || !Array.isArray(proposal.additions)) {
              failures.push(makeFailure(artifactPath, selection, "lens_selection.llm_proposal_path", "schema_version 1 proposal with additions", "invalid proposal contract"));
            } else if (JSON.stringify(selection.llm_additions) !== JSON.stringify(proposal.additions)) {
              failures.push(makeFailure(artifactPath, selection, "lens_selection.llm_additions", JSON.stringify(proposal.additions), JSON.stringify(selection.llm_additions)));
            }
          }
        }
      } catch (error) {
        failures.push(makeFailure(artifactPath, record, "lens_selection_path", "valid bound lens selection", error.message));
      }
    }
  }
  validateCompletionValidation(record, artifactPath, failures);
  let events = [];
  if (record.execution_mode === "fresh_spawned_orchestrator") {
    events = validateEventsLog(root, record, artifactPath, failures);
  }
  if (record.status === "completed" && record.execution_mode === "fresh_spawned_orchestrator") {
    requireDetachedEvent(events, artifactPath, record, "orchestrator_started", { role: "orchestrator", status: "started" }, failures);
    requireDetachedEvent(events, artifactPath, record, "ledger_created", { role: "orchestrator" }, failures);
    requireDetachedEvent(events, artifactPath, record, "prompt_packet_created", { role: "orchestrator" }, failures);
    requireDetachedEvent(events, artifactPath, record, "spawn_prompt_created", { role: "orchestrator" }, failures);
    requireDetachedEvent(events, artifactPath, record, "validation_passed", { role: "orchestrator" }, failures);
    requireDetachedEvent(events, artifactPath, record, "synthesis_completed", { role: "orchestrator" }, failures);
    requireDetachedEvent(events, artifactPath, record, "archive_written", { role: "orchestrator" }, failures);
    requireDetachedEvent(events, artifactPath, record, "completion_reported", { role: "orchestrator" }, failures);
    for (const reviewId of record.current_review_record_ids || []) {
      const reviewPath = (record.review_record_artifacts || []).find((entry) => entry.record_id === reviewId)?.artifact_path;
      requireDetachedEvent(events, artifactPath, record, "reviewer_spawned", { role: "orchestrator", artifact_path: reviewPath }, failures);
      requireDetachedEvent(events, artifactPath, record, "reviewer_completed", { role: "orchestrator", artifact_path: reviewPath }, failures);
      requireDetachedEvent(events, artifactPath, record, "reviewer_closed", { role: "orchestrator", artifact_path: reviewPath }, failures);
    }
  }
  if (options.targetRevision && record.target_revision !== options.targetRevision) {
    failures.push(makeFailure(artifactPath, record, "target_revision", options.targetRevision, record.target_revision));
  }
  for (const field of ["selected_lenses", "current_review_record_ids", "superseded_review_record_ids", "synthesis_record_ids", "archive_paths", "review_record_artifacts", "synthesis_record_artifacts"]) {
    if (!Array.isArray(record[field])) {
      failures.push(makeFailure(artifactPath, record, field, "array", record[field]));
    }
  }
  validateLedgerLensScope(root, record, artifactPath, failures);
  validateCompletionValidationReferences(record, artifactPath, failures);
  for (const archivePath of record.archive_paths || []) {
    if (!isRepoRelativePath(archivePath)) {
      failures.push(makeFailure(artifactPath, record, "archive_paths", "repository-relative path", archivePath));
    }
  }

  const reviewArtifacts = new Map((record.review_record_artifacts || []).map((entry) => [entry.record_id, entry.artifact_path]));
  const synthesisArtifacts = new Map((record.synthesis_record_artifacts || []).map((entry) => [entry.record_id, entry.artifact_path]));
  const seenCurrentTuples = new Set();
  const currentIds = new Set(record.current_review_record_ids || []);
  const currentLenses = new Set();

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
      reviewInputRevision: record.review_input_revision,
      artifactPath: reviewPath
    });
    failures.push(...reviewFailures);
    if (review.run_mode !== record.run_mode) {
      failures.push(makeFailure(artifactPath, review, "run_mode", `matching ledger run_mode ${record.run_mode}`, review.run_mode));
    }
    if (review.execution_mode !== record.execution_mode) {
      failures.push(makeFailure(artifactPath, review, "execution_mode", `matching ledger execution_mode ${record.execution_mode}`, review.execution_mode));
    }
    if (review.status !== "completed") {
      failures.push(makeFailure(artifactPath, review, "status", "completed current review", review.status));
    }
    if (review.lens) currentLenses.add(review.lens);
    const tuple = `${review.pass_id}|${review.target_revision}|${review.lens}|${review.attempt}`;
    if (seenCurrentTuples.has(tuple)) {
      failures.push(makeFailure(artifactPath, review, "attempt", "unique current pass/target/lens/attempt", tuple));
    }
    seenCurrentTuples.add(tuple);
  }
  if (record.status === "completed" && record.run_mode === "full") {
    for (const lens of record.selected_lenses || []) {
      if (!currentLenses.has(lens)) {
        failures.push(makeFailure(artifactPath, record, "current_review_record_ids", `completed current review for selected lens ${lens}`, "missing"));
      }
    }
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
  if (record.run_mode === "full") requireFields(record, COMPLETION_SUMMARY_FULL_REQUIRED_FIELDS, artifactPath, failures);
  if (record.run_scope === "core_profile") requireFields(record, COMPLETION_SUMMARY_CORE_PROFILE_REQUIRED_FIELDS, artifactPath, failures);
  validateSchemaVersion(record, artifactPath, failures, COMPLETION_SUMMARY_SCHEMA_VERSION);
  validateRunMode(record, artifactPath, failures);
  validateEnum(record.run_scope, RUN_SCOPES, artifactPath, record, "run_scope", failures);
  validatePathField(root, artifactPath, record, "target_path", failures, { mustExist: false });
  if (options.targetRevision && record.target_revision !== options.targetRevision) {
    failures.push(makeFailure(artifactPath, record, "target_revision", options.targetRevision, record.target_revision));
  }
  if (options.reviewInputRevision && record.review_input_revision !== options.reviewInputRevision) {
    failures.push(makeFailure(artifactPath, record, "review_input_revision", options.reviewInputRevision, record.review_input_revision));
  }
  if (options.ledger) {
    for (const field of ["run_mode", "run_scope", "core_profile_id", "core_gate_passed"]) {
      if (options.ledger[field] !== undefined && record[field] !== options.ledger[field]) {
        failures.push(makeFailure(artifactPath, record, field, options.ledger[field], record[field]));
      }
    }
    for (const field of ["required_lens_ids", "completed_lens_ids"]) {
      if (options.ledger[field] !== undefined && JSON.stringify(record[field]) !== JSON.stringify(options.ledger[field])) {
        failures.push(makeFailure(artifactPath, record, field, JSON.stringify(options.ledger[field]), JSON.stringify(record[field])));
      }
    }
  }
  validateClaimFlags(record, artifactPath, failures);

  if (record.run_scope === "core_profile") {
    if (record.run_mode !== "full") failures.push(makeFailure(artifactPath, record, "run_mode", "full for core_profile scope", record.run_mode));
    const required = validateUniqueArrayItems(record, "required_lens_ids", artifactPath, failures);
    const completed = validateUniqueArrayItems(record, "completed_lens_ids", artifactPath, failures);
    if (record.core_gate_passed !== true) failures.push(makeFailure(artifactPath, record, "core_gate_passed", true, record.core_gate_passed));
    if (!setEquals(required, completed)) failures.push(makeFailure(artifactPath, record, "completed_lens_ids", "exact required_lens_ids", (record.completed_lens_ids || []).join(",")));
    if (record.claim_flags?.completion !== true || record.claim_flags?.review_complete !== true) {
      failures.push(makeFailure(artifactPath, record, "claim_flags", "completion and review_complete true for passed core profile", JSON.stringify(record.claim_flags)));
    }
  }

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
