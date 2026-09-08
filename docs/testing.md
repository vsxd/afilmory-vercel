# Testing & CI

This repo uses **Vitest** (unit/component) and **Playwright** (e2e), orchestrated
as Vitest _projects_ from the root `vitest.config.ts`.

## Running tests

```bash
pnpm test              # all projects in one vitest run
pnpm test:coverage     # same, with v8 coverage -> ./coverage
pnpm test:e2e:install  # one-time: download the chromium browser Playwright needs
pnpm test:e2e          # Playwright e2e (spawns a Vite dev server)
pnpm test:e2e:prod     # production build + service-worker smoke test
pnpm test:e2e:webkit   # focused Desktop Safari + iPhone smoke
pnpm deploy:smoke      # real build-static.sh against the synthetic fixture
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

`coverage.all` is enabled, so untested source files count toward the denominator
(they show as `0%`) — the baseline reflects real coverage, not just touched files.
`pnpm coverage:check:partitions` also protects separate floors for the web app,
Builder, WebGL viewer, and shared packages so strength in one area cannot hide a
large regression in another.

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

## End-to-end (Playwright)

The e2e specs (`apps/web/e2e/`) drive a real Vite dev server (`webServer` in
`playwright.config.ts`) with an embedded manifest. E2E uses dedicated ports
(`1925` for dev and `4174` for prod smoke), separate from the normal Vite ports.
Existing servers are never reused by default; set
`PLAYWRIGHT_REUSE_SERVER=true` only when you deliberately own a compatible
server lifecycle.

Both server wrappers set `AFILMORY_MANIFEST_PATH` to the committed
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

## CI

`.github/workflows/ci.yml` runs these jobs in parallel on every PR/push to `main`:

- **Formatting + lint**, **Type-check**, **Production dependency audit**
- **Test + coverage** — `pnpm test:coverage`, uploads coverage, writes a summary
- **E2E (Playwright)** — dev-server specs, then a prod-smoke run, both against
  the committed fixture manifest
- **Deployment smoke** — the real `scripts/build-static.sh` entrypoint against
  the isolated synthetic manifest
- **Cross-browser** — focused Desktop WebKit and iPhone smoke coverage
- **Supply chain** — workspace contracts, high-confidence secret scanning,
  dependency review, CodeQL, and a CycloneDX production SBOM
- **Node compatibility** — type and contract checks on the Node 20 minimum

Shared install/setup lives in the composite action `.github/actions/setup`.
`.github/workflows/security-audit.yml` also runs a weekly full production +
development dependency audit (and supports manual dispatch). Dependabot opens
grouped weekly minor/patch updates for pnpm dependencies and GitHub Actions;
major upgrades remain an explicit maintainer decision and grouped backlog; see
`docs/dependency-policy.md`.
