# Review Lens: Data Model

Evaluate the plan from a data modeling, schema, and storage perspective. Focus on whether the data design supports the feature correctly and whether changes can be deployed safely.

## Focus Areas

- Schema changes
- Data migration strategy and safety
- Backward compatibility of data changes
- Storage and query performance implications
- Data validation and integrity enforcement
- Relationship modeling
- Data lifecycle
- Contract stability
- Caching and consistency model
- Multi-tenancy or isolation concerns

## Key Questions

- Does the plan specify what data-shape changes are required?
- Is there a migration strategy, and is it reversible?
- Can the migration run safely on production data?
- Are new fields nullable or defaulted safely for existing rows?
- Does the plan introduce redundant or denormalized data, and if so, how is consistency maintained?
- Are data contracts versioned or backward-compatible?
- Does the plan account for data validation at the boundary and integrity at the storage layer?
- Are indexes and query patterns considered for performance at realistic data volumes?

## Red Flags

Apply the materiality gate before lowering a score: would this data-model issue justify changing the plan before implementation? If not, record it as non-blocking polish and do not let it prevent a `5/5`. Treat the list below as examples of issues to watch for, not a checklist that must produce findings.

Flag and classify as `[critical]`, `[major]`, or `[minor]`:
- Schema changes with no migration plan
- Non-reversible migrations with no rollback strategy
- New required columns on populated tables with no default or backfill plan
- Missing indexes on columns that will be queried or filtered frequently
- Denormalized data with no consistency mechanism
- Breaking changes to API contracts or event schemas with no versioning
- Data validation only in the UI layer
- No consideration of production data volume during migration
- Implicit assumptions about data shape that are not enforced by schema
- Missing soft-delete or archival strategy for user-facing data where relevant

## Reviewer Bias

When two approaches are roughly equivalent, prefer:
- Explicit schema definitions over implicit data shapes
- Reversible migrations over one-way changes
- Additive schema changes over destructive ones
- Validation at the storage boundary, not just the UI
- Backward-compatible contract changes over breaking ones
