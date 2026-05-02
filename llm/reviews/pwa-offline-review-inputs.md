# PWA Offline Review Inputs

Use this package with [reviewer-template.md](/C:/src/chip-chad/llm/reviews/reviewer-template.md) and one of:

- [lens-implementation.md](/C:/src/chip-chad/llm/reviews/lens-implementation.md)
- [lens-risk.md](/C:/src/chip-chad/llm/reviews/lens-risk.md)
- [lens-test-strategy.md](/C:/src/chip-chad/llm/reviews/lens-test-strategy.md)
- [lens-product-ux.md](/C:/src/chip-chad/llm/reviews/lens-product-ux.md)

After collecting outputs, run synthesis with [synthesize-review-feedback.md](/C:/src/chip-chad/llm/reviews/synthesize-review-feedback.md).

## Feature Request

```md
<feature_request>
Plan a PWA implementation for Chip Chad that enables offline mode for the web app while preserving the existing Expo cross-platform setup. The plan should account for Expo web export constraints, useful offline behavior, installability, Application Insights, performance implications, accessibility, versioning, rollback, and anything else materially needed for a safe rollout.

Success means the plan is implementation-ready for this repository: it should fit the current Expo static-export architecture, preserve current web shell performance goals, respect the repo's security and testing contracts, and define enough user-visible behavior that developers do not need to guess.
</feature_request>
```

## Proposed Plan

```md
<proposed_plan>
# Chip Chad PWA Offline Plan v2

## Summary
- Add a web-only PWA layer on top of the existing `expo export` static build. Native Expo iOS/Android builds do not share service-worker code.
- Keep the installed app rooted at `/calculator/`, matching the current manifest and live-shell contract, while the static home page remains a non-app landing page.
- Ship conservative updates, desktop-first install UX, and offline support for the calculator shell, Results/Reference chunks, formulas, tap-drill content, and legal pages after one successful online visit.

## Key Changes
- Write a spec first in `llm/pwa-offline-plan.md`, then implement. Update `README.md`, `docs/testing-guide.md`, and the privacy page in `src/data/legal-pages.ts` to mention Cache Storage/service-worker offline behavior.
- Add `workbox-build` and `web-vitals` as web-only build/runtime dependencies.
- Insert a new post-export step into `build:web`: `expo export -> apply-web-seo -> build-web-pwa -> audit:web-export`.
- Implement `scripts/build-web-pwa.mjs` to generate `dist/sw.js`, `dist/sw-register.js`, and `dist/offline.html`. Do not use inline bootstrap code; keep CSP at `script-src 'self'` and load only external scripts.
- Derive every PWA URL from `sitePath(...)` / `absoluteUrl(...)` and the existing web route constants. The live app start URL and scope remain `/calculator/`; no hardcoded `/` paths are allowed.
- Register the service worker from the calculator shell only, using the root-level `sw.js` so it can control the whole site base path. Dev server builds never register it. Static export builds include the assets; runtime registration is gated by `EXPO_PUBLIC_PWA_ENABLED`.
- Default `EXPO_PUBLIC_PWA_ENABLED` to enabled for local static validation and production export, disabled for Expo dev server, and available as an emergency rollback kill switch. When disabled, the bootstrap unregisters existing Chip Chad workers and clears Chip Chad PWA caches.
- Use Workbox `generateSW` with `skipWaiting: false`, `cleanupOutdatedCaches: true`, and an explicit waiting-worker update flow. The app shows an accessible update banner in the footer/meta area, posts `SKIP_WAITING` on user confirmation, then reloads.
- Precache only offline-essential assets: `/calculator/index.html`, current JS chunks for Setup/Calculate/Results/Reference, formulas markdown, tap-drill assets, KaTeX CSS/fonts, app fonts, favicon/install icons, legal pages, `offline.html`, and manifest/bootstrap files. Do not precache SEO landing pages, social preview images, or other marketing-only assets.
- Use `NetworkFirst` for document navigations with `offline.html` fallback, cache-first for hashed JS/CSS/fonts, and stale-while-revalidate only where freshness is non-critical. Keep the existing lazy-load first-visit behavior; offline readiness improves repeat visits, not first-paint JS cost.
- Namespace caches with build identity from `buildVersion` plus `commitShaShort` so rollback does not reuse bad caches. Serve `sw.js`, `sw-register.js`, `site.webmanifest`, `offline.html`, and all HTML entrypoints with `no-cache`; keep hashed assets immutable.
- Extend the Azure Static Web Apps config generator to emit the new cache headers for all HTML entrypoints plus the PWA bootstrap files, and extend the export audit to fail if those headers or files are missing. Reuse the existing generated-route source of truth instead of hardcoding duplicate route lists.
- Add a small web-only PWA runtime seam such as `src/lib/pwa-runtime.web.ts` with a native no-op shim. `App.tsx` consumes only typed state like `offline`, `offlineReady`, `updateAvailable`, and `installAvailable`.
- Keep install UX desktop-first. Show the CTA only on wide web when `beforeinstallprompt` is available and the app is not already in standalone mode. On iOS/Safari, provide passive manual-install copy only; no fake install prompt.
- Extend `src/lib/application-insights.web.ts` with `trackEvent` and `trackMetric`. After consent only, send best-effort `LCP`, `INP`, `CLS`, and PWA lifecycle events such as registration success, offline ready, update available, update applied, install accepted, and install dismissed. The service worker itself does not emit telemetry.

## Test Plan
- Add unit tests for the PWA runtime state machine, the unregister/kill-switch path, and build-time URL generation under base-path deployments.
- Extend export-audit coverage so PWA-enabled builds require `sw.js`, `sw-register.js`, `offline.html`, the manifest link, and the new `no-cache` header routes.
- Add a precache-budget assertion for the offline-essential asset set with an initial hard cap of `3.5 MB`.
- Add Playwright coverage for:
  - first static load at `/calculator/` registers the worker without breaking the current shell
  - offline reload after one successful visit still supports Setup, Calculate, Results, formulas, and tap-drill flows
  - waiting-worker update banner appears and reload activates the new version
  - desktop install CTA appears only in supported browser mode and disappears in standalone mode
- Add one build-level regression for subpath deployments so manifest, bootstrap, and service-worker URLs stay under the configured base path.
- Keep `test:ui:dev-smoke` service-worker-free and assert that contract explicitly.
- Add manual smoke steps for Safari/iOS Add to Home Screen plus offline calculator usage, and for desktop installed-standalone launch.

## Assumptions
- V1 offline scope is the calculator/reference workflow and legal pages, not the static landing-page catalog.
- The installed app remains a `/calculator/` experience even though the worker can control the whole site base path.
- Preview/branch deployments stay PWA-disabled until the production path is proven stable; local static test builds remain PWA-enabled so the behavior is covered before shipping.
</proposed_plan>
```

## Relevant Context

```md
<relevant_context>
- The web app is an Expo static export deployed to Azure Static Web Apps. `build:web` currently runs: `expo export --platform web -> tsx scripts/apply-web-seo.mjs -> npm run audit:web-export`.
- The static marketing/SEO home route is `/`. The interactive live calculator route is `/calculator/`, and manifest `start_url` plus `scope` already point there. See `src/lib/web-routes.ts`, `scripts/apply-web-seo.mjs`, and `tests/ui/seo.spec.ts`.
- Site URLs and subpath deployments are already a supported contract. Internal URLs must be derived from `sitePath(...)` and `absoluteUrl(...)` from `src/lib/site-url.ts`; `README.md` explicitly calls out alternate deployments mounted at a subpath.
- CSP currently includes `script-src 'self'` with no inline allowance, so inline service-worker bootstrap code would be blocked. See `src/lib/web-security.ts`.
- Azure Static Web Apps headers are generated from `buildStaticWebAppSecurityConfig()` in `src/lib/web-security.ts`. Current routes already distinguish immutable hashed assets from short-lived static assets, and `scripts/check-web-export.mjs` audits those generated cache headers.
- The repo already ships a manifest link, apple-touch icon, static home shell, and build/export audit. Any PWA work should extend those seams rather than introduce parallel route or header sources of truth.
- Application Insights is already wired for web only, build-time configured through Expo config, and gated by explicit analytics consent in `App.tsx` plus `src/lib/analytics-consent.ts`.
- The current web shell intentionally lazy-loads Calculate, Results, and Reference-related chunks to protect first paint. The plan must preserve that first-visit loading posture; offline wins should come from repeat-visit caching, not eager first-load bundle growth.
- Current exported `dist/` size is about 4.17 MB across 101 files. The largest files are the main web bundle (~1.24 MB), `ReferenceFormulasSection` chunk (~534 KB), and `ResultsTab` chunk (~233 KB). Any precache budget should account for those realities.
- Validation commands that write to `dist/` must run serially. `build:web` and `test:ui` cannot overlap.
</relevant_context>
```

## Constraints

```md
<constraints>
- Tech stack: Expo SDK 55, React Native Web, Expo static export, Azure Static Web Apps.
- This is a web-only PWA feature. Native iOS/Android builds must keep working without service-worker code paths.
- Do not regress the existing `/` static landing page versus `/calculator/` live-app split.
- Do not hardcode root-relative routes that break subpath deployments.
- Keep CSP strict unless a change is explicitly justified; prefer external scripts over inline exceptions.
- Preserve the current first-visit lazy-loading strategy for Calculate, Results, and Reference.
- Keep analytics opt-in. No PWA telemetry may send before consent.
- Rollback must be practical: the plan should support disabling registration and clearing Chip Chad-owned caches if needed.
- Validation must fit the repo’s current workflow: `npm run validate`, `npm run build:web`, and `npm run test:ui` run serially; `test:ui:dev-smoke` remains a dev-server path.
- Keep the change scoped. Do not broaden into a general router rewrite, native install work, or unrelated web-shell refactor.
- Documentation updates are required if behavior, scripts, validation contracts, or privacy/storage behavior change.
</constraints>
```

## Suggested Review Order

1. Implementation
2. Risk
3. Test Strategy
4. Product & UX

## Synthesis Inputs

After collecting the four review outputs, feed them into [synthesize-review-feedback.md](/C:/src/chip-chad/llm/reviews/synthesize-review-feedback.md) with the same `feature_request`, `proposed_plan`, and `constraints` blocks from this file.
