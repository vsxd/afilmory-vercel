# Testing & CI

This repo uses **Vitest** (unit/component) and **Playwright** (e2e), orchestrated
as Vitest *projects* from the root `vitest.config.ts`.

## Running tests

```bash
pnpm test            # all projects, per-package (CI-equivalent strict run)
pnpm test:coverage   # all projects in one pass, with v8 coverage -> ./coverage
pnpm test:e2e        # Playwright e2e (spawns a Vite dev server)
```

Run a single project or file:

```bash
pnpm exec vitest run --project builder
pnpm exec vitest run --project web apps/web/src/lib/__tests__/color.test.ts
pnpm exec vitest --project ui            # watch mode
```

## Coverage (report-only)

Coverage is **measured, not gated** — CI surfaces the numbers in the job summary
and uploads the HTML/lcov report as an artifact, but does not fail a build on a
coverage drop. To ratchet later, add a `coverage.thresholds` block to
`vitest.config.ts`.

```bash
pnpm test:coverage && open coverage/index.html
```

`coverage.all` is enabled, so untested source files count toward the denominator
(they show as `0%`) — the baseline reflects real coverage, not just touched files.

## Conventions

Match the surrounding package — the two projects differ:

| Project | Test location | Import style | Environment |
| --- | --- | --- | --- |
| `@afilmory/builder` (NodeNext) | co-located `foo.test.ts` next to `foo.ts` | `import { x } from "./foo.js"` (`.js` extension) | node |
| `apps/web`, `@afilmory/ui` | `__tests__/foo.test.ts` | `import { x } from "../foo"` (no extension) | jsdom |

- Use `import { describe, expect, it, vi } from "vitest"` (no globals).
- Prefer characterization tests that pin down real, subtle behavior over trivial asserts.
- For object-URL code in jsdom, stub `URL.createObjectURL` / `URL.revokeObjectURL`
  with `vi.spyOn(...).mockImplementation(...)` (jsdom's support is inconsistent).

## End-to-end (Playwright)

The e2e specs (`apps/web/e2e/`) drive a real Vite dev server (`webServer` in
`playwright.config.ts`) with `AFILMORY_EMBED_MANIFEST=true`, which embeds
`generated/photos-manifest.json`.

Because `generated/` is gitignored (and absent in CI), the e2e job uses a
committed fixture manifest instead: `apps/web/e2e/fixtures/photos-manifest.json`.
The CI job copies it into `generated/` before running. Build-time thumbnail assets
(also gitignored) are stubbed inside the spec, so the suite needs no generated
images.

Regenerate the fixture from a real local manifest (e.g. after the schema changes):

```bash
pnpm exec tsx scripts/build-e2e-manifest-fixture.ts
```

The script trims a real `generated/photos-manifest.json` down to ~18 photos that
still satisfy every assertion (the searched-for photo, the `SONY ILCE-7C` camera,
and multi-country GPS data) and validates the result with `assertManifest`.

## CI

`.github/workflows/ci.yml` runs these jobs in parallel on every PR/push to `main`:

- **Lint**, **Type-check**, **Dependency audit**
- **Test + coverage** — `pnpm test:coverage`, uploads coverage, writes a summary
- **Build** — `SKIP_MANIFEST_BUILD=true pnpm build` against an empty manifest fixture
- **E2E (Playwright)** — chromium against the committed fixture manifest

Shared install/setup lives in the composite action `.github/actions/setup`.
