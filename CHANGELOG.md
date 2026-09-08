# Changelog

All notable Project Code changes are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and releases follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Source architecture guards, Web test type-checking, and a separately checked
  TypeScript module Worker with a shared bidirectional protocol.

- Workspace, environment-template, fixture-drift, partition-coverage, secret,
  deployment-smoke, and SBOM contracts.
- WebKit/iPhone smoke coverage and zero-credential synthetic demo mode.
- Security, conduct, contribution, licensing, dependency, and release policies.
- Web Delivery Manifest v3 with lazy, validated photo-detail/map hydration and
  stable content-addressed ID-hash shards.
- Keyboard-operable virtual masonry, accessible map popovers, viewer zoom
  controls, reduced-motion behavior, and retryable runtime error states.
- Builder processing fingerprints, explicit concurrency budgets, structured
  photo failures, immutable artifact snapshots, and privacy-mode transitions.
- Production startup/PWA budgets, private-route and vendor-cycle build guards,
  fork-aware source/license metadata, and exact-source publication checks.

### Changed

- Separate Builder requests, captured build plans and plugin execution inputs.
- Publish immutable photo snapshots through React external-store subscriptions.
- Model media conversion outcomes, progress events, cancellation and runtime
  disposal explicitly, with presentation-layer translation.

- Remote artifact caching defaults to a dedicated branch and non-destructive
  commits; optional history compaction now requires explicit consent and uses a
  precise force-with-lease.
- Cache restores validate JSON structure, file sizes, file names, and media
  signatures before replacing local artifacts.
- Coarse and stripped location modes no longer restore or publish geocoding
  caches that may contain legacy exact-coordinate keys.
- Location publishing defaults to coarse coordinates and external reverse
  geocoding requires explicit opt-in.
- Detail shards use dense binary hash-prefix partitioning so adding a photo
  preserves unrelated immutable cache entries.
- Video playback relies on browser/CDN byte-range caching instead of advertising
  an unfillable Service Worker full-response cache.
- Pin transitive `@babel/core` consumers to the patched 7.29.6 release for
  GHSA-4x5r-pxfx-6jf8.

### Fixed

- Preserve TIFF grayscale and transparent alpha channels, report DOM image
  decode failures, time out stalled downloads, and cancel queued conversions.
- Keep hydrated photo details visible under React Compiler memoization and
  pre-optimize lazy map dependencies to avoid first-navigation dev reloads.

- Preserve hash-prefixed accent colors when `.env.template` is parsed by dotenv.
- Prevent Radix primitives split across manual chunks from failing during
  production ESM initialization.
- Make artifact-cache restoration transactional with staging, backup rollback,
  interrupted-swap recovery, and fault-injection coverage.
- Harden video readiness/abort sequencing, Live Photo hover intent and
  concurrency, viewer gesture readiness, gallery focus retention, map
  hydration, and manifest retries.
- Prevent stale gallery URL effects and delayed viewer returns from overwriting
  a newer map navigation.

[Unreleased]: https://github.com/vsxd/afilmory-vercel/compare/v0.1.0...HEAD
