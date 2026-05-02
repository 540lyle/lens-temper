# Web Offline Review Inputs

This is a generic fixture packet for reviewing a web offline-readiness plan.
It is intentionally fictional and does not describe any real product or private
repository.

Use this packet with:

- `llm/reviews/reviewer-template.md`
- one selected lens file from `llm/reviews/`
- `llm/reviews/synthesize-review-feedback.md` after collecting review outputs

## Feature Request

```md
<feature_request>
Plan offline support for a browser-based reference workspace used by field
staff. The app should remain useful after one successful online visit by
caching the shell, recent reference documents, and a simple offline fallback.

Success means the plan is implementation-ready for a generic static web app:
it should define user-visible behavior, update handling, rollback, privacy
constraints, performance budgets, and validation steps clearly enough that an
implementation agent does not need to infer missing behavior.
</feature_request>
```

## Proposed Plan

```md
<proposed_plan>
# Field Reference Offline Plan

## Summary
- Add a web-only service worker to the static production build.
- Cache the app shell, current reference index, recently opened reference
  documents, fonts, icons, and an offline fallback page after the first online
  visit.
- Show clear user-facing states for offline mode, update availability, and
  failed refresh attempts.

## Key Changes
- Add a short specification at `docs/plans/web-offline-plan.md` before
  implementation begins.
- Add a build step that emits `dist/sw.js`, `dist/sw-register.js`, and
  `dist/offline.html` from a single route and asset manifest.
- Register the service worker only in production static builds. Development
  server runs should never register or retain a worker.
- Gate registration behind `OFFLINE_SUPPORT_ENABLED` so operators can disable
  service-worker registration and clear this app's caches during rollback.
- Use a network-first strategy for HTML navigations with `offline.html` as the
  fallback, cache-first for versioned static assets, and stale-while-revalidate
  for non-sensitive reference documents.
- Version cache names with the application build id so rollback does not reuse
  incompatible cached assets.
- Keep all cached content non-sensitive. Do not cache account pages, personal
  notes, or authenticated API responses in V1.
- Add an accessible update banner that appears when a waiting service worker is
  available. Activate the update only after user confirmation.

## Test Plan
- Add unit tests for registration gating, cache-name generation, and rollback
  cache cleanup.
- Add build checks that fail when `sw.js`, `sw-register.js`, `offline.html`, or
  required cache headers are missing from the static output.
- Add browser coverage for first online load, offline reload, update-banner
  activation, disabled rollback mode, and cache cleanup.
- Add a manual smoke checklist for a desktop browser and one mobile browser.

## Assumptions
- Offline support is for repeat visits, not first-load availability.
- V1 caches only public reference content and app assets.
- The app can ship without background sync or offline mutations.
</proposed_plan>
```

## Relevant Context

```md
<relevant_context>
- The app is deployed as static files behind a CDN.
- HTML files and service-worker bootstrap files must use short-lived cache
  headers; versioned assets may use immutable cache headers.
- The current app shell lazy-loads large reference sections. Offline support
  should not force all sections into the first-load bundle.
- The app already has a public reference index and an authenticated account
  area. Offline V1 must not cache authenticated account data.
- Static build validation currently owns route generation and asset auditing.
  Offline support should extend that validation instead of introducing a second
  route manifest.
</relevant_context>
```

## Constraints

```md
<constraints>
- Keep the change web-only.
- Do not cache personal data, authenticated API responses, or user-generated
  notes.
- Preserve first-load performance within the existing bundle budget.
- Provide a practical rollback path that disables registration and clears this
  app's named caches.
- Keep development server behavior service-worker-free.
- Update docs if storage behavior, validation commands, or user-visible offline
  behavior changes.
</constraints>
```

## Suggested Review Order

1. Risk
2. Test Strategy
3. Implementation
4. Product & UX

## Prompt Assembly Notes

When running a review:

1. Use `llm/reviews/reviewer-template.md` as the base template.
2. Inject the `Feature Request` section into `{{feature_request}}`.
3. Inject the `Proposed Plan` section into `{{proposed_plan}}`.
4. Inject the `Relevant Context` section into `{{relevant_context}}`.
5. Inject the `Constraints` section into `{{constraints}}`.
6. Inject one lens file into `{{review_lens}}`.
