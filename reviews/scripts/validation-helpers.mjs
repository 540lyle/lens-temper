import { createHash } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
  APPLY_MODES,
  ARTIFACT_VISIBILITY,
  AUTOMATIC_PASS_LIMIT,
  BLOCKING_SEVERITIES,
  CHANGE_TYPES,
  CLAIM_FLAG_KEYS,
  COMPLETION_SUMMARY_REQUIRED_FIELDS,
  COMPLETION_SUMMARY_FULL_REQUIRED_FIELDS,
  COMPLETION_SUMMARY_CORE_PROFILE_REQUIRED_FIELDS,
  COMPLETION_SUMMARY_SCHEMA_VERSION,
  CONTRACT_VERSION,
  CROSS_CUTTING_KEYS,
  DELIVERED_LINE_PATTERN,
  CROSS_CUTTING_STATUS_VALUES,
  EXECUTION_MODES,
  EXIT_CODES,
  FINAL_ASSESSMENTS,
  FINDING_DECISIONS,
  FINDING_SEVERITIES,
  GOAL_FIT_VALUES,
  INTENT_AMENDED_BY,
  INTENT_CARD_FIELDS,
  LEDGER_REQUIRED_FIELDS,
  LEDGER_FULL_REQUIRED_FIELDS,
  LEDGER_CORE_PROFILE_REQUIRED_FIELDS,
  LEDGER_SCHEMA_VERSION,
  LEDGER_STATUSES,
  LEGACY_MARKDOWN_SECTIONS,
  LEGACY_SETTLED_LOCK_STATES,
  LENS_BLOCKING_VALUES,
  LENS_STATES,
  LOCK_STATES,
  PROVENANCE_BASIS_VALUES,
  REJECTION_REASONS,
  REQUIRED_MARKDOWN_SECTIONS,
  REVIEW_COMPLETED_REQUIRED_FIELDS,
  REVIEW_FULL_REQUIRED_FIELDS,
  REVIEW_GOAL_MARKDOWN_SECTIONS,
  REVIEW_INPUT_OPTIONAL_FIELDS,
  REVIEW_INPUT_REQUIRED_FIELDS,
  REVIEW_REQUIRED_FIELDS,
  REVIEW_STATUSES,
  REVIEW_VERDICTS,
  RUN_MODES,
  RUN_SCOPES,
  SCHEMA_VERSION,
  SCOPE_DELTA_NET_VALUES,
  SCORE_CHALLENGE_KEYS,
  SCORECARD_KEYS,
  SYNTHESIS_REQUIRED_FIELDS,
  SYNTHESIS_FULL_REQUIRED_FIELDS,
  TARGET_EDIT_DECIDERS,
  TRACE_EVENT_NAMES
} from "./validation-contracts.mjs";
import { evaluateLensPolicy, validateLensSelectionShape } from "./lens-selection-contract.mjs";

export { CONTRACT_VERSION, EXIT_CODES };

export function repoRootFrom(importMetaUrl = import.meta.url) {
  const here = dirname(fileURLToPath(importMetaUrl));
  return resolve(here, "../..");
}

// The LensTemper package root holds the registry, manifests, lenses, and
// templates. The project root (--root, default: the current directory) holds
// the reviewed target, run artifacts, and archives. They are the same
// directory only when the package reviews its own files.
export const PACKAGE_ROOT = repoRootFrom();

export function projectRootFrom(opts = {}) {
  return resolve(opts.root || opts.artifactRoot || process.cwd());
}

// Repository-relative inputs resolve against the project root; other paths
// resolve as given.
export function resolveInputPath(root, value) {
  return isRepoRelativePath(value) ? join(root, value) : resolve(value);
}

export function readRegistry() {
  return readJsonFile(join(PACKAGE_ROOT, "reviews", "registry.json"));
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
    root: null,
    reopen: "",
    applied: "",
    hostInitiated: false,
    audit: false,
    decidedBy: null,
    summary: null,
    parentLedger: null,
    humanApproval: null,
    applyMode: null,
    runMode: null,
    runScope: null,
    executionMode: null,
    eventsPath: null,
    allLenses: false,
    lensProposal: null,
    lensSelection: null,
    selectionFallback: null,
    coreProfile: null,
    removeEdit: null
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
    else if (arg === "--host-initiated") opts.hostInitiated = true;
    else if (arg === "--audit") opts.audit = true;
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
export const EMPTY_INTENT_CARD = "No intent card supplied. Infer the goal and non-goals as the Goal Gate describes.";
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

export function encodeIntentCard(intent) {
  return intent === undefined ? encodePromptData(EMPTY_INTENT_CARD) : encodePromptJson(intent);
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
    // Omitted when absent so inputs without an intent card keep their revision.
    ...(record.intent === undefined ? {} : { intent: record.intent }),
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

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateStringFields(value, required, optional, artifactPath, record, prefix, failures) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    failures.push(makeFailure(artifactPath, record, prefix, "object", value));
    return;
  }
  for (const key of Object.keys(value)) {
    if (!required.includes(key) && !optional.includes(key)) {
      failures.push(makeFailure(artifactPath, record, `${prefix}.${key}`, "supported field", "unexpected"));
    }
  }
  for (const key of required) {
    if (!isNonEmptyString(value[key])) failures.push(makeFailure(artifactPath, record, `${prefix}.${key}`, "non-empty string", value[key]));
  }
  for (const key of optional) {
    if (value[key] !== undefined && !isNonEmptyString(value[key])) failures.push(makeFailure(artifactPath, record, `${prefix}.${key}`, "non-empty string", value[key]));
  }
}

function validateIntentCard(record, artifactPath, failures) {
  const intent = record.intent;
  if (intent === undefined) return;
  if (!intent || typeof intent !== "object" || Array.isArray(intent)) {
    failures.push(makeFailure(artifactPath, record, "intent", "object", intent));
    return;
  }
  for (const key of Object.keys(intent)) {
    if (!INTENT_CARD_FIELDS.includes(key)) failures.push(makeFailure(artifactPath, record, `intent.${key}`, "supported intent card field", "unexpected"));
  }
  if (!Array.isArray(intent.goals) || intent.goals.length === 0) {
    failures.push(makeFailure(artifactPath, record, "intent.goals", "non-empty array", intent.goals));
  } else {
    const ids = new Set();
    for (const [index, goal] of intent.goals.entries()) {
      validateStringFields(goal, ["id", "text"], ["success_signal"], artifactPath, record, `intent.goals[${index}]`, failures);
      if (!isNonEmptyString(goal?.id)) continue;
      if (ids.has(goal.id)) failures.push(makeFailure(artifactPath, record, `intent.goals[${index}].id`, "unique goal id", goal.id));
      ids.add(goal.id);
    }
  }
  for (const field of ["non_goals", "must_not_grow"]) {
    if (intent[field] === undefined) continue;
    if (!Array.isArray(intent[field]) || !intent[field].every(isNonEmptyString)) {
      failures.push(makeFailure(artifactPath, record, `intent.${field}`, "array of non-empty strings", JSON.stringify(intent[field])));
    }
  }
  if (intent.decided_tradeoffs !== undefined) {
    if (!Array.isArray(intent.decided_tradeoffs)) {
      failures.push(makeFailure(artifactPath, record, "intent.decided_tradeoffs", "array", intent.decided_tradeoffs));
    } else {
      for (const [index, tradeoff] of intent.decided_tradeoffs.entries()) {
        validateStringFields(tradeoff, ["decision", "rejected_alternative", "why"], [], artifactPath, record, `intent.decided_tradeoffs[${index}]`, failures);
      }
    }
  }
  if (intent.amended_by !== undefined) {
    validateEnum(intent.amended_by, INTENT_AMENDED_BY, artifactPath, record, "intent.amended_by", failures);
  }
}

export function validateReviewInputRecord(record, options = {}) {
  const artifactPath = options.artifactPath || options.inputPath || "review-input";
  const failures = [];
  requireFields(record, REVIEW_INPUT_REQUIRED_FIELDS, artifactPath, failures);
  validateSchemaVersion(record, artifactPath, failures);
  validateIntentCard(record, artifactPath, failures);
  const allowed = new Set([...REVIEW_INPUT_REQUIRED_FIELDS, ...REVIEW_INPUT_OPTIONAL_FIELDS]);
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
  if (record.intent !== undefined) totalBytes += Buffer.byteLength(JSON.stringify(record.intent), "utf8");
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
      throw Object.assign(new Error(`--review-input must resolve under the project root ${root}`), { exitCode: EXIT_CODES.usage });
    }
    const resolved = resolveRepoPath(root, sourcePath);
    if (!resolved || !existsSync(resolved)) {
      throw Object.assign(new Error(notFoundMessage(root, sourcePath, "review input")), { exitCode: EXIT_CODES.read });
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

  const allowedFields = new Set([...REVIEW_INPUT_REQUIRED_FIELDS, ...REVIEW_INPUT_OPTIONAL_FIELDS]);
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

// Failures print sorted, except that those marked lead (such as "attach it
// first") print first, since fixing them clears most of the rest.
// A missing field prints once, as missing, not again for each check of its value.
export function printFailures(failures, opts = {}) {
  const missing = new Set(failures.filter((failure) => failure.expected === "present" && failure.actual === "missing").map((failure) => `${failure.artifact_path}|${failure.field}`));
  const shown = failures.filter((failure) => !missing.has(`${failure.artifact_path}|${failure.field}`) || (failure.expected === "present" && failure.actual === "missing"));
  const lead = shown.filter((failure) => failure.lead);
  const rest = shown.filter((failure) => !failure.lead).sort((a, b) => formatFailure(a).localeCompare(formatFailure(b)));
  for (const { lead: _lead, ...failure } of [...lead, ...rest]) {
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

// A missing path is usually a wrong working directory or --root, so the
// message names the root the path resolved against.
export function notFoundMessage(root, repoPath, what = "artifact") {
  return `${what} not found: ${repoPath} (resolved against ${root}; pass --root <project> when it lives in another project)`;
}

export function computeArtifactSha(root, repoPath) {
  const resolved = resolveRepoPath(root, repoPath);
  if (!resolved || !existsSync(resolved)) {
    throw Object.assign(new Error(notFoundMessage(root, repoPath)), { exitCode: EXIT_CODES.usage });
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

// The ledger's target revision is the audit record of what was reviewed. Only
// callers that hand the target text to a model (synthesis) require the live
// target to still match it; archiving and reporting work after later edits.
export async function loadValidatedRunContext(root, ledgerInput, options = {}) {
  const ledgerPath = normalizeRepoInputPath(root, ledgerInput);
  const ledgerResolved = ledgerPath ? resolveRepoPath(root, ledgerPath) : null;
  if (!ledgerResolved || !existsSync(ledgerResolved)) {
    throw Object.assign(new Error(notFoundMessage(root, ledgerInput, "ledger")), { exitCode: EXIT_CODES.read });
  }
  const ledger = readJsonFile(ledgerResolved);
  let targetRevision = ledger.target_revision;
  if (options.requireCurrentTarget) {
    if (!fileExistsAt(root, ledger.target_path)) {
      throw Object.assign(new Error(notFoundMessage(root, ledger.target_path, "target")), { exitCode: EXIT_CODES.read });
    }
    targetRevision = computeArtifactSha(root, ledger.target_path);
  }
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
    targetRevision: ledger.target_revision,
    reviewInput: resolveReviewInput(root, { reviewInput: ledger.review_input_path }),
    reviews
  };
}

const RECORD_ARTIFACT_FIELDS = { review: "review_record_artifacts", synthesis: "synthesis_record_artifacts" };

// update-ledger.mjs registers each attached record by id, path, and content
// hash (artifact_sha). A registered file edited after attachment fails here.
// Ledgers written before artifact_sha existed skip the hash check.
export function registeredArtifactHashFailures(root, ledger, artifactPath) {
  const failures = [];
  for (const [kind, field] of Object.entries(RECORD_ARTIFACT_FIELDS)) {
    for (const [index, entry] of (Array.isArray(ledger[field]) ? ledger[field] : []).entries()) {
      if (entry?.artifact_sha === undefined) continue;
      if (!isRepoRelativePath(entry.artifact_path) || !fileExistsAt(root, entry.artifact_path)) continue;
      const actual = computeArtifactSha(root, entry.artifact_path);
      if (actual !== entry.artifact_sha) {
        failures.push(makeFailure(artifactPath, ledger, `${field}[${index}].artifact_sha`, entry.artifact_sha, actual,
          `${entry.artifact_path} (${kind} ${entry.record_id}) changed after it was attached; re-attach it with update-ledger.mjs --ledger <ledger> --${kind} ${entry.artifact_path} --write`));
      }
    }
  }
  return failures;
}

// A file validated against a ledger must be the record the ledger registered,
// not another file that reuses its record_id with different content.
export function registeredArtifactFailures(root, ledger, kind, record, inputPath) {
  const entry = (ledger?.[RECORD_ARTIFACT_FIELDS[kind]] || []).find((item) => item.record_id === record?.record_id);
  if (!entry || !isRepoRelativePath(entry.artifact_path) || !fileExistsAt(root, entry.artifact_path)) return [];
  const registered = resolveRepoPath(root, entry.artifact_path);
  const input = resolveInputPath(root, inputPath);
  if (resolve(registered) === resolve(input)) return [];
  if (readFileSync(registered).equals(readFileSync(input))) return [];
  return [makeFailure(inputPath, record, "record_id", `the ${kind} the ledger registered for ${record.record_id} (${entry.artifact_path})`, `${inputPath} with different content`,
    `validate the registered file, or attach this one with update-ledger.mjs --ledger <ledger> --${kind} ${inputPath} --write`)];
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
  const legacySections = LEGACY_MARKDOWN_SECTIONS[sectionKind];
  // Legacy Markdown is recognized by its first section, not by the legacy
  // heading appearing anywhere in the text.
  const firstSection = text.match(/^###[ \t]+.*$/m)?.[0].trim();
  const legacy = Boolean(legacySections && firstSection === legacySections[0]);
  const sections = legacy ? [...legacySections] : [...(REQUIRED_MARKDOWN_SECTIONS[sectionKind] || [])];
  if (sectionKind === "review" && (options.goalContract || REVIEW_GOAL_MARKDOWN_SECTIONS.some((section) => text.includes(section)))) {
    sections.unshift(...REVIEW_GOAL_MARKDOWN_SECTIONS);
  }
  for (const section of sections) {
    if (!text.includes(section)) {
      failures.push(makeFailure(artifactPath, record, "markdown_section", section, "missing"));
    }
  }
  return legacy ? "legacy" : "current";
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

// The lens verdict. Both fields are optional so records written before them
// stay valid; when present they must agree with material_blockers.
function validateLensVerdict(record, artifactPath, failures) {
  if (record.blocking !== undefined) {
    validateEnum(record.blocking, LENS_BLOCKING_VALUES, artifactPath, record, "blocking", failures);
    const present = record.material_blockers?.present;
    if (typeof present === "boolean" && LENS_BLOCKING_VALUES.includes(record.blocking) && (record.blocking === "yes") !== present) {
      failures.push(makeFailure(artifactPath, record, "blocking", `${present ? "yes" : "no"} to match material_blockers.present`, record.blocking));
    }
  }
  if (record.goal_fit !== undefined) {
    validateEnum(record.goal_fit, GOAL_FIT_VALUES, artifactPath, record, "goal_fit", failures);
    if (record.blocking === "yes" && record.goal_fit === "ok") {
      failures.push(makeFailure(artifactPath, record, "goal_fit", "at_risk or violated when blocking is yes", record.goal_fit));
    }
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
    if (source.basis === "direct_workspace_read" && source.target_included === true && record.status === "completed" && typeof record.target_path === "string" && !source.paths_reviewed.includes(record.target_path)) {
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
  let knownLenses;
  for (const [index, decision] of record.finding_decisions.entries()) {
    const prefix = `finding_decisions[${index}]`;
    if (!decision.finding_id) failures.push(makeFailure(artifactPath, record, `${prefix}.finding_id`, "stable slug", decision.finding_id));
    if (!decision.source_lens) failures.push(makeFailure(artifactPath, record, `${prefix}.source_lens`, "source lens id", decision.source_lens));
    if (!decision.source_review_record_id) failures.push(makeFailure(artifactPath, record, `${prefix}.source_review_record_id`, "source review record id", decision.source_review_record_id));
    validateEnum(decision.decision, FINDING_DECISIONS, artifactPath, record, `${prefix}.decision`, failures);
    if (decision.severity !== undefined) {
      validateEnum(decision.severity, FINDING_SEVERITIES, artifactPath, record, `${prefix}.severity`, failures);
    }
    // Legacy and optional: reruns follow applied findings and affected_lenses.
    if (decision.affects_rerun_scope !== undefined && typeof decision.affects_rerun_scope !== "boolean") {
      failures.push(makeFailure(artifactPath, record, `${prefix}.affects_rerun_scope`, "boolean", decision.affects_rerun_scope));
    }
    if (decision.affected_lenses !== undefined) {
      const lenses = decision.affected_lenses;
      knownLenses ||= new Set(readRegistry().lenses.map((entry) => entry.id));
      if (!Array.isArray(lenses) || !lenses.every((lens) => knownLenses.has(lens)) || new Set(lenses).size !== lenses.length) {
        failures.push(makeFailure(artifactPath, record, `${prefix}.affected_lenses`, "array of unique registry lens ids", JSON.stringify(lenses)));
      }
    }
    if (!decision.reason) failures.push(makeFailure(artifactPath, record, `${prefix}.reason`, "short reason", decision.reason));
    if (decision.change_type !== undefined) {
      validateEnum(decision.change_type, CHANGE_TYPES, artifactPath, record, `${prefix}.change_type`, failures);
    }
    if (decision.serves_goal !== undefined && decision.serves_goal !== null && !isNonEmptyString(decision.serves_goal)) {
      failures.push(makeFailure(artifactPath, record, `${prefix}.serves_goal`, "goal id or text, or null", decision.serves_goal));
    }
    if (decision.decision === "accepted" && decision.change_type === "add" && !isNonEmptyString(decision.serves_goal)) {
      failures.push(makeFailure(artifactPath, record, `${prefix}.serves_goal`, "the goal an accepted add serves", decision.serves_goal ?? "missing"));
    }
    if (decision.decision === "needs_author" && decision.change_type !== undefined) {
      failures.push(makeFailure(artifactPath, record, `${prefix}.change_type`, "absent; a question for the author is not a plan change", decision.change_type));
    }
    if (decision.rejection_reason !== undefined) {
      validateEnum(decision.rejection_reason, REJECTION_REASONS, artifactPath, record, `${prefix}.rejection_reason`, failures);
      if (decision.decision !== "rejected") {
        failures.push(makeFailure(artifactPath, record, `${prefix}.rejection_reason`, "only on rejected decisions", decision.decision));
      }
    }
  }
}

function validateScopeDelta(record, artifactPath, failures) {
  const delta = record.scope_delta;
  if (delta === undefined) return;
  if (!delta || typeof delta !== "object" || Array.isArray(delta)) {
    failures.push(makeFailure(artifactPath, record, "scope_delta", "object", delta));
    return;
  }
  for (const field of ["added", "removed"]) {
    if (!Array.isArray(delta[field]) || !delta[field].every((item) => typeof item === "string")) {
      failures.push(makeFailure(artifactPath, record, `scope_delta.${field}`, "array of strings", JSON.stringify(delta[field])));
    }
  }
  validateEnum(delta.net, SCOPE_DELTA_NET_VALUES, artifactPath, record, "scope_delta.net", failures);
  if (typeof delta.reductive_goal !== "boolean") {
    failures.push(makeFailure(artifactPath, record, "scope_delta.reductive_goal", "boolean", delta.reductive_goal));
  }
  if (delta.reductive_goal === true && delta.net === "grows" && record.final_assessment !== "Goal drift") {
    failures.push(makeFailure(artifactPath, record, "final_assessment", "Goal drift when a reductive goal's net surface grows", record.final_assessment));
  }
}

// A synthesis written to the goal-anchored contract (current Markdown, or a
// scope_delta) records its scope delta and the change type of every accepted
// blocking finding, so an untyped addition cannot skip the serves_goal check.
// Legacy synthesis records carry neither and stay valid.
function validateGoalAnchoredSynthesis(record, markdownContract, artifactPath, failures) {
  if (markdownContract === "current" && record.scope_delta === undefined) {
    failures.push(makeFailure(artifactPath, record, "scope_delta", "present when the synthesis Markdown has a Scope Delta section", "missing"));
  }
  if (markdownContract !== "current" && record.scope_delta === undefined) return;
  for (const [index, decision] of (Array.isArray(record.finding_decisions) ? record.finding_decisions : []).entries()) {
    if (decision?.decision === "accepted" && BLOCKING_SEVERITIES.includes(decision.severity) && decision.change_type === undefined) {
      failures.push(makeFailure(artifactPath, record, `finding_decisions[${index}].change_type`, "clarify, add, or remove for an accepted blocking finding", "missing"));
    }
  }
}

// Policy may apply only in auto mode, only on pass 1 (the automatic rerun and
// later passes apply nothing), and only an accepted blocking finding that cites
// a stated goal: an intent card goal id when the run has a card. Questions and minor issues reach the target only by a human. Ledgers written
// before apply_mode existed keep the policy rule without the mode check.
export function validateTargetEdits(record, findingDecisions, artifactPath, failures, intent) {
  if (record.target_edits === undefined) return;
  if (!Array.isArray(record.target_edits)) {
    failures.push(makeFailure(artifactPath, record, "target_edits", "array", record.target_edits));
    return;
  }
  for (const [index, edit] of record.target_edits.entries()) {
    const prefix = `target_edits[${index}]`;
    if (!edit || typeof edit !== "object" || Array.isArray(edit)) {
      failures.push(makeFailure(artifactPath, record, prefix, "object", edit));
      continue;
    }
    validateEnum(edit.decided_by, TARGET_EDIT_DECIDERS, artifactPath, record, `${prefix}.decided_by`, failures);
    if (!isNonEmptyString(edit.summary)) failures.push(makeFailure(artifactPath, record, `${prefix}.summary`, "non-empty string", edit.summary));
    const citesFinding = isNonEmptyString(edit.finding_id);
    if (citesFinding === (edit.host_initiated === true)) {
      failures.push(makeFailure(artifactPath, record, prefix, "exactly one of finding_id or host_initiated: true", JSON.stringify(edit)));
    }
    if (citesFinding && findingDecisions.size > 0 && !findingDecisions.has(edit.finding_id)) {
      failures.push(makeFailure(artifactPath, record, `${prefix}.finding_id`, "a finding id from this ledger's synthesis decisions", edit.finding_id));
    }
    if (edit.decided_by === "policy") {
      if (record.apply_mode === "interactive") {
        failures.push(makeFailure(artifactPath, record, `${prefix}.decided_by`, "human in interactive mode; only apply_mode auto applies by policy", "policy"));
        continue;
      }
      if ((record.pass_index ?? 1) >= AUTOMATIC_PASS_LIMIT) {
        failures.push(makeFailure(artifactPath, record, `${prefix}.decided_by`, `human on pass ${record.pass_index}; policy applies only on pass 1, before the one automatic rerun`, "policy"));
        continue;
      }
      const decision = citesFinding ? findingDecisions.get(edit.finding_id) : undefined;
      const goalIds = Array.isArray(intent?.goals) ? intent.goals.map((goal) => goal?.id) : null;
      const citesStatedGoal = goalIds ? goalIds.includes(decision?.serves_goal) : isNonEmptyString(decision?.serves_goal);
      const applicable = decision?.decision === "accepted"
        && BLOCKING_SEVERITIES.includes(decision.severity)
        && citesStatedGoal;
      if (!applicable) {
        failures.push(makeFailure(artifactPath, record, `${prefix}.decided_by`, "human unless the edit applies an accepted blocking finding that cites a stated goal", "policy"));
      }
    }
  }
}

// Maps a lens decision onto open | settled. Legacy lock states keep the
// meaning the old rerun decider gave them: a locked lens is settled, and any
// other lens is open exactly when its rerun_needed is true.
export function lensStateOf(entry) {
  if (LENS_STATES.includes(entry?.lens_state)) return entry.lens_state;
  if (LEGACY_SETTLED_LOCK_STATES.includes(entry?.lock_state)) return "settled";
  return entry?.rerun_needed === true ? "open" : "settled";
}

// Rerun decisions follow applied findings, not target hashes. Each lens starts
// from its synthesis state (settled when there is none) and reopens only when
// one of its own findings was applied, an applied finding from another lens
// names it in affected_lenses, or the user reopens it. A reopened lens outside
// this pass (settled in an earlier pass of the lineage) is added.
export function deriveRerunDecisions({ lenses, lensEntries = [], findings = new Map(), applied = [], reopen = [] }) {
  const reasons = new Map();
  const reopenLens = (lens, reason) => {
    if (!reasons.has(lens)) reasons.set(lens, reason);
  };
  for (const lens of reopen) reopenLens(lens, "reopened by the user");
  for (const findingId of applied) {
    // A single-lens run without a synthesis owns every finding it reported.
    const finding = findings.get(findingId) || (lenses.length === 1 ? { source_lens: lenses[0] } : null);
    if (!finding) {
      throw Object.assign(new Error(`applied finding ${findingId} has no synthesis decision naming its source lens`), { exitCode: EXIT_CODES.usage });
    }
    reopenLens(finding.source_lens, `own finding ${findingId} was applied`);
    for (const lens of finding.affected_lenses || []) {
      reopenLens(lens, `applied finding ${findingId} from ${finding.source_lens} names this lens as affected`);
    }
  }
  const baseline = new Map(lensEntries.map((entry) => [entry.lens, entry]));
  return [...new Set([...lenses, ...reasons.keys()])].map((lens) => {
    if (reasons.has(lens)) return { lens, lens_state: "open", rerun_needed: true, reason: reasons.get(lens) };
    const entry = baseline.get(lens);
    const lensState = entry ? lensStateOf(entry) : "settled";
    return {
      lens,
      lens_state: lensState,
      rerun_needed: lensState === "open",
      reason: entry?.reason || "no applied finding or user reopen"
    };
  });
}

export function validateLensLocks(record, artifactPath, failures) {
  if (!Array.isArray(record.lens_lock_decisions)) {
    failures.push(makeFailure(artifactPath, record, "lens_lock_decisions", "array", record.lens_lock_decisions));
    return;
  }
  for (const [index, lock] of record.lens_lock_decisions.entries()) {
    const prefix = `lens_lock_decisions[${index}]`;
    if (!lock.lens) failures.push(makeFailure(artifactPath, record, `${prefix}.lens`, "lens id", lock.lens));
    if (lock.lens_state === undefined && lock.lock_state === undefined) {
      failures.push(makeFailure(artifactPath, record, `${prefix}.lens_state`, LENS_STATES.join("|"), "missing"));
    }
    if (lock.lens_state !== undefined) {
      validateEnum(lock.lens_state, LENS_STATES, artifactPath, record, `${prefix}.lens_state`, failures);
    }
    if (lock.lock_state !== undefined) {
      validateEnum(lock.lock_state, LOCK_STATES, artifactPath, record, `${prefix}.lock_state`, failures);
      if (typeof lock.rerun_needed !== "boolean") {
        failures.push(makeFailure(artifactPath, record, `${prefix}.rerun_needed`, "boolean", lock.rerun_needed));
      }
    } else if (lock.rerun_needed !== undefined && lock.rerun_needed !== (lock.lens_state === "open")) {
      failures.push(makeFailure(artifactPath, record, `${prefix}.rerun_needed`, "true only for an open lens", lock.rerun_needed));
    }
    if (LENS_STATES.includes(lock.lens_state) && LOCK_STATES.includes(lock.lock_state)) {
      const legacyState = lensStateOf({ lock_state: lock.lock_state, rerun_needed: lock.rerun_needed });
      if (legacyState !== lock.lens_state) {
        failures.push(makeFailure(artifactPath, record, `${prefix}.lens_state`, `${legacyState} to match legacy lock_state`, lock.lens_state));
      }
    }
    if (!lock.reason) failures.push(makeFailure(artifactPath, record, `${prefix}.reason`, "short reason", lock.reason));
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

// Revision of an intent card for lineage checks. amended_by records who changed
// the card, not what it says, so it is left out.
export function intentRevision(intent) {
  if (intent === undefined) return "none";
  const { amended_by: _amendedBy, ...card } = intent || {};
  return `sha256:${createHash("sha256").update(canonicalJson(card), "utf8").digest("hex")}`;
}

// Pass lineage: pass 1 has no parent; pass 2 is the one automatic rerun; a
// later pass needs a recorded human_approval. The intent card stays fixed
// across a lineage unless its owner amends it.
export function validatePassLineage(record, intent, artifactPath = "review-ledger") {
  const failures = [];
  const index = record.pass_index ?? 1;
  if (!Number.isInteger(index) || index < 1) {
    failures.push(makeFailure(artifactPath, record, "pass_index", "positive integer", record.pass_index));
    return failures;
  }
  if (record.human_approval !== undefined || index > AUTOMATIC_PASS_LIMIT) {
    const approval = record.human_approval;
    if (approval?.decided_by !== "human" || !isNonEmptyString(approval?.summary)) {
      failures.push(makeFailure(artifactPath, record, "human_approval", `decided_by: human with a summary${index > AUTOMATIC_PASS_LIMIT ? ` for pass ${index}; only pass ${AUTOMATIC_PASS_LIMIT} reruns automatically, so record the user's approval with --human-approval "<what the user approved>"` : ""}`, approval === undefined ? "missing" : JSON.stringify(approval)));
    }
  }
  if (index === 1) {
    for (const field of ["parent_pass_id", "parent_intent_revision"]) {
      if (record[field] !== undefined) failures.push(makeFailure(artifactPath, record, field, "absent on pass 1", record[field]));
    }
    return failures;
  }
  if (!isNonEmptyString(record.parent_pass_id) || record.parent_pass_id === record.pass_id) {
    failures.push(makeFailure(artifactPath, record, "parent_pass_id", "the parent pass id for pass 2 or later", record.parent_pass_id));
  }
  if (!isNonEmptyString(record.parent_intent_revision)) {
    failures.push(makeFailure(artifactPath, record, "parent_intent_revision", "the parent pass intent revision", record.parent_intent_revision));
  } else if (record.parent_intent_revision !== intentRevision(intent) && intent?.amended_by !== "human") {
    failures.push(makeFailure(artifactPath, record, "intent.amended_by", "human when the intent card differs from the parent pass", intent?.amended_by ?? "missing"));
  }
  return failures;
}

// Lineage fields for a new pass whose parent is the ledger at parentLedgerInput.
// Throws a usage error when the parent reviews another target, when the pass
// needs the user's approval and none is recorded, or when the intent card
// changed without amended_by: human.
export function buildPassLineage(root, parentLedgerInput, { passId, targetPath, intent, humanApproval }) {
  if (!parentLedgerInput) {
    if (humanApproval) throw Object.assign(new Error("--human-approval records approval for a rerun pass and requires --parent-ledger"), { exitCode: EXIT_CODES.usage });
    return { pass_index: 1 };
  }
  const parent = readJsonFile(resolveInputPath(root, parentLedgerInput));
  if (parent.target_path !== targetPath) {
    throw Object.assign(new Error(`--parent-ledger reviews ${parent.target_path}, not ${targetPath}`), { exitCode: EXIT_CODES.usage });
  }
  const parentInput = parent.review_input_path ? resolveReviewInput(root, { reviewInput: parent.review_input_path }) : null;
  const lineage = {
    pass_index: (parent.pass_index ?? 1) + 1,
    parent_pass_id: parent.pass_id,
    parent_intent_revision: intentRevision(parentInput?.record.intent),
    ...(humanApproval ? { human_approval: { decided_by: "human", summary: humanApproval } } : {})
  };
  const failures = validatePassLineage({ pass_id: passId, ...lineage }, intent, "--parent-ledger");
  if (failures.length > 0) {
    throw Object.assign(new Error(`invalid pass lineage: ${failures.map(formatFailure).join("; ")}`), { exitCode: EXIT_CODES.usage });
  }
  return lineage;
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
    // A settled lens in a full run has delivered a current validated review.
    // Settling asks nothing of scores; the legacy lock states below still do.
    if (lock.lens_state === "settled" && record.run_mode === "full" && !currentReviewsByLens.has(lock.lens)) {
      failures.push(makeFailure(artifactPath, record, `lens_lock_decisions.${lock.lens}.source_review`, "current included review for settled lens", "missing"));
    }
    if (!LEGACY_SETTLED_LOCK_STATES.includes(lock.lock_state)) continue;
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
  const registry = readRegistry();
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

let currentTemplateRevision;
function reviewerTemplateRevision() {
  if (currentTemplateRevision === undefined) {
    try {
      currentTemplateRevision = computeArtifactSha(PACKAGE_ROOT, readRegistry().entrypoints.reviewer_template);
    } catch {
      currentTemplateRevision = null;
    }
  }
  return currentTemplateRevision;
}

// A review written to the goal-anchored reviewer contract records the lens
// verdict fields or was stamped with the current reviewer template; its
// Markdown must carry the Goal Gate and Goal Fit sections.
export function isGoalContractReview(record) {
  if (record.goal_fit !== undefined || record.blocking !== undefined) return true;
  const templateRevision = reviewerTemplateRevision();
  return Boolean(templateRevision) && record.template_revision === templateRevision;
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
  validateLensVerdict(record, artifactPath, failures);
  validateProvenance(record, root, artifactPath, failures);
  const requiresMarkdown = record.status === "completed" || record.fixture_kind !== "schema_only_minimal";
  validateMarkdownBinding(root, artifactPath, record, "review", failures, { required: requiresMarkdown, goalContract: isGoalContractReview(record) });

  if (["fresh_spawned_lens_reviewers", "fresh_spawned_orchestrator"].includes(record.execution_mode) && record.status === "completed") {
    if (!record.agent_id) failures.push(makeFailure(artifactPath, record, "agent_id", "present", record.agent_id));
    if (record.closed !== true) failures.push(makeFailure(artifactPath, record, "closed", true, record.closed));
    if (record.output_captured !== true) failures.push(makeFailure(artifactPath, record, "output_captured", true, record.output_captured));
  }
  return failures;
}

// Provenance the run already knows is stamped by the script that attaches a
// record, not echoed by a model: the ledger's pass, target, revisions, and
// modes, the package template and lens revisions, and the Markdown hash. Only
// missing fields are filled; a supplied value that disagrees still fails
// validation. A category the lens does not own and the review skipped is not
// applicable; an owned category is the reviewer's to answer and is never filled.
// Fields stampRunProvenance fills for a review when they are missing.
export const STAMPED_REVIEW_FIELDS = ["pass_id", "target_path", "target_revision", "run_mode", "review_input_revision", "execution_mode", "template_revision", "lens_revision", "markdown_artifact_sha"];

export function stampRunProvenance(root, ledger, record, kind) {
  const stamped = [];
  const fill = (field, value) => {
    if (record[field] === undefined && value !== undefined && value !== null) {
      record[field] = value;
      stamped.push(field);
    }
  };
  for (const field of ["pass_id", "target_path", "target_revision", "run_mode", "review_input_revision"]) fill(field, ledger[field]);
  if (kind === "review") {
    fill("execution_mode", ledger.execution_mode);
    const registry = readRegistry();
    fill("template_revision", computeArtifactSha(PACKAGE_ROOT, registry.entrypoints.reviewer_template));
    const lensEntry = registry.lenses.find((entry) => entry.id === record.lens);
    const manifest = lensEntry ? readJsonFile(join(PACKAGE_ROOT, lensEntry.manifest_path)) : null;
    if (manifest) fill("lens_revision", computeArtifactSha(PACKAGE_ROOT, manifest.prompt_path));
    // Manifest labels such as "Compatibility / platform constraints" start with
    // their key's words (compatibility_platform).
    const { primary = [], secondary = [] } = manifest?.cross_cutting_ownership || {};
    const owned = new Set([...primary, ...secondary].map((label) => {
      const words = label.toLowerCase().replace(/[^a-z]+/g, "_");
      return CROSS_CUTTING_KEYS.find((key) => words.startsWith(key));
    }));
    if (manifest && record.cross_cutting_status === undefined) record.cross_cutting_status = {};
    if (manifest && record.cross_cutting_status && typeof record.cross_cutting_status === "object" && !Array.isArray(record.cross_cutting_status)) {
      for (const key of CROSS_CUTTING_KEYS) {
        if (!owned.has(key) && record.cross_cutting_status[key] === undefined) {
          record.cross_cutting_status[key] = "not_applicable";
          stamped.push(`cross_cutting_status.${key}`);
        }
      }
    }
  }
  if (record.markdown_artifact_path && record.markdown_artifact_sha === undefined && fileExistsAt(root, record.markdown_artifact_path)) {
    fill("markdown_artifact_sha", computeArtifactSha(root, record.markdown_artifact_path));
  }
  return stamped;
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

// Delivered counts. A blocking gap is an accepted finding that is not minor; a
// minor issue is an accepted minor or a downgraded finding; a question is a
// needs_author decision. Reviewer Open Questions (and minor issues without a
// decision) live only in the synthesis Markdown, so its line may count more
// minor issues and questions than the decisions, never fewer, and exactly the
// decisions' blocking gaps.
export const isBlockingGapDecision = (entry) => entry?.decision === "accepted" && entry.severity !== "minor";
export const isMinorIssueDecision = (entry) => (entry?.decision === "accepted" && entry.severity === "minor") || entry?.decision === "downgraded";
export const isQuestionDecision = (entry) => entry?.decision === "needs_author";

export function deliveredFromDecisions(decisions) {
  const list = Array.isArray(decisions) ? decisions : [];
  return {
    blocking_gaps: list.filter(isBlockingGapDecision).length,
    minor_issues: list.filter(isMinorIssueDecision).length,
    questions: list.filter(isQuestionDecision).length
  };
}

export function parseDeliveredLine(text) {
  const match = String(text || "").match(DELIVERED_LINE_PATTERN);
  return match ? { blocking_gaps: Number(match[1]), minor_issues: Number(match[2]), questions: Number(match[3]) } : null;
}

export function formatDelivered(delivered) {
  return `Review delivered: ${delivered.blocking_gaps} blocking gaps, ${delivered.minor_issues} minor issues, ${delivered.questions} questions`;
}

export function deliveredCountFailures(claimed, decisions, artifactPath, record, field) {
  const failures = [];
  if (!claimed || !Array.isArray(decisions)) return failures;
  const counted = deliveredFromDecisions(decisions);
  const message = `the Review delivered line must agree with the synthesis finding_decisions (claimed: ${formatDelivered(claimed)})`;
  if (claimed.blocking_gaps !== counted.blocking_gaps) {
    failures.push(makeFailure(artifactPath, record, `${field}.blocking_gaps`, `${counted.blocking_gaps} (accepted non-minor finding decisions)`, claimed.blocking_gaps, message));
  }
  if (claimed.minor_issues < counted.minor_issues) {
    failures.push(makeFailure(artifactPath, record, `${field}.minor_issues`, `at least ${counted.minor_issues} (accepted minor and downgraded finding decisions)`, claimed.minor_issues, message));
  }
  if (claimed.questions < counted.questions) {
    failures.push(makeFailure(artifactPath, record, `${field}.questions`, `at least ${counted.questions} (needs_author finding decisions)`, claimed.questions, message));
  }
  return failures;
}

export function readSynthesisDeliveredLine(root, synthesis) {
  if (typeof synthesis?.markdown_artifact_path !== "string" || !isRepoRelativePath(synthesis.markdown_artifact_path)) return null;
  const resolved = resolveRepoPath(root, synthesis.markdown_artifact_path);
  if (!resolved || !existsSync(resolved)) return null;
  return parseDeliveredLine(readFileSync(resolved, "utf8"));
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
  validateScopeDelta(record, artifactPath, failures);
  validateLensLocks(record, artifactPath, failures);
  validatePriorMaterialFindings(record, artifactPath, failures);
  const markdownContract = validateMarkdownBinding(root, artifactPath, record, "synthesis", failures);
  validateGoalAnchoredSynthesis(record, markdownContract, artifactPath, failures);
  failures.push(...deliveredCountFailures(readSynthesisDeliveredLine(root, record), record.finding_decisions, artifactPath, record, "markdown.review_delivered"));

  if (options.ledger) {
    const synthesisArtifacts = new Map((options.ledger.synthesis_record_artifacts || []).map((entry) => [entry.record_id, entry.artifact_path]));
    if (!(options.ledger.synthesis_record_ids || []).includes(record.record_id)) {
      failures.push(makeFailure(artifactPath, record, "record_id", "a synthesis record attached to the ledger (attach it first with update-ledger.mjs --ledger <ledger> --synthesis <synthesis-json> --write)", record.record_id));
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
  if (record.apply_mode !== undefined) {
    validateEnum(record.apply_mode, APPLY_MODES, artifactPath, record, "apply_mode", failures);
  }
  let intent;
  if (record.review_input_path !== undefined) {
    validatePathField(root, artifactPath, record, "review_input_path", failures, { mustExist: true });
    try {
      const reviewInput = resolveReviewInput(root, { reviewInput: record.review_input_path });
      intent = reviewInput.record.intent;
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
        const registry = readRegistry();
        // Replay the policy only against the reviewed text. After a later edit
        // the recorded revisions are the audit trail.
        const replayable = fileExistsAt(root, selection.target_path) && computeArtifactSha(root, selection.target_path) === selection.target_revision;
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
          const policyRevision = computeArtifactSha(PACKAGE_ROOT, selection.policy_path);
          if (selection.policy_revision !== policyRevision) failures.push(makeFailure(artifactPath, selection, "lens_selection.policy_revision", policyRevision, selection.policy_revision));
        }
        if (replayable && ["deterministic", "deterministic_plus_llm_additions"].includes(selection.mode) && selection.review_input_path) {
          const replayInput = resolveReviewInput(root, { reviewInput: selection.review_input_path });
          const replayPolicy = readJsonFile(join(PACKAGE_ROOT, selection.policy_path));
          const replay = evaluateLensPolicy(replayPolicy, registry, replayInput.record, readTextFile(join(root, selection.target_path)));
          if (JSON.stringify(selection.deterministic_lenses) !== JSON.stringify(replay.deterministicLenses)) {
            failures.push(makeFailure(artifactPath, selection, "lens_selection.deterministic_lenses", JSON.stringify(replay.deterministicLenses), JSON.stringify(selection.deterministic_lenses)));
          }
          if (JSON.stringify(selection.matched_domains) !== JSON.stringify(replay.matchedDomains)) {
            failures.push(makeFailure(artifactPath, selection, "lens_selection.matched_domains", JSON.stringify(replay.matchedDomains), JSON.stringify(selection.matched_domains)));
          }
        }
        if (replayable && ["core_profile", "core_profile_plus_llm_additions"].includes(selection.mode) && selection.review_input_path) {
          const profile = (registry.core_profiles || []).find((entry) => entry.id === selection.core_profile_id);
          if (!profile) {
            failures.push(makeFailure(artifactPath, selection, "lens_selection.core_profile_id", "known registry core profile", selection.core_profile_id));
          } else {
            const replayInput = resolveReviewInput(root, { reviewInput: selection.review_input_path });
            const replayPolicy = readJsonFile(join(PACKAGE_ROOT, selection.policy_path));
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
  // The events log is an opt-in audit: runs record setup events cheaply, and
  // --audit checks the log and, for a detached run, its reviewer lifecycle.
  let events = [];
  if (options.audit && record.events_path !== undefined) {
    events = validateEventsLog(root, record, artifactPath, failures);
  }
  if (options.audit && record.status === "completed" && record.execution_mode === "fresh_spawned_orchestrator") {
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
    const edits = Array.isArray(record.target_edits) ? record.target_edits.length : 0;
    const message = edits > 0
      ? `the target was edited after delivery (${edits} target_edits recorded); this ledger keeps the revision pass ${record.pass_id} reviewed, so validate it with --target-revision ${record.target_revision}, and review the edited text in a rerun pass`
      : `this ledger records the revision pass ${record.pass_id} reviewed; validate it with --target-revision ${record.target_revision}, or start a new pass for the current text`;
    failures.push(makeFailure(artifactPath, record, "target_revision", options.targetRevision, record.target_revision, message));
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

  const findingDecisions = new Map();
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
    for (const decision of Array.isArray(synthesis.finding_decisions) ? synthesis.finding_decisions : []) {
      findingDecisions.set(decision.finding_id, decision);
    }
  }
  failures.push(...registeredArtifactHashFailures(root, record, artifactPath));
  validateTargetEdits(record, findingDecisions, artifactPath, failures, intent);
  failures.push(...validatePassLineage(record, intent, artifactPath));

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
  // The headline line must match the structured counts and, with a ledger,
  // the finding decisions of the synthesis it reports.
  const textDelivered = parseDeliveredLine(text);
  const recordDelivered = record.delivered && typeof record.delivered === "object" ? record.delivered : null;
  if (textDelivered && recordDelivered && ["blocking_gaps", "minor_issues", "questions"].some((key) => textDelivered[key] !== recordDelivered[key])) {
    failures.push(makeFailure(artifactPath, record, "summary_text.review_delivered", formatDelivered(recordDelivered), formatDelivered(textDelivered)));
  }
  const claimed = textDelivered || recordDelivered;
  if (claimed && options.ledger) {
    const synthesisIds = options.ledger.synthesis_record_ids || [];
    const synthesisId = record.synthesis_record_id || synthesisIds.at(-1);
    const synthesisPath = (options.ledger.synthesis_record_artifacts || []).find((entry) => entry.record_id === synthesisId)?.artifact_path;
    if (record.synthesis_record_id !== undefined && !synthesisIds.includes(record.synthesis_record_id)) {
      failures.push(makeFailure(artifactPath, record, "synthesis_record_id", `one of the ledger synthesis_record_ids: ${synthesisIds.join(",")}`, record.synthesis_record_id));
    } else if (synthesisPath && isRepoRelativePath(synthesisPath) && fileExistsAt(root, synthesisPath)) {
      const synthesis = readJsonFile(resolveRepoPath(root, synthesisPath));
      failures.push(...deliveredCountFailures(claimed, synthesis.finding_decisions, artifactPath, record, "review_delivered"));
    }
  }
  return failures;
}

export function ensureNode18() {
  const major = Number.parseInt(process.versions.node.split(".")[0], 10);
  if (major < 18) {
    process.stderr.write(`Node 18+ required, actual=${process.versions.node}\n`);
    process.exit(EXIT_CODES.internal);
  }
  ignoreBrokenPipes();
}

// A reader that closes early (`| head`) must not turn a finished run into a
// stack trace: output to a closed pipe is dropped and the script finishes.
let brokenPipesIgnored = false;
export function ignoreBrokenPipes() {
  if (brokenPipesIgnored) return;
  brokenPipesIgnored = true;
  for (const stream of [process.stdout, process.stderr]) {
    stream.on("error", (error) => {
      if (error?.code === "EPIPE" || error?.code === "ERR_STREAM_DESTROYED") return;
      throw error;
    });
  }
}

// Validators confirm success in one line unless --quiet; --json prints the
// valid event instead.
export function printValid(opts, text, event) {
  if (opts.json) process.stdout.write(`${JSON.stringify({ event: "valid", ...event })}\n`);
  else if (!opts.quiet) process.stdout.write(`${text}\n`);
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
