#!/usr/bin/env node
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  CONTRACT_VERSION,
  EXIT_CODES,
  archiveRunPath,
  computeArtifactSha,
  ensureNode18,
  isRepoRelativePath,
  normalizeRepoInputPath,
  parseCommonArgs,
  readJsonFile,
  repoRootFrom,
  resolveRepoPath,
  usage
} from "./validation-helpers.mjs";

ensureNode18();

const scriptName = "create-ledger.mjs";

try {
  const opts = parseCommonArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(`${usage(scriptName, "--target <path> --pass-id <id> [--lens a,b] [--out <path>] [--json]")}\n`);
    process.exit(EXIT_CODES.ok);
  }
  if (opts.version) {
    process.stdout.write(`${CONTRACT_VERSION}\n`);
    process.exit(EXIT_CODES.ok);
  }
  if (!opts.target || !opts.passId) {
    process.stderr.write(`${usage(scriptName, "--target <path> --pass-id <id> [--lens a,b] [--out <path>]")}\n`);
    process.stderr.write(`validation error: missing --target or --pass-id\n`);
    process.exit(EXIT_CODES.usage);
  }
  const root = repoRootFrom(import.meta.url);
  const targetPath = normalizeRepoInputPath(root, opts.target);
  if (!targetPath) {
    process.stderr.write(`validation error: --target must resolve under the repository root\n`);
    process.exit(EXIT_CODES.usage);
  }
  const registry = readJsonFile(join(root, "reviews", "registry.json"));
  const selected = opts.lens
    ? opts.lens.split(",").map((item) => item.trim()).filter(Boolean)
    : registry.lenses.map((entry) => entry.id);
  const targetRevision = computeArtifactSha(root, targetPath);
  const ledger = {
    schema_version: 1,
    pass_id: opts.passId,
    target_path: targetPath,
    target_revision: targetRevision,
    status: "active",
    execution_mode: "manual_or_imported",
    selected_lenses: selected,
    current_review_record_ids: [],
    superseded_review_record_ids: [],
    synthesis_record_ids: [],
    archive_paths: [archiveRunPath(targetPath, opts.passId)],
    artifact_visibility: "public_safe",
    review_record_artifacts: [],
    synthesis_record_artifacts: []
  };
  const output = `${JSON.stringify(ledger, null, 2)}\n`;
  if (opts.out) {
    if (!isRepoRelativePath(opts.out)) {
      process.stderr.write(`validation error: --out must be repository-relative\n`);
      process.exit(EXIT_CODES.usage);
    }
    const outPath = resolveRepoPath(root, opts.out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, output, "utf8");
    if (!opts.quiet) process.stdout.write(`wrote ${opts.out}\n`);
  } else {
    process.stdout.write(output);
  }
} catch (error) {
  process.stderr.write(`${usage(scriptName, "--target <path> --pass-id <id> [--lens a,b] [--out <path>]")}\n`);
  process.stderr.write(`validation error: ${error.message}\n`);
  process.exit(error.exitCode || EXIT_CODES.internal);
}
