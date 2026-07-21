export const CONTRACT_VERSION = "4.1.0";
export const SCHEMA_VERSION = 2;
export const LEDGER_SCHEMA_VERSION = 3;
export const COMPLETION_SUMMARY_SCHEMA_VERSION = 3;

export const EXIT_CODES = {
  ok: 0,
  validation: 1,
  usage: 2,
  read: 3,
  stale: 4,
  internal: 5
};

export const SCORECARD_KEYS = [
  "correctness",
  "completeness",
  "risk_awareness",
  "testability",
  "maintainability",
  "ship_readiness"
];

export const CROSS_CUTTING_KEYS = [
  "security_privacy",
  "accessibility",
  "performance",
  "reliability_rollback",
  "observability_debuggability",
  "compatibility_platform"
];

export const CROSS_CUTTING_STATUS_VALUES = [
  "not_applicable",
  "non_blocking",
  "material_issue"
];

export const REVIEW_VERDICTS = [
  "Strong",
  "Usable with fixes",
  "High risk",
  "Incomplete"
];

export const FINAL_ASSESSMENTS = [
  "Ready to implement",
  "Ready with minor clarifications",
  "Needs revision",
  "Not implementation-ready"
];

export const EXECUTION_MODES = [
  "fresh_spawned_lens_reviewers",
  "fresh_spawned_orchestrator",
  "manual_or_imported"
];

export const TRACE_EVENT_NAMES = [
  "orchestrator_started",
  "ledger_created",
  "lens_selection_created",
  "prompt_packet_created",
  "spawn_prompt_created",
  "reviewer_spawned",
  "reviewer_completed",
  "reviewer_closed",
  "validation_passed",
  "synthesis_completed",
  "rerun_selected",
  "archive_written",
  "completion_reported"
];

export const RUN_MODES = [
  "full",
  "inline",
  "advisory"
];

export const RUN_SCOPES = [
  "core_profile",
  "selected_lenses"
];

export const PROVENANCE_BASIS_VALUES = [
  "direct_workspace_read",
  "provided_packet",
  "imported_archive",
  "fixture"
];

export const CLAIM_FLAG_KEYS = [
  "completion",
  "lock_state",
  "all_5_lockable",
  "review_complete"
];

export const SCORE_CHALLENGE_KEYS = [
  "would_make_this_a_4",
  "why_not_present",
  "evidence_no_material_issue"
];

export const REVIEW_STATUSES = [
  "completed",
  "error",
  "superseded",
  "stale"
];

export const LEDGER_STATUSES = [
  "active",
  "completed",
  "error",
  "superseded",
  "stale"
];

export const LOCK_STATES = [
  "active",
  "failing",
  "passing_locked",
  "rerun_required",
  "converged_locked",
  "not_affected",
  "superseded",
  "error"
];

export const FINDING_DECISIONS = [
  "accepted",
  "rejected",
  "downgraded",
  "deferred"
];

export const FINDING_SEVERITIES = [
  "critical",
  "major",
  "minor"
];

export const ARTIFACT_VISIBILITY = [
  "public_safe",
  "private_local_only"
];

export const LENS_IDS = [
  "architecture",
  "implementation",
  "risk",
  "security",
  "test-strategy",
  "product-ux",
  "data-model",
  "natty"
];

export const LENS_SELECTION_REQUIRED_FIELDS = [
  "schema_version",
  "status",
  "pass_id",
  "target_path",
  "target_revision",
  "review_input_path",
  "review_input_revision",
  "policy_path",
  "policy_revision",
  "matched_domains",
  "deterministic_lenses",
  "llm_additions",
  "selected_lenses"
];

export const LENS_ADDITIONS_REQUIRED_FIELDS = ["schema_version", "additions"];

export const COMPLETION_SUMMARY_REQUIRED_FIELDS = [
  "schema_version",
  "run_mode",
  "run_scope",
  "target_path",
  "target_revision",
  "claim_flags",
  "summary_text"
];

export const REQUIRED_MARKDOWN_SECTIONS = {
  review: [
    "### Provenance",
    "### Verdict",
    "### What the Plan Gets Right",
    "### Gaps and Risks",
    "### Recommended Changes",
    "### Open Questions",
    "### Cross-Cutting Sweep",
    "### Stateful Workflow Sweep",
    "### Scorecard"
  ],
  synthesis: [
    "### Consolidated Critique",
    "### Synthesis Decisions",
    "### Reviewer Conflicts",
    "### Scorecard Reconciliation",
    "### Cross-Cutting Coverage",
    "### Lens Lock And Rerun Decisions",
    "### Recommended Plan Changes",
    "### Unresolved Questions",
    "### Final Assessment"
  ],
  final: [
    "Final assessment",
    "Target",
    "Artifact storage",
    "Verification evidence"
  ]
};

export const REVIEW_REQUIRED_FIELDS = [
  "schema_version",
  "record_id",
  "pass_id",
  "target_path",
  "target_revision",
  "template_revision",
  "lens",
  "lens_revision",
  "attempt",
  "run_mode",
  "execution_mode",
  "status",
  "artifact_path",
  "provenance",
  "verdict",
  "material_blockers",
  "cross_cutting_status",
  "scorecard"
];

export const REVIEW_FULL_REQUIRED_FIELDS = [
  "review_input_revision"
];

export const REVIEW_COMPLETED_REQUIRED_FIELDS = [
  "markdown_artifact_path",
  "markdown_artifact_sha"
];

export const SYNTHESIS_REQUIRED_FIELDS = [
  "schema_version",
  "record_id",
  "pass_id",
  "target_path",
  "target_revision",
  "run_mode",
  "included_review_record_ids",
  "superseded_review_record_ids",
  "finding_decisions",
  "lens_lock_decisions",
  "claim_flags",
  "prior_material_findings_context",
  "final_assessment",
  "artifact_path",
  "markdown_artifact_path",
  "markdown_artifact_sha"
];

export const SYNTHESIS_FULL_REQUIRED_FIELDS = [
  "review_input_revision"
];

export const LEDGER_REQUIRED_FIELDS = [
  "schema_version",
  "pass_id",
  "target_path",
  "target_revision",
  "status",
  "run_mode",
  "run_scope",
  "execution_mode",
  "selected_lenses",
  "current_review_record_ids",
  "superseded_review_record_ids",
  "synthesis_record_ids",
  "archive_paths",
  "artifact_visibility",
  "completion_validation",
  "review_record_artifacts",
  "synthesis_record_artifacts"
];

export const LEDGER_FULL_REQUIRED_FIELDS = [
  "review_input_path",
  "review_input_revision",
  "lens_selection_path",
  "lens_selection_revision"
];

export const LEDGER_CORE_PROFILE_REQUIRED_FIELDS = [
  "core_profile_id",
  "required_lens_ids",
  "completed_lens_ids",
  "core_gate_passed"
];

export const COMPLETION_SUMMARY_FULL_REQUIRED_FIELDS = [
  "review_input_revision"
];

export const COMPLETION_SUMMARY_CORE_PROFILE_REQUIRED_FIELDS = [
  "core_profile_id",
  "required_lens_ids",
  "completed_lens_ids",
  "core_gate_passed"
];

export const REVIEW_INPUT_REQUIRED_FIELDS = [
  "schema_version",
  "feature_request",
  "relevant_context",
  "constraints",
  "previous_adjudications"
];

export const SCHEMA_CONTRACTS = {
  "lens-selection.schema.json": {
    required: LENS_SELECTION_REQUIRED_FIELDS,
    conditionalRequired: {
      "status.resolved": ["mode", "llm_proposal_path", "llm_proposal_revision"],
      "status.needs_clarification": ["clarification_question"]
    },
    enums: {
      status: ["resolved", "needs_clarification"],
      mode: ["explicit", "all_lenses", "deterministic", "deterministic_plus_llm_additions", "core_profile", "core_profile_plus_llm_additions", "conservative_fallback"]
    },
    arrayItemRequired: {
      matched_domains: ["domain", "source", "phrase", "lenses"],
      llm_additions: ["lens", "reason", "evidence"]
    },
    arrayItemEnums: {
      deterministic_lenses: LENS_IDS,
      "llm_additions.lens": LENS_IDS,
      selected_lenses: LENS_IDS
    }
  },
  "lens-additions.schema.json": {
    required: LENS_ADDITIONS_REQUIRED_FIELDS,
    arrayItemRequired: {
      additions: ["lens", "reason", "evidence"]
    },
    arrayItemEnums: {
      "additions.lens": LENS_IDS
    }
  },
  "review-output.schema.json": {
    required: REVIEW_REQUIRED_FIELDS,
    conditionalRequired: {
      completed: REVIEW_COMPLETED_REQUIRED_FIELDS,
      "run_mode.full": REVIEW_FULL_REQUIRED_FIELDS
    },
    enums: {
      verdict: REVIEW_VERDICTS,
      run_mode: RUN_MODES,
      execution_mode: EXECUTION_MODES,
      status: REVIEW_STATUSES
    },
    nestedRequired: {
      material_blockers: ["present", "summary", "count"],
      cross_cutting_status: CROSS_CUTTING_KEYS,
      scorecard: SCORECARD_KEYS,
      provenance: ["input_sources"]
    },
    nestedEnums: {
      cross_cutting_status: CROSS_CUTTING_STATUS_VALUES
    }
  },
  "synthesis-output.schema.json": {
    required: SYNTHESIS_REQUIRED_FIELDS,
    conditionalRequired: {
      "run_mode.full": SYNTHESIS_FULL_REQUIRED_FIELDS
    },
    enums: {
      final_assessment: FINAL_ASSESSMENTS,
      run_mode: RUN_MODES
    },
    arrayItemRequired: {
      finding_decisions: ["finding_id", "source_lens", "source_review_record_id", "decision", "affects_rerun_scope", "reason"],
      lens_lock_decisions: ["lens", "lock_state", "rerun_needed", "reason"],
      prior_material_findings_context: ["source_record_id", "finding_id", "source_target_path", "source_target_revision", "decision", "severity"]
    },
    arrayItemEnums: {
      "finding_decisions.decision": FINDING_DECISIONS,
      "finding_decisions.severity": FINDING_SEVERITIES,
      "lens_lock_decisions.lock_state": LOCK_STATES
    }
  },
  "review-ledger.schema.json": {
    required: LEDGER_REQUIRED_FIELDS,
    conditionalRequired: {
      "execution_mode.fresh_spawned_orchestrator": ["events_path"],
      "run_mode.full": LEDGER_FULL_REQUIRED_FIELDS,
      "run_scope.core_profile": LEDGER_CORE_PROFILE_REQUIRED_FIELDS
    },
    enums: {
      status: LEDGER_STATUSES,
      run_mode: RUN_MODES,
      run_scope: RUN_SCOPES,
      execution_mode: EXECUTION_MODES,
      artifact_visibility: ARTIFACT_VISIBILITY
    },
    nestedRequired: {
      completion_validation: ["validator_name", "validator_contract_version", "passed", "validated_review_record_ids", "failures"]
    },
    arrayItemRequired: {
      review_record_artifacts: ["record_id", "artifact_path"],
      synthesis_record_artifacts: ["record_id", "artifact_path"]
    }
  },
  "completion-summary.schema.json": {
    required: COMPLETION_SUMMARY_REQUIRED_FIELDS,
    conditionalRequired: {
      "run_mode.full": COMPLETION_SUMMARY_FULL_REQUIRED_FIELDS,
      "run_scope.core_profile": COMPLETION_SUMMARY_CORE_PROFILE_REQUIRED_FIELDS
    },
    enums: {
      run_mode: RUN_MODES,
      run_scope: RUN_SCOPES
    },
    nestedRequired: {
      claim_flags: CLAIM_FLAG_KEYS
    }
  },
  "review-input.schema.json": {
    required: REVIEW_INPUT_REQUIRED_FIELDS
  }
};
