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
  resolveRepoPath,
  usage,
  writeJsonLinesEvent
} from "./validation-helpers.mjs";

ensureNode18();

const scriptName = "assemble-spawn-prompt.mjs";

function resolveLensManifest(root, registry, lensInput) {
  let lensManifestPath = lensInput;
  const lensById = registry.lenses.find((entry) => entry.id === lensInput);
  if (lensById) lensManifestPath = lensById.manifest_path;
  if (lensManifestPath.endsWith(".md")) {
    const lensPath = normalizeRepoInputPath(root, lensManifestPath);
    lensManifestPath = registry.lenses
      .map((entry) => entry.manifest_path)
      .find((path) => readJsonFile(join(root, path)).prompt_path === lensPath);
  }
  if (!lensManifestPath || !isRepoRelativePath(lensManifestPath)) {
    throw Object.assign(new Error(`unknown lens ${lensInput}`), { exitCode: EXIT_CODES.usage });
  }
  return {
    path: lensManifestPath,
    manifest: readJsonFile(join(root, lensManifestPath))
  };
}

function buildSpawnPrompt({
  passId,
  targetPath,
  targetRevision,
  templatePath,
  templateRevision,
  lensId,
  lensDisplayName,
  lensManifestPath,
  lensPromptPath,
  lensRevision,
  inputPacketPath,
  runScope,
  executionMode
}) {
  return `Role: You are the fresh LensTemper ${lensDisplayName} lens reviewer for this one-lens handoff.

# Goal
Review \`${targetPath}\` through the ${lensDisplayName} lens and return a valid LensTemper reviewer-template response.

# Success Criteria
- Treat the current repository checkout as the source of truth.
- Read the prompt packet at \`${inputPacketPath}\`.
- Verify the target, template, and lens revisions before reviewing.
- Review exactly one lens: \`${lensId}\` (${lensDisplayName}).
- Return exactly the sections required by \`${templatePath}\`.
- Complete the cross-cutting sweep and stateful workflow sweep.
- Challenge whether the plan gives an implementation agent enough concrete
  guidance to avoid inventing behavior.
- Include score-challenge evidence for every \`5/5\`.
- Report missing files or revision mismatches as input problems.

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

Revisions:
- target: \`${targetRevision}\`
- template: \`${templateRevision}\`
- lens: \`${lensRevision}\`

# Constraints
Read-only. Do not edit files, update ledgers, inspect sibling review outputs, or synthesize multi-review feedback.
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
    process.stdout.write(`${usage(scriptName, "--target <path> --lens <id|manifest|path> --pass-id <id> --input-packet <path> [--out <path>] [--json]")}\n`);
    process.exit(EXIT_CODES.ok);
  }
  if (opts.version) {
    process.stdout.write(`${CONTRACT_VERSION}\n`);
    process.exit(EXIT_CODES.ok);
  }
  if (!opts.target || !opts.lens || !opts.passId || !opts.inputPacket) {
    process.stderr.write(`${usage(scriptName, "--target <path> --lens <id|manifest|path> --pass-id <id> --input-packet <path> [--out <path>]")}\n`);
    process.stderr.write(`validation error: missing --target, --lens, --pass-id, or --input-packet\n`);
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

  const inputPacketPath = normalizeRepoInputPath(root, opts.inputPacket);
  if (!inputPacketPath) {
    process.stderr.write(`validation error: --input-packet must resolve under the repository root\n`);
    process.exit(EXIT_CODES.usage);
  }
  const inputPacketResolved = resolveRepoPath(root, inputPacketPath);
  if (!inputPacketResolved || !existsSync(inputPacketResolved)) {
    process.stderr.write(`validation error: input packet not found ${inputPacketPath}\n`);
    process.exit(EXIT_CODES.read);
  }

  const lens = resolveLensManifest(root, registry, opts.lens);
  const templatePath = registry.entrypoints.reviewer_template;
  const lensPromptPath = lens.manifest.prompt_path;
  const lensDisplayName = lens.manifest.display_name || lensManifestDisplayName(lens.manifest.id);
  const targetRevision = computeArtifactSha(root, targetPath);
  const templateRevision = computeArtifactSha(root, templatePath);
  const lensRevision = computeArtifactSha(root, lensPromptPath);
  const runScope = opts.runScope || "selected_lenses";
  const executionMode = opts.executionMode || "fresh_spawned_lens_reviewers";
  const prompt = buildSpawnPrompt({
    passId: opts.passId,
    targetPath,
    targetRevision,
    templatePath,
    templateRevision,
    lensId: lens.manifest.id,
    lensDisplayName,
    lensManifestPath: lens.path,
    lensPromptPath,
    lensRevision,
    inputPacketPath,
    runScope,
    executionMode
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
      template_revision: templateRevision,
      lens_revision: lensRevision,
      lens: lens.manifest.id,
      input_packet_path: inputPacketPath
    });
  } else {
    process.stdout.write(prompt);
  }
} catch (error) {
  process.stderr.write(`${usage(scriptName, "--target <path> --lens <id|manifest|path> --pass-id <id> --input-packet <path> [--out <path>]")}\n`);
  process.stderr.write(`validation error: ${error.message}\n`);
  process.exit(error.exitCode || EXIT_CODES.internal);
}
