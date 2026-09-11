import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { stubCartoBasemap, stubLocalThumbnails } from "./helpers";

// Run within the existing Chromium project, with mobile layout and touch input.
// The separate mobile project intentionally selects only dismiss-gesture.spec.ts.
test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});

const pageErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  await stubLocalThumbnails(page);
  await stubCartoBasemap(page);
});

test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

async function openGallery(page: Page) {
  await page.goto("/");
  await expect(page.locator("[data-gallery-header]")).toHaveCount(1);
  await expect(
    page.locator("[data-gallery-header]").getByRole("heading", { level: 1 }),
  ).toBeVisible();
  await expect(page.getByLabel("Loading", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("grid")).toHaveCount(1);
  await expect(
    page.locator("[data-gallery-photo-link]").first(),
  ).toBeInViewport();
  await expect(page.locator("[data-gallery-floating-actions]")).toBeHidden();
}

async function scrollToFloatingActions(page: Page) {
  // Exercise the real scroll listener. Mobile layout uses body, not window or
  // the desktop ScrollArea viewport, as its scrolling element.
  await page.mouse.move(195, 400);
  await page.mouse.wheel(0, 900);
  await expect
    .poll(() => page.evaluate(() => document.body.scrollTop))
    .toBeGreaterThan(500);
  await expect(page.locator("[data-gallery-header]")).not.toBeInViewport();

  const floating = page.locator("[data-gallery-floating-actions]");
  await expect(floating).toBeVisible();
  await expect(floating.getByRole("button")).toHaveCount(3);
  for (const name of ["Search & Filter", "Map Explore", "View"]) {
    await expect(
      floating.getByRole("button", { name, exact: true }),
    ).toBeInViewport({
      ratio: 1,
    });
  }
  return floating;
}

async function expectVisibleKeyboardFocus(control: Locator) {
  await expect(control).toBeFocused();
  await expect
    .poll(() =>
      control.evaluate((element) => getComputedStyle(element).outlineStyle),
    )
    .not.toBe("none");
  await expect
    .poll(() =>
      control.evaluate((element) =>
        Number.parseFloat(getComputedStyle(element).outlineWidth),
      ),
    )
    .toBeGreaterThanOrEqual(2);
}

test("mobile long scrolling keeps the original actions reachable and restores search focus", async ({
  page,
}) => {
  await openGallery(page);
  const floating = await scrollToFloatingActions(page);
  const search = floating.getByRole("button", { name: "Search & Filter" });
  await floating.getByRole("button", { name: "View", exact: true }).focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  await expectVisibleKeyboardFocus(search);
  const originalTrigger = await search.elementHandle();
  expect(originalTrigger).not.toBeNull();
  const scrollTop = await page.evaluate(() => document.body.scrollTop);

  await search.tap();
  const dialog = page.getByRole("dialog", { name: "Search & Filter" });
  await expect(dialog.getByRole("combobox")).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).tap();

  await expect(dialog).toHaveCount(0);
  await expect(search).toBeFocused();
  expect(
    await originalTrigger!.evaluate((element) => element.isConnected),
  ).toBe(true);
  await expect
    .poll(() => page.evaluate(() => document.body.scrollTop))
    .toBe(scrollTop);
  await expect(page.getByRole("grid")).toBeVisible();
  await expect(page.locator("[data-gallery-header]")).toHaveCount(1);
  await expect(page.locator("#main-content")).not.toHaveAttribute("inert", "");
  await expect(page.locator("#main-content")).not.toHaveAttribute(
    "aria-hidden",
    "true",
  );

  // This is the existing map action, not a new mobile navigation destination.
  await floating.getByRole("button", { name: "Map Explore" }).tap();
  await expect(page).toHaveURL(/\/explore$/);
  await expect(
    page.getByRole("heading", { name: "Explore Map" }),
  ).toBeVisible();
});

test("mobile view drawer returns focus to its original floating trigger after sorting resets scroll", async ({
  page,
}) => {
  await openGallery(page);
  const floating = await scrollToFloatingActions(page);
  const view = floating.getByRole("button", { name: "View", exact: true });
  const originalTrigger = await view.elementHandle();
  expect(originalTrigger).not.toBeNull();

  await view.tap();
  const drawer = page.getByRole("dialog", { name: "View", exact: true });
  await expect(drawer).toBeVisible();
  const oldestFirst = drawer.getByRole("button", { name: "Oldest First" });
  await drawer.getByRole("button", { name: "Newest First" }).focus();
  await page.keyboard.press("Tab");
  await expectVisibleKeyboardFocus(oldestFirst);
  await page.keyboard.press("Enter");
  await expect(oldestFirst).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("sort"))
    .toBe("asc");
  await expect(drawer).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(drawer).toHaveCount(0);
  await expect(view).toBeFocused();
  await expect(view).toBeInViewport({ ratio: 1 });
  expect(
    await originalTrigger!.evaluate((element) => element.isConnected),
  ).toBe(true);
  await expect.poll(() => page.evaluate(() => document.body.scrollTop)).toBe(0);
  await expect(page.locator("[data-gallery-header]")).toBeInViewport();
  await expect(
    page.locator("[data-gallery-photo-link]").first(),
  ).toHaveAttribute("data-photo-id", "SYNTH0001");
  await expect(page.getByRole("grid")).toBeVisible();
  await expect(page.locator("#main-content")).not.toHaveAttribute("inert", "");
});

test("clearing a zero-result filter combination restores photos in the selected order", async ({
  page,
}) => {
  // The fixture pairs Polaris P1 with the Lumina lens only in SYNTH0014
  // (portrait) and SYNTH0016 (night). Adding its existing macro tag produces
  // zero matches without inventing a camera, lens, or tag ID.
  const query = new URLSearchParams({
    sort: "asc",
    cameras: "Polaris P1",
    lenses: "Lumina Vista 35mm F1.8",
    tags: "macro",
  });
  await page.goto(`/?${query}`);
  const header = page.locator("[data-gallery-header]");
  await expect(header).toHaveCount(1);
  const heading = header.getByRole("heading", { level: 1 });
  await expect(heading).toBeVisible();
  await expect(page.getByLabel("Loading", { exact: true })).toHaveCount(0);
  const originalHeading = await heading.textContent();
  await expect(header.locator("[data-filter-chip]")).toHaveCount(3);
  await expect(page.locator("[data-gallery-photo-link]")).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText(
    "No photos match these filters.",
  );

  await page.getByRole("button", { name: "Clear filters", exact: true }).tap();

  await expect
    .poll(() => {
      const url = new URL(page.url());
      return {
        pathname: url.pathname,
        sort: url.searchParams.get("sort"),
        cameras: url.searchParams.get("cameras"),
        lenses: url.searchParams.get("lenses"),
        tags: url.searchParams.get("tags"),
      };
    })
    .toEqual({
      pathname: "/",
      sort: "asc",
      cameras: null,
      lenses: null,
      tags: null,
    });
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(header).toHaveCount(1);
  await expect(heading).toHaveText(originalHeading!);
  await expect(header.locator("[data-filter-chip]")).toHaveCount(0);
  await expect(
    header.getByRole("button", { name: "Search & Filter" }),
  ).toBeFocused();
  await expect(page.getByRole("grid")).toBeVisible();
  const firstPhoto = page.locator("[data-gallery-photo-link]").first();
  await expect(firstPhoto).toHaveAttribute("data-photo-id", "SYNTH0001");
  await expect(firstPhoto).toBeInViewport();
  await expect(page.locator("[data-gallery-floating-actions]")).toBeHidden();
});
