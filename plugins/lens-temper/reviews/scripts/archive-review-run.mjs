#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import {
  CONTRACT_VERSION,
  EXIT_CODES,
  archiveRunPath,
  ensureNode18,
  isRepoRelativePath,
  parseCommonArgs,
  readJsonFile,
  readTextFile,
  repoRootFrom,
  resolveRepoPath,
  usage,
  writeJsonLinesEvent
} from "./validation-helpers.mjs";

ensureNode18();

const scriptName = "archive-review-run.mjs";

function copyIfProvided(root, sourceRepoPath, archiveDir, fileName) {
  if (!sourceRepoPath) return null;
  if (!isRepoRelativePath(sourceRepoPath)) {
    throw Object.assign(new Error(`non-repository-relative path ${sourceRepoPath}`), { exitCode: EXIT_CODES.usage });
  }
  const source = resolveRepoPath(root, sourceRepoPath);
  if (!source || !existsSync(source)) {
    throw Object.assign(new Error(`missing artifact ${sourceRepoPath}`), { exitCode: EXIT_CODES.read });
  }
  const target = join(archiveDir, fileName || basename(sourceRepoPath));
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
  return target;
}

try {
  const opts = parseCommonArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(`${usage(scriptName, "--ledger <ledger-json> [--input-packet <path>] [--synthesis <path>] [--final <path>] [--archive-root <path>] [--json]")}\n`);
    process.exit(EXIT_CODES.ok);
  }
  if (opts.version) {
    process.stdout.write(`${CONTRACT_VERSION}\n`);
    process.exit(EXIT_CODES.ok);
  }
  if (!opts.ledger) {
    process.stderr.write(`${usage(scriptName, "--ledger <ledger-json> [--archive-root <path>]")}\n`);
    process.stderr.write(`validation error: missing --ledger\n`);
    process.exit(EXIT_CODES.usage);
  }
  const root = repoRootFrom(import.meta.url);
  const ledger = readJsonFile(opts.ledger);
  const archiveRoot = opts.archiveRoot || "reviews/archive";
  if (!isRepoRelativePath(archiveRoot)) {
    process.stderr.write(`validation error: --archive-root must be repository-relative\n`);
    process.exit(EXIT_CODES.usage);
  }
  const plannedArchivePath = archiveRunPath(ledger.target_path, ledger.pass_id);
  const archiveRepoPath = archiveRoot === "reviews/archive"
    ? plannedArchivePath
    : `${archiveRoot}/${basename(plannedArchivePath)}`;
  const archiveDir = resolveRepoPath(root, archiveRepoPath);
  mkdirSync(archiveDir, { recursive: true });
  copyIfProvided(root, opts.ledger, archiveDir, "ledger.json");
  copyIfProvided(root, opts.inputPacket, archiveDir, "input.packet.md");
  copyIfProvided(root, opts.synthesis, archiveDir, "synthesis.md");
  copyIfProvided(root, opts.final, archiveDir, "final.md");
  mkdirSync(join(archiveDir, "reviews"), { recursive: true });
  for (const entry of ledger.review_record_artifacts || []) {
    copyIfProvided(root, entry.artifact_path, join(archiveDir, "reviews"), `${entry.record_id}.json`);
  }
  ledger.archive_paths = Array.from(new Set([...(ledger.archive_paths || []), archiveRepoPath]));
  writeFileSync(join(archiveDir, "ledger.json"), `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  const finalAssessment = opts.synthesis && opts.synthesis.endsWith(".json")
    ? readJsonFile(resolveRepoPath(root, opts.synthesis)).final_assessment
    : "not recorded";
  if (opts.json) {
    writeJsonLinesEvent("archived", { archive_path: archiveRepoPath, final_assessment: finalAssessment });
  } else if (!opts.quiet) {
    process.stdout.write(`archived ${archiveRepoPath} final_assessment=${finalAssessment}\n`);
  }
} catch (error) {
  process.stderr.write(`${usage(scriptName, "--ledger <ledger-json> [--archive-root <path>]")}\n`);
  process.stderr.write(`validation error: ${error.message}\n`);
  process.exit(error.exitCode || EXIT_CODES.internal);
}
