#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = "plugins/lens-temper";
const STATIC_PAYLOAD_PATHS = [
  [".codex-plugin", `${PACKAGE_ROOT}/.codex-plugin`],
  ["assets", `${PACKAGE_ROOT}/assets`],
  ["skills", `${PACKAGE_ROOT}/skills`]
];

function repoRootFrom(importMetaUrl = import.meta.url) {
  return resolve(dirname(fileURLToPath(importMetaUrl)), "../..");
}

function normalizeRepoPath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function assertRepoRelative(repoPath) {
  const normalized = normalizeRepoPath(repoPath);
  if (!normalized || normalized === "." || normalized.split("/").some((segment) => segment === "." || segment === "..")) {
    throw new Error(`unsafe package path: ${repoPath}`);
  }
  if (isAbsolute(normalized) || /^[A-Za-z]:/.test(normalized)) {
    throw new Error(`absolute package path is not allowed: ${repoPath}`);
  }
  return normalized;
}

function assertUnderRoot(root, targetPath) {
  const resolved = resolve(root, targetPath);
  const rel = relative(root, resolved);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`path resolves outside repository: ${targetPath}`);
  }
  return resolved;
}

function copyPath(root, sourceRepoPath, targetRepoPath) {
  const source = assertUnderRoot(root, assertRepoRelative(sourceRepoPath));
  const target = assertUnderRoot(root, assertRepoRelative(targetRepoPath));
  if (!existsSync(source)) {
    throw new Error(`source path does not exist: ${sourceRepoPath}`);
  }
  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target, { recursive: true, force: true });
}

function syncCodexPluginPayload(root = repoRootFrom()) {
  const manifest = JSON.parse(readFileSync(join(root, "lens-temper.package.json"), "utf8"));
  const packageRootPath = assertUnderRoot(root, PACKAGE_ROOT);
  rmSync(packageRootPath, { recursive: true, force: true });
  mkdirSync(packageRootPath, { recursive: true });

  for (const [source, target] of STATIC_PAYLOAD_PATHS) {
    copyPath(root, source, target);
  }

  for (const candidate of manifest.packageCandidates || []) {
    const normalized = normalizeRepoPath(candidate);
    if (!normalized.startsWith("reviews/")) continue;
    copyPath(root, normalized, `${PACKAGE_ROOT}/${normalized}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  syncCodexPluginPayload();
  process.stdout.write("synced Codex plugin payload\n");
}

export { syncCodexPluginPayload };
