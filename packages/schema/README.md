# @afilmory/schema

The manifest contract. This package defines the `photos-manifest.json` types
and the parsing/validation logic that every producer (builder, scripts) and
consumer (web app, Vite plugins) must agree on.

## Parsing: strict vs lenient

The entry points have different failure behavior:

- **`validateManifest`** — returns a success result or a list of issues without
  throwing. Use it when the caller needs to handle validation failure explicitly.
- **`assertManifest`** — throws `ManifestValidationError` on any validation
  failure. Use it for build/publication gates, including manifests read by the
  web build after cache recovery; invalid input must not become a published
  empty gallery.
- **`parseManifest`** — applies strict validation but returns an empty manifest
  on failure. Use only when the caller intentionally wants that fallback; it is
  not a publication gate.
- **`parseManifestLenient`** — salvages recoverable cached photos. It returns
  `manifest`, `skipped` (unusable or duplicate photos), and `repaired` (photos
  retained after normalization that need reprocessing). Invalid schema/version,
  timestamps, or a non-array `photos` field still throw `ManifestValidationError`.

Use lenient parsing only at a recovery boundary that handles these diagnostics.
The Builder uses it to plan repairs; publication still requires strict validation.

## Versioning

`CURRENT_MANIFEST_VERSION` is pinned in `src/version.ts`. Validators accept only
that version; `parseManifest` returns its documented empty fallback for a version
mismatch. There is no migration code, deliberately:

- **Version bump = full rebuild.** The builder discards any cached manifest
  that fails to parse and regenerates from scratch; the web app surfaces a
  `BootstrapError` diagnostic page on a version mismatch. Plan for a rebuild
  from the source photos rather than relying on incompatible cached metadata.
- **Bumping the version** therefore never needs migration logic, but the bump
  must be propagated. Grep list:
  - `packages/schema/src/version.ts` (the constant itself),
  - test fixtures and assertions across packages
    (grep `version: 2` / `"version": 2` / `toBe(2)`),
  - `apps/web/e2e/fixtures/photos-manifest.json` — regenerate it with
    `scripts/create-synthetic-e2e-fixture.ts` (`pnpm fixture:e2e`).

## Constraints

Manifest v2 is the Builder's disk/shared format. Web Delivery Manifest v3 is a
separate publication protocol defined in the web app's
[`delivery-manifest.ts`](../../apps/web/src/data-runtime/delivery-manifest.ts);
use its delivery validators and `PhotoRepository` for those assets, not the v2
manifest parsers.

- **Zero runtime dependencies.** This package is imported by the browser
  bundle, the builder, and one-off scripts; keep it dependency-free.
- No build step: exports raw TypeScript (`./src/index.ts`).

## Subpaths

- `@afilmory/schema` — the manifest contract described above.
- `@afilmory/schema/types` — type-only imports of the manifest shapes.
- `@afilmory/schema/geo` — shared geo heuristics (locale scoring, admin-region
  normalization, geo filter matching). Deliberately a separate subpath: it is
  cross-package UI/locale logic, not part of the manifest contract, and is not
  re-exported from the barrel.
