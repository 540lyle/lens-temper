#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXIT_CODES = {
  ok: 0,
  validation: 1,
  read: 3
};

const DISALLOWED_PACKAGE_PATTERNS = [
  /^\.claude(\/|$)/,
  /^\.codex(\/|$)/,
  /^\.git(\/|$)/,
  /^node_modules(\/|$)/,
  /^dist(\/|$)/,
  /^coverage(\/|$)/,
  /^\.cache(\/|$)/,
  /^cache(\/|$)/,
  /^tmp(\/|$)/,
  /^temp(\/|$)/,
  /^reviews\/archive\/.+/,
  /(^|\/)\.worktree(\/|$)/,
  /(^|\/)worktree-cache(\/|$)/
];

const ADVISORY_HOSTS = ["cursor", "copilot"];

const REQUIRED_GITIGNORE_LINES = [
  ["node_modules/", "node_modules/ is not ignored"],
  ["dist/", "dist/ is not ignored"],
  ["coverage/", "coverage/ is not ignored"],
  ["*.log", "*.log is not ignored"],
  [".claude/", ".claude/ is not ignored"],
  [".codex/", ".codex/ is not ignored"],
  [".cache/", ".cache/ is not ignored"],
  ["reviews/archive/*/", "reviews/archive/*/ is not ignored"],
  ["!reviews/archive/.gitkeep", "reviews/archive/.gitkeep exception is missing"]
];

function repoRootFrom(importMetaUrl = import.meta.url) {
  return resolve(dirname(fileURLToPath(importMetaUrl)), "../..");
}

function readJson(root, repoPath, failures) {
  const fullPath = join(root, repoPath);
  try {
    return JSON.parse(readFileSync(fullPath, "utf8"));
  } catch (error) {
    failures.push(failure(repoPath, "json", "readable JSON", error.message, "cannot read JSON"));
    return null;
  }
}

function readText(root, repoPath, failures) {
  try {
    return readFileSync(join(root, repoPath), "utf8");
  } catch (error) {
    failures.push(failure(repoPath, "file", "readable file", error.message, "cannot read file"));
    return "";
  }
}

function failure(artifactPath, field, expected, actual, message) {
  return {
    artifact_path: artifactPath,
    field,
    expected,
    actual,
    message
  };
}

function normalizeRepoPath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "");
}

function isSafeRepoRelativePath(value) {
  const normalized = normalizeRepoPath(value);
  if (!normalized || normalized === ".") return false;
  if (normalized.includes("../") || normalized.startsWith("../")) return false;
  if (normalized.includes("/./") || normalized.startsWith("./")) return false;
  if (isAbsolute(normalized) || /^[A-Za-z]:/.test(normalized)) return false;
  return normalized;
}

function resolvePackagePath(root, repoPath) {
  const normalized = isSafeRepoRelativePath(repoPath);
  if (!normalized) return null;
  const fullPath = resolve(root, normalized);
  const rel = relative(root, fullPath);
  if (rel.startsWith("..") || isAbsolute(rel)) return null;
  return fullPath;
}

function pathExists(root, repoPath) {
  const fullPath = resolvePackagePath(root, repoPath);
  return Boolean(fullPath && existsSync(fullPath));
}

function pathIsFile(root, repoPath) {
  const fullPath = resolvePackagePath(root, repoPath);
  return Boolean(fullPath && existsSync(fullPath) && statSync(fullPath).isFile());
}

function pathIsDirectory(root, repoPath) {
  const fullPath = resolvePackagePath(root, repoPath);
  return Boolean(fullPath && existsSync(fullPath) && statSync(fullPath).isDirectory());
}

function packageCandidateIsDisallowed(repoPath) {
  const normalized = normalizeRepoPath(repoPath).replace(/\/$/, "");
  return DISALLOWED_PACKAGE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function walkFiles(root, repoPath) {
  const normalized = normalizeRepoPath(repoPath);
  const start = join(root, normalized);
  if (!existsSync(start)) return [];
  const stat = statSync(start);
  if (stat.isFile()) return [normalized];
  if (!stat.isDirectory()) return [];
  const files = [];
  for (const entry of readdirSync(start, { withFileTypes: true })) {
    const child = `${normalized.replace(/\/$/, "")}/${entry.name}`;
    if (entry.isDirectory()) files.push(...walkFiles(root, child));
    else if (entry.isFile()) files.push(child);
  }
  return files;
}

function checkRequiredPackageFields(manifest, failures) {
  for (const field of ["name", "version", "description", "skills", "requiredSharedResources", "hostSupportMatrix", "manifestTargets"]) {
    if (!(field in manifest)) {
      failures.push(failure("lens-temper.package.json", field, "present", "missing", "package manifest missing required field"));
    }
  }
}

function checkPluginVersions(root, manifest, failures) {
  for (const repoPath of [".claude-plugin/plugin.json", ".codex-plugin/plugin.json"]) {
    const plugin = readJson(root, repoPath, failures);
    if (!plugin) continue;
    if (plugin.version !== manifest.version) {
      failures.push(failure(repoPath, "version", manifest.version, plugin.version, "plugin version mismatch"));
    }
  }
}

function checkSkillPaths(root, manifest, failures) {
  for (const skill of manifest.skills || []) {
    if (!pathExists(root, skill.path)) {
      failures.push(failure("lens-temper.package.json", `skills.${skill.id || "unknown"}.path`, "existing file", skill.path, "package skill path does not exist"));
    } else if (!pathIsFile(root, skill.path) || !normalizeRepoPath(skill.path).endsWith("/SKILL.md")) {
      failures.push(failure("lens-temper.package.json", `skills.${skill.id || "unknown"}.path`, "SKILL.md file", skill.path, "skill path must point to a SKILL.md file"));
    }
  }

  const registry = readJson(root, "reviews/registry.json", failures);
  for (const skill of registry?.skills || []) {
    if (!pathExists(root, skill.path)) {
      failures.push(failure("reviews/registry.json", `skills.${skill.id || "unknown"}.path`, "existing file", skill.path, "registry skill path does not exist"));
    } else if (!pathIsFile(root, skill.path) || !normalizeRepoPath(skill.path).endsWith("/SKILL.md")) {
      failures.push(failure("reviews/registry.json", `skills.${skill.id || "unknown"}.path`, "SKILL.md file", skill.path, "skill path must point to a SKILL.md file"));
    }
  }

  const packageSkills = new Map((manifest.skills || []).map((skill) => [skill.id, normalizeRepoPath(skill.path)]));
  const registrySkills = new Map((registry?.skills || []).map((skill) => [skill.id, normalizeRepoPath(skill.path)]));
  const packageIds = [...packageSkills.keys()].sort();
  const registryIds = [...registrySkills.keys()].sort();
  if (packageIds.join("|") !== registryIds.join("|")) {
    failures.push(failure("reviews/registry.json", "skills", packageIds.join("|"), registryIds.join("|"), "package and registry skill ids differ"));
    return;
  }
  for (const id of packageIds) {
    if (packageSkills.get(id) !== registrySkills.get(id)) {
      failures.push(failure("reviews/registry.json", `skills.${id}.path`, packageSkills.get(id), registrySkills.get(id), "package and registry skill paths differ"));
    }
  }

  const registryScripts = new Map((registry?.scripts || []).map((script) => [script.id, normalizeRepoPath(script.path)]));
  if (registryScripts.get("validate-package") !== "reviews/scripts/validate-package.mjs") {
    failures.push(failure("reviews/registry.json", "scripts.validate-package.path", "reviews/scripts/validate-package.mjs", registryScripts.get("validate-package") || "missing", "registry missing required package validator script"));
  }
  for (const [id, scriptPath] of registryScripts) {
    if (!pathIsFile(root, scriptPath)) {
      failures.push(failure("reviews/registry.json", `scripts.${id}.path`, "existing file", scriptPath, "registry script path does not exist"));
    }
  }
}

function checkReviewsResourceRule(root, manifest, failures) {
  const skillFiles = walkFiles(root, "skills").filter((repoPath) => repoPath.endsWith(".md"));
  const skillsReferenceReviews = skillFiles.some((repoPath) => readFileSync(join(root, repoPath), "utf8").includes("reviews/"));
  const declaredReviews = (manifest.requiredSharedResources || []).map(normalizeRepoPath).includes("reviews/");
  if (skillsReferenceReviews && !declaredReviews) {
    failures.push(failure("lens-temper.package.json", "requiredSharedResources", "reviews/", manifest.requiredSharedResources || [], "skills reference reviews but reviews are not declared"));
  }

  const readme = readText(root, "README.md", failures);
  if (!/full\s+LensTemper\s+requires\s+`?skills\/`?\s+and\s+`?reviews\/`?\s+together/i.test(readme)) {
    failures.push(failure("README.md", "packaging_rule", "Full LensTemper requires skills/ and reviews/ together", "missing", "README missing full LensTemper packaging rule"));
  }
}

function checkReadmeHostClaims(root, failures) {
  const readme = readText(root, "README.md", failures);
  if (!/Host Support Matrix/i.test(readme)) {
    failures.push(failure("README.md", "host_support_matrix", "present", "missing", "README missing Host Support Matrix"));
  }
  for (const host of ADVISORY_HOSTS) {
    const hostLinePattern = new RegExp(`^.*\\b${host}\\b.*$`, "gim");
    const lines = readme.match(hostLinePattern) || [];
    for (const line of lines) {
      if (/\bfull\b/i.test(line) && !/\badvisory\b|\breference\b/i.test(line)) {
        failures.push(failure("README.md", host, "advisory/reference support only", line.trim(), "README claims full support for advisory host"));
      }
    }
  }
}

function checkReadmeVersionExamples(root, manifest, failures) {
  const readme = readText(root, "README.md", failures);
  const cachePathPattern = /(?:cache[\\/]+local[\\/]+)?lens-temper[\\/](\d+\.\d+\.\d+)/g;
  for (const match of readme.matchAll(cachePathPattern)) {
    failures.push(failure("README.md", "codex_cache_version", "active installed cache path placeholder", match[1], "README hardcodes Codex cache version path"));
  }
  if (pathExists(root, "docs/INSTALL.md")) {
    const installDoc = readText(root, "docs/INSTALL.md", failures);
    for (const match of installDoc.matchAll(cachePathPattern)) {
      failures.push(failure("docs/INSTALL.md", "codex_cache_version", "active installed cache path placeholder", match[1], "install doc hardcodes Codex cache version path"));
    }
  }
}

function checkFullReviewDowngradeLanguage(root, failures) {
  const silentDowngradePatterns = [
    /\bif (?:it|that|spawn_agent|fresh[^.]{0,80}) (?:is )?unavailable,\s*use inline\/advisory mode\b/i,
    /\bwithout that,\s*use inline\/advisory mode\b/i
  ];
  const paths = [
    "README.md",
    "docs/INSTALL.md",
    ...walkFiles(root, "skills").filter((repoPath) => repoPath.endsWith("/SKILL.md"))
  ];
  for (const repoPath of paths) {
    if (!pathExists(root, repoPath)) continue;
    const text = readText(root, repoPath, failures);
    for (const pattern of silentDowngradePatterns) {
      const match = text.match(pattern);
      if (match) {
        failures.push(failure(repoPath, "full_review_downgrade", "stop full-review requests unless advisory mode is explicitly requested", match[0], "docs allow silent inline/advisory downgrade"));
      }
    }
  }
}

function checkHostSupportMatrix(manifest, failures) {
  const matrix = manifest.hostSupportMatrix || {};
  for (const [host, expectedStatus] of Object.entries({
    "claude-code": "full",
    codex: "full",
    "claude-desktop-claude-ai": "conditional",
    cursor: "advisory",
    copilot: "advisory"
  })) {
    if (matrix[host]?.status !== expectedStatus) {
      failures.push(failure("lens-temper.package.json", `hostSupportMatrix.${host}.status`, expectedStatus, matrix[host]?.status, "host support matrix status mismatch"));
    }
  }
}

function checkIgnoredLocalArtifacts(root, manifest, failures) {
  const gitignore = readText(root, ".gitignore", failures);
  const gitignoreLines = gitignore.split(/\r?\n/).map((line) => line.trim());
  for (const [line, message] of REQUIRED_GITIGNORE_LINES) {
    if (!gitignoreLines.includes(line)) {
      failures.push(failure(".gitignore", line, "ignored", "missing", message));
    }
  }

  const packageCandidates = (manifest.packageCandidates || []).map(normalizeRepoPath);
  for (const repoPath of manifest.packageCandidates || []) {
    const normalized = normalizeRepoPath(repoPath);
    if (packageCandidateIsDisallowed(normalized)) {
      failures.push(failure("lens-temper.package.json", "packageCandidates", "portable source only", repoPath, "package candidate includes host cache or local artifact"));
      continue;
    }
    if (!pathExists(root, normalized)) {
      failures.push(failure("lens-temper.package.json", "packageCandidates", "existing path", repoPath, "package candidate does not exist"));
      continue;
    }
    const expanded = pathIsDirectory(root, normalized) ? walkFiles(root, normalized) : [normalized];
    for (const candidate of expanded) {
      if (candidate === "reviews/archive/.gitkeep") continue;
      if (packageCandidateIsDisallowed(candidate)) {
        failures.push(failure("lens-temper.package.json", "packageCandidates", "portable source only", candidate, "package candidate expands to host cache or local artifact"));
      }
    }
  }

  const coversCandidate = (targetPath) => {
    const target = normalizeRepoPath(targetPath);
    return packageCandidates.some((candidate) => {
      const normalizedCandidate = candidate.replace(/\/$/, "");
      return target === normalizedCandidate || target.startsWith(`${normalizedCandidate}/`);
    });
  };
  const matrix = manifest.hostSupportMatrix || {};
  for (const target of manifest.manifestTargets || []) {
    if (!pathIsFile(root, target.path)) {
      failures.push(failure("lens-temper.package.json", `manifestTargets.${target.host || "unknown"}.path`, "existing file", target.path, "manifest target path does not exist"));
    }
    if (!coversCandidate(target.path)) {
      failures.push(failure("lens-temper.package.json", `manifestTargets.${target.host || "unknown"}.path`, "listed package candidate", target.path, "manifest target is not included in package candidates"));
    }
    const expectedSupport = matrix[target.host]?.status;
    if (expectedSupport && target.support !== expectedSupport) {
      failures.push(failure("lens-temper.package.json", `manifestTargets.${target.host}.support`, expectedSupport, target.support, "manifest target support does not match host support matrix"));
    }
  }
}

export function validatePackageRoot(root = repoRootFrom()) {
  const failures = [];
  const manifest = readJson(root, "lens-temper.package.json", failures);
  if (!manifest) return failures;
  checkRequiredPackageFields(manifest, failures);
  checkPluginVersions(root, manifest, failures);
  checkSkillPaths(root, manifest, failures);
  checkReviewsResourceRule(root, manifest, failures);
  checkReadmeHostClaims(root, failures);
  checkReadmeVersionExamples(root, manifest, failures);
  checkFullReviewDowngradeLanguage(root, failures);
  checkHostSupportMatrix(manifest, failures);
  checkIgnoredLocalArtifacts(root, manifest, failures);
  return failures;
}

function formatFailure(item) {
  return [
    item.artifact_path,
    `field=${item.field}`,
    `expected=${item.expected}`,
    `actual=${Array.isArray(item.actual) ? item.actual.join("|") : item.actual}`,
    `message=${item.message}`
  ].join(" ");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const failures = validatePackageRoot(repoRootFrom(import.meta.url));
  if (failures.length > 0) {
    for (const item of failures) process.stderr.write(`${formatFailure(item)}\n`);
    process.exit(EXIT_CODES.validation);
  }
  process.stdout.write("package validation passed\n");
  process.exit(EXIT_CODES.ok);
}
