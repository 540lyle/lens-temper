#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  CONTRACT_VERSION,
  EXIT_CODES,
  PACKAGE_ROOT,
  buildPassLineage,
  computeArtifactSha,
  ensureNode18,
  isRepoRelativePath,
  normalizeRepoInputPath,
  parseCommonArgs,
  projectRootFrom,
  readJsonFile,
  readRegistry,
  resolveInputPath,
  resolveReviewInput,
  resolveRepoPath,
  serializeReviewInput,
  usage,
  writeRunEvent
} from "./validation-helpers.mjs";
import { selectLenses } from "./lens-selection.mjs";
import { APPLY_MODES } from "./validation-contracts.mjs";

ensureNode18();

const scriptName = "run-plan-review.mjs";

const execFileAsync = promisify(execFile);

// Child scripts come from the package and run against the project root.
async function runScript(root, name, args) {
  const script = join(PACKAGE_ROOT, "reviews", "scripts", name);
  const { stdout } = await execFileAsync(process.execPath, [script, "--root", root, ...args], { cwd: root, encoding: "utf8" });
  return stdout;
}

try {
  const opts = parseCommonArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(`${usage(scriptName, "--target <path> --pass-id <id> (--review-input <path> | --feature-request <text>) [--relevant-context <text>] [--constraints <text>] [--previous-adjudications <text>] [--lens a,b | --all-lenses | --core-profile <id>] [--lens-proposal <path>] [--selection-fallback all] [--execution-mode fresh_spawned_lens_reviewers|fresh_spawned_orchestrator] [--apply-mode interactive|auto] [--parent-ledger <path> [--human-approval <summary>]] [--root <path>] [--out <dir>]")}\n`);
    process.exit(EXIT_CODES.ok);
  }
  if (opts.version) {
    process.stdout.write(`${CONTRACT_VERSION}\n`);
    process.exit(EXIT_CODES.ok);
  }
  if (!opts.target || !opts.passId) {
    process.stderr.write(`${usage(scriptName, "--target <path> --pass-id <id> (--review-input <path> | --feature-request <text>) [--lens a,b] [--out <dir>]")}\n`);
    process.stderr.write(`validation error: missing --target or --pass-id\n`);
    process.exit(EXIT_CODES.usage);
  }
  const root = projectRootFrom(opts);
  const registry = readRegistry();
  const targetPath = normalizeRepoInputPath(root, opts.target);
  if (!targetPath) {
    process.stderr.write(`validation error: --target must resolve under the project root\n`);
    process.exit(EXIT_CODES.usage);
  }
  const applyMode = opts.applyMode || "interactive";
  if (!APPLY_MODES.includes(applyMode)) {
    throw Object.assign(new Error(`--apply-mode must be one of ${APPLY_MODES.join(", ")}`), { exitCode: EXIT_CODES.usage });
  }
  const defaultCoreProfile = (registry.core_profiles || []).find((entry) => entry.id === registry.default_core_profile_id);
  if (!defaultCoreProfile || !Array.isArray(defaultCoreProfile.required_lens_ids)) {
    throw Object.assign(new Error("registry default core profile is invalid"), { exitCode: EXIT_CODES.usage });
  }
  const outDir = opts.out || `reviews/archive/${opts.passId}`;
  if (!isRepoRelativePath(outDir)) {
    process.stderr.write(`validation error: --out must be repository-relative\n`);
    process.exit(EXIT_CODES.usage);
  }
  const resolvedOutDir = resolveRepoPath(root, outDir);
  if (!resolvedOutDir) {
    process.stderr.write(`validation error: --out must resolve under the repository root\n`);
    process.exit(EXIT_CODES.usage);
  }
  const reviewInput = resolveReviewInput(root, opts);
  const reviewInputPath = `${outDir}/review-input.json`;
  const targetRevision = computeArtifactSha(root, targetPath);
  const proposalPath = opts.lensProposal ? normalizeRepoInputPath(root, opts.lensProposal) : null;
  if (opts.lensProposal && !proposalPath) {
    process.stderr.write(`validation error: --lens-proposal must resolve under the repository root\n`);
    process.exit(EXIT_CODES.usage);
  }
  // Validate lineage before writing anything. A rerun without an explicit
  // scope reruns only the lenses the parent's rerun decisions reopened.
  buildPassLineage(root, opts.parentLedger, {
    passId: opts.passId,
    targetPath,
    intent: reviewInput.record.intent,
    humanApproval: opts.humanApproval
  });
  let explicitLenses = opts.lens === null
    ? null
    : opts.lens.split(",").map((item) => item.trim()).filter(Boolean);
  if (opts.parentLedger && !explicitLenses && !opts.allLenses && !opts.coreProfile) {
    const parent = readJsonFile(resolveInputPath(root, opts.parentLedger));
    explicitLenses = (parent.rerun_decisions || []).filter((entry) => entry.rerun_needed).map((entry) => entry.lens);
    if (explicitLenses.length === 0) {
      throw Object.assign(new Error("the parent ledger reopens no lens; run decide-reruns.mjs --write on it, or pass --lens to rerun lenses explicitly"), { exitCode: EXIT_CODES.usage });
    }
  }
  if (opts.coreProfile && (explicitLenses || opts.allLenses)) {
    throw Object.assign(new Error("--core-profile cannot be combined with --lens or --all-lenses"), { exitCode: EXIT_CODES.usage });
  }
  let selection;
  try {
    selection = selectLenses({
      root,
      registry,
      reviewInput: { ...reviewInput.record, revision: reviewInput.revision },
      reviewInputPath,
      targetPath,
      targetRevision,
      explicitLenses,
      allLenses: opts.allLenses,
      fallback: opts.selectionFallback,
      coreProfileId: (!explicitLenses && !opts.allLenses && !opts.selectionFallback) ? (opts.coreProfile || registry.default_core_profile_id) : null,
      proposalPath,
      passId: opts.passId
    });
  } catch (error) {
    if (!error.exitCode) error.exitCode = EXIT_CODES.usage;
    throw error;
  }
  if (selection.status !== "resolved") {
    process.stderr.write(`clarification required: ${selection.clarification_question}\n`);
    process.exit(EXIT_CODES.usage);
  }
  const lenses = selection.selected_lenses;
  const lensSet = new Set(lenses);
  const activeCoreProfile = (registry.core_profiles || []).find((entry) => entry.id === (selection.core_profile_id || registry.default_core_profile_id));
  const coreLensSet = new Set(activeCoreProfile.required_lens_ids);
  const runScope = [...coreLensSet].every((lens) => lensSet.has(lens)) ? "core_profile" : "selected_lenses";
  mkdirSync(resolvedOutDir, { recursive: true });
  writeFileSync(resolveRepoPath(root, reviewInputPath), serializeReviewInput(reviewInput.record), "utf8");
  const lensSelectionPath = `${outDir}/lens-selection.json`;
  writeFileSync(resolveRepoPath(root, lensSelectionPath), `${JSON.stringify(selection, null, 2)}\n`, "utf8");
  const lensSelectionRevision = computeArtifactSha(root, lensSelectionPath);
  const ledgerPath = `${outDir}/ledger.json`;
  const eventsPath = `${outDir}/events.jsonl`;
  const executionMode = opts.executionMode || "fresh_spawned_lens_reviewers";
  writeFileSync(resolveRepoPath(root, eventsPath), "", "utf8");
  await runScript(root, "create-ledger.mjs", [
    "--target", targetPath,
    "--pass-id", opts.passId,
    "--lens", lenses.join(","),
    "--run-mode", "full",
    ...(runScope === "core_profile" ? ["--core-profile", activeCoreProfile.id] : []),
    "--execution-mode", executionMode,
    "--apply-mode", applyMode,
    ...(opts.parentLedger ? ["--parent-ledger", opts.parentLedger] : []),
    ...(opts.humanApproval ? ["--human-approval", opts.humanApproval] : []),
    "--review-input", reviewInputPath,
    "--lens-selection", lensSelectionPath,
    "--events-path", eventsPath,
    "--out", ledgerPath,
    "--quiet"
  ]);
  writeRunEvent(root, eventsPath, "lens_selection_created", {
    pass_id: opts.passId,
    role: executionMode === "fresh_spawned_orchestrator" ? "parent_launcher" : "hosted_orchestrator",
    target_revision: targetRevision,
    review_input_revision: reviewInput.revision,
    artifact_path: lensSelectionPath,
    artifact_revision: lensSelectionRevision,
    status: "created"
  });
  writeRunEvent(root, eventsPath, "ledger_created", {
    pass_id: opts.passId,
    role: executionMode === "fresh_spawned_orchestrator" ? "parent_launcher" : "hosted_orchestrator",
    target_revision: targetRevision,
    review_input_revision: reviewInput.revision,
    artifact_path: ledgerPath,
    status: "created"
  });
  let orchestratorPath = null;
  if (executionMode === "fresh_spawned_orchestrator") {
    orchestratorPath = `${outDir}/${opts.passId}.orchestrator.md`;
    await runScript(root, "assemble-orchestrator-prompt.mjs", [
      "--target", targetPath,
      "--pass-id", opts.passId,
      "--lens", lenses.join(","),
      "--ledger", ledgerPath,
      "--events-path", eventsPath,
      "--review-input", reviewInputPath,
      "--apply-mode", applyMode,
      ...(runScope === "core_profile" ? ["--core-profile", activeCoreProfile.id] : []),
      "--out", orchestratorPath,
      "--quiet"
    ]);
  }
  const preparedLenses = await Promise.all(lenses.map(async (lens) => {
    const promptPath = `${outDir}/${lens}.prompt.md`;
    await runScript(root, "assemble-review-prompt.mjs", [
      "--target", targetPath,
      "--lens", lens,
      "--pass-id", opts.passId,
      "--review-input", reviewInputPath,
      "--out", promptPath,
      "--quiet"
    ]);
    const spawnPath = `${outDir}/${lens}.spawn.md`;
    await runScript(root, "assemble-spawn-prompt.mjs", [
      "--target", targetPath,
      "--lens", lens,
      "--pass-id", opts.passId,
      "--input-packet", promptPath,
      "--review-input", reviewInputPath,
      "--run-scope", runScope,
      "--execution-mode", executionMode,
      "--out", spawnPath,
      "--quiet"
    ]);
    return { promptPath, spawnPath };
  }));
  // Event order is deterministic even though independent lens preparation is parallel.
  for (const { promptPath, spawnPath } of preparedLenses) {
    writeRunEvent(root, eventsPath, "prompt_packet_created", {
      pass_id: opts.passId,
      role: executionMode === "fresh_spawned_orchestrator" ? "parent_launcher" : "hosted_orchestrator",
      target_revision: targetRevision,
      review_input_revision: reviewInput.revision,
      artifact_path: promptPath,
      status: "created"
    });
    writeRunEvent(root, eventsPath, "spawn_prompt_created", {
      pass_id: opts.passId,
      role: executionMode === "fresh_spawned_orchestrator" ? "parent_launcher" : "hosted_orchestrator",
      target_revision: targetRevision,
      review_input_revision: reviewInput.revision,
      artifact_path: spawnPath,
      status: "created"
    });
  }
  const orchestratorText = orchestratorPath ? `, ${orchestratorPath}` : "";
  process.stdout.write(`created ${reviewInputPath}, ${lensSelectionPath}, ${ledgerPath}${orchestratorText}, ${eventsPath}, ${lenses.length} prompt files, and ${lenses.length} spawn prompt files\n`);
  process.stdout.write(`reviewer execution remains host-provided; spawn reviewers with the generated *.spawn.md handoffs\n`);
  process.stdout.write(applyMode === "auto"
    ? `apply mode auto: after delivery, only accepted blocking findings that cite a stated goal may be applied, logged in target_edits with decided_by: policy; questions and minor issues wait for the user\n`
    : `apply mode interactive: apply nothing; deliver every blocking gap, question, and minor issue to the user\n`);
} catch (error) {
  process.stderr.write(`${usage(scriptName, "--target <path> --pass-id <id> (--review-input <path> | --feature-request <text>) [--lens a,b | --all-lenses] [--lens-proposal <path>] [--selection-fallback all] [--out <dir>]")}\n`);
  process.stderr.write(`validation error: ${error.message}\n`);
  process.exit(error.exitCode || EXIT_CODES.internal);
}
