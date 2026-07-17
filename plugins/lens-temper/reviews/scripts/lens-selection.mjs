import { computeArtifactSha, readJsonFile, readTextFile, resolveReviewInput } from "./validation-helpers.mjs";
import {
  evaluateLensPolicy,
  LENS_ADDITIONS_SCHEMA_VERSION,
  LENS_SELECTION_SCHEMA_VERSION,
  orderedKnownLenses,
  validateLensIds,
  validateLensSelectionShape
} from "./lens-selection-contract.mjs";

export { LENS_ADDITIONS_SCHEMA_VERSION, LENS_SELECTION_SCHEMA_VERSION } from "./lens-selection-contract.mjs";

export function loadLensSelectionPolicy(root, registry) {
  const path = "reviews/manifests/lens-selection.json";
  const policy = readJsonFile(`${root}/${path}`);
  if (policy.schema_version !== "1.0" || !Array.isArray(policy.domains) || policy.domains.length === 0) {
    throw new Error("invalid lens-selection policy");
  }
  const ids = new Set();
  for (const [index, domain] of policy.domains.entries()) {
    if (!domain || typeof domain.id !== "string" || !domain.id.trim()) throw new Error(`policy domain ${index} requires an id`);
    if (ids.has(domain.id)) throw new Error(`duplicate policy domain ${domain.id}`);
    ids.add(domain.id);
    if (!Array.isArray(domain.lenses) || domain.lenses.length === 0) throw new Error(`policy domain ${domain.id} requires lenses`);
    validateLensIds(registry, domain.lenses, `policy domain ${domain.id}`);
    if (!Array.isArray(domain.phrases) || domain.phrases.length === 0 || domain.phrases.some((phrase) => typeof phrase !== "string" || !phrase.trim())) {
      throw new Error(`policy domain ${domain.id} requires non-empty phrases`);
    }
  }
  return { path, revision: computeArtifactSha(root, path), policy };
}

export function loadLensAdditions(root, repoPath, registry) {
  if (!repoPath) return { path: null, revision: null, additions: [] };
  const record = readJsonFile(`${root}/${repoPath}`);
  if (record.schema_version !== LENS_ADDITIONS_SCHEMA_VERSION || !Array.isArray(record.additions)) {
    throw new Error("lens proposal must use schema_version 1 and an additions array");
  }
  const unsupportedRecordFields = Object.keys(record).filter((field) => !["schema_version", "additions"].includes(field));
  if (unsupportedRecordFields.length > 0) throw new Error(`lens proposal contains unsupported fields: ${unsupportedRecordFields.join(", ")}`);
  const additions = record.additions.map((entry, index) => {
    if (!entry || typeof entry !== "object") throw new Error(`lens proposal addition ${index} must be an object`);
    const unsupportedEntryFields = Object.keys(entry).filter((field) => !["lens", "reason", "evidence"].includes(field));
    if (unsupportedEntryFields.length > 0) throw new Error(`lens proposal addition ${index} contains unsupported fields: ${unsupportedEntryFields.join(", ")}`);
    const lens = String(entry.lens || "").trim();
    validateLensIds(registry, [lens], `lens proposal addition ${index}`);
    const reason = String(entry.reason || "").trim();
    const evidence = String(entry.evidence || "").trim();
    if (!reason || !evidence) throw new Error(`lens proposal addition ${index} requires reason and evidence`);
    return { lens, reason, evidence };
  });
  const ids = additions.map((entry) => entry.lens);
  if (new Set(ids).size !== ids.length) throw new Error("lens proposal contains duplicate lens additions");
  return { path: repoPath, revision: computeArtifactSha(root, repoPath), additions };
}

export function validateLensSelectionRecord(root, record, registry, expected = {}, options = {}) {
  const failures = validateLensSelectionShape(record, registry);
  for (const [field, value] of Object.entries(expected)) {
    if (value !== undefined && value !== null && record?.[field] !== value) failures.push(`${field} does not match the run contract`);
  }
  try {
    if (record?.policy_path !== "reviews/manifests/lens-selection.json") failures.push("policy_path must reference the canonical policy");
    else if (record.policy_revision !== computeArtifactSha(root, record.policy_path)) failures.push("policy_revision is stale");
    if (record?.llm_proposal_path) {
      if (record.llm_proposal_revision !== computeArtifactSha(root, record.llm_proposal_path)) failures.push("llm_proposal_revision is stale");
      const proposal = loadLensAdditions(root, record.llm_proposal_path, registry);
      if (JSON.stringify(record.llm_additions) !== JSON.stringify(proposal.additions)) failures.push("llm_additions do not match the bound proposal");
    }
    if (options.replay !== false && ["deterministic", "deterministic_plus_llm_additions"].includes(record?.mode)) {
      if (!record.review_input_path && expected.review_input_path) {
        failures.push("automatic selection requires review_input_path for deterministic replay");
      } else if (record.review_input_path) {
        const reviewInput = resolveReviewInput(root, { reviewInput: record.review_input_path });
        const policy = loadLensSelectionPolicy(root, registry);
        const replay = evaluateLensPolicy(policy.policy, registry, reviewInput.record, readTextFile(`${root}/${record.target_path}`));
        if (JSON.stringify(record.deterministic_lenses) !== JSON.stringify(replay.deterministicLenses)) failures.push("deterministic_lenses do not match policy replay");
        if (JSON.stringify(record.matched_domains) !== JSON.stringify(replay.matchedDomains)) failures.push("matched_domains do not match policy replay");
      }
    }
    if (options.replay !== false && ["core_profile", "core_profile_plus_llm_additions"].includes(record?.mode)) {
      const profile = (registry.core_profiles || []).find((entry) => entry.id === record.core_profile_id);
      if (!profile) failures.push("core_profile_id must reference a known registry core profile");
      else if (record.review_input_path) {
        const reviewInput = resolveReviewInput(root, { reviewInput: record.review_input_path });
        const policy = loadLensSelectionPolicy(root, registry);
        const replay = evaluateLensPolicy(policy.policy, registry, reviewInput.record, readTextFile(`${root}/${record.target_path}`));
        const expected = orderedKnownLenses(registry, new Set([...profile.required_lens_ids, ...replay.deterministicLenses]));
        if (JSON.stringify(record.deterministic_lenses) !== JSON.stringify(expected)) failures.push("deterministic_lenses do not match core-profile policy replay");
        if (JSON.stringify(record.matched_domains) !== JSON.stringify(replay.matchedDomains)) failures.push("matched_domains do not match policy replay");
      }
    }
  } catch (error) {
    failures.push(error.message);
  }
  return failures;
}

export function selectLenses({
  root,
  registry,
  reviewInput,
  reviewInputPath = null,
  targetPath,
  targetRevision,
  explicitLenses = null,
  allLenses = false,
  fallback = null,
  coreProfileId = null,
  proposalPath = null,
  passId = "selection"
}) {
  if (explicitLenses && allLenses) throw new Error("--lens cannot be combined with --all-lenses");
  if (explicitLenses && proposalPath) throw new Error("--lens cannot be combined with --lens-proposal");
  if (explicitLenses && fallback) throw new Error("--lens cannot be combined with --selection-fallback");
  if (allLenses && proposalPath) throw new Error("--all-lenses cannot be combined with --lens-proposal");
  if (allLenses && fallback) throw new Error("--all-lenses cannot be combined with --selection-fallback");
  if (explicitLenses && coreProfileId) throw new Error("--lens cannot be combined with --core-profile");
  if (allLenses && coreProfileId) throw new Error("--all-lenses cannot be combined with --core-profile");
  if (fallback && coreProfileId) throw new Error("--selection-fallback cannot be combined with --core-profile");
  if (fallback && fallback !== "all") throw new Error("--selection-fallback must be all when supplied");

  const policy = loadLensSelectionPolicy(root, registry);
  const allIds = registry.lenses.map((entry) => entry.id);
  let mode;
  let deterministicLenses;
  let matchedDomains = [];
  let proposal = { path: null, revision: null, additions: [] };

  if (explicitLenses) {
    validateLensIds(registry, explicitLenses, "--lens");
    mode = "explicit";
    deterministicLenses = orderedKnownLenses(registry, explicitLenses);
  } else if (allLenses) {
    mode = "all_lenses";
    deterministicLenses = allIds;
  } else {
    const evaluated = evaluateLensPolicy(policy.policy, registry, reviewInput, readTextFile(`${root}/${targetPath}`));
    matchedDomains = evaluated.matchedDomains;
    if (coreProfileId) {
      const profile = (registry.core_profiles || []).find((entry) => entry.id === coreProfileId);
      if (!profile || !Array.isArray(profile.required_lens_ids) || profile.required_lens_ids.length === 0) throw new Error(`unknown or invalid core profile ${coreProfileId}`);
      validateLensIds(registry, profile.required_lens_ids, `core profile ${coreProfileId}`);
      deterministicLenses = orderedKnownLenses(registry, new Set([...profile.required_lens_ids, ...evaluated.deterministicLenses]));
      proposal = loadLensAdditions(root, proposalPath, registry);
      mode = proposal.additions.length > 0 ? "core_profile_plus_llm_additions" : "core_profile";
    } else {
      deterministicLenses = evaluated.deterministicLenses;
    }
    if (!coreProfileId && deterministicLenses.length === 0) {
      if (fallback === "all") {
        mode = "conservative_fallback";
        deterministicLenses = allIds;
        proposal = { path: null, revision: null, additions: [] };
      } else {
        return {
          schema_version: LENS_SELECTION_SCHEMA_VERSION,
          status: "needs_clarification",
          pass_id: passId,
          target_path: targetPath,
          target_revision: targetRevision,
          review_input_path: reviewInputPath,
          review_input_revision: reviewInput.revision,
          policy_path: policy.path,
          policy_revision: policy.revision,
          clarification_question: policy.policy.clarification_question,
          matched_domains: [],
          deterministic_lenses: [],
          llm_additions: [],
          selected_lenses: []
        };
      }
    } else if (!coreProfileId) {
      proposal = loadLensAdditions(root, proposalPath, registry);
      mode = proposal.additions.length > 0 ? "deterministic_plus_llm_additions" : "deterministic";
    }
  }

  const selected = new Set(deterministicLenses);
  for (const addition of proposal.additions) selected.add(addition.lens);
  const result = {
    schema_version: LENS_SELECTION_SCHEMA_VERSION,
    status: "resolved",
    pass_id: passId,
    target_path: targetPath,
    target_revision: targetRevision,
    review_input_path: reviewInputPath,
    review_input_revision: reviewInput.revision,
    policy_path: policy.path,
    policy_revision: policy.revision,
    mode,
    ...(coreProfileId ? { core_profile_id: coreProfileId } : {}),
    matched_domains: matchedDomains,
    deterministic_lenses: deterministicLenses,
    llm_proposal_path: proposal.path,
    llm_proposal_revision: proposal.revision,
    llm_additions: proposal.additions,
    selected_lenses: orderedKnownLenses(registry, selected)
  };
  const failures = validateLensSelectionRecord(root, result, registry, {
    pass_id: passId,
    target_path: targetPath,
    target_revision: targetRevision,
    review_input_path: reviewInputPath,
    review_input_revision: reviewInput.revision
  }, { replay: false });
  if (failures.length > 0) throw new Error(`invalid generated lens selection: ${failures.join("; ")}`);
  return result;
}
