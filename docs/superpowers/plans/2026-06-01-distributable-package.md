# Distributable LensTemper Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make LensTemper installable and refreshable as a Codex repo marketplace package while keeping `skills/` plus `reviews/` as the portable package source.

**Architecture:** Add a repo-root Codex marketplace catalog at `.agents/plugins/marketplace.json` that points at the repository root plugin with a local `source.path` of `"./"`. Update install, publishing, README, package manifest, and package validator code so marketplace distribution becomes the primary documented Codex path and drift is caught in tests.

**Tech Stack:** Node.js ESM scripts, `node:test`, JSON package metadata, Codex plugin manifest metadata, Markdown install/publishing docs.

---

## Fact Check Notes

- The bundled Codex plugin-creator reference and installed marketplace examples use marketplace roots containing `.agents/plugins/marketplace.json` plus sibling plugin source paths such as `./plugins/browser`.
- No local bundled reference or official OpenAI web result found during planning verified the prompt's `source.source: "git-subdir"` shape. Do not use `git-subdir` in this PR unless a current Codex CLI/docs check proves support.
- Because LensTemper's plugin root is the repository root, the repo marketplace entry should use `source: { "source": "local", "path": "./" }`.
- The local shell could not run `codex plugin --help`; `codex.exe` returned "Access is denied". Treat install command wording as documentation derived from bundled plugin-creator docs, and verify with a working Codex CLI before release if possible.
- Codex official/curated marketplace publication is separate from this repo marketplace distribution work.

## File Structure

- Create `.agents/plugins/marketplace.json`: Codex repo marketplace catalog for this repository.
- Modify `lens-temper.package.json`: add the marketplace file to `packageCandidates`.
- Modify `reviews/scripts/validate-package.mjs`: add marketplace metadata, package candidate, install-doc ordering, fallback-label, and version-sync checks.
- Modify `reviews/scripts/validate-package.test.mjs`: add focused fixtures for the new validator checks.
- Modify `docs/INSTALL.md`: make Codex marketplace install primary and move cache-copy instructions under `Local Development Fallback`.
- Modify `README.md`: keep concise, describe package boundary, and link to install docs for Codex marketplace setup.
- Modify `docs/PUBLISHING_CHECKLIST.md`: add release/distribution checklist.

---

### Task 1: Add Repo Marketplace Metadata

**Files:**
- Create: `.agents/plugins/marketplace.json`

- [x] **Step 1: Create the marketplace JSON**

Create `.agents/plugins/marketplace.json` with this exact content:

```json
{
  "name": "lens-temper",
  "interface": {
    "displayName": "LensTemper"
  },
  "plugins": [
    {
      "name": "lens-temper",
      "source": {
        "source": "local",
        "path": "./"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL"
      },
      "category": "Coding"
    }
  ]
}
```

- [x] **Step 2: Validate JSON syntax**

Run:

```powershell
node -e "JSON.parse(require('fs').readFileSync('.agents/plugins/marketplace.json','utf8')); console.log('marketplace json ok')"
```

Expected: prints `marketplace json ok`.

- [x] **Step 3: Commit checkpoint (not used in this run)**

```powershell
git add .agents/plugins/marketplace.json
git commit -m "feat: add Codex repo marketplace metadata"
```

---

### Task 2: Add Marketplace Package Validation Tests

**Files:**
- Modify: `reviews/scripts/validate-package.test.mjs`

- [x] **Step 1: Add marketplace constants**

In `reviews/scripts/validate-package.test.mjs`, add this constant after `BASE_PACKAGE`:

```js
const VALID_MARKETPLACE = {
  name: "lens-temper",
  interface: {
    displayName: "LensTemper"
  },
  plugins: [
    {
      name: "lens-temper",
      source: {
        source: "local",
        path: "./"
      },
      policy: {
        installation: "AVAILABLE",
        authentication: "ON_INSTALL"
      },
      category: "Coding"
    }
  ]
};
```

- [x] **Step 2: Include the marketplace candidate in the base fixture**

Add this string to `BASE_PACKAGE.packageCandidates`:

```js
".agents/plugins/marketplace.json",
```

Place it near the other root metadata and adapter files.

- [x] **Step 3: Extend the fixture builder**

Change the `makeFixture` signature from:

```js
function makeFixture({ packagePatch = {}, readme = defaultReadme(), registryPath = "skills/start-plan-review/SKILL.md" } = {}) {
```

to:

```js
function makeFixture({
  packagePatch = {},
  readme = defaultReadme(),
  installDoc = defaultInstallDoc(),
  registryPath = "skills/start-plan-review/SKILL.md",
  marketplace = VALID_MARKETPLACE
} = {}) {
```

Replace the current install doc write:

```js
write(root, "docs/INSTALL.md", "# Installing LensTemper\n");
```

with:

```js
write(root, "docs/INSTALL.md", installDoc);
if (marketplace) {
  write(root, ".agents/plugins/marketplace.json", `${JSON.stringify(marketplace, null, 2)}\n`);
}
```

- [x] **Step 4: Add default install doc helper**

Add this function after `defaultReadme()`:

```js
function defaultInstallDoc() {
  return `# Installing LensTemper

## Codex

Register this repository marketplace, then install LensTemper:

\`\`\`bash
codex plugin marketplace add <path-to-lens-temper-checkout>
codex plugin add lens-temper@lens-temper
\`\`\`

For development users, install from a checkout of \`main\`. For stable users,
install from a checkout of a release tag such as \`v0.1.1\`.

## Local Development Fallback

If Codex is using a cached local plugin copy, refresh the active installed cache
path after edits.

\`\`\`powershell
robocopy <path-to-checkout> <installed-cache-path> /MIR /XD .git .claude .codex .cache node_modules dist coverage reviews\\archive /XF *.log /NFL /NDL /NJH /NJS /NP
\`\`\`
`;
}
```

- [x] **Step 5: Add focused failing tests**

Append these tests near the package-candidate and docs tests:

```js
test("reports missing Codex repo marketplace metadata", () => {
  const root = makeFixture({ marketplace: null });
  try {
    assert(messages(validatePackageRoot(root)).some((message) => message.includes("Codex repo marketplace metadata is missing")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reports marketplace metadata without required policy and category", () => {
  const root = makeFixture({
    marketplace: {
      name: "lens-temper",
      plugins: [
        {
          name: "lens-temper",
          source: {
            source: "local",
            path: "./"
          }
        }
      ]
    }
  });
  try {
    const failureMessages = messages(validatePackageRoot(root));
    assert(failureMessages.some((message) => message.includes("marketplace plugin missing installation policy")));
    assert(failureMessages.some((message) => message.includes("marketplace plugin missing authentication policy")));
    assert(failureMessages.some((message) => message.includes("marketplace plugin missing category")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reports package candidates missing marketplace metadata", () => {
  const root = makeFixture({
    packagePatch: {
      packageCandidates: BASE_PACKAGE.packageCandidates.filter((candidate) => candidate !== ".agents/plugins/marketplace.json")
    }
  });
  try {
    assert(messages(validatePackageRoot(root)).some((message) => message.includes("marketplace metadata is not included in package candidates")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reports install docs without primary Codex marketplace install", () => {
  const root = makeFixture({
    installDoc: `# Installing LensTemper

## Codex

\`\`\`powershell
robocopy <path-to-checkout> <installed-cache-path> /MIR
\`\`\`

## Local Development Fallback

Manual fallback notes.
`
  });
  try {
    assert(messages(validatePackageRoot(root)).some((message) => message.includes("install doc must present Codex marketplace install before local fallback")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reports cache-copy guidance outside local development fallback", () => {
  const root = makeFixture({
    installDoc: `# Installing LensTemper

## Codex

\`\`\`bash
codex plugin marketplace add <path-to-lens-temper-checkout>
codex plugin add lens-temper@lens-temper
\`\`\`

\`\`\`powershell
robocopy <path-to-checkout> <installed-cache-path> /MIR
\`\`\`

## Local Development Fallback

Fallback section exists but the robocopy guidance appeared earlier.
`
  });
  try {
    assert(messages(validatePackageRoot(root)).some((message) => message.includes("cache-copy guidance must be under Local Development Fallback")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
```

- [x] **Step 6: Run tests and verify failure**

Run:

```powershell
node --test reviews/scripts/validate-package.test.mjs
```

Expected: the new marketplace tests fail because the validator has not been implemented yet.

---

### Task 3: Implement Marketplace Package Validation

**Files:**
- Modify: `reviews/scripts/validate-package.mjs`

- [x] **Step 1: Add marketplace constants**

Add after `const ADVISORY_HOSTS = ["copilot"];`:

```js
const MARKETPLACE_PATH = ".agents/plugins/marketplace.json";
const LOCAL_FALLBACK_HEADING_PATTERN = /^##\s+Local Development Fallback\s*$/im;
```

- [x] **Step 2: Add marketplace validator**

Add this function after `checkPluginVersions`:

```js
function checkCodexMarketplace(root, manifest, failures) {
  if (!pathIsFile(root, MARKETPLACE_PATH)) {
    failures.push(failure(MARKETPLACE_PATH, "file", "existing file", "missing", "Codex repo marketplace metadata is missing"));
    return;
  }

  const marketplace = readJson(root, MARKETPLACE_PATH, failures);
  if (!marketplace) return;

  if (marketplace.name !== "lens-temper") {
    failures.push(failure(MARKETPLACE_PATH, "name", "lens-temper", marketplace.name, "marketplace name mismatch"));
  }

  if (!Array.isArray(marketplace.plugins)) {
    failures.push(failure(MARKETPLACE_PATH, "plugins", "array", marketplace.plugins, "marketplace plugins must be an array"));
    return;
  }

  const plugin = marketplace.plugins.find((candidate) => candidate?.name === "lens-temper");
  if (!plugin) {
    failures.push(failure(MARKETPLACE_PATH, "plugins", "plugin named lens-temper", marketplace.plugins.map((candidate) => candidate?.name), "marketplace does not expose the lens-temper plugin"));
    return;
  }

  if (plugin.source?.source !== "local") {
    failures.push(failure(MARKETPLACE_PATH, "plugins.lens-temper.source.source", "local", plugin.source?.source, "marketplace plugin source must be local for repo distribution"));
  }
  if (plugin.source?.path !== "./") {
    failures.push(failure(MARKETPLACE_PATH, "plugins.lens-temper.source.path", "./", plugin.source?.path, "marketplace plugin source must point at this repository package root"));
  }
  if (!plugin.policy?.installation) {
    failures.push(failure(MARKETPLACE_PATH, "plugins.lens-temper.policy.installation", "explicit policy", plugin.policy?.installation, "marketplace plugin missing installation policy"));
  }
  if (!plugin.policy?.authentication) {
    failures.push(failure(MARKETPLACE_PATH, "plugins.lens-temper.policy.authentication", "explicit policy", plugin.policy?.authentication, "marketplace plugin missing authentication policy"));
  }
  if (!plugin.category) {
    failures.push(failure(MARKETPLACE_PATH, "plugins.lens-temper.category", "explicit category", plugin.category, "marketplace plugin missing category"));
  }

  const packageCandidates = (manifest.packageCandidates || []).map(normalizeRepoPath);
  if (!packageCandidatesCover(packageCandidates, MARKETPLACE_PATH)) {
    failures.push(failure("lens-temper.package.json", "packageCandidates", MARKETPLACE_PATH, "missing", "marketplace metadata is not included in package candidates"));
  }
}
```

- [x] **Step 3: Add install doc validator**

Add this function after `checkReadmeVersionExamples`:

```js
function checkInstallDocDistributionPath(root, failures) {
  const installDocPath = "docs/INSTALL.md";
  const installDoc = readText(root, installDocPath, failures);
  const codexMarketplaceIndex = installDoc.search(/codex\s+plugin\s+marketplace\s+add/i);
  const codexPluginAddIndex = installDoc.search(/codex\s+plugin\s+add\s+lens-temper@lens-temper/i);
  const fallbackMatch = installDoc.match(LOCAL_FALLBACK_HEADING_PATTERN);
  const fallbackIndex = fallbackMatch?.index ?? -1;
  const cacheCopyIndex = installDoc.search(/\brobocopy\b|cache[\\/]+local[\\/]+lens-temper/i);

  if (codexMarketplaceIndex < 0 || codexPluginAddIndex < 0 || fallbackIndex < 0 || codexMarketplaceIndex > fallbackIndex || codexPluginAddIndex > fallbackIndex) {
    failures.push(failure(installDocPath, "codex_marketplace_install", "marketplace install before Local Development Fallback", "missing or after fallback", "install doc must present Codex marketplace install before local fallback"));
  }

  if (cacheCopyIndex >= 0 && (fallbackIndex < 0 || cacheCopyIndex < fallbackIndex)) {
    failures.push(failure(installDocPath, "local_cache_copy", "under Local Development Fallback", "before fallback section", "cache-copy guidance must be under Local Development Fallback"));
  }
}
```

- [x] **Step 4: Wire new checks into `validatePackageRoot`**

In `validatePackageRoot`, add:

```js
  checkCodexMarketplace(root, manifest, failures);
```

after `checkPluginVersions(root, manifest, failures);`.

Add:

```js
  checkInstallDocDistributionPath(root, failures);
```

after `checkReadmeVersionExamples(root, manifest, failures);`.

- [x] **Step 5: Run focused tests**

Run:

```powershell
node --test reviews/scripts/validate-package.test.mjs
```

Expected: all tests in `validate-package.test.mjs` pass.

- [x] **Step 6: Commit checkpoint (not used in this run)**

```powershell
git add reviews/scripts/validate-package.mjs reviews/scripts/validate-package.test.mjs
git commit -m "test: validate Codex marketplace package metadata"
```

---

### Task 4: Add Marketplace File to Package Manifest

**Files:**
- Modify: `lens-temper.package.json`

- [x] **Step 1: Add the marketplace file to package candidates**

In `packageCandidates`, add:

```json
".agents/plugins/marketplace.json",
```

Place it after `.codex-plugin/plugin.json`.

- [x] **Step 2: Run package validator**

Run:

```powershell
node reviews/scripts/validate-package.mjs
```

Expected: package validation may still fail on install doc ordering until Task 5 is complete. It must not fail because `.agents/plugins/marketplace.json` is missing from package candidates.

- [x] **Step 3: Commit checkpoint (not used in this run)**

```powershell
git add lens-temper.package.json
git commit -m "chore: include marketplace metadata in package candidates"
```

---

### Task 5: Update Codex Install Documentation

**Files:**
- Modify: `docs/INSTALL.md`

- [x] **Step 1: Replace the current Codex section**

Replace the `## Codex` section with:

```markdown
## Codex

Codex reads `.codex-plugin/plugin.json` and the root `skills/` directory. Full
LensTemper reviews also require `spawn_agent` or an equivalent fresh-subagent
tool. If that is unavailable, a full review cannot be completed; only run
inline/advisory mode when the user explicitly asks for a non-lockable advisory
pass.

### Repo Marketplace Install

The primary Codex distribution path is this repository's marketplace metadata at
`.agents/plugins/marketplace.json`. Clone or update the repository first:

```bash
git clone https://github.com/540lyle/lens-temper.git
cd lens-temper
node reviews/scripts/validate-package.mjs
```

Register the repository marketplace and install LensTemper:

```bash
codex plugin marketplace add <path-to-lens-temper-checkout>
codex plugin add lens-temper@lens-temper
```

Development users should install from a checkout of `main`. Stable users should
install from a checkout of a release tag such as `v0.1.1`.

To update, pull the checkout to the desired branch or tag, reinstall the plugin,
and start a new Codex thread so updated skill and plugin metadata are loaded:

```bash
git pull --ff-only
node reviews/scripts/validate-package.mjs
codex plugin add lens-temper@lens-temper
```

Hosts may require reload, restart, or a new thread after an update.

### Local Development Fallback

Use this only when actively iterating on a locally cached Codex plugin copy and
the marketplace reinstall path is not available. It is not the normal install or
update path.

On Windows, discover the installed path first:

```powershell
Get-ChildItem "$env:USERPROFILE\.codex\plugins\cache\local\lens-temper" -Directory
```

Then mirror into the directory Codex is actually using:

```powershell
robocopy <path-to-checkout> <installed-cache-path> /MIR /XD .git .claude .codex .cache node_modules dist coverage reviews\archive /XF *.log /NFL /NDL /NJH /NJS /NP
```

Use your actual checkout path and installed cache path. The cache directory
version segment may lag the plugin manifest version.
```

- [x] **Step 2: Keep cross-host sections accurate**

Review `## Claude Code`, `## Claude Desktop / Claude.ai`, `## Cursor`, and `## Copilot`.
Do not claim official marketplace publication for any host unless an actual listing exists.
Keep these support claims:

```text
Claude Code: local plugin or official/third-party marketplace only if actually listed.
Claude Desktop / Claude.ai: conditional Skills packaging; full claims require bundled reviews/ and fresh isolation.
Cursor: conditional full only with fresh isolation and validator-backed artifacts; otherwise advisory/reference.
Copilot: advisory/reference only.
```

- [x] **Step 3: Run validator**

Run:

```powershell
node reviews/scripts/validate-package.mjs
```

Expected: package validation passes or reports only issues from later README/publishing edits that are still pending.

- [x] **Step 4: Commit checkpoint (not used in this run)**

```powershell
git add docs/INSTALL.md
git commit -m "docs: make Codex marketplace install primary"
```

---

### Task 6: Update README Package Boundary and Install Pointer

**Files:**
- Modify: `README.md`

- [x] **Step 1: Find the install/package wording**

Run:

```powershell
rg -n "Install|Installing|Codex|Package|Full LensTemper requires" README.md
```

- [x] **Step 2: Add concise marketplace install pointer**

In the existing installation or package section, add this paragraph without duplicating full command details:

```markdown
Codex repo marketplace installation is the primary Codex path. See
[`docs/INSTALL.md`](docs/INSTALL.md) for the marketplace registration,
install, update, and local-development fallback commands.
```

- [x] **Step 3: Ensure the package boundary remains explicit**

Ensure README still contains this exact sentence, or add it to the package section if missing:

```markdown
Full LensTemper requires `skills/` and `reviews/` together.
```

- [x] **Step 4: Run validator**

Run:

```powershell
node reviews/scripts/validate-package.mjs
```

Expected: package validation passes or reports only publishing checklist content still pending.

- [x] **Step 5: Commit checkpoint (not used in this run)**

```powershell
git add README.md
git commit -m "docs: point README to Codex marketplace install"
```

---

### Task 7: Update Publishing Checklist

**Files:**
- Modify: `docs/PUBLISHING_CHECKLIST.md`

- [x] **Step 1: Add release distribution checklist**

Add this section after `## Current Cleanup`:

```markdown
## Release Distribution Checklist

- [x] Bump `lens-temper.package.json`, `.codex-plugin/plugin.json`, and
  `.claude-plugin/plugin.json` to the same semantic version.
- [x] Verify `.agents/plugins/marketplace.json` exposes `lens-temper` with
  `source.source: "local"`, `source.path: "./"`, explicit
  `policy.installation`, explicit `policy.authentication`, and `category`.
- [x] Verify `lens-temper.package.json` includes
  `.agents/plugins/marketplace.json` in `packageCandidates`.
- [x] Verify `docs/INSTALL.md` presents Codex repo marketplace install before
  local cache-copy fallback instructions.
- [x] Run the full validation suite:
  `node --test reviews/scripts/*.test.mjs`,
  `node reviews/scripts/validate-package.mjs`,
  `node reviews/scripts/validate-review-fixtures.mjs`,
  `node reviews/scripts/run-review-evals.mjs`,
  `node --check reviews/scripts/*.mjs`, and `git diff --check`.
- [x] Tag releases as `vX.Y.Z`.
- [x] Recommend stable users install from release tags and development users
  install from `main`.
- [x] Note in release notes that hosts may require reload, restart, reinstall,
  or a new thread after update.
- [x] Keep official curated marketplace submission separate from repo
  marketplace distribution.
```

- [x] **Step 2: Remove duplicate stale checklist items**

If the existing checklist repeats the same release steps less concretely, replace them with the new section rather than keeping duplicate bullets.

- [x] **Step 3: Run validator**

Run:

```powershell
node reviews/scripts/validate-package.mjs
```

Expected: `package validation passed`.

- [x] **Step 4: Commit checkpoint (not used in this run)**

```powershell
git add docs/PUBLISHING_CHECKLIST.md
git commit -m "docs: add release distribution checklist"
```

---

### Task 8: Full Verification and Final Review

**Files:**
- Verify all changed files.

- [x] **Step 1: Run full validation suite**

Run:

```powershell
node --test reviews/scripts/*.test.mjs
node reviews/scripts/validate-package.mjs
node reviews/scripts/validate-review-fixtures.mjs
node reviews/scripts/run-review-evals.mjs
node --check reviews/scripts/*.mjs
git diff --check
```

Expected:

```text
all node:test suites pass
package validation passed
review fixture validation passes
review evals pass
node --check prints no syntax errors
git diff --check prints no whitespace errors
```

- [x] **Step 2: Inspect final diff scope**

Run:

```powershell
git diff --stat HEAD~7..HEAD
git diff HEAD~7..HEAD -- .agents/plugins/marketplace.json lens-temper.package.json reviews/scripts/validate-package.mjs reviews/scripts/validate-package.test.mjs docs/INSTALL.md README.md docs/PUBLISHING_CHECKLIST.md
```

Expected: changes are limited to marketplace metadata, package manifest, validator/tests, and docs. No review lens behavior, synthesis behavior, artifact schemas, or eval fixtures changed.

- [x] **Step 3: Verify no local artifacts are candidates**

Run:

```powershell
git status --ignored --short --untracked-files=all
node reviews/scripts/validate-package.mjs
```

Expected: ignored local artifacts may appear in status, but no `.claude/`, `.codex/`, `.cache/`, `node_modules/`, `dist/`, `coverage/`, or populated `reviews/archive/*/` paths are listed in `packageCandidates`; package validation passes.

- [x] **Step 4: Final response checklist**

In the final response, summarize:

```text
Files changed:
- .agents/plugins/marketplace.json
- lens-temper.package.json
- reviews/scripts/validate-package.mjs
- reviews/scripts/validate-package.test.mjs
- docs/INSTALL.md
- README.md
- docs/PUBLISHING_CHECKLIST.md

Install/update path:
- Codex repo marketplace install uses codex plugin marketplace add <path-to-lens-temper-checkout>, then codex plugin add lens-temper@lens-temper.
- Updates pull the selected branch/tag, rerun validation, reinstall, and start a new thread/reload host as needed.

Verification:
- List every command from Step 1 and whether it passed.

Caveat:
- Official curated marketplace publication is separate from repo marketplace distribution.
```

---

## Self-Review

- Spec coverage: The plan covers marketplace metadata, install docs, README, publishing checklist, package manifest, validator checks, validator tests, and final verification. It explicitly preserves host-support caveats and avoids review workflow behavior changes.
- Placeholder scan: No `TBD`, `TODO`, or unspecified "add tests" steps are used; concrete file paths, command lines, and expected outcomes are provided.
- Type consistency: The marketplace path is consistently `.agents/plugins/marketplace.json`; the marketplace source is consistently `{ "source": "local", "path": "./" }`; the install command pair is consistently `codex plugin marketplace add <path-to-lens-temper-checkout>` and `codex plugin add lens-temper@lens-temper`.
