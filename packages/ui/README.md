# @afilmory/ui

Project-internal design system for `apps/web`. It is not a general-purpose
component library: components exist because the gallery needs them, and their
APIs track the app's needs rather than a public contract.

## Consumers

- `apps/web` — the only real consumer. Its Tailwind entry scans this package
  via `@source "../../node_modules/@afilmory/ui"`, so class names written here
  are picked up without a build step.

## Conventions

- Directory per component (`button/`, `dialog/`, `thumbhash/`, ...), exported
  through the barrel `src/index.ts`.
- Styling uses the app's shared tokens and `af-*` surface recipes, with
  Tailwind utilities for layout. Variants go through `tailwind-variants`;
  follow the [styling contract](../../docs/styling.md).
- Animation uses either `motion` (`m.*` components) or the Radix CSS
  animation lifecycle. Do not animate the same transform with both.

## Rules

- **No app state.** Nothing here may import jotai atoms, i18n, the router, or
  any `apps/web` module — data and user-facing strings come in through props.
- No build step: exports raw TypeScript (`./src/index.ts`). JavaScript modules
  must stay import-pure; module-level caches are fine, global mutation on
  import is not. CSS imports are explicitly listed in `sideEffects` so
  production tree-shaking preserves the local Sonner integration stylesheet.
