import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { syncCodexPluginPayload } from "./sync-codex-plugin-payload.mjs";

function write(root, repoPath, content) {
  const fullPath = join(root, repoPath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content, "utf8");
}

test("syncs the complete Codex payload, including the host guide", () => {
  const root = mkdtempSync(join(tmpdir(), "lens-temper-sync-"));
  try {
    write(root, "lens-temper.package.json", `${JSON.stringify({ packageCandidates: ["reviews/"] })}\n`);
    write(root, ".codex-plugin/plugin.json", "{\"name\":\"lens-temper\"}\n");
    write(root, "assets/icon.txt", "icon\n");
    write(root, "skills/start-plan-review/SKILL.md", "skill\n");
    write(root, "docs/hosts/codex.md", "# Codex Host Guide\n");
    write(root, "reviews/README.md", "# Reviews\n");
    write(root, "plugins/lens-temper/stale.txt", "stale\n");

    syncCodexPluginPayload(root);

    for (const [source, packaged] of [
      [".codex-plugin/plugin.json", "plugins/lens-temper/.codex-plugin/plugin.json"],
      ["assets/icon.txt", "plugins/lens-temper/assets/icon.txt"],
      ["skills/start-plan-review/SKILL.md", "plugins/lens-temper/skills/start-plan-review/SKILL.md"],
      ["docs/hosts/codex.md", "plugins/lens-temper/docs/hosts/codex.md"],
      ["reviews/README.md", "plugins/lens-temper/reviews/README.md"]
    ]) {
      assert.equal(readFileSync(join(root, packaged), "utf8"), readFileSync(join(root, source), "utf8"));
    }
    assert.equal(existsSync(join(root, "plugins/lens-temper/stale.txt")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
