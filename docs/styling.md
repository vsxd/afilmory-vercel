# Styling

Afilmory keeps photographs prominent and application chrome neutral. Use the
shared tokens and surface recipes for controls, panels, and overlays; use
Tailwind utilities for layout, spacing, typography, and responsive behavior.
This contract applies to the web app and `@afilmory/ui`.

## Where styles belong

The global entry is `apps/web/src/styles/index.css`, in this order:

| File                | Responsibility                                                           |
| ------------------- | ------------------------------------------------------------------------ |
| `tailwind.css`      | Tailwind, plugins, and workspace source discovery.                       |
| `tokens.css`        | Application `--af-*` tokens, Tailwind theme aliases, and the dark theme. |
| `base.css`          | Fonts, document sizing, scroll ownership, and scrollbars.                |
| `surfaces.css`      | Shared material and interaction recipes in `@layer components`.          |
| `accessibility.css` | Keyboard focus and reduced-motion safeguards.                            |

Feature-specific selectors belong next to their component and are imported by
that feature. For example, gallery layout rules live in `Gallery.css`, and map
marker rules live in `MapMarker.css`. Keep these selectors scoped with an
`af-` prefix; do not add broad selectors such as `[data-highlighted]` that
silently change unrelated Radix components.

`packages/ui` exposes components through its package root. Its components use
the app's global theme and recipes. Do not create a second token system inside
the package or import a private UI module from the app.

## Tokens and surfaces

Use `text-ui`, `text-ui-secondary`, and `text-ui-muted` for chrome text;
`border-ui-border` and `border-ui-strong` for boundaries; and `bg-ui-subtle`
or `bg-ui-hover` for simple supporting backgrounds. `rounded-panel` and
`rounded-control` express the shared radii. Circular controls still use
`rounded-full`.

| Recipe           | Use                                                                    |
| ---------------- | ---------------------------------------------------------------------- |
| `af-panel`       | A restrained translucent panel within the page.                        |
| `af-popover`     | A floating panel with the shared border, shadow, and blur.             |
| `af-glass`       | An overlay on photographs or a map.                                    |
| `af-control`     | A control's material and hover, active, selected, and disabled states. |
| `af-input-shell` | A compound input's border and single focus boundary.                   |
| `af-menu-item`   | A Radix menu item's highlighted, open, and disabled states.            |

Recipes own material and state; they do not choose width, height, spacing, or
radius. Do not put competing `bg-*`, `border-*`, `transition-*`, or opacity
state utilities on a recipe merely to reproduce its existing appearance.
Use an existing token or change the shared recipe when the change is meant to
apply everywhere. A deliberate component variation can supply the recipe's
local `--af-control-*` variables.

Combine `af-glass af-control` for a glass control. The recipe composes its
background variables and resets them on nested controls, so a panel's glass
or selected state does not leak into its children. Avoid selectors that
patch each combination with another hard-coded background.

The ordinary shared `Button` has a `surface` variant for neutral controls.
Primary and destructive actions have explicit color variants. A toggle uses
`aria-pressed`; adding `data-variant="solid"` makes its pressed state solid.
Do not add `aria-pressed` to an ordinary action just to obtain a color.
Use `text-accent-content` on solid accent surfaces. Accent contrast is
resolved in the element's scope because a photo may supply its own accent.

Neutral tokens do not replace meaningful colors: photograph overlays, map
markers, histograms, status indicators, and brand marks may need their own
colors. Keep those choices local and explain non-obvious exceptions.

## Interaction and motion

Use native `disabled` where possible. For slotted links, `Button` preserves
focusability and blocks activation while exposing `aria-disabled`; styling
alone must never be responsible for blocking an action. The recipes support
native disabled controls, `aria-disabled="true"`, and Radix `data-disabled`.
An explicit `data-disabled="false"` remains enabled.

Menus use Radix's `data-highlighted` and `data-state="open"`; they no longer
pass a `--highlight-bg` inline style. Keep keyboard selection, checked state,
and dismiss behavior in the existing primitives.

Keyboard focus has one visible boundary, owned by `accessibility.css`.
Avoid adding a second focus ring or suppressing the outline on individual
controls. Use `--af-focus-offset` when a container would clip the boundary.
Compound inputs use the shell's focus boundary instead of drawing one around
every child. Verify focus in the browser: a class name or jsdom focus event
does not prove that the outline is painted.

Use `--af-duration-fast`, `--af-duration-normal`, and `--af-ease` for ordinary
CSS transitions. Motion components use the existing spring presets and the
app's `MotionConfig reducedMotion="user"`; components with their own hover
or tap animations can also use `useReducedMotion`. Do not let CSS animations
and Motion both animate the same transform. HoverCard and Tooltip use
Radix's CSS animation lifecycle; Dialog keeps its existing Motion lifecycle.
The global reduced-motion rules also constrain CSS animations and scrolling.
Controls animate the CSS `scale` property for utility-based press feedback;
they do not transition the `transform` property written frame by frame by Motion.
Photo accent changes use these existing component transitions instead of
injecting a temporary global `*` transition rule.

Masonry clips zooming images and Live Photo video inside one media wrapper.
The hover shade bleeds one CSS pixel past that boundary to cover fractional
device pixels. Keep `VirtualMasonry` containment at `layout`: an additional
paint clip on the cell cuts that bleed and produces bright edge seams. The
photo dimensions and four-pixel layout gutter do not change. Use `clsxm` when
component callers override default positioning or overflow utilities.

## Dynamic values and third-party adapters

Inline styles are appropriate for values calculated at runtime: masonry
positions, measured dimensions, thumbnail transforms, photo-derived accents,
and chart data. They are not a place to copy static panel gradients, shadows,
or border colors into every component.

Prefer a library's unstyled mode and public theme variables. The Sonner
adapter uses `af-popover` and `af-control`, maps its close-button theme
variables to application tokens, and keeps narrowly scoped description and
keyboard-focus rules in `packages/ui/src/sonner.css`. Sonner injects its own
description color, outline reset, and focus shadow even in unstyled mode.
The adapter preserves one visible outline and the normal surface shadow,
using enough specificity to work when the library appends its CSS after
the production stylesheet. These exceptions use no `!important`. Keep similar integration
exceptions beside the adapter and document why a recipe alone cannot work.
A package that imports CSS must list that CSS in its `sideEffects` metadata,
so production tree-shaking retains the stylesheet.

Do not invent utility names. Tailwind 4 only generates classes it recognizes;
a plausible-looking class can silently emit no CSS. Prefer static class
names over runtime string construction, and register theme values using the
appropriate Tailwind namespace.

## Verification

Run the ordinary formatting, lint, type, and unit checks, plus:

```bash
pnpm styles:check
pnpm exec vitest run --project ui
```

`styles:check` checks source contracts and compiles the actual Tailwind entry
to verify shared tokens, selectors, and selected utility probes. CI runs it
in the lint job. It complements browser checks; it does not prove visual
contrast, detect every unused utility, or replace interaction tests.

For visible changes, check the affected route with real CSS in the browser.
Cover desktop and narrow touch layouts, long content, keyboard focus,
hover/pressed/disabled states, nested surfaces, reduced motion, and closing
an overlay back to its trigger. The Playwright suites run with
`pnpm test:e2e` and `pnpm test:e2e:prod`; run the relevant tests for the change.
See [testing.md](testing.md) for fixture and platform details.

Add a regression test when behavior changes. Keep unit assertions about
behavior and accessibility relationships; test painted state or CSS
compilation at the layer that can observe it. Avoid tests that merely repeat
a component's class string or duplicate token values.

## Framework boundaries

Tailwind supplies layout utilities and the existing plugins provide icons,
safe areas, typography, and the dark theme. DaisyUI's `rootscrolllock` base
module is excluded: this app uses Radix/body scroll locking and deliberately
keeps the fixed root from becoming the scroll owner. Do not re-enable a second
scroll-lock implementation. The separate UIKit color palette
has been removed: chrome uses the application tokens, and status icons use
`success`, `error`, `warning`, and `info`.

For the framework rules behind the theme aliases and component layer, see
[Tailwind theme variables](https://tailwindcss.com/docs/theme) and
[adding custom styles](https://tailwindcss.com/docs/adding-custom-styles).
