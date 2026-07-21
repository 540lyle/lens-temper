export const LENS_SELECTION_SCHEMA_VERSION = 2;
export const LENS_ADDITIONS_SCHEMA_VERSION = 1;

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[\u2010-\u2015_-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function phraseMatches(text, phrase) {
  const normalizedPhrase = normalizeText(phrase);
  if (!normalizedPhrase) return false;
  const pattern = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRegExp(normalizedPhrase)}(?=$|[^\\p{L}\\p{N}])`, "u");
  return pattern.test(text);
}

function normalizedTextWindows(value, maxWords = 80, overlapWords = 20) {
  const paragraphs = String(value || "")
    .split(/\r?\n\s*\r?\n|\r?\n(?=\s*(?:[-*+] |\d+[.)] ))/u)
    .map((part) => normalizeText(part))
    .filter(Boolean);
  const windows = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(" ");
    if (words.length <= maxWords) {
      windows.push(paragraph);
      continue;
    }
    const stride = maxWords - overlapWords;
    for (let start = 0; start < words.length; start += stride) {
      windows.push(words.slice(start, start + maxWords).join(" "));
      if (start + maxWords >= words.length) break;
    }
  }
  return windows;
}

function matchRule(windows, rule) {
  for (const window of windows) {
    if ((rule.except_any || []).some((candidate) => phraseMatches(window, candidate))) continue;
    if (Array.isArray(rule.any_of)) {
      const phrase = rule.any_of.find((candidate) => phraseMatches(window, candidate));
      if (phrase) return { rule: rule.id, phrase };
    }
    if (Array.isArray(rule.all_of)) {
      const phrases = rule.all_of.map((group) => group.find((candidate) => phraseMatches(window, candidate)));
      if (phrases.every(Boolean)) return { rule: rule.id, phrase: phrases.join(" + ") };
    }
  }
  return null;
}

export function orderedKnownLenses(registry, values) {
  const requested = new Set(values);
  return registry.lenses.map((entry) => entry.id).filter((id) => requested.has(id));
}

export function validateLensIds(registry, values, field, options = {}) {
  if (!Array.isArray(values) || (!options.allowEmpty && values.length === 0)) {
    throw new Error(`${field} must contain at least one lens id`);
  }
  const known = new Set(registry.lenses.map((entry) => entry.id));
  const seen = new Set();
  for (const value of values) {
    if (typeof value !== "string" || !known.has(value)) throw new Error(`${field} contains unknown lens ${value}`);
    if (seen.has(value)) throw new Error(`${field} contains duplicate lens ${value}`);
    seen.add(value);
  }
}

export function evaluateLensPolicy(policy, registry, reviewInput, targetText) {
  const sources = [
    ["feature_request", reviewInput.feature_request],
    ["relevant_context", reviewInput.relevant_context],
    ["constraints", reviewInput.constraints],
    ["previous_adjudications", reviewInput.previous_adjudications],
    ["target", targetText]
  ].map(([source, value]) => ({
    source,
    text: normalizeText(value),
    windows: normalizedTextWindows(value)
  }));
  const selected = new Set();
  const matchedDomains = [];
  for (const domain of policy.domains) {
    validateLensIds(registry, domain.lenses, `policy domain ${domain.id}`);
    for (const source of sources) {
      const ruleMatch = (domain.rules || []).map((rule) => matchRule(source.windows, rule)).find(Boolean);
      const phrase = (domain.phrases || []).find((candidate) => phraseMatches(source.text, candidate));
      if (!phrase && !ruleMatch) continue;
      domain.lenses.forEach((lens) => selected.add(lens));
      matchedDomains.push({
        domain: domain.id,
        source: source.source,
        phrase: ruleMatch?.phrase || phrase,
        ...(ruleMatch ? { rule: ruleMatch.rule } : {}),
        lenses: domain.lenses
      });
      break;
    }
  }
  return {
    matchedDomains,
    deterministicLenses: orderedKnownLenses(registry, selected)
  };
}

export function validateLensSelectionShape(record, registry) {
  const failures = [];
  if (!record || record.schema_version !== LENS_SELECTION_SCHEMA_VERSION) failures.push(`schema_version must be ${LENS_SELECTION_SCHEMA_VERSION}`);
  if (record?.status !== "resolved") failures.push("status must be resolved");
  for (const field of ["pass_id", "target_path", "target_revision", "review_input_revision", "policy_path", "policy_revision", "mode"]) {
    if (!String(record?.[field] || "").trim()) failures.push(`${field} must be a non-empty string`);
  }
  const modes = new Set(["explicit", "all_lenses", "deterministic", "deterministic_plus_llm_additions", "core_profile", "core_profile_plus_llm_additions", "conservative_fallback"]);
  if (!modes.has(record?.mode)) failures.push(`unknown selection mode ${record?.mode}`);
  try {
    validateLensIds(registry, record?.selected_lenses, "selected_lenses");
    validateLensIds(registry, record?.deterministic_lenses, "deterministic_lenses");
  } catch (error) {
    failures.push(error.message);
  }
  if (!Array.isArray(record?.matched_domains)) failures.push("matched_domains must be an array");
  if (record?.review_input_path !== null && !String(record?.review_input_path || "").trim()) failures.push("review_input_path must be a non-empty string or null");
  const deterministic = new Set(record?.deterministic_lenses || []);
  const additions = record?.llm_additions || [];
  if (!Array.isArray(additions)) failures.push("llm_additions must be an array");
  const merged = new Set(deterministic);
  for (const [index, addition] of (Array.isArray(additions) ? additions : []).entries()) {
    try {
      validateLensIds(registry, [addition?.lens], `llm_additions[${index}]`);
    } catch (error) {
      failures.push(error.message);
    }
    if (deterministic.has(addition?.lens)) failures.push(`llm_additions[${index}] duplicates a deterministic lens`);
    else if (merged.has(addition?.lens)) failures.push(`llm_additions[${index}] duplicates another addition`);
    if (!String(addition?.reason || "").trim() || !String(addition?.evidence || "").trim()) {
      failures.push(`llm_additions[${index}] requires reason and evidence`);
    }
    merged.add(addition?.lens);
  }
  const expectedOrder = orderedKnownLenses(registry, merged);
  if (JSON.stringify(record?.selected_lenses || []) !== JSON.stringify(expectedOrder)) {
    failures.push("selected_lenses must equal deterministic_lenses plus llm_additions in registry order");
  }
  const allIds = registry.lenses.map((entry) => entry.id);
  if (["all_lenses", "conservative_fallback"].includes(record?.mode) && JSON.stringify(record?.deterministic_lenses) !== JSON.stringify(allIds)) {
    failures.push(`${record.mode} must select the complete registry as its deterministic set`);
  }
  if (record?.mode === "deterministic_plus_llm_additions" && additions.length === 0) failures.push("deterministic_plus_llm_additions requires at least one addition");
  if (record?.mode === "core_profile_plus_llm_additions" && additions.length === 0) failures.push("core_profile_plus_llm_additions requires at least one addition");
  if (!["deterministic_plus_llm_additions", "core_profile_plus_llm_additions"].includes(record?.mode) && additions.length > 0) failures.push(`${record.mode} cannot contain LLM additions`);
  if ((record?.llm_proposal_path === null) !== (record?.llm_proposal_revision === null)) failures.push("LLM proposal path and revision must be supplied together");
  if (["deterministic_plus_llm_additions", "core_profile_plus_llm_additions"].includes(record?.mode) && !record.llm_proposal_path) failures.push("LLM additions require a bound proposal path");
  if (["core_profile", "core_profile_plus_llm_additions"].includes(record?.mode)) {
    const profile = (registry.core_profiles || []).find((entry) => entry.id === record.core_profile_id);
    if (!profile) failures.push("core_profile_id must reference a known registry core profile");
    else for (const lens of profile.required_lens_ids || []) {
      if (!deterministic.has(lens)) failures.push(`deterministic_lenses must include core profile lens ${lens}`);
    }
  } else if (record?.core_profile_id !== undefined) {
    failures.push(`${record.mode} cannot contain core_profile_id`);
  }
  return failures;
}
