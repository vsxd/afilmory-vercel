# Changelog

All notable Project Code changes are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and releases follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Advisory public-original access and CORS sampling after successful S3 builds
  on Vercel or in fresh-build mode, with bounded requests and redacted diagnostics.
- Clean deployment smoke coverage that starts without generated artifacts and
  runs the real Builder and static build against synthetic local photos.
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

- Reduce Vercel's primary Deploy Button to five storage settings with region
  and endpoint defaults; offer a separate public-image-domain deployment link.
- Derive canonical site URLs from Vercel's stable production domain when
  `SITE_URL` is not set, keeping preview hostnames out of public metadata.
- Separate Builder requests, captured build plans and plugin execution inputs.
- Publish immutable photo snapshots through React external-store subscriptions.
- Model media conversion outcomes, progress events, cancellation and runtime
  disposal explicitly, with presentation-layer translation.
- Upgrade MapLibre GL to 6.4.1 and Vitest/coverage to 4.1.11, and constrain
  js-yaml/valibot to patched releases. Bundle MapLibre's module worker explicitly;
  interactive maps now require WebGL2.
- Include web build plugins/scripts in coverage and calibrate enforced global
  and partition floors against Vitest 4's AST remapping, retaining all source
  files and tests in the comparison.
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

- Explain original-image HTTP, network, timeout and decode failures in the
  viewer and allow retries to discard failed cached image data.
- Preserve TIFF grayscale and transparent alpha channels, report DOM image
  decode failures, time out stalled downloads, and cancel queued conversions.
- Keep hydrated photo details visible under React Compiler memoization.
- Avoid MapLibre initialization when WebGL2 is unavailable, keeping the photo
  viewer usable during navigation and map teardown.
- Scan route page entries during Vite dependency optimization so a first visit
  to the map cannot trigger an optimizer reload that cancels navigation.
- Make the synthetic demo serve local photos and Live Photo video without
  Playwright stubs; isolate demo/E2E dependency caches from each other and from
  regular development.
- Restore gallery link dimensions, slider drag/cancel behavior, viewer focus
  return, and rejection of synchronously failed image requests.
- Regenerate missing addressed thumbnails instead of accepting stale versions,
  and preserve CDN-renamed thumbnail artifacts during remote cleanup.
- Reject invalid photo path IDs and unsafe location dictionary keys; preserve
  literal replacement characters in SEO metadata and numeric EXIF values in RSS.
- Close local media file streams when a client disconnects.
- Preserve workspace dependency ownership in the SBOM and allow secret scans
  after tracked files or directories are removed from the working tree.
- Ignore private environment variants and the default local photo directory;
  clarify that location privacy modes do not strip EXIF from public originals.
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
