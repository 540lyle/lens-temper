#!/usr/bin/env node
// Fails a pull request that changes what ships to users without raising the
// package version above the base branch's. Claude Code caches an installed
// plugin by version, so an unbumped change never reaches installed copies.
// AGENTS.md documents the same rule and paths.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXIT_CODES = {
  ok: 0,
  validation: 1,
  usage: 2
};

const PACKAGE_MANIFEST = "lens-temper.package.json";

const SHIPPED_PREFIXES = [
  "skills/",
  "reviews/",
  "assets/",
  "docs/hosts/",
  "plugins/lens-temper/",
  ".codex-plugin/",
  ".cursor/rules/"
];

const SHIPPED_FILES = [
  ".claude-plugin/plugin.json",
  PACKAGE_MANIFEST,
  ".github/copilot-instructions.md"
];

// Tests ship with the scripts but change nothing users run, including the
// copies the payload sync writes under plugins/lens-temper/.
export function isShippedPath(repoPath) {
  if (repoPath.endsWith(".test.mjs")) return false;
  return SHIPPED_FILES.includes(repoPath) || SHIPPED_PREFIXES.some((prefix) => repoPath.startsWith(prefix));
}

export function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version));
  return match ? match.slice(1).map(Number) : null;
}

// Returns a negative number, zero, or a positive number, like a sort comparator.
export function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return 0;
}

export function checkVersionBump({ changedFiles, baseVersion, headVersion }) {
  const shipped = changedFiles.filter(isShippedPath);
  if (shipped.length === 0) return { shipped, failures: [] };
  const failure = (expected, actual, message) => ({ artifact_path: PACKAGE_MANIFEST, field: "version", expected, actual, message });
  if (!parseVersion(headVersion)) {
    return { shipped, failures: [failure("MAJOR.MINOR.PATCH", headVersion, "package version is not a plain semantic version")] };
  }
  // A base without a readable version has nothing to bump past.
  if (!parseVersion(baseVersion)) return { shipped, failures: [] };
  if (compareVersions(headVersion, baseVersion) <= 0) {
    return { shipped, failures: [failure(`greater than ${baseVersion}`, headVersion, "shipped files changed without a version bump; see AGENTS.md")] };
  }
  return { shipped, failures: [] };
}

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function readBaseVersion(root, base) {
  try {
    return JSON.parse(git(root, ["show", `${base}:${PACKAGE_MANIFEST}`])).version;
  } catch {
    return undefined;
  }
}

export function checkRepository(root, base) {
  const changedFiles = git(root, ["diff", "--name-only", "-z", `${base}...HEAD`]).split("\0").filter(Boolean);
  const headVersion = JSON.parse(readFileSync(join(root, PACKAGE_MANIFEST), "utf8")).version;
  const baseVersion = readBaseVersion(root, base);
  return { ...checkVersionBump({ changedFiles, baseVersion, headVersion }), baseVersion, headVersion };
}

function formatFailure(item) {
  return [
    item.artifact_path,
    `field=${item.field}`,
    `expected=${item.expected}`,
    `actual=${item.actual}`,
    `message=${item.message}`
  ].join(" ");
}

function usage() {
  return "Usage: node .github/scripts/check-version-bump.mjs --base <git-ref> [--root <path>]\n";
}

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help") opts.help = true;
    else if ((arg === "--base" || arg === "--root") && argv[i + 1] !== undefined) opts[arg.slice(2)] = argv[++i];
    else throw Object.assign(new Error(`unsupported option: ${arg}`), { exitCode: EXIT_CODES.usage });
  }
  return opts;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.help) {
      process.stdout.write(usage());
      process.exit(EXIT_CODES.ok);
    }
    if (!opts.base) throw Object.assign(new Error("--base is required"), { exitCode: EXIT_CODES.usage });
    const root = resolve(opts.root || join(dirname(fileURLToPath(import.meta.url)), "../.."));
    const result = checkRepository(root, opts.base);
    if (result.failures.length > 0) {
      for (const item of result.failures) process.stderr.write(`${formatFailure(item)}\n`);
      process.stderr.write(`shipped files changed: ${result.shipped.join(", ")}\n`);
      process.exit(EXIT_CODES.validation);
    }
    process.stdout.write(result.shipped.length === 0
      ? "version check passed: no shipped files changed\n"
      : `version check passed: ${result.baseVersion ?? "none"} -> ${result.headVersion}\n`);
  } catch (error) {
    if (error.exitCode === EXIT_CODES.usage) process.stderr.write(usage());
    process.stderr.write(`version check error: ${error.stderr || error.message}\n`);
    process.exit(error.exitCode || EXIT_CODES.validation);
  }
}
