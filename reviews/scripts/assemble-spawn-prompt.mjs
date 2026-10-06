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
  notFoundMessage,
  PACKAGE_ROOT,
  parseCommonArgs,
  projectRootFrom,
  readJsonFile,
  readRegistry,
  resolveReviewInput,
  resolveRepoPath,
  usage,
  writeJsonLinesEvent
} from "./validation-helpers.mjs";

ensureNode18();

const scriptName = "assemble-spawn-prompt.mjs";
const usageText = "--target <path> --lens <id|manifest|path> --pass-id <id> --input-packet <path> --review-input <path> [--root <path>] [--out <path>] [--json]";

function resolveLensManifest(registry, lensInput) {
  let lensManifestPath = lensInput;
  const lensById = registry.lenses.find((entry) => entry.id === lensInput);
  if (lensById) lensManifestPath = lensById.manifest_path;
  if (lensManifestPath.endsWith(".md")) {
    const lensPath = normalizeRepoInputPath(PACKAGE_ROOT, lensManifestPath);
    lensManifestPath = registry.lenses
      .map((entry) => entry.manifest_path)
      .find((path) => readJsonFile(join(PACKAGE_ROOT, path)).prompt_path === lensPath);
  }
  if (!lensManifestPath || !isRepoRelativePath(lensManifestPath)) {
    throw Object.assign(new Error(`unknown lens ${lensInput}`), { exitCode: EXIT_CODES.usage });
  }
  return {
    path: lensManifestPath,
    manifest: readJsonFile(join(PACKAGE_ROOT, lensManifestPath))
  };
}

function buildSpawnPrompt({
  passId,
  targetPath,
  targetRevision,
  reviewInputPath,
  reviewInputRevision,
  templatePath,
  templateRevision,
  lensId,
  lensDisplayName,
  lensManifestPath,
  lensPromptPath,
  lensRevision,
  inputPacketPath,
  runScope,
  executionMode,
  separatePackage
}) {
  const packageNote = separatePackage
    ? "\nThe template, lens manifest, and lens prompt paths are relative to the LensTemper package, not this project; the prompt packet already contains their text.\n"
    : "";
  return `Role: You are the fresh LensTemper ${lensDisplayName} lens reviewer for this one-lens handoff.

# Goal
Review \`${targetPath}\` through the ${lensDisplayName} lens and return a valid LensTemper reviewer-template response.

# Success Criteria
- Treat the current repository checkout as the source of truth.
- Read the prompt packet at \`${inputPacketPath}\`.
- Review exactly one lens: \`${lensId}\` (${lensDisplayName}).
- Apply the template's Goal Gate first, using the packet's intent card as the
  goal reference when one is supplied. Raise \`[critical]\` or \`[major]\` only
  when the gate is met, and ask pending owner decisions without answering them.
  Zero findings is the expected result for a sound plan.
- Return exactly the sections required by \`${templatePath}\`.
- Review the cross-cutting categories the packet says your lens owns; the
  Implementation lens owns the stateful workflow sweep.
- Include score-challenge evidence for every \`5/5\`.
- Report missing or unreadable files as input problems. The scripts record
  provenance and revisions; do not repeat them.

# Context
Pass ID: \`${passId}\`
Run mode: \`full\`
Run scope: \`${runScope}\`
Execution mode: \`${executionMode}\`

Paths:
- target: \`${targetPath}\`
- template: \`${templatePath}\`
- lens manifest: \`${lensManifestPath}\`
- lens prompt: \`${lensPromptPath}\`
- prompt packet: \`${inputPacketPath}\`
- review input: \`${reviewInputPath}\`
${packageNote}
Revisions:
- target: \`${targetRevision}\`
- review input: \`${reviewInputRevision}\`
- template: \`${templateRevision}\`
- lens: \`${lensRevision}\`

# Constraints
Read-only. Do not edit the target spec or any other file, update ledgers, inspect sibling review outputs, or synthesize multi-review feedback.
Ignore inherited conversation context.
`;
}

function lensManifestDisplayName(lensId) {
  return lensId
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
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
  if (!opts.target || !opts.lens || !opts.passId || !opts.inputPacket || !opts.reviewInput) {
    process.stderr.write(`${usage(scriptName, usageText)}\n`);
    process.stderr.write(`validation error: missing --target, --lens, --pass-id, --input-packet, or --review-input\n`);
    process.exit(EXIT_CODES.usage);
  }

  const root = projectRootFrom(opts);
  const registry = readRegistry();
  const targetPath = normalizeRepoInputPath(root, opts.target);
  if (!targetPath) {
    process.stderr.write(`validation error: --target must resolve under the project root ${root}\n`);
    process.exit(EXIT_CODES.usage);
  }
  const targetResolved = resolveRepoPath(root, targetPath);
  if (!targetResolved || !existsSync(targetResolved)) {
    process.stderr.write(`validation error: ${notFoundMessage(root, targetPath, "target")}\n`);
    process.exit(EXIT_CODES.read);
  }

  const inputPacketPath = normalizeRepoInputPath(root, opts.inputPacket);
  if (!inputPacketPath) {
    process.stderr.write(`validation error: --input-packet must resolve under the project root ${root}\n`);
    process.exit(EXIT_CODES.usage);
  }
  const inputPacketResolved = resolveRepoPath(root, inputPacketPath);
  if (!inputPacketResolved || !existsSync(inputPacketResolved)) {
    process.stderr.write(`validation error: ${notFoundMessage(root, inputPacketPath, "input packet")}\n`);
    process.exit(EXIT_CODES.read);
  }

  const lens = resolveLensManifest(registry, opts.lens);
  const reviewInput = resolveReviewInput(root, opts);
  const templatePath = registry.entrypoints.reviewer_template;
  const lensPromptPath = lens.manifest.prompt_path;
  const lensDisplayName = lens.manifest.display_name || lensManifestDisplayName(lens.manifest.id);
  const targetRevision = computeArtifactSha(root, targetPath);
  const templateRevision = computeArtifactSha(PACKAGE_ROOT, templatePath);
  const lensRevision = computeArtifactSha(PACKAGE_ROOT, lensPromptPath);
  const runScope = opts.runScope || "selected_lenses";
  const executionMode = opts.executionMode || "fresh_spawned_lens_reviewers";
  const prompt = buildSpawnPrompt({
    passId: opts.passId,
    targetPath,
    targetRevision,
    reviewInputPath: reviewInput.sourcePath,
    reviewInputRevision: reviewInput.revision,
    templatePath,
    templateRevision,
    lensId: lens.manifest.id,
    lensDisplayName,
    lensManifestPath: lens.path,
    lensPromptPath,
    lensRevision,
    inputPacketPath,
    runScope,
    executionMode,
    separatePackage: root !== PACKAGE_ROOT
  });

  if (opts.out) {
    if (!isRepoRelativePath(opts.out)) {
      process.stderr.write(`validation error: --out must be repository-relative\n`);
      process.exit(EXIT_CODES.usage);
    }
    const outPath = resolveRepoPath(root, opts.out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, prompt, "utf8");
    if (opts.json) {
      writeJsonLinesEvent("spawn_prompt_assembled", {
        output_path: opts.out,
        target_path: targetPath,
        target_revision: targetRevision,
        review_input_path: reviewInput.sourcePath,
        review_input_revision: reviewInput.revision,
        template_revision: templateRevision,
        lens_revision: lensRevision,
        lens: lens.manifest.id,
        input_packet_path: inputPacketPath
      });
    } else if (!opts.quiet) {
      process.stdout.write(`wrote ${opts.out}\n`);
    }
  } else if (opts.json) {
    writeJsonLinesEvent("spawn_prompt_assembled", {
      output_path: null,
      target_path: targetPath,
      target_revision: targetRevision,
      review_input_path: reviewInput.sourcePath,
      review_input_revision: reviewInput.revision,
      template_revision: templateRevision,
      lens_revision: lensRevision,
      lens: lens.manifest.id,
      input_packet_path: inputPacketPath
    });
  } else {
    process.stdout.write(prompt);
  }
} catch (error) {
  process.stderr.write(`${usage(scriptName, usageText)}\n`);
  process.stderr.write(`validation error: ${error.message}\n`);
  process.exit(error.exitCode || EXIT_CODES.internal);
}
