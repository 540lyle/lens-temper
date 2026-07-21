#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  CONTRACT_VERSION,
  EXIT_CODES,
  computeArtifactSha,
  ensureNode18,
  isRepoRelativePath,
  normalizeRepoInputPath,
  parseCommonArgs,
  readJsonFile,
  repoRootFrom,
  resolveReviewInput,
  resolveRepoPath,
  usage,
  writeRunEvent
} from "./validation-helpers.mjs";

ensureNode18();

const scriptName = "assemble-orchestrator-prompt.mjs";

function resolveSelectedLenses(registry, lensOption) {
  const selected = lensOption
    ? lensOption.split(",").map((item) => item.trim()).filter(Boolean)
    : registry.lenses.map((entry) => entry.id);
  const known = new Set(registry.lenses.map((entry) => entry.id));
  const selectedSet = new Set(selected);
  if (selectedSet.size !== selected.length) {
    throw Object.assign(new Error(`--lens must not include duplicate lens ids`), { exitCode: EXIT_CODES.usage });
  }
  for (const lens of selected) {
    if (!known.has(lens)) {
      throw Object.assign(new Error(`unknown lens ${lens}`), { exitCode: EXIT_CODES.usage });
    }
  }
  return selected;
}

function buildOrchestratorPrompt({
  passId,
  targetPath,
  targetRevision,
  reviewInputPath,
  reviewInputRevision,
  runMode,
  runScope,
  selectedLenses,
  ledgerPath,
  eventsPath,
  orchestratorPath,
  archivePath,
  registry
}) {
  const lensRows = selectedLenses
    .map((id) => {
      const entry = registry.lenses.find((lens) => lens.id === id);
      const manifest = readJsonFile(join(repoRootFrom(import.meta.url), entry.manifest_path));
      return `- ${id}: manifest \`${entry.manifest_path}\`, prompt \`${manifest.prompt_path}\``;
    })
    .join("\n");
  const requiredArtifacts = [
    reviewInputPath,
    ledgerPath,
    eventsPath,
    orchestratorPath,
    ...selectedLenses.flatMap((lens) => [
      `${archivePath}/${lens}.prompt.md`,
      `${archivePath}/${lens}.spawn.md`,
      `${archivePath}/${lens}.review.json`,
      `${archivePath}/${lens}.review.md`
    ]),
    `${archivePath}/synthesis.json`,
    `${archivePath}/synthesis.md`,
    `${archivePath}/final.md`
  ];
  return `Role: You are the detached LensTemper full-run orchestrator.

# Goal
Own the LensTemper review pass for \`${targetPath}\` from ledger creation through reviewer prompts, reviewer output capture, synthesis, rerun decisions, archive evidence, and completion reporting.

# Run Contract
- Pass ID: \`${passId}\`
- Target path: \`${targetPath}\`
- Target revision: \`${targetRevision}\`
- Review input: \`${reviewInputPath}\`
- Review input revision: \`${reviewInputRevision}\`
- Run mode: \`${runMode}\`
- Run scope: \`${runScope}\`
- Execution mode: \`fresh_spawned_orchestrator\`
- Ledger: \`${ledgerPath}\`
- Events log: \`${eventsPath}\`

# Selected Lenses
${lensRows}

# Allowed Files
Read only these repository-relative source inputs and workflow definitions:
- \`${targetPath}\`
- \`${reviewInputPath}\`
- \`reviews/README.md\`
- \`reviews/AGENT.md\`
- \`reviews/registry.json\`
- \`reviews/reviewer-template.md\`
- \`reviews/synthesize-review-feedback.md\`
- \`reviews/scripts/*.mjs\`
- \`reviews/manifests/**/*.json\`
- \`reviews/lenses/*.md\`

Write only repository-relative run artifacts for this pass:
- \`${ledgerPath}\`
- \`${eventsPath}\`
- \`${orchestratorPath}\`
- \`${archivePath}/**\`

# Required Artifacts
${requiredArtifacts.map((path) => `- \`${path}\``).join("\n")}

# Event Log
Append one JSON object per line to \`${eventsPath}\`. Every event must include \`pass_id\`, \`timestamp\`, \`role\`, \`target_revision\`, \`review_input_revision\`, optional repository-relative \`artifact_path\`, and \`status\`.

For this packet, emit all orchestrator-owned events with \`role: \"orchestrator\"\`. Leave any launcher-authored setup events intact (they may use \`role: \"parent_launcher\"\`).

Include \`artifact_path\` whenever the event refers to a concrete artifact (prompt packets, spawn prompts, reviewer outputs, synthesis, archive evidence, or completion summary).

Use these event names when they occur: \`orchestrator_started\`, \`ledger_created\`, \`prompt_packet_created\`, \`spawn_prompt_created\`, \`reviewer_spawned\`, \`reviewer_completed\`, \`reviewer_closed\`, \`validation_passed\`, \`synthesis_completed\`, \`rerun_selected\`, \`archive_written\`, \`completion_reported\`.

# Stop Conditions
- Stop and report input failure if the target path or target revision differs from this packet.
- Stop and report input failure if \`${reviewInputPath}\` does not hash to \`${reviewInputRevision}\` after normalization.
- Stop before review if the host cannot spawn detached-context reviewer subagents for the selected
  lenses. Do not perform an inline/advisory substitute unless the user
  explicitly requested inline or advisory mode.
- Stop before synthesis if any current reviewer output is missing, stale, unvalidated, uncaptured, or not closed.
- Stop before completion if the ledger, events log, reviewer outputs, synthesis, and archive evidence disagree.
- Stop before completion if selected-lens scope is confused with a passed core profile.

# Claim Rules
- Treat reviewer outputs as lockable only when they are validated, current for \`${targetRevision}\`, captured into artifacts, and closed.
- Label unvalidated or imported outputs as advisory/imported; do not use them for lock states.
- Completion claims require agreement among \`${eventsPath}\`, \`${ledgerPath}\`, reviewer artifacts, synthesis artifacts, and archive evidence.
- Require every current review, synthesis, event, and completion artifact to report \`review_input_revision: "${reviewInputRevision}"\`.
- Launch one detached-context reviewer subagent per selected lens. Do not provide parent-launcher or orchestrator conversation or history; each reviewer reads only its run packet and permitted workspace files. Reviewer execution may be concurrent or sequential, and one reviewer may not cover multiple lenses.
- Use host-provided spawning mechanics. Do not assume Codex, Claude, Cursor, or any specific API.
`;
}

try {
  const opts = parseCommonArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(`${usage(scriptName, "--target <path> --pass-id <id> --review-input <path> [--lens a,b] [--run-scope core_profile|selected_lenses] [--ledger <path>] [--events-path <path>] [--out <path>]")}\n`);
    process.exit(EXIT_CODES.ok);
  }
  if (opts.version) {
    process.stdout.write(`${CONTRACT_VERSION}\n`);
    process.exit(EXIT_CODES.ok);
  }
  if (!opts.target || !opts.passId || !opts.reviewInput) {
    process.stderr.write(`${usage(scriptName, "--target <path> --pass-id <id> --review-input <path> [--lens a,b] [--out <path>]")}\n`);
    process.stderr.write(`validation error: missing --target, --pass-id, or --review-input\n`);
    process.exit(EXIT_CODES.usage);
  }
  const root = repoRootFrom(import.meta.url);
  const registry = readJsonFile(join(root, "reviews", "registry.json"));
  const targetPath = normalizeRepoInputPath(root, opts.target);
  if (!targetPath) {
    process.stderr.write(`validation error: --target must resolve under the repository root\n`);
    process.exit(EXIT_CODES.usage);
  }
  const targetResolved = resolveRepoPath(root, targetPath);
  if (!targetResolved || !existsSync(targetResolved)) {
    process.stderr.write(`validation error: target not found ${targetPath}\n`);
    process.exit(EXIT_CODES.read);
  }
  const selectedLenses = resolveSelectedLenses(registry, opts.lens);
  const coreProfile = (registry.core_profiles || []).find((entry) => entry.id === (opts.coreProfile || registry.default_core_profile_id));
  if (!coreProfile || !Array.isArray(coreProfile.required_lens_ids)) {
    process.stderr.write(`validation error: registry default core profile is invalid\n`);
    process.exit(EXIT_CODES.usage);
  }
  const selectedLensSet = new Set(selectedLenses);
  const coreLensSet = new Set(coreProfile.required_lens_ids);
  const selectedIncludesCore = [...coreLensSet].every((lens) => selectedLensSet.has(lens));
  const runScope = opts.runScope || (selectedIncludesCore ? "core_profile" : "selected_lenses");
  if (runScope === "core_profile" && !selectedIncludesCore) {
    process.stderr.write(`validation error: core_profile run-scope requires every ${coreProfile.id} core lens\n`);
    process.exit(EXIT_CODES.usage);
  }
  const outPath = opts.out || `reviews/archive/${opts.passId}/${opts.passId}.orchestrator.md`;
  if (!isRepoRelativePath(outPath)) {
    process.stderr.write(`validation error: --out must be repository-relative\n`);
    process.exit(EXIT_CODES.usage);
  }
  const archivePath = outPath.replace(/\/[^/]+$/, "");
  const ledgerPath = opts.ledger || `${archivePath}/ledger.json`;
  const eventsPath = opts.eventsPath || `${archivePath}/events.jsonl`;
  for (const [name, path] of [["--ledger", ledgerPath], ["--events-path", eventsPath]]) {
    if (!isRepoRelativePath(path)) {
      process.stderr.write(`validation error: ${name} must be repository-relative\n`);
      process.exit(EXIT_CODES.usage);
    }
  }
  const targetRevision = computeArtifactSha(root, targetPath);
  const reviewInput = resolveReviewInput(root, opts);
  const prompt = buildOrchestratorPrompt({
    passId: opts.passId,
    targetPath,
    targetRevision,
    reviewInputPath: reviewInput.sourcePath,
    reviewInputRevision: reviewInput.revision,
    runMode: "full",
    runScope,
    selectedLenses,
    ledgerPath,
    eventsPath,
    orchestratorPath: outPath,
    archivePath,
    registry
  });
  const resolvedOut = resolveRepoPath(root, outPath);
  mkdirSync(dirname(resolvedOut), { recursive: true });
  writeFileSync(resolvedOut, prompt, "utf8");
  writeRunEvent(root, eventsPath, "prompt_packet_created", {
    pass_id: opts.passId,
    role: "parent_launcher",
    target_revision: targetRevision,
    review_input_path: reviewInput.sourcePath,
    review_input_revision: reviewInput.revision,
    artifact_path: outPath,
    status: "created"
  });
  if (opts.json) {
    process.stdout.write(`${JSON.stringify({ event: "orchestrator_prompt_created", artifact_path: outPath, events_path: eventsPath, target_revision: targetRevision, review_input_path: reviewInput.sourcePath, review_input_revision: reviewInput.revision })}\n`);
  } else if (!opts.quiet) {
    process.stdout.write(`wrote ${outPath}\n`);
  }
} catch (error) {
  process.stderr.write(`${usage(scriptName, "--target <path> --pass-id <id> --review-input <path> [--lens a,b] [--out <path>]")}\n`);
  process.stderr.write(`validation error: ${error.message}\n`);
  process.exit(error.exitCode || EXIT_CODES.internal);
}
