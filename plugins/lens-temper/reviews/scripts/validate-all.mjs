#!/usr/bin/env node
import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { CONTRACT_VERSION, EXIT_CODES, ensureNode18, repoRootFrom } from "./validation-helpers.mjs";

ensureNode18();
const execFileAsync = promisify(execFile);

async function runLane(root, lane) {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, lane.args, {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024
    });
    return { ...lane, code: 0, stdout, stderr };
  } catch (error) {
    return { ...lane, code: error.code || 1, stdout: error.stdout || "", stderr: error.stderr || error.message };
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    process.stdout.write("Usage: node reviews/scripts/validate-all.mjs [--quiet]\n");
    return;
  }
  if (args.includes("--version")) {
    process.stdout.write(`${CONTRACT_VERSION}\n`);
    return;
  }
  const quiet = args.includes("--quiet");
  if (args.some((arg) => arg !== "--quiet")) throw Object.assign(new Error("unsupported option"), { exitCode: EXIT_CODES.usage });

  const root = repoRootFrom(import.meta.url);
  const testFiles = (await readdir(join(root, "reviews", "scripts")))
    .filter((name) => name.endsWith(".test.mjs"))
    .sort()
    .map((name) => `reviews/scripts/${name}`);
  const lanes = [
    { name: "unit-tests", args: ["--test", ...testFiles] },
    { name: "package", args: ["reviews/scripts/validate-package.mjs"] },
    { name: "fixtures", args: ["reviews/scripts/validate-review-fixtures.mjs"] },
    { name: "evals", args: ["reviews/scripts/run-review-evals.mjs"] }
  ];
  const results = await Promise.all(lanes.map((lane) => runLane(root, lane)));
  for (const result of results) {
    if (!quiet || result.code !== 0) process.stdout.write(`== ${result.name} (${result.code === 0 ? "pass" : "fail"}) ==\n`);
    if (!quiet && result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  }
  if (results.some((result) => result.code !== 0)) process.exit(EXIT_CODES.validation);
}

main().catch((error) => {
  process.stderr.write(`validation error: ${error.message}\n`);
  process.exit(error.exitCode || EXIT_CODES.internal);
});
