import { fileURLToPath } from "node:url";

import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import sharp from "sharp";

import fixtureManifest from "./fixtures/photos-manifest.json" with { type: "json" };
import { stubCartoBasemap, stubLocalThumbnails } from "./helpers";

test.use({ serviceWorkers: "block" });

const pageErrors = new WeakMap<Page, string[]>();
const originalFixtures = new Map<string, Promise<Buffer>>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await stubCartoBasemap(page);
  await stubLocalThumbnails(page);
  // Preview assertions need real portrait/landscape fixtures, not the shared
  // square placeholder. Originals retain manifest dimensions for WebGL tiles.
  await page.route(
    /(?:https:\/\/photos\.fixture\.test\/fixtures|\/thumbnails)\/SYNTH\d{4}\.jpg(?:\?.*)?$/,
    async (route) => {
      const url = new URL(route.request().url());
      const filename = url.pathname.split("/").at(-1)!;
      const fixturePath = fileURLToPath(
        new URL(`fixtures/thumbnails/${filename}`, import.meta.url),
      );
      const isOriginal = url.hostname === "photos.fixture.test";
      if (isOriginal && !originalFixtures.has(filename)) {
        const photo = fixtureManifest.photos.find(
          (item) => `${item.id}.jpg` === filename,
        )!;
        originalFixtures.set(
          filename,
          sharp(fixturePath)
            .resize(photo.width, photo.height)
            .jpeg()
            .toBuffer(),
        );
      }
      await route.fulfill({
        contentType: "image/jpeg",
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store",
        },
        ...(isOriginal
          ? { body: await originalFixtures.get(filename)! }
          : { path: fixturePath }),
      });
    },
  );
});

test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

async function openGallery(page: Page, requireVisiblePhoto = true) {
  await page.goto("/?sort=asc");
  const header = page.locator("[data-gallery-header]");
  await expect(header.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByLabel("Loading", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("grid")).toHaveCount(1);
  const firstPhoto = page.locator("[data-gallery-photo-link]").first();
  if (requireVisiblePhoto) await expect(firstPhoto).toBeInViewport();
  else await expect(firstPhoto).toHaveCount(1);
  return header;
}

async function openSearch(page: Page, header: Locator) {
  await header.getByRole("button", { name: "Search & Filter" }).click();
  const dialog = page.locator("[data-command-palette]");
  await expect(dialog).toHaveAttribute("role", "dialog");
  await expect(dialog.getByRole("combobox")).toBeVisible();
  return dialog;
}

async function expectMatchCount(dialog: Locator, count: number) {
  await expect(dialog.locator("[data-command-match-count]")).toHaveText(
    `${count} matching ${count === 1 ? "photo" : "photos"}`,
  );
}

async function selectLastPhoto(dialog: Locator) {
  const input = dialog.getByRole("combobox");
  await input.fill("SYNTH00");
  const results = dialog.locator('[data-command-result-id^="photo-"]');
  await expect(results).toHaveCount(10);
  for (let index = 1; index < 10; index++) await input.press("ArrowDown");
  const selected = dialog.locator('[data-command-result-id="photo-SYNTH0010"]');
  await expect(selected).toHaveAttribute("aria-selected", "true");
  await expect(selected).toBeInViewport({ ratio: 1 });
  const scroller = dialog.locator("[data-command-results]");
  await expect
    .poll(() => scroller.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  return {
    input,
    scrollTop: await scroller.evaluate((element) => element.scrollTop),
  };
}

async function expectSearchRestored(
  dialog: Locator,
  scrollTop: number,
  focus: "input" | "photo",
) {
  await expect(dialog).toBeVisible();
  const input = dialog.getByRole("combobox");
  await expect(input).toHaveValue("SYNTH00");
  const selected = dialog.locator('[data-command-result-id="photo-SYNTH0010"]');
  await expect(focus === "input" ? input : selected).toBeFocused();
  await expect(selected).toHaveAttribute("aria-selected", "true");
  await expect(input).toHaveAttribute(
    "aria-activedescendant",
    (await selected.getAttribute("id"))!,
  );
  await expect
    .poll(async () =>
      Math.abs(
        (await dialog
          .locator("[data-command-results]")
          .evaluate((element) => element.scrollTop)) - scrollTop,
      ),
    )
    .toBeLessThanOrEqual(1);
}

test.describe("desktop search refinement", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("keeps the gallery modal and unchanged in width while counts follow filters, not the text query", async ({
    page,
  }) => {
    const header = await openGallery(page);
    const wall = page.locator("[data-gallery-root]");
    const originalWidth = (await wall.boundingBox())!.width;
    const dialog = await openSearch(page, header);
    const main = page.locator("#main-content");
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(main).toHaveAttribute("inert", "");
    await expect(main).toHaveAttribute("aria-hidden", "true");
    await expect
      .poll(async () => (await wall.boundingBox())!.width)
      .toBe(originalWidth);
    await expectMatchCount(dialog, 18);

    await dialog
      .getByRole("button", { name: "Polaris P1", exact: true })
      .click();
    await expectMatchCount(dialog, 8);
    await expect
      .poll(() => new URL(page.url()).searchParams.get("cameras"))
      .toBe("Polaris P1");
    await dialog.getByRole("combobox").fill("SYNTH0001");
    // SYNTH0001 uses Lumina, outside the selected Polaris filter. Text search
    // remains library-wide and never changes the gallery's eight-photo set.
    await expect(
      dialog.locator('[data-command-result-id="photo-SYNTH0001"]'),
    ).toBeVisible();
    await expectMatchCount(dialog, 8);
    await expect(
      dialog.getByRole("button", { name: "View 8 photos" }),
    ).toBeVisible();
    expect(new URL(page.url()).searchParams.get("cameras")).toBe("Polaris P1");
    expect(new URL(page.url()).searchParams.get("sort")).toBe("asc");

    await dialog.getByRole("button", { name: "View 8 photos" }).click();
    await expect(dialog).toBeHidden();
    await expect(main).not.toHaveAttribute("inert", "");
    await expect
      .poll(async () => (await wall.boundingBox())!.width)
      .toBe(originalWidth);
    expect(new URL(page.url()).searchParams.get("cameras")).toBe("Polaris P1");
  });

  test("separates filters and photos without losing keyboard order, and shows uncropped previews", async ({
    page,
  }) => {
    const header = await openGallery(page);
    const dialog = await openSearch(page, header);
    const input = dialog.getByRole("combobox");
    await input.fill("Lumina");
    const filters = dialog.getByRole("group", { name: "Filters", exact: true });
    const photos = dialog.getByRole("group", { name: "Photos", exact: true });
    await expect(filters).toBeVisible();
    await expect(photos).toBeVisible();
    await expect(
      filters.locator('[data-command-result-id="camera-Lumina LX-7"]'),
    ).toHaveAttribute("aria-selected", "true");
    await expect(photos.locator("[data-command-result-id]")).toHaveCount(10);
    await expect(
      dialog.locator("[data-command-result-id]").first(),
    ).toHaveAttribute("data-command-result-id", "camera-Lumina LX-7");
    await input.press("Enter");
    await expectMatchCount(dialog, 10);
    await expect
      .poll(() => new URL(page.url()).searchParams.get("cameras"))
      .toBe("Lumina LX-7");

    await input.fill("SYNTH000");
    for (const id of ["SYNTH0001", "SYNTH0002"]) {
      const preview = dialog.locator(
        `[data-command-result-id="photo-${id}"] [data-command-preview]`,
      );
      await preview.scrollIntoViewIfNeeded();
      const image = preview.locator('img:not([aria-hidden="true"])');
      await expect(image).toHaveCSS("object-fit", "contain");
      await expect
        .poll(() =>
          image.evaluate((element: HTMLImageElement) => element.naturalWidth),
        )
        .toBeGreaterThan(0);
      const dimensions = await preview.boundingBox();
      expect(dimensions!.width).toBeGreaterThan(40);
      expect(dimensions!.height).toBeGreaterThan(40);
      const portrait = await image.evaluate(
        (element: HTMLImageElement) =>
          element.naturalHeight > element.naturalWidth,
      );
      expect(portrait).toBe(id === "SYNTH0002");
    }
  });

  test("preserves query, keyboard selection and result scrolling across manual close and reopen", async ({
    page,
  }) => {
    const header = await openGallery(page);
    const dialog = await openSearch(page, header);
    const { scrollTop } = await selectLastPhoto(dialog);
    await page.keyboard.press("Control+k");
    await expect(dialog).toBeHidden();
    await expect(page.locator("#main-content")).not.toHaveAttribute(
      "inert",
      "",
    );
    await page.keyboard.press("Control+k");
    await expectSearchRestored(dialog, scrollTop, "input");
    await expect(page.locator("#main-content")).toHaveAttribute("inert", "");
  });

  test("returns from a searched photo to the same query, selection and scroll position", async ({
    page,
  }) => {
    const header = await openGallery(page);
    const dialog = await openSearch(page, header);
    const { input, scrollTop } = await selectLastPhoto(dialog);
    await input.press("Enter");
    await expect(page).toHaveURL(/\/photos\/SYNTH0010\?sort=asc$/);
    const viewer = page.getByRole("dialog", { name: "Photo viewer" });
    await expect(viewer).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(viewer.locator("[data-photo-viewer-sequence]")).toContainText(
      "All photos · Photo 10 of 18",
    );
    await viewer.getByRole("button", { name: "Close", exact: true }).click();
    await expect(viewer).toBeHidden();
    await expect(page).toHaveURL(/\/\?sort=asc$/);
    await expectSearchRestored(dialog, scrollTop, "photo");
    await expect(page.locator("#main-content")).toHaveAttribute("inert", "");
    await page.keyboard.press("ArrowUp");
    const previousPhoto = dialog.locator(
      '[data-command-result-id="photo-SYNTH0009"]',
    );
    await expect(previousPhoto).toBeFocused();
    await expect(previousPhoto).toHaveAttribute("aria-selected", "true");
    await expect(input).toHaveAttribute(
      "aria-activedescendant",
      (await previousPhoto.getAttribute("id"))!,
    );
    // A focused result remains a native button: Enter opens the new selection.
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/photos\/SYNTH0009\?sort=asc$/);
    await expect(viewer).toBeVisible();
    await expect(dialog).toBeHidden();
  });

  test("Escape closes search opened over the viewer without dismissing the photo", async ({
    page,
  }) => {
    await openGallery(page);
    await page
      .locator('[data-gallery-photo-link][data-photo-id="SYNTH0001"]')
      .click();
    const viewer = page.getByRole("dialog", { name: "Photo viewer" });
    await expect(viewer).toBeVisible();
    await expect(
      viewer.getByRole("button", { name: "Close", exact: true }),
    ).toBeFocused();
    const photoUrl = page.url();
    await page.keyboard.press("Control+k");
    const dialog = page.locator("[data-command-palette]");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("combobox").fill("SYNTH0002");
    await expect(
      dialog.locator('[data-command-result-id="photo-SYNTH0002"]'),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(viewer).toBeVisible();
    await expect(page).toHaveURL(photoUrl);
    await expect(page.locator("#main-content")).toHaveAttribute("inert", "");
    await viewer.getByRole("button", { name: "Close", exact: true }).click();
    await expect(viewer).toBeHidden();
    await expect(page).toHaveURL(/\/\?sort=asc$/);
  });
});

for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
]) {
  test.describe(`mobile search at ${viewport.width}px`, () => {
    test.use({ viewport, isMobile: true, hasTouch: true });

    test("keeps the matching-photo footer reachable and closes without undoing filters", async ({
      page,
    }) => {
      const header = await openGallery(page);
      const dialog = await openSearch(page, header);
      await expect(
        dialog.getByRole("button", { name: "View 18 photos" }),
      ).toBeInViewport({
        ratio: 1,
      });
      await dialog
        .getByRole("button", { name: "Polaris P1", exact: true })
        .tap();
      await expectMatchCount(dialog, 8);
      const input = dialog.getByRole("combobox");
      await input.fill("SYNTH0001");
      const photoResult = dialog.locator(
        '[data-command-result-id="photo-SYNTH0001"]',
      );
      await photoResult.tap();
      const viewer = page.getByRole("dialog", { name: "Photo viewer" });
      await expect(viewer).toBeVisible();
      await expect(dialog).toBeHidden();
      await viewer.getByRole("button", { name: "Close", exact: true }).tap();
      await expect(viewer).toBeHidden();
      await expect(dialog).toBeVisible();
      await expect(photoResult).toBeFocused();
      await expect(input).not.toBeFocused();
      // Tap once, then type through the keyboard rather than fill(), which
      // could refocus the input and conceal focus theft after the first edit.
      await input.tap();
      await page.keyboard.press("ControlOrMeta+a");
      await page.keyboard.type("SYNTH0002", { delay: 20 });
      await expect(input).toHaveValue("SYNTH0002");
      await expect(input).toBeFocused();
      await expect(
        dialog.locator('[data-command-result-id="photo-SYNTH0002"]'),
      ).toBeVisible();
      const viewPhotos = dialog.getByRole("button", { name: "View 8 photos" });
      await expect(viewPhotos).toBeInViewport({ ratio: 1 });
      const bounds = (await viewPhotos.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      await viewPhotos.tap();
      await expect(dialog).toBeHidden();
      await expect(page.locator("#main-content")).not.toHaveAttribute(
        "inert",
        "",
      );
      expect(new URL(page.url()).searchParams.get("cameras")).toBe(
        "Polaris P1",
      );
      await expect(
        page.locator("[data-gallery-photo-link]").first(),
      ).toHaveAttribute("data-photo-id", "SYNTH0011");
    });
  });
}

for (const viewport of [
  { width: 320, height: 568 },
  { width: 568, height: 320 },
]) {
  test.describe(`simulated keyboard at ${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport, isMobile: true, hasTouch: true });

    test("a 240px visual viewport leaves filtered search results and the exit action reachable", async ({
      page,
    }) => {
      // This models the browser's visualViewport resize event, not an actual
      // operating-system keyboard. The layout viewport and gallery stay intact.
      await page.addInitScript(() => {
        const viewport = new EventTarget();
        Object.defineProperties(viewport, {
          width: { get: () => innerWidth },
          height: { configurable: true, get: () => innerHeight },
          offsetTop: { get: () => 0 },
          offsetLeft: { get: () => 0 },
          scale: { get: () => 1 },
        });
        Object.defineProperty(window, "visualViewport", {
          configurable: true,
          value: viewport,
        });
      });
      // The author card can fill a short landscape screen before scrolling.
      const header = await openGallery(page, false);
      const wall = page.locator("[data-gallery-root]");
      const originalWidth = (await wall.boundingBox())!.width;
      const dialog = await openSearch(page, header);
      await dialog
        .getByRole("button", { name: "Polaris P1", exact: true })
        .tap();
      await expectMatchCount(dialog, 8);
      const input = dialog.getByRole("combobox");
      await input.fill("SYNTH000");
      await expect(
        dialog.locator('[data-command-result-id^="photo-"]'),
      ).toHaveCount(9);
      await page.evaluate(() => {
        Object.defineProperty(window.visualViewport, "height", {
          configurable: true,
          value: 240,
        });
        window.visualViewport!.dispatchEvent(new Event("resize"));
      });
      const viewPhotos = dialog.getByRole("button", { name: "View 8 photos" });
      await expect(viewPhotos).toBeVisible();
      await expect
        .poll(async () => {
          const panelBounds = (await dialog.boundingBox())!;
          const inputBounds = (await input.boundingBox())!;
          const footerBounds = (await viewPhotos.boundingBox())!;
          const resultBounds = (await dialog
            .locator("[data-command-results]")
            .boundingBox())!;
          return (
            panelBounds.y >= 0 &&
            panelBounds.y + panelBounds.height <= 241 &&
            inputBounds.y >= 0 &&
            inputBounds.y + inputBounds.height <= resultBounds.y + 1 &&
            resultBounds.height >= 44 &&
            resultBounds.y + resultBounds.height <= footerBounds.y + 1 &&
            footerBounds.y + footerBounds.height <= 241 &&
            footerBounds.x >= 0 &&
            footerBounds.x + footerBounds.width <= viewport.width + 1
          );
        })
        .toBe(true);
      await expect
        .poll(async () => (await wall.boundingBox())!.width)
        .toBe(originalWidth);
      await viewPhotos.focus();
      await page.keyboard.press("Tab");
      await expect(input).toBeFocused();
      await viewPhotos.tap();
      await expect(dialog).toBeHidden();
      expect(new URL(page.url()).searchParams.get("cameras")).toBe(
        "Polaris P1",
      );
    });
  });
}
