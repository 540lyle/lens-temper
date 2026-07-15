import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const archiveRoot = "reviews/archive/.tmp-archive-review-run-test";

test("archive rewrites run artifacts to archive-local paths", () => {
  rmSync(resolve(repoRoot, archiveRoot), { recursive: true, force: true });
  try {
    const output = execFileSync(process.execPath, [
      "reviews/scripts/archive-review-run.mjs",
      "--ledger", "reviews/examples/review-ledger.valid-detached-completed.json",
      "--archive-root", archiveRoot
    ], { cwd: repoRoot, encoding: "utf8" });
    const match = output.match(/archived (\S+)/);
    assert.ok(match);
    const runPath = match[1];
    const ledger = JSON.parse(readFileSync(resolve(repoRoot, runPath, "ledger.json"), "utf8"));
    assert.equal(ledger.review_input_path, `${runPath}/review-input.json`);
    assert.equal(ledger.events_path, `${runPath}/events.jsonl`);
    assert.ok(ledger.review_record_artifacts.every((entry) => entry.artifact_path.startsWith(`${runPath}/reviews/`)));
    assert.ok(ledger.synthesis_record_artifacts.every((entry) => entry.artifact_path.startsWith(`${runPath}/synthesis/`)));
    for (const entry of [...ledger.review_record_artifacts, ...ledger.synthesis_record_artifacts]) {
      assert.equal(existsSync(resolve(repoRoot, entry.artifact_path)), true, basename(entry.artifact_path));
    }
  } finally {
    rmSync(resolve(repoRoot, archiveRoot), { recursive: true, force: true });
  }
});
