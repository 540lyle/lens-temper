#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
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
  /^\.cursor\/skills(\/|$)/,
  /^node_modules(\/|$)/,
  /^dist(\/|$)/,
  /^coverage(\/|$)/,
  /^\.cache(\/|$)/,
  /^cache(\/|$)/,
  /^tmp(\/|$)/,
  /^temp(\/|$)/,
  /^reviews\/archive\/.+/,
  /(^|\/)reviews\/archive\/.+/,
  /(^|\/)\.worktree(\/|$)/,
  /(^|\/)worktree-cache(\/|$)/
];

const ADVISORY_HOSTS = ["copilot"];

const REQUIRED_GITIGNORE_LINES = [
  ["node_modules/", "node_modules/ is not ignored"],
  ["dist/", "dist/ is not ignored"],
  ["coverage/", "coverage/ is not ignored"],
  ["*.log", "*.log is not ignored"],
  [".claude/", ".claude/ is not ignored"],
  [".codex/", ".codex/ is not ignored"],
  [".cache/", ".cache/ is not ignored"],
  [".cursor/skills/", ".cursor/skills/ is not ignored"],
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
  if (normalized.split("/").some((segment) => segment === "." || segment === "..")) return false;
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

function packageCandidatesCover(packageCandidates, targetPath) {
  const target = normalizeRepoPath(targetPath);
  return packageCandidates.some((candidate) => {
    const normalizedCandidate = normalizeRepoPath(candidate).replace(/\/$/, "");
    return target === normalizedCandidate || target.startsWith(`${normalizedCandidate}/`);
  });
}

function expandPackageCandidateFiles(root, repoPath) {
  const normalized = normalizeRepoPath(repoPath);
  if (!pathExists(root, normalized) || packageCandidateIsDisallowed(normalized)) return [];
  const expanded = pathIsDirectory(root, normalized) ? walkFiles(root, normalized) : [normalized];
  return expanded.filter((candidate) => candidate === "reviews/archive/.gitkeep" || !packageCandidateIsDisallowed(candidate));
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

function fileSha256(root, repoPath) {
  return createHash("sha256").update(readFileSync(join(root, normalizeRepoPath(repoPath)))).digest("hex");
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
  const cursorRow = readme.match(/^\|\s*Cursor\s*\|(?<support>[^|]+)\|(?<requirements>[^|]+)\|/im);
  if (cursorRow) {
    const cursorSupport = cursorRow.groups?.support?.trim() || "";
    const cursorRequirements = cursorRow.groups?.requirements?.trim() || "";
    if (/\bfull\b/i.test(cursorSupport) && !/\bconditional\b/i.test(cursorSupport)) {
      failures.push(failure("README.md", "cursor", "conditional full, not unconditional full", cursorRow[0].trim(), "README claims unconditional full support for conditional host"));
    }
    if (!/conditional\s+full/i.test(cursorSupport) || !/advisory\/reference|advisory/i.test(cursorRequirements)) {
      failures.push(failure("README.md", "cursor", "conditional full with advisory/reference fallback", cursorRow[0].trim(), "README missing Cursor conditional-full support caveat"));
    }
  }
  for (const host of ADVISORY_HOSTS) {
    const hostLinePattern = new RegExp(`^\\|\\s*${host}\\s*\\|.*$`, "gim");
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

function checkMarketplaceMetadata(root, manifest, failures) {
  const marketplacePath = ".agents/plugins/marketplace.json";
  const packageCandidates = (manifest.packageCandidates || []).map(normalizeRepoPath);

  if (!packageCandidatesCover(packageCandidates, marketplacePath)) {
    failures.push(failure("lens-temper.package.json", "packageCandidates", marketplacePath, "missing", "marketplace metadata is not included in package candidates"));
  }

  if (!pathIsFile(root, marketplacePath)) {
    failures.push(failure(marketplacePath, "file", "existing file", "missing", "Codex repo marketplace metadata is missing"));
    return;
  }

  const marketplace = readJson(root, marketplacePath, failures);
  if (!marketplace) return;
  if (marketplace.name !== "lens-temper") {
    failures.push(failure(marketplacePath, "name", "lens-temper", marketplace.name, "marketplace top-level name is wrong"));
  }

  if (!Array.isArray(marketplace.plugins)) {
    failures.push(failure(marketplacePath, "plugins", "array with lens-temper plugin", marketplace.plugins || "missing", "marketplace plugins must be an array"));
    return;
  }

  const plugin = marketplace.plugins.find((candidate) => candidate?.name === "lens-temper");
  if (!plugin) {
    failures.push(failure(marketplacePath, "plugins", "plugin named lens-temper", marketplace.plugins || [], "marketplace does not expose lens-temper plugin"));
    return;
  }

  if (!plugin.source || plugin.source.source !== "local" || plugin.source.path !== "./plugins/lens-temper") {
    failures.push(failure(marketplacePath, "plugins.lens-temper.source", "{ source: local, path: ./plugins/lens-temper }", plugin.source || "missing", "marketplace plugin source must point at the packaged Codex plugin payload"));
  }
  if (!plugin.policy?.installation) {
    failures.push(failure(marketplacePath, "plugins.lens-temper.policy.installation", "explicit policy", "missing", "marketplace plugin lacks installation policy"));
  }
  if (!plugin.policy?.authentication) {
    failures.push(failure(marketplacePath, "plugins.lens-temper.policy.authentication", "explicit policy", "missing", "marketplace plugin lacks authentication policy"));
  }
  if (!plugin.category) {
    failures.push(failure(marketplacePath, "plugins.lens-temper.category", "explicit category", "missing", "marketplace plugin lacks category"));
  }
}

function checkPackagedCodexPayload(root, manifest, failures) {
  const packageRoot = "plugins/lens-temper";
  const packageCandidates = (manifest.packageCandidates || []).map(normalizeRepoPath);

  if (!packageCandidatesCover(packageCandidates, `${packageRoot}/`)) {
    failures.push(failure("lens-temper.package.json", "packageCandidates", `${packageRoot}/`, "missing", "packaged Codex plugin payload is not included in package candidates"));
  }

  for (const repoPath of [
    `${packageRoot}/.codex-plugin/plugin.json`,
    `${packageRoot}/skills/`,
    `${packageRoot}/reviews/`
  ]) {
    if (!pathExists(root, repoPath)) {
      failures.push(failure(repoPath, "file", "existing packaged Codex payload path", "missing", "packaged Codex plugin payload is incomplete"));
    }
  }

  const packagedPlugin = readJson(root, `${packageRoot}/.codex-plugin/plugin.json`, failures);
  if (packagedPlugin && packagedPlugin.version !== manifest.version) {
    failures.push(failure(`${packageRoot}/.codex-plugin/plugin.json`, "version", manifest.version, packagedPlugin.version, "packaged Codex plugin version mismatch"));
  }

  const mirroredRoots = [
    [".codex-plugin/plugin.json", `${packageRoot}/.codex-plugin/plugin.json`],
    ...walkFiles(root, "skills").map((repoPath) => [repoPath, `${packageRoot}/${repoPath}`]),
    ...packageCandidates
      .filter((repoPath) => repoPath.startsWith("reviews/"))
      .flatMap((repoPath) => expandPackageCandidateFiles(root, repoPath))
      .map((repoPath) => [repoPath, `${packageRoot}/${repoPath}`])
  ];

  const sourcePaths = new Set(mirroredRoots.map(([sourcePath]) => normalizeRepoPath(sourcePath)));
  for (const [sourcePath, packagedPath] of mirroredRoots) {
    if (!pathIsFile(root, packagedPath)) {
      failures.push(failure(packagedPath, "file", `packaged copy of ${sourcePath}`, "missing", "packaged Codex plugin payload is missing a source file"));
      continue;
    }
    if (fileSha256(root, sourcePath) !== fileSha256(root, packagedPath)) {
      failures.push(failure(packagedPath, "sha256", `matches ${sourcePath}`, "different", "packaged Codex plugin payload file drifted from source"));
    }
  }

  for (const packagedFile of walkFiles(root, packageRoot)) {
    if (packagedFile === `${packageRoot}/.codex-plugin/plugin.json`) continue;
    const sourcePath = packagedFile.slice(`${packageRoot}/`.length);
    if (!sourcePaths.has(sourcePath)) {
      failures.push(failure(packagedFile, "source", "file mirrored from root Codex payload", sourcePath, "packaged Codex plugin payload contains an unexpected file"));
    }
  }
}

function checkInstallDocMarketplaceOrder(root, failures) {
  const installDocPath = "docs/INSTALL.md";
  if (!pathIsFile(root, installDocPath)) return;
  const installDoc = readText(root, installDocPath, failures);
  const codexIndex = installDoc.search(/^##\s+Codex\s*$/im);
  const marketplaceIndex = installDoc.search(/codex\s+plugin\s+marketplace\s+add/i);
  const pluginInstallIndex = installDoc.search(/codex\s+plugin\s+add\s+lens-temper@lens-temper/i);
  const fallbackIndex = installDoc.search(/^##\s+Local Development Fallback\s*$/im);
  const cacheCopyIndex = installDoc.search(/\brobocopy\b|cached local plugin copy|installed-cache-path/i);

  if (marketplaceIndex < 0 || (codexIndex >= 0 && marketplaceIndex < codexIndex) || (fallbackIndex >= 0 && marketplaceIndex > fallbackIndex)) {
    failures.push(failure(installDocPath, "codex_marketplace_install", "marketplace install before local development fallback", "missing or after fallback", "install doc must present Codex marketplace install before local development fallback"));
  }

  if (pluginInstallIndex < 0 || (fallbackIndex >= 0 && pluginInstallIndex > fallbackIndex)) {
    failures.push(failure(installDocPath, "codex_plugin_install", "codex plugin add lens-temper@lens-temper before local development fallback", "missing or after fallback", "install doc must include Codex plugin install command"));
  }

  if (cacheCopyIndex >= 0 && (fallbackIndex < 0 || cacheCopyIndex < fallbackIndex)) {
    failures.push(failure(installDocPath, "codex_cache_copy_fallback", "cache-copy guidance under Local Development Fallback", "outside fallback", "Codex cache-copy guidance must be labeled as local development fallback"));
  }
}

function checkFullReviewDowngradeLanguage(root, failures) {
  const silentDowngradePatterns = [
    /\bif (?:it|that|spawn_agent|fresh[^.]{0,80}) (?:is )?unavailable,\s*use inline\/advisory mode\b/i,
    /\bwithout that,\s*use inline\/advisory mode\b/i,
    /\botherwise\s+treat the run as inline\/advisory\b/i
  ];
  const paths = [
    "README.md",
    "docs/INSTALL.md",
    "reviews/README.md",
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
    cursor: "conditional",
    copilot: "advisory"
  })) {
    if (matrix[host]?.status !== expectedStatus) {
      failures.push(failure("lens-temper.package.json", `hostSupportMatrix.${host}.status`, expectedStatus, matrix[host]?.status, "host support matrix status mismatch"));
    }
  }
}

function checkCursorAdapter(root, manifest, failures) {
  const cursorRulePath = ".cursor/rules/lens-temper.mdc";
  const cursorGuidePath = "docs/hosts/cursor.md";
  const packageCandidates = (manifest.packageCandidates || []).map(normalizeRepoPath);

  if (!packageCandidatesCover(packageCandidates, cursorGuidePath)) {
    failures.push(failure("lens-temper.package.json", "packageCandidates", cursorGuidePath, "missing", "Cursor host guide is not included in package candidates"));
  }
  if (!pathIsFile(root, cursorGuidePath)) {
    failures.push(failure(cursorGuidePath, "file", "existing file", "missing", "Cursor host guide is missing"));
  }

  if (!pathIsFile(root, cursorRulePath)) {
    failures.push(failure(cursorRulePath, "file", "existing file", "missing", "Cursor adapter is missing"));
    return;
  }

  const cursorRule = readText(root, cursorRulePath, failures);
  if (/^\s*alwaysApply:\s*true\s*$/im.test(cursorRule)) {
    failures.push(failure(cursorRulePath, "alwaysApply", "false", "true", "Cursor rule must be requestable, not always applied"));
  }
  if (!/^\s*alwaysApply:\s*false\s*$/im.test(cursorRule)) {
    failures.push(failure(cursorRulePath, "alwaysApply", "false", "missing", "Cursor rule must declare requestable application"));
  }

  for (const requiredReference of [
    "docs/hosts/cursor.md",
    "reviews/README.md",
    "reviews/registry.json",
    "reviews/lenses/",
    "reviews/manifests/lenses/",
    "reviews/reviewer-template.md",
    "advisory/reference"
  ]) {
    if (!cursorRule.includes(requiredReference)) {
      failures.push(failure(cursorRulePath, "required_reference", requiredReference, "missing", "Cursor adapter missing required advisory reference"));
    }
  }

  if (pathIsFile(root, cursorGuidePath)) {
    const cursorGuide = readText(root, cursorGuidePath, failures);
    for (const requiredGuideText of [
      /Cursor support is\s+conditional full/,
      /otherwise Cursor support is\s+advisory\/reference/,
      "Advisory Quick Start",
      "Entrypoints",
      "Advisory Verification Checklist",
      "Conditional Full Gates",
      "Background Agents",
      "experiment",
      /fresh reviewer\s+isolation/,
      "reviews/registry.json",
      "reviews/manifests/lenses/",
      "lens-<slug>.md",
      "parent-chat-only secret",
      "ledger.json",
      "events.jsonl",
      "completion-summary.json",
      "validate-review-fixtures.mjs",
      "validate-review-output.mjs",
      "validate-ledger.mjs",
      "validate-synthesis-output.mjs",
      "decide-reruns.mjs",
      "emit-completion-summary.mjs",
      "archive path consistency",
      "validate-completion-summary.mjs"
    ]) {
      const found = typeof requiredGuideText === "string"
        ? cursorGuide.includes(requiredGuideText)
        : requiredGuideText.test(cursorGuide);
      if (!found) {
        failures.push(failure(cursorGuidePath, "required_guidance", String(requiredGuideText), "missing", "Cursor host guide missing required advisory guidance"));
      }
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
    if (!isSafeRepoRelativePath(normalized)) {
      failures.push(failure("lens-temper.package.json", "packageCandidates", "safe repository-relative path", repoPath, "package candidate contains unsafe path segment"));
      continue;
    }
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
      if (candidate === "reviews/archive/.gitkeep" || candidate.endsWith("/reviews/archive/.gitkeep")) continue;
      if (packageCandidateIsDisallowed(candidate)) {
        failures.push(failure("lens-temper.package.json", "packageCandidates", "portable source only", candidate, "package candidate expands to host cache or local artifact"));
      }
    }
  }

  const matrix = manifest.hostSupportMatrix || {};
  for (const target of manifest.manifestTargets || []) {
    if (!pathIsFile(root, target.path)) {
      failures.push(failure("lens-temper.package.json", `manifestTargets.${target.host || "unknown"}.path`, "existing file", target.path, "manifest target path does not exist"));
    }
    if (!packageCandidatesCover(packageCandidates, target.path)) {
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
  checkMarketplaceMetadata(root, manifest, failures);
  checkPackagedCodexPayload(root, manifest, failures);
  checkInstallDocMarketplaceOrder(root, failures);
  checkFullReviewDowngradeLanguage(root, failures);
  checkHostSupportMatrix(manifest, failures);
  checkCursorAdapter(root, manifest, failures);
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
