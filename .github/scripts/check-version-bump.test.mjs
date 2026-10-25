import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { checkVersionBump, compareVersions, isShippedPath } from "./check-version-bump.mjs";

const script = join(dirname(fileURLToPath(import.meta.url)), "check-version-bump.mjs");

test("shipped paths match the AGENTS.md list; tests and docs do not ship", () => {
  for (const path of [
    "skills/start-plan-review/SKILL.md",
    "reviews/scripts/emit-completion-summary.mjs",
    "reviews/README.md",
    "plugins/lens-temper/reviews/scripts/validation-helpers.mjs",
    ".claude-plugin/plugin.json",
    ".codex-plugin/plugin.json",
    "lens-temper.package.json",
    ".cursor/rules/lens-temper.mdc",
    ".github/copilot-instructions.md"
  ]) {
    assert.equal(isShippedPath(path), true, path);
  }
  for (const path of [
    "reviews/scripts/delivery-integrity.test.mjs",
    "plugins/lens-temper/reviews/scripts/delivery-integrity.test.mjs",
    "README.md",
    "AGENTS.md",
    "CONTRIBUTING.md",
    "docs/INSTALL.md",
    ".github/workflows/validate.yml",
    ".github/scripts/check-version-bump.mjs",
    ".claude-plugin/marketplace.json"
  ]) {
    assert.equal(isShippedPath(path), false, path);
  }
});

test("versions compare numerically, not as strings", () => {
  assert.ok(compareVersions("0.10.0", "0.9.0") > 0);
  assert.ok(compareVersions("0.2.1", "0.2.0") > 0);
  assert.ok(compareVersions("1.0.0", "0.99.99") > 0);
  assert.equal(compareVersions("0.2.0", "0.2.0"), 0);
  assert.ok(compareVersions("0.1.9", "0.2.0") < 0);
});

test("a shipped change needs a version above the base", () => {
  const changedFiles = ["reviews/scripts/emit-completion-summary.mjs"];
  assert.equal(checkVersionBump({ changedFiles, baseVersion: "0.2.0", headVersion: "0.2.0" }).failures.length, 1);
  assert.equal(checkVersionBump({ changedFiles, baseVersion: "0.2.0", headVersion: "0.1.9" }).failures.length, 1);
  assert.deepEqual(checkVersionBump({ changedFiles, baseVersion: "0.2.0", headVersion: "0.2.1" }).failures, []);
  assert.deepEqual(checkVersionBump({ changedFiles, baseVersion: "0.2.0", headVersion: "0.3.0" }).failures, []);
});

test("a change with no shipped files needs no bump", () => {
  const result = checkVersionBump({ changedFiles: ["AGENTS.md", "reviews/scripts/lens-state.test.mjs"], baseVersion: "0.2.0", headVersion: "0.2.0" });
  assert.deepEqual(result, { shipped: [], failures: [] });
});

test("a malformed head version fails; a base without one does not", () => {
  const changedFiles = ["skills/start-plan-review/SKILL.md"];
  const malformed = checkVersionBump({ changedFiles, baseVersion: "0.2.0", headVersion: "0.3" });
  assert.match(malformed.failures[0].message, /not a plain semantic version/);
  assert.deepEqual(checkVersionBump({ changedFiles, baseVersion: undefined, headVersion: "0.1.0" }).failures, []);
});

// Builds a repository whose main holds version 0.2.0, then commits `changes`
// on a branch and runs the CLI against main.
function runAgainstBranch(changes) {
  const root = mkdtempSync(join(tmpdir(), "lens-temper-version-bump-"));
  const git = (...args) => execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", ...args], { cwd: root, stdio: "ignore" });
  const write = (path, content) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content, "utf8");
  };
  try {
    git("init", "-q", "-b", "main");
    write("lens-temper.package.json", `${JSON.stringify({ name: "lens-temper", version: "0.2.0" })}\n`);
    write("reviews/scripts/tool.mjs", "export const a = 1;\n");
    git("add", "-A");
    git("commit", "-q", "-m", "base");
    git("checkout", "-q", "-b", "change");
    for (const [path, content] of Object.entries(changes)) write(path, content);
    git("add", "-A");
    git("commit", "-q", "-m", "change");
    return spawnSync(process.execPath, [script, "--base", "main", "--root", root], { encoding: "utf8" });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("the CLI fails a shipped change that keeps the base version", () => {
  const result = runAgainstBranch({ "reviews/scripts/tool.mjs": "export const a = 2;\n" });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /expected=greater than 0\.2\.0 actual=0\.2\.0/);
  assert.match(result.stderr, /shipped files changed: reviews\/scripts\/tool\.mjs/);
});

test("the CLI passes a shipped change with a bumped version", () => {
  const result = runAgainstBranch({
    "reviews/scripts/tool.mjs": "export const a = 2;\n",
    "lens-temper.package.json": `${JSON.stringify({ name: "lens-temper", version: "0.2.1" })}\n`
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /version check passed: 0\.2\.0 -> 0\.2\.1/);
});

test("the CLI passes a docs-only change without a bump", () => {
  const result = runAgainstBranch({ "AGENTS.md": "# Agent Instructions\n" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /no shipped files changed/);
});
