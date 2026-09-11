# Testing & CI

This repo uses **Vitest 4** (unit/component) and **Playwright** (e2e), orchestrated
as Vitest _projects_ from the root `vitest.config.ts`.

## Running tests

```bash
pnpm test              # all projects in one vitest run
pnpm test:coverage     # same, with v8 coverage -> ./coverage
pnpm test:e2e:install  # one-time: download the chromium browser Playwright needs
pnpm test:e2e          # Playwright e2e (spawns a Vite dev server)
pnpm test:e2e:prod     # production build + service-worker smoke test
pnpm test:e2e:webkit   # focused Desktop Safari + iPhone smoke
pnpm deploy:smoke      # clean Builder + build-static.sh with synthetic local photos
```

Run a single project or file:

```bash
pnpm exec vitest run --project builder
pnpm exec vitest run --project web apps/web/src/lib/__tests__/color.test.ts
pnpm exec vitest --project ui            # watch mode
```

## Type and architecture gates

`pnpm type-check` checks production sources, `apps/web/tsconfig.test.json`,
the tools/E2E configuration and `packages/webgl-viewer/tsconfig.worker.json`.
The worker uses WebWorker globals separately from the DOM compilation. Vitest
transpilation does not substitute for type-checking test fixtures and mocks.

`pnpm contracts` also checks source architecture with each workspace's
TypeScript resolver: runtime cycles, production-to-test references, package
exports and layer boundaries. Type-only and dynamic imports are excluded from
static cycles but still checked for boundary violations. See
[engineering-contracts.md](./engineering-contracts.md) for ownership and
snapshot contracts.

## Coverage gate

CI surfaces coverage in the job summary, uploads the HTML/lcov report, and
enforces repository-wide minimums from `vitest.config.ts`. The thresholds sit
slightly below the current baseline so a broad regression fails without making
small, well-tested changes brittle. Ratchet them upward as coverage improves.

```bash
pnpm test:coverage && open coverage/index.html
```

The explicit `coverage.include` patterns include untested source files in the
denominator (they show as `0%`). Vitest 4 removed `coverage.all`; keeping the
include patterns is what preserves the complete source baseline. Its V8 provider
uses AST-based remapping, so coverage counts can differ from older versions even
when the tested behavior is unchanged. The repository-wide and partition
thresholds remain enforced.
`pnpm coverage:check:partitions` also protects separate floors for the web app,
Builder, WebGL viewer, web build plugins/scripts, and shared packages so strength in one area cannot hide a
large regression in another.

Build-time Vite plugins and `apps/web/scripts` count toward coverage as well as
runtime source; the `web-build` partition guards their own measured baseline.

The September 2026 security upgrade to Vitest 4.1.11 recalibrated the floors for
its [AST remapping](https://v4.vitest.dev/guide/migration#v8-code-coverage-major-changes).
A controlled comparison ran the same 1,249 tests and counted the same 371 source
files in both versions, with no coverage exclusions added:

| Metric     | Vitest 3.2.7           | Vitest 4.1.11          | Current global floor |
| ---------- | ---------------------- | ---------------------- | -------------------- |
| Statements | 74.62%                 | 73.14%                 | 70%                  |
| Branches   | 79.11% (5,568 / 7,038) | 64.44% (5,734 / 8,897) | 63%                  |
| Functions  | 84.01% (1,366 / 1,626) | 74.51% (1,886 / 2,531) | 73%                  |
| Lines      | 74.62%                 | 74.29%                 | 70%                  |

The old provider reported 100% branch/function coverage for some unexecuted
files, including the Builder TUI; the new provider counts their actual
uncovered branches and functions. The percentages across versions are not a
behavioral regression comparison. Keep the new floors enforced and raise them
with meaningful tests; do not remove untested source to increase the numbers.

| Partition       | Statements | Branches | Functions | Lines |
| --------------- | ---------: | -------: | --------: | ----: |
| Web             |        68% |      59% |       70% |   68% |
| Web build       |        59% |      53% |       60% |   60% |
| Builder         |        75% |      68% |       82% |   75% |
| WebGL viewer    |        78% |      70% |       79% |   78% |
| Shared packages |        70% |      75% |       72% |   70% |

Every Vitest project also installs `test/setup/fail-on-console.ts`. An
unexpected `console.warn` or `console.error` fails the test. If console output is
the behavior being tested, spy on that method explicitly in the test.

## Conventions

Match the surrounding package conventions:

| Project                                  | Test location                             | Import style                                     | Environment |
| ---------------------------------------- | ----------------------------------------- | ------------------------------------------------ | ----------- |
| `@afilmory/builder` (bundler resolution) | co-located `foo.test.ts` next to `foo.ts` | `import { x } from "./foo.js"` (`.js` extension) | node        |
| `apps/web`, `@afilmory/ui`               | `__tests__/foo.test.ts`                   | `import { x } from "../foo"` (no extension)      | jsdom       |

- Use `import { describe, expect, it, vi } from "vitest"` (no globals).
- Prefer characterization tests that pin down real, subtle behavior over trivial asserts.
- For object-URL code in jsdom, stub `URL.createObjectURL` / `URL.revokeObjectURL`
  with `vi.spyOn(...).mockImplementation(...)` (jsdom's support is inconsistent).
- Constructor mocks called with `new` must use a regular function or class as
  their implementation; arrow functions are not constructable in Vitest 4.
- Test projects configure automatic JSX through Vite 8's `oxc.jsx` option;
  Vitest's Oxc defaults supersede the deprecated `esbuild` options.
- `vi.restoreAllMocks()` restores manual spies without clearing their call
  history. Use `vi.clearAllMocks()` or the mock's `mockClear()` when a test needs
  to reset call assertions as well.

## End-to-end (Playwright)

The e2e specs (`apps/web/e2e/`) drive a real Vite dev server (`webServer` in
`playwright.config.ts`) with an embedded manifest. E2E uses dedicated ports
(`1925` for dev and `4174` for prod smoke), separate from the normal Vite ports.
Existing servers are never reused by default; set
`PLAYWRIGHT_REUSE_SERVER=true` only when you deliberately own a compatible
server lifecycle.

E2E and `pnpm dev:demo` use separate Vite modes and dependency caches, with the
code inspector disabled, so running the demo cannot invalidate a test server's
optimized dependencies.

The E2E dev and production server wrappers set `AFILMORY_MANIFEST_PATH` to the committed
`apps/web/e2e/fixtures/photos-manifest.json` and `AFILMORY_PUBLIC_ASSET_DIR` to
the fixture root. The build-time readers consume those isolated paths directly,
so an e2e run never reads, writes, locks, or restores the developer's
`generated/photos-manifest.json`; parallel runs cannot race over it. Build-time
thumbnail assets are stubbed inside dev specs; the production build reads them
from the fixture root for OG generation, then prod smoke copies them into its
fresh build output. The wrappers also
point dotenv at the committed empty `environment.env`, pass through only a
small allowlist of platform/connectivity variables, and pin the provider/site/map
values used by the specs. A developer's private root `.env` or shell variables
therefore cannot silently change the run.

A separate prod-smoke mode (`pnpm test:e2e:prod`) runs a real production build
(external manifest asset, PWA service worker) behind `vite preview` and executes
only the `prod-smoke` project. Run the two modes as separate invocations — CI
does — so dev-server runs never pay for a production build.

The fixture is **fully synthetic**: invented `SYNTH00…` photos, a fictional
`Lumina LX-7` camera, and mid-ocean GPS coordinates in made-up countries. It
must **never** be regenerated from a real photo library — an earlier fixture
trimmed from real manifest data leaked personal GPS coordinates and filenames
into the repo. Regenerate it (e.g. after a manifest schema change) with:

```bash
pnpm fixture:e2e
```

This runs `scripts/create-synthetic-e2e-fixture.ts`, which invents the manifest
data, renders deterministic gradient thumbnails through the real builder
pipeline (so `thumbHash` values are genuine), and writes everything under
`apps/web/e2e/fixtures/`.

## Clean deployment smoke

`pnpm deploy:smoke` copies the current source into a temporary workspace and
reuses installed external dependencies. It excludes private environment files,
local photo libraries, generated manifests, thumbnails, and prior build output.
Two synthetic originals are created from scratch, then the real
`build-static.sh → pnpm build → precheck → Builder CLI → Vite` chain runs with
fresh-build mode enabled and the Builder skip flag disabled.

The smoke verifies the resulting manifest, original and thumbnail images,
photo HTML shells, delivery JSON, and static site assets. Temporary output is
removed afterward; the developer's manifest and build output are untouched.
The source snapshot is a local test with no invented Git revision, so it is
never used as a publishable deployment. This covers the complete local-provider
build path; it does not provision or verify a real Vercel account or S3 bucket.

## CI

`.github/workflows/ci.yml` runs these jobs in parallel on every PR/push to `main`:

- **Formatting + lint**, **Type-check**, **Production dependency audit**
- **Test + coverage** — `pnpm test:coverage`, uploads coverage, writes a summary
- **E2E (Playwright)** — dev-server specs, then a prod-smoke run, both against
  the committed fixture manifest
- **Deployment smoke** — the real `scripts/build-static.sh` entrypoint from a
  clean workspace, with Builder processing synthetic local originals
- **Cross-browser** — focused Desktop WebKit and iPhone smoke coverage, with
  its own downloadable HTML report and retry traces
- **Supply chain** — high-confidence secret scanning and a CycloneDX production
  SBOM; workspace contracts run in the lint job
- **Node compatibility** — type and contract checks on the Node 20 minimum

Dependency review and CodeQL run in separate workflows on pull requests;
CodeQL also runs on pushes to `main` and weekly.
Shared install/setup lives in the composite action `.github/actions/setup`.
`.github/workflows/security-audit.yml` also runs a weekly full production +
development dependency audit (and supports manual dispatch). Dependabot opens
grouped weekly minor/patch updates for pnpm dependencies and GitHub Actions;
major upgrades remain separate pull requests requiring an explicit maintainer
decision; see [the dependency policy](dependency-policy.md).
