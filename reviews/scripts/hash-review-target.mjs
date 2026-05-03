#!/usr/bin/env node
import { relative, resolve } from "node:path";
import {
  CONTRACT_VERSION,
  EXIT_CODES,
  computeArtifactSha,
  ensureNode18,
  isRepoRelativePath,
  parseCommonArgs,
  repoRootFrom,
  usage,
  writeJsonLinesEvent
} from "./validation-helpers.mjs";

ensureNode18();

const scriptName = "hash-review-target.mjs";

try {
  const opts = parseCommonArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(`${usage(scriptName, "<target-path> [--json]")}\n`);
    process.exit(EXIT_CODES.ok);
  }
  if (opts.version) {
    process.stdout.write(`${CONTRACT_VERSION}\n`);
    process.exit(EXIT_CODES.ok);
  }
  if (opts.positional.length !== 1) {
    process.stderr.write(`${usage(scriptName, "<target-path> [--json]")}\n`);
    process.stderr.write(`validation error: missing target path\n`);
    process.exit(EXIT_CODES.usage);
  }

  const root = repoRootFrom(import.meta.url);
  const input = opts.positional[0];
  const repoPath = isRepoRelativePath(input)
    ? input
    : relative(root, resolve(input)).replace(/\\/g, "/");
  const hash = computeArtifactSha(root, repoPath);
  if (opts.json) {
    writeJsonLinesEvent("hash", { target_path: repoPath, target_revision: hash });
  } else {
    process.stdout.write(`${hash}\n`);
  }
} catch (error) {
  process.stderr.write(`${usage(scriptName, "<target-path> [--json]")}\n`);
  process.stderr.write(`validation error: ${error.message}\n`);
  process.exit(error.exitCode || EXIT_CODES.internal);
}
