import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { validatePackageRoot } from "./validate-package.mjs";

const BASE_PACKAGE = {
  name: "lens-temper",
  version: "0.1.1",
  description: "LensTemper runs structured spec-driven development reviews.",
  skills: [
    {
      id: "start-plan-review",
      path: "skills/start-plan-review/SKILL.md"
    }
  ],
  requiredSharedResources: [
    "reviews/"
  ],
  hostSupportMatrix: {
    "claude-code": {
      status: "full",
      requirements: [".claude-plugin/plugin.json", "skills/", "reviews/", "fresh reviewer agents"]
    },
    codex: {
      status: "full",
      requirements: [".codex-plugin/plugin.json", "skills/", "reviews/", "spawn_agent"]
    },
    "claude-desktop-claude-ai": {
      status: "conditional",
      requirements: ["packaged reviews/", "fresh reviewer isolation"]
    },
    cursor: {
      status: "conditional",
      adapter: ".cursor/rules/lens-temper.mdc",
      requirements: [
        "detached orchestrator subagent",
        "one fresh reviewer per lens",
        "parent-chat-only secret isolation falsification",
        "per-lens JSON review artifacts",
        "ledger.json and events.jsonl",
        "synthesis and completion-summary validators"
      ]
    },
    copilot: {
      status: "advisory",
      adapter: ".github/copilot-instructions.md"
    }
  },
  manifestTargets: [
    {
      host: "claude-code",
      path: ".claude-plugin/plugin.json",
      support: "full"
    },
    {
      host: "codex",
      path: ".codex-plugin/plugin.json",
      support: "full"
    },
    {
      host: "cursor",
      path: ".cursor/rules/lens-temper.mdc",
      support: "conditional"
    },
    {
      host: "copilot",
      path: ".github/copilot-instructions.md",
      support: "advisory"
    }
  ],
  packageCandidates: [
    "README.md",
    "lens-temper.package.json",
    ".claude-plugin/plugin.json",
    ".codex-plugin/plugin.json",
    "skills/",
    "reviews/",
    "docs/hosts/cursor.md",
    ".cursor/rules/lens-temper.mdc",
    ".github/copilot-instructions.md"
  ]
};

function write(root, repoPath, content) {
  const fullPath = join(root, repoPath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content, "utf8");
}

function makeFixture({ packagePatch = {}, readme = defaultReadme(), registryPath = "skills/start-plan-review/SKILL.md" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "lens-temper-package-"));
  const manifest = {
    ...BASE_PACKAGE,
    ...packagePatch
  };
  write(root, "lens-temper.package.json", `${JSON.stringify(manifest, null, 2)}\n`);
  write(root, ".claude-plugin/plugin.json", `${JSON.stringify({ name: "lens-temper", version: "0.1.1" }, null, 2)}\n`);
  write(root, ".codex-plugin/plugin.json", `${JSON.stringify({ name: "lens-temper", version: "0.1.1" }, null, 2)}\n`);
  write(root, ".gitignore", "node_modules/\ndist/\ncoverage/\n*.log\n.claude/\n.codex/\n.cache/\n.cursor/skills/\nreviews/archive/*/\n!reviews/archive/.gitkeep\n");
  write(root, "README.md", readme);
  write(root, "docs/INSTALL.md", "# Installing LensTemper\n");
  write(root, "skills/start-plan-review/SKILL.md", "---\nname: start-plan-review\n---\nRead reviews/README.md before running.\n");
  write(root, "docs/hosts/cursor.md", `# Cursor Host Guide

Cursor support is conditional full when a detached run proves fresh reviewer isolation and artifact validation; otherwise Cursor support is advisory/reference. Use .cursor/rules/lens-temper.mdc as an Agent Requested rule, read reviews/README.md, reviews/registry.json, selected reviews/lenses/ files, reviews/manifests/lenses/ entries, and reviews/reviewer-template.md, and label non-gated output advisory/reference. Cursor Background Agents can satisfy the conditional full gate only after an experiment proves fresh reviewer isolation with validate-review-fixtures.mjs, validate-review-output.mjs, validate-ledger.mjs, validate-synthesis-output.mjs, decide-reruns.mjs, emit-completion-summary.mjs, and validate-completion-summary.mjs. The guide includes Advisory Quick Start, Entrypoints, Advisory Verification Checklist, Conditional Full Gates, lens-<slug>.md, parent-chat-only secret, ledger.json, events.jsonl, completion-summary.json, and archive path consistency.
`);
  write(root, "reviews/scripts/validate-package.mjs", "#!/usr/bin/env node\n");
  write(root, "reviews/README.md", "# Reviews\n");
  write(root, "reviews/registry.json", `${JSON.stringify({
    scripts: [
      {
        id: "validate-package",
        path: "reviews/scripts/validate-package.mjs"
      }
    ],
    skills: [
      {
        id: "start-plan-review",
        path: registryPath
      }
    ]
  }, null, 2)}\n`);
  write(root, ".cursor/rules/lens-temper.mdc", `---
description: Use when the user asks Cursor for an advisory LensTemper review.
alwaysApply: false
---

# LensTemper Cursor Advisory Adapter

Read docs/hosts/cursor.md, reviews/README.md, selected reviews/lenses/ files, and reviews/reviewer-template.md. Label Cursor-only output advisory/reference.
`);
  write(root, ".github/copilot-instructions.md", "# LensTemper Copilot advisory adapter\n");
  return root;
}

function defaultReadme() {
  return `# LensTemper

## Host Support Matrix

| Host | Support | Notes |
|------|---------|-------|
| Claude Code | Full review supported | Plugin plus Agent tool. |
| Codex | Full review supported | Plugin/skills plus spawn_agent. |
| Claude Desktop / Claude.ai | Conditional | Needs packaged reviews/ resources and verified fresh reviewer isolation. |
| Cursor | Conditional full | Requires detached orchestration, fresh reviewer isolation, artifact validation, and parent-chat-only secret scan; otherwise advisory/reference. |
| Copilot | Advisory/reference | Via .github/copilot-instructions.md or AGENTS.md. |

## Packaging Rule

Full LensTemper requires skills/ and reviews/ together. Installing only one
skill folder is advisory unless the package embeds shared resources.

Skill package means the portable source. Plugin, rules, and instructions files
are host adapters.
`;
}

function messages(failures) {
  return failures.map((failure) => failure.message);
}

test("validates a complete LensTemper package fixture", () => {
  const root = makeFixture();
  try {
    assert.deepEqual(validatePackageRoot(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reports plugin version drift", () => {
  const root = makeFixture({
    packagePatch: {
      version: "0.1.2"
    }
  });
  try {
    assert(messages(validatePackageRoot(root)).some((message) => message.includes("plugin version mismatch")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reports hardcoded README Codex cache paths", () => {
  const root = makeFixture({
    readme: `${defaultReadme()}

\`\`\`powershell
robocopy <path-to-checkout> $env:USERPROFILE\\.codex\\plugins\\cache\\local\\lens-temper\\0.1.1 /MIR
\`\`\`
`
  });
  try {
    assert(messages(validatePackageRoot(root)).some((message) => message.includes("README hardcodes Codex cache version path")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reports hardcoded install doc Codex cache paths", () => {
  const root = makeFixture();
  write(root, "docs/INSTALL.md", `# Installing LensTemper

\`\`\`powershell
robocopy <path-to-checkout> $env:USERPROFILE\\.codex\\plugins\\cache\\local\\lens-temper\\0.1.1 /MIR
\`\`\`
`);
  try {
    assert(messages(validatePackageRoot(root)).some((message) => message.includes("install doc hardcodes Codex cache version path")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reports missing local artifact ignore rules", () => {
  const root = makeFixture();
  write(root, ".gitignore", ".claude/\nnode_modules/\n");
  try {
    assert(messages(validatePackageRoot(root)).some((message) => message.includes(".codex/ is not ignored")));
    assert(messages(validatePackageRoot(root)).some((message) => message.includes(".cursor/skills/ is not ignored")));
    assert(messages(validatePackageRoot(root)).some((message) => message.includes("reviews/archive/*/ is not ignored")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reports silent full-review downgrades to advisory mode", () => {
  const root = makeFixture({
    readme: `${defaultReadme()}

Full reviews require spawn_agent; if that is unavailable, use inline/advisory mode instead of claiming a full pass.
`
  });
  try {
    assert(messages(validatePackageRoot(root)).some((message) => message.includes("docs allow silent inline/advisory downgrade")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reports missing registry skill paths", () => {
  const root = makeFixture({ registryPath: "skills/missing/SKILL.md" });
  try {
    assert(messages(validatePackageRoot(root)).some((message) => message.includes("registry skill path does not exist")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reports skill paths that are not SKILL.md files", () => {
  const root = makeFixture({
    packagePatch: {
      skills: [
        {
          id: "start-plan-review",
          path: "skills/start-plan-review"
        }
      ]
    },
    registryPath: "skills/start-plan-review"
  });
  try {
    assert(messages(validatePackageRoot(root)).some((message) => message.includes("skill path must point to a SKILL.md file")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reports package and registry skill id drift", () => {
  const root = makeFixture({
    packagePatch: {
      skills: [
        {
          id: "renamed-start-plan-review",
          path: "skills/start-plan-review/SKILL.md"
        }
      ]
    }
  });
  try {
    assert(messages(validatePackageRoot(root)).some((message) => message.includes("package and registry skill ids differ")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reports package and registry skill path drift", () => {
  const root = makeFixture({
    packagePatch: {
      skills: [
        {
          id: "start-plan-review",
          path: "reviews/README.md"
        }
      ]
    }
  });
  try {
    assert(messages(validatePackageRoot(root)).some((message) => message.includes("package and registry skill paths differ")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reports missing validate-package registry script", () => {
  const root = makeFixture();
  write(root, "reviews/registry.json", `${JSON.stringify({
    scripts: [],
    skills: [
      {
        id: "start-plan-review",
        path: "skills/start-plan-review/SKILL.md"
      }
    ]
  }, null, 2)}\n`);
  try {
    assert(messages(validatePackageRoot(root)).some((message) => message.includes("registry missing required package validator script")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reports unconditional full support claims for Cursor", () => {
  const root = makeFixture({
    readme: defaultReadme().replace("Cursor | Conditional full", "Cursor | Full support")
  });
  try {
    assert(messages(validatePackageRoot(root)).some((message) => message.includes("README claims unconditional full support for conditional host")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reports unsupported full support claims for Copilot", () => {
  const root = makeFixture({
    readme: defaultReadme().replace("Copilot | Advisory/reference", "Copilot | Full support")
  });
  try {
    assert(messages(validatePackageRoot(root)).some((message) => message.includes("README claims full support for advisory host")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reports always-on Cursor advisory rules", () => {
  const root = makeFixture();
  write(root, ".cursor/rules/lens-temper.mdc", `---
description: LensTemper advisory adapter.
alwaysApply: true
---

# LensTemper Cursor Advisory Adapter

Read docs/hosts/cursor.md, reviews/README.md, selected reviews/lenses/ files, and reviews/reviewer-template.md. Label Cursor-only output advisory/reference.
`);
  try {
    assert(messages(validatePackageRoot(root)).some((message) => message.includes("Cursor rule must be requestable, not always applied")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reports missing Cursor host guide", () => {
  const root = makeFixture({
    packagePatch: {
      packageCandidates: BASE_PACKAGE.packageCandidates.filter((candidate) => candidate !== "docs/hosts/cursor.md")
    }
  });
  try {
    assert(messages(validatePackageRoot(root)).some((message) => message.includes("Cursor host guide is not included in package candidates")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reports Cursor adapter missing advisory workflow references", () => {
  const root = makeFixture();
  write(root, ".cursor/rules/lens-temper.mdc", `---
description: Use when the user asks Cursor for an advisory LensTemper review.
alwaysApply: false
---

# LensTemper Cursor Advisory Adapter

General LensTemper reminder.
`);
  try {
    assert(messages(validatePackageRoot(root)).some((message) => message.includes("Cursor adapter missing required advisory reference")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reports Cursor host guide missing execution details", () => {
  const root = makeFixture();
  write(root, "docs/hosts/cursor.md", `# Cursor Host Guide

Cursor support is advisory/reference. Cursor Background Agents remain an experiment until fresh reviewer isolation and artifact validation are verified with validate-review-fixtures.mjs.
`);
  try {
    assert(messages(validatePackageRoot(root)).some((message) => message.includes("Cursor host guide missing required advisory guidance")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reports missing package candidates", () => {
  const root = makeFixture({
    packagePatch: {
      packageCandidates: [
        ...BASE_PACKAGE.packageCandidates,
        "missing-public-doc.md"
      ]
    }
  });
  try {
    assert(messages(validatePackageRoot(root)).some((message) => message.includes("package candidate does not exist")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reports disallowed files under package candidate directories", () => {
  const root = makeFixture();
  write(root, "reviews/archive/run/ledger.json", "{}\n");
  try {
    assert(messages(validatePackageRoot(root)).some((message) => message.includes("package candidate expands to host cache or local artifact")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reports manifest target support drift", () => {
  const root = makeFixture({
    packagePatch: {
      manifestTargets: BASE_PACKAGE.manifestTargets.map((target) => target.host === "cursor" ? { ...target, support: "advisory" } : target)
    }
  });
  try {
    assert(messages(validatePackageRoot(root)).some((message) => message.includes("manifest target support does not match host support matrix")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reports host cache or worktree package candidates", () => {
  const root = makeFixture({
    packagePatch: {
      packageCandidates: [
        ...BASE_PACKAGE.packageCandidates,
        ".claude/settings.local.json"
      ]
    }
  });
  try {
    assert(messages(validatePackageRoot(root)).some((message) => message.includes("package candidate includes host cache or local artifact")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reports Cursor skill junction package candidates", () => {
  const root = makeFixture({
    packagePatch: {
      packageCandidates: [
        ...BASE_PACKAGE.packageCandidates,
        ".cursor/skills/start-plan-review"
      ]
    }
  });
  try {
    assert(messages(validatePackageRoot(root)).some((message) => message.includes("package candidate includes host cache or local artifact")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reports missing skills and reviews packaging rule when skills reference reviews", () => {
  const root = makeFixture({
    packagePatch: {
      requiredSharedResources: []
    }
  });
  try {
    assert(messages(validatePackageRoot(root)).some((message) => message.includes("skills reference reviews but reviews are not declared")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
