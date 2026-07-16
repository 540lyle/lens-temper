#!/usr/bin/env node
import { join } from "node:path";
import {
  CONTRACT_VERSION,
  EXIT_CODES,
  computeArtifactSha,
  ensureNode18,
  normalizeRepoInputPath,
  parseCommonArgs,
  readJsonFile,
  repoRootFrom,
  resolveReviewInput,
  usage
} from "./validation-helpers.mjs";
import { selectLenses } from "./lens-selection.mjs";

ensureNode18();
const scriptName = "select-lenses.mjs";

try {
  const opts = parseCommonArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(`${usage(scriptName, "--target <path> (--review-input <path> | --feature-request <text>) [--lens a,b | --all-lenses] [--lens-proposal <path>] [--selection-fallback all] [--json]")}\n`);
    process.exit(EXIT_CODES.ok);
  }
  if (opts.version) {
    process.stdout.write(`${CONTRACT_VERSION}\n`);
    process.exit(EXIT_CODES.ok);
  }
  if (!opts.target) throw Object.assign(new Error("missing --target"), { exitCode: EXIT_CODES.usage });
  const root = repoRootFrom(import.meta.url);
  const targetPath = normalizeRepoInputPath(root, opts.target);
  if (!targetPath) throw Object.assign(new Error("--target must resolve under the repository root"), { exitCode: EXIT_CODES.usage });
  const registry = readJsonFile(join(root, "reviews", "registry.json"));
  const reviewInput = resolveReviewInput(root, opts);
  const explicitLenses = opts.lens === null ? null : opts.lens.split(",").map((item) => item.trim()).filter(Boolean);
  const proposalPath = opts.lensProposal ? normalizeRepoInputPath(root, opts.lensProposal) : null;
  if (opts.lensProposal && !proposalPath) throw Object.assign(new Error("--lens-proposal must resolve under the repository root"), { exitCode: EXIT_CODES.usage });
  let result;
  try {
    result = selectLenses({
      root,
      registry,
      reviewInput: { ...reviewInput.record, revision: reviewInput.revision },
      reviewInputPath: reviewInput.sourcePath,
      targetPath,
      targetRevision: computeArtifactSha(root, targetPath),
      explicitLenses,
      allLenses: opts.allLenses,
      fallback: opts.selectionFallback,
      proposalPath,
      passId: opts.passId || "selection"
    });
  } catch (error) {
    if (!error.exitCode) error.exitCode = EXIT_CODES.usage;
    throw error;
  }
  if (opts.json) process.stdout.write(`${JSON.stringify({ event: "lens_selection", ...result })}\n`);
  else if (result.status === "resolved") result.selected_lenses.forEach((lens) => process.stdout.write(`${lens}\n`));
  else process.stderr.write(`clarification required: ${result.clarification_question}\n`);
  if (result.status !== "resolved") process.exit(EXIT_CODES.usage);
} catch (error) {
  process.stderr.write(`${usage(scriptName, "--target <path> (--review-input <path> | --feature-request <text>) [--lens a,b | --all-lenses] [--lens-proposal <path>] [--selection-fallback all] [--json]")}\n`);
  process.stderr.write(`validation error: ${error.message}\n`);
  process.exit(error.exitCode || EXIT_CODES.internal);
}
