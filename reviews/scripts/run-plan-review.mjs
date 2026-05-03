#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import {
  CONTRACT_VERSION,
  EXIT_CODES,
  ensureNode18,
  parseCommonArgs,
  readJsonFile,
  repoRootFrom,
  usage
} from "./validation-helpers.mjs";

ensureNode18();

const scriptName = "run-plan-review.mjs";

function runNode(root, args) {
  return execFileSync(process.execPath, args, { cwd: root, encoding: "utf8" });
}

try {
  const opts = parseCommonArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(`${usage(scriptName, "--target <path> --pass-id <id> [--lens a,b] [--out <dir>]")}\n`);
    process.exit(EXIT_CODES.ok);
  }
  if (opts.version) {
    process.stdout.write(`${CONTRACT_VERSION}\n`);
    process.exit(EXIT_CODES.ok);
  }
  if (!opts.target || !opts.passId) {
    process.stderr.write(`${usage(scriptName, "--target <path> --pass-id <id> [--lens a,b] [--out <dir>]")}\n`);
    process.stderr.write(`validation error: missing --target or --pass-id\n`);
    process.exit(EXIT_CODES.usage);
  }
  const root = repoRootFrom(import.meta.url);
  const registry = readJsonFile(join(root, "reviews", "registry.json"));
  const lenses = opts.lens
    ? opts.lens.split(",").map((item) => item.trim()).filter(Boolean)
    : registry.lenses.map((entry) => entry.id);
  const outDir = opts.out || `reviews/archive/${opts.passId}`;
  mkdirSync(join(root, outDir), { recursive: true });
  const ledgerPath = `${outDir}/ledger.json`;
  runNode(root, ["reviews/scripts/create-ledger.mjs", "--target", opts.target, "--pass-id", opts.passId, "--lens", lenses.join(","), "--run-mode", "full", "--out", ledgerPath, "--quiet"]);
  for (const lens of lenses) {
    runNode(root, [
      "reviews/scripts/assemble-review-prompt.mjs",
      "--target", opts.target,
      "--lens", lens,
      "--pass-id", opts.passId,
      "--out", `${outDir}/${lens}.prompt.md`,
      "--quiet"
    ]);
  }
  process.stdout.write(`created ${ledgerPath} and ${lenses.length} prompt files\n`);
  process.stdout.write(`reviewer execution remains host-provided; run reviewers with the generated prompts\n`);
} catch (error) {
  process.stderr.write(`${usage(scriptName, "--target <path> --pass-id <id> [--lens a,b] [--out <dir>]")}\n`);
  process.stderr.write(`validation error: ${error.message}\n`);
  process.exit(error.exitCode || EXIT_CODES.internal);
}
