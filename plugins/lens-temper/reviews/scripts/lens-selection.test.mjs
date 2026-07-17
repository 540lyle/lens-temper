import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { computeArtifactSha, readJsonFile, resolveReviewInput } from "./validation-helpers.mjs";
import { selectLenses, validateLensSelectionRecord } from "./lens-selection.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const archiveRoot = join(root, "reviews", "archive");
const registry = readJsonFile(join(root, "reviews", "registry.json"));

function repoPath(path) {
  return relative(root, path).replace(/\\/g, "/");
}

function withSelectionFiles(targetText, proposal, callback) {
  mkdirSync(archiveRoot, { recursive: true });
  const dir = mkdtempSync(join(archiveRoot, "lens-selection-test-"));
  const targetPath = repoPath(join(dir, "target.md"));
  writeFileSync(join(root, targetPath), targetText, "utf8");
  let proposalPath = null;
  if (proposal) {
    proposalPath = repoPath(join(dir, "proposal.json"));
    writeFileSync(join(root, proposalPath), `${JSON.stringify(proposal, null, 2)}\n`, "utf8");
  }
  try {
    return callback({ targetPath, proposalPath });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runSelection(targetText, featureRequest, options = {}) {
  return withSelectionFiles(targetText, options.proposal, ({ targetPath, proposalPath }) => {
    const result = selectLenses({
      root,
      registry,
      reviewInput: {
        feature_request: featureRequest,
        relevant_context: "No additional context supplied beyond the target plan.",
        constraints: "No additional constraints supplied.",
        previous_adjudications: options.previousAdjudications || "No previous adjudications supplied.",
        revision: "sha256:test"
      },
      targetPath,
      targetRevision: computeArtifactSha(root, targetPath),
      proposalPath,
      explicitLenses: options.explicitLenses ?? null,
      allLenses: options.allLenses ?? false,
      fallback: options.fallback ?? null,
      coreProfileId: options.coreProfileId ?? null,
      passId: "selection-test"
    });
    if (result.status === "resolved") {
      assert.deepEqual(validateLensSelectionRecord(root, result, registry, {
        pass_id: "selection-test",
        target_path: targetPath,
        target_revision: result.target_revision,
        review_input_revision: "sha256:test"
      }), []);
    }
    return result;
  });
}

test("phrase boundaries avoid substring false positives", () => {
  const result = runSelection("Internal fixture.", "Build an internal fixture.");
  assert.equal(result.status, "needs_clarification");
  assert.deepEqual(result.selected_lenses, []);
});

test("migration and cross-module rules select their complete deterministic bundles", () => {
  const migration = runSelection("Migration of stored records.", "Migrate saved records safely.");
  assert.deepEqual(migration.selected_lenses, ["implementation", "risk", "test-strategy", "data-model"]);
  const contract = runSelection("Change a cross-module contract.", "Update a shared contract.");
  assert.deepEqual(contract.selected_lenses, ["architecture", "implementation", "test-strategy"]);
});

test("user-facing workflow is a named evidence-producing domain", () => {
  const result = runSelection("Add a dialog with an error state.", "Change a user-facing workflow.");
  assert.deepEqual(result.selected_lenses, ["test-strategy", "product-ux"]);
  assert.equal(result.matched_domains.some((entry) => entry.domain === "user-facing-workflow"), true);
});

test("automatic selection inspects previous adjudications from the canonical input", () => {
  const result = runSelection("Internal fixture.", "Build an internal fixture.", {
    previousAdjudications: "A prior migration finding remains accepted and unresolved."
  });
  assert.deepEqual(result.selected_lenses, ["implementation", "risk", "test-strategy", "data-model"]);
  assert.equal(result.matched_domains.some((entry) => entry.source === "previous_adjudications"), true);
});

test("validated LLM proposals add lenses but cannot subtract the deterministic minimum", () => {
  const result = runSelection("Implementation plan for a utility.", "Implement a tooling change.", {
    proposal: {
      schema_version: 1,
      additions: [{
        lens: "product-ux",
        reason: "The utility introduces an operator decision.",
        evidence: "Target: the operator chooses whether to retry."
      }]
    }
  });
  assert.equal(result.mode, "deterministic_plus_llm_additions");
  assert.deepEqual(result.deterministic_lenses, ["implementation"]);
  assert.deepEqual(result.selected_lenses, ["implementation", "product-ux"]);
});

test("an LLM proposal cannot rescue a zero-match input", () => {
  const result = runSelection("Internal fixture.", "Build an internal fixture.", {
    proposal: {
      schema_version: 1,
      additions: [{ lens: "risk", reason: "Possible risk.", evidence: "Target mentions a fixture." }]
    }
  });
  assert.equal(result.status, "needs_clarification");
});

test("a proposal cannot re-add a deterministic lens", () => {
  assert.throws(() => runSelection("Implementation plan.", "Tooling change.", {
    proposal: {
      schema_version: 1,
      additions: [{ lens: "implementation", reason: "Add it.", evidence: "Target says implementation plan." }]
    }
  }), /duplicates a deterministic lens/);
});

test("selection validation rejects additions that differ from the bound proposal", () => {
  withSelectionFiles("Implementation plan.", {
    schema_version: 1,
    additions: [{ lens: "risk", reason: "Rollout concern.", evidence: "Target names a production rollout." }]
  }, ({ targetPath, proposalPath }) => {
    const result = selectLenses({
      root,
      registry,
      reviewInput: {
        feature_request: "Implement a tooling change.",
        relevant_context: "No additional context supplied beyond the target plan.",
        constraints: "No additional constraints supplied.",
        previous_adjudications: "No previous adjudications supplied.",
        revision: "sha256:test"
      },
      targetPath,
      targetRevision: computeArtifactSha(root, targetPath),
      proposalPath,
      passId: "proposal-binding-test"
    });
    result.llm_additions[0].evidence = "Substituted evidence.";
    assert.equal(validateLensSelectionRecord(root, result, registry).includes("llm_additions do not match the bound proposal"), true);
  });
});

test("selection validation replays automatic policy evidence", () => {
  const reviewInputPath = "reviews/examples/review-input.valid.json";
  const reviewInput = resolveReviewInput(root, { reviewInput: reviewInputPath });
  const targetPath = "reviews/evals/fixtures/deferred-restore-save-race.md";
  const result = selectLenses({
    root,
    registry,
    reviewInput: { ...reviewInput.record, revision: reviewInput.revision },
    reviewInputPath,
    targetPath,
    targetRevision: computeArtifactSha(root, targetPath),
    passId: "policy-replay-test"
  });
  result.matched_domains = [];
  result.deterministic_lenses = ["implementation"];
  result.selected_lenses = ["implementation"];
  const failures = validateLensSelectionRecord(root, result, registry, {
    review_input_path: reviewInputPath
  });
  assert.equal(failures.includes("deterministic_lenses do not match policy replay"), true);
  assert.equal(failures.includes("matched_domains do not match policy replay"), true);
});

test("explicit and conservative all-lens modes are deterministic", () => {
  const explicit = runSelection("Migration and user-facing dialog.", "Broad change.", {
    explicitLenses: ["risk"]
  });
  assert.equal(explicit.mode, "explicit");
  assert.deepEqual(explicit.selected_lenses, ["risk"]);
  const fallback = runSelection("Internal fixture.", "Build an internal fixture.", { fallback: "all" });
  assert.equal(fallback.mode, "conservative_fallback");
  assert.deepEqual(fallback.selected_lenses, registry.lenses.map((entry) => entry.id));
});

test("standard-v2 selects seven core lenses and triggers Natty only for an LLM authority boundary", () => {
  const ordinary = runSelection("Internal implementation plan.", "Implement a tooling change.", {
    coreProfileId: "standard-v2"
  });
  assert.equal(ordinary.mode, "core_profile");
  assert.equal(ordinary.selected_lenses.length, 7);
  assert.equal(ordinary.selected_lenses.includes("security"), true);
  assert.equal(ordinary.selected_lenses.includes("natty"), false);

  const llmBoundary = runSelection(
    "Use LLM generated structured output to choose a tool route.",
    "Add a natural language command.",
    { coreProfileId: "standard-v2" }
  );
  assert.equal(llmBoundary.selected_lenses.length, 8);
  assert.equal(llmBoundary.selected_lenses.includes("natty"), true);
  assert.equal(llmBoundary.matched_domains.some((entry) => entry.domain === "llm-authority-boundary"), true);
});

test("lens manifests reference the canonical policy without duplicated trigger lists", () => {
  const policy = readJsonFile(join(root, "reviews", "manifests", "lens-selection.json"));
  const domains = new Map(policy.domains.map((domain) => [domain.id, new Set(domain.lenses)]));
  for (const lens of registry.lenses) {
    const manifest = readJsonFile(join(root, lens.manifest_path));
    assert.equal(Object.hasOwn(manifest, "default_selection_triggers"), false);
    assert.equal(Array.isArray(manifest.selection_domains), true);
    for (const domainId of manifest.selection_domains) {
      assert.equal(domains.has(domainId), true, `${lens.id} references unknown domain ${domainId}`);
      assert.equal(domains.get(domainId).has(lens.id), true, `${domainId} does not select ${lens.id}`);
    }
  }
  for (const [domainId, lensIds] of domains) {
    for (const lensId of lensIds) {
      const manifestPath = registry.lenses.find((entry) => entry.id === lensId)?.manifest_path;
      assert.ok(manifestPath, `${domainId} references unknown lens ${lensId}`);
      const manifest = readJsonFile(join(root, manifestPath));
      assert.equal(manifest.selection_domains.includes(domainId), true, `${lensId} omits ${domainId}`);
    }
  }
  const lensIds = registry.lenses.map((entry) => entry.id);
  const selectionSchema = readJsonFile(join(root, "reviews", "schemas", "lens-selection.schema.json"));
  const additionsSchema = readJsonFile(join(root, "reviews", "schemas", "lens-additions.schema.json"));
  assert.deepEqual(selectionSchema.properties.deterministic_lenses.items.enum, lensIds);
  assert.deepEqual(selectionSchema.properties.selected_lenses.items.enum, lensIds);
  assert.deepEqual(selectionSchema.properties.llm_additions.items.properties.lens.enum, lensIds);
  assert.deepEqual(additionsSchema.properties.additions.items.properties.lens.enum, lensIds);
});
