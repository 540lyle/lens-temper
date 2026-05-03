export const CONTRACT_VERSION = "1.0.0";
export const SCHEMA_VERSION = 1;

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
  "manual_or_imported"
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
  "execution_mode",
  "status",
  "artifact_path",
  "verdict",
  "material_blockers",
  "cross_cutting_status",
  "scorecard"
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
  "included_review_record_ids",
  "superseded_review_record_ids",
  "finding_decisions",
  "lens_lock_decisions",
  "final_assessment",
  "artifact_path",
  "markdown_artifact_path",
  "markdown_artifact_sha"
];

export const LEDGER_REQUIRED_FIELDS = [
  "schema_version",
  "pass_id",
  "target_path",
  "target_revision",
  "status",
  "execution_mode",
  "selected_lenses",
  "current_review_record_ids",
  "superseded_review_record_ids",
  "synthesis_record_ids",
  "archive_paths",
  "artifact_visibility",
  "review_record_artifacts",
  "synthesis_record_artifacts"
];

export const SCHEMA_CONTRACTS = {
  "review-output.schema.json": {
    required: REVIEW_REQUIRED_FIELDS,
    conditionalRequired: {
      completed: REVIEW_COMPLETED_REQUIRED_FIELDS
    },
    enums: {
      verdict: REVIEW_VERDICTS,
      execution_mode: EXECUTION_MODES,
      status: REVIEW_STATUSES
    },
    nestedRequired: {
      material_blockers: ["present", "summary", "count"],
      cross_cutting_status: CROSS_CUTTING_KEYS,
      scorecard: SCORECARD_KEYS
    },
    nestedEnums: {
      cross_cutting_status: CROSS_CUTTING_STATUS_VALUES
    }
  },
  "synthesis-output.schema.json": {
    required: SYNTHESIS_REQUIRED_FIELDS,
    enums: {
      final_assessment: FINAL_ASSESSMENTS
    },
    arrayItemRequired: {
      finding_decisions: ["finding_id", "source_lens", "source_review_record_id", "decision", "affects_rerun_scope", "reason"],
      lens_lock_decisions: ["lens", "lock_state", "rerun_needed", "reason"]
    },
    arrayItemEnums: {
      "finding_decisions.decision": FINDING_DECISIONS,
      "finding_decisions.severity": FINDING_SEVERITIES,
      "lens_lock_decisions.lock_state": LOCK_STATES
    }
  },
  "review-ledger.schema.json": {
    required: LEDGER_REQUIRED_FIELDS,
    enums: {
      status: LEDGER_STATUSES,
      execution_mode: EXECUTION_MODES,
      artifact_visibility: ARTIFACT_VISIBILITY
    },
    arrayItemRequired: {
      review_record_artifacts: ["record_id", "artifact_path"],
      synthesis_record_artifacts: ["record_id", "artifact_path"]
    }
  }
};
