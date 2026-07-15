#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import {
  CONTRACT_VERSION,
  EXIT_CODES,
  computeArtifactSha,
  encodePromptData,
  ensureNode18,
  isRepoRelativePath,
  parseCommonArgs,
  readJsonFile,
  readTextFile,
  repoRootFrom,
  renderTemplate,
  resolveReviewInput,
  resolveRepoPath,
  usage,
  writeJsonLinesEvent
} from "./validation-helpers.mjs";

ensureNode18();

const scriptName = "assemble-review-prompt.mjs";

function toRepo(root, input) {
  if (isRepoRelativePath(input)) return input;
  return relative(root, resolve(input)).replace(/\\/g, "/");
}

try {
  const opts = parseCommonArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(`${usage(scriptName, "--target <path> --lens <id|manifest|path> --pass-id <id> (--review-input <path> | --feature-request <text>) [--relevant-context <text>] [--constraints <text>] [--previous-adjudications <text>] [--out <path>] [--json]")}\n`);
    process.exit(EXIT_CODES.ok);
  }
  if (opts.version) {
    process.stdout.write(`${CONTRACT_VERSION}\n`);
    process.exit(EXIT_CODES.ok);
  }
  if (!opts.target || !opts.lens || !opts.passId) {
    process.stderr.write(`${usage(scriptName, "--target <path> --lens <id|manifest|path> --pass-id <id> (--review-input <path> | --feature-request <text>) [--out <path>]")}\n`);
    process.stderr.write(`validation error: missing --target, --lens, or --pass-id\n`);
    process.exit(EXIT_CODES.usage);
  }

  const root = repoRootFrom(import.meta.url);
  const registry = readJsonFile(join(root, "reviews", "registry.json"));
  const targetPath = toRepo(root, opts.target);
  const targetResolved = resolveRepoPath(root, targetPath);
  if (!targetResolved || !existsSync(targetResolved)) {
    process.stderr.write(`validation error: target not found ${targetPath}\n`);
    process.exit(EXIT_CODES.read);
  }

  let lensManifestPath = opts.lens;
  const lensById = registry.lenses.find((entry) => entry.id === opts.lens);
  if (lensById) lensManifestPath = lensById.manifest_path;
  if (lensManifestPath.endsWith(".md")) {
    const lensPath = toRepo(root, lensManifestPath);
    lensManifestPath = registry.lenses
      .map((entry) => entry.manifest_path)
      .find((path) => readJsonFile(join(root, path)).prompt_path === lensPath);
  }
  if (!lensManifestPath) {
    process.stderr.write(`validation error: unknown lens ${opts.lens}\n`);
    process.exit(EXIT_CODES.usage);
  }
  const lensManifest = readJsonFile(join(root, lensManifestPath));
  const templatePath = registry.entrypoints.reviewer_template;
  const template = readTextFile(join(root, templatePath));
  const lensText = readTextFile(join(root, lensManifest.prompt_path));
  const targetText = readTextFile(targetResolved);
  const targetRevision = computeArtifactSha(root, targetPath);
  const templateRevision = computeArtifactSha(root, templatePath);
  const lensRevision = computeArtifactSha(root, lensManifest.prompt_path);
  const reviewInput = resolveReviewInput(root, opts);

  const prompt = renderTemplate(template, {
    pass_id: opts.passId,
    target_path: targetPath,
    target_revision: targetRevision,
    review_input_revision: reviewInput.revision,
    template_revision: templateRevision,
    lens_revision: lensRevision,
    feature_request: encodePromptData(reviewInput.record.feature_request),
    proposed_plan: encodePromptData(targetText),
    relevant_context: encodePromptData(reviewInput.record.relevant_context),
    constraints: encodePromptData(reviewInput.record.constraints),
    review_lens: lensText,
    previous_adjudications: encodePromptData(reviewInput.record.previous_adjudications)
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
      writeJsonLinesEvent("prompt_assembled", {
        output_path: opts.out,
        target_path: targetPath,
        target_revision: targetRevision,
        review_input_path: reviewInput.sourcePath,
        review_input_revision: reviewInput.revision,
        template_revision: templateRevision,
        lens_revision: lensRevision,
        lens: lensManifest.id
      });
    } else if (!opts.quiet) {
      process.stdout.write(`wrote ${opts.out}\n`);
    }
  } else {
    if (opts.json) {
      writeJsonLinesEvent("prompt_assembled", {
        output_path: null,
        target_path: targetPath,
        target_revision: targetRevision,
        review_input_path: reviewInput.sourcePath,
        review_input_revision: reviewInput.revision,
        template_revision: templateRevision,
        lens_revision: lensRevision,
        lens: lensManifest.id
      });
    } else {
      process.stdout.write(prompt);
    }
  }
} catch (error) {
  process.stderr.write(`${usage(scriptName, "--target <path> --lens <id|manifest|path> --pass-id <id> (--review-input <path> | --feature-request <text>) [--out <path>]")}\n`);
  process.stderr.write(`validation error: ${error.message}\n`);
  process.exit(error.exitCode || EXIT_CODES.internal);
}
