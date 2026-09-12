import { expect, test } from "@playwright/test";

import { stubLocalThumbnails } from "./helpers";

test.beforeEach(async ({ page }) => {
  await stubLocalThumbnails(page);
});

test("gallery, command palette, and viewer work in WebKit", async ({
  page,
}, testInfo) => {
  await page.goto("/?cross-browser-smoke=true");
  const search = page.getByRole("button", { name: "Search & Filter" });
  await expect(search).toBeVisible();

  const photos = page.locator("[data-photo-id]");
  await expect(photos.first()).toBeVisible();

  await search.click();
  const searchDialog = page.getByRole("dialog", { name: "Search & Filter" });
  await expect(searchDialog.getByRole("combobox")).toBeVisible();
  if (testInfo.project.name === "iphone-smoke") {
    await searchDialog
      .getByRole("button", { name: "Close", exact: true })
      .click();
  } else {
    await page.keyboard.press("Escape");
  }
  await expect(searchDialog).toBeHidden();

  await photos.first().click();
  const viewer = page.getByRole("dialog", { name: "Photo viewer" });
  await expect(viewer).toBeVisible();
  await expect(page).toHaveURL(/\/photos\/[^/?]+/);

  // Desktop eagerly renders the lazy EXIF inspector. Waiting for it prevents
  // Playwright from tearing down Vite while those chunks are still compiling,
  // and verifies the split panel rather than only the viewer shell.
  if (testInfo.project.name === "webkit-smoke") {
    await expect(
      page.getByRole("heading", { name: "Photo Inspector" }),
    ).toBeVisible();
  } else {
    const infoToggle = viewer.locator("[data-photo-viewer-info-toggle]");
    await infoToggle.click();
    const info = viewer.locator("[data-photo-info]");
    const media = viewer.locator("[data-photo-viewer-media]");
    await expect(info).toBeVisible();
    const initialHeight = (await media.boundingBox())!.height;
    await viewer.getByRole("button", { name: "More info space" }).click();
    await expect
      .poll(async () => (await media.boundingBox())!.height)
      .toBeLessThan(initialHeight);
    const strip = (await viewer.locator(".af-viewer-filmstrip").boundingBox())!;
    expect(strip.y + strip.height).toBeLessThanOrEqual(
      (await info.boundingBox())!.y + 1,
    );
    expect((await media.boundingBox())!.height).toBeGreaterThan(90);
    await viewer
      .getByRole("button", { name: "Close photo information" })
      .click();
    await expect(info).toBeHidden();
    await expect(infoToggle).toBeFocused();
  }

  await page.getByRole("button", { name: "Close" }).click();
  await expect(viewer).toBeHidden();
});
