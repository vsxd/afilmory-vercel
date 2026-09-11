import { expect, test } from "@playwright/test";

import {
  stubCartoBasemap,
  stubLocalThumbnails,
  VIEWER_FIXTURE_IMAGE_PATH,
} from "./helpers";

// Included by the default Chromium dev project only. Production and mobile
// projects have explicit smoke/dismiss-gesture file filters.
test.use({ serviceWorkers: "block" });

test("recovers an original photo from HTTP 403 through the visible retry action", async ({
  page,
}) => {
  await stubCartoBasemap(page);
  await stubLocalThumbnails(page);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  let denyOriginal = true;
  let originalRequests = 0;
  await page.route("https://photos.fixture.test/**", async (route) => {
    originalRequests++;
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    };
    if (denyOriginal) {
      await route.fulfill({
        status: 403,
        headers,
        contentType: "text/plain",
        body: "Forbidden",
      });
      return;
    }
    await route.fulfill({
      status: 200,
      headers,
      contentType: "image/png",
      path: VIEWER_FIXTURE_IMAGE_PATH,
    });
  });

  await page.goto("/");
  const galleryPhoto = page.locator("[data-gallery-photo-link]").first();
  await expect(galleryPhoto).toBeVisible();
  const photoId = (await galleryPhoto.getAttribute("data-photo-id"))!;
  await galleryPhoto.click();
  const viewer = page.getByRole("dialog", { name: "Photo viewer" });
  await expect(viewer.getByRole("alert")).toContainText(
    "Access to the original photo was denied",
  );
  expect(originalRequests).toBe(1);

  denyOriginal = false;
  await viewer.getByRole("button", { name: "Try again", exact: true }).click();
  const photo = viewer.getByRole("group", { name: photoId, exact: true });
  // This becomes accessible only after onImagePainted: a thumbnail, blank
  // canvas, or a dispatched click cannot satisfy recovery.
  await expect(
    photo.getByRole("img", { name: photoId, exact: true }).locator("canvas"),
  ).toBeVisible();
  await expect(photo.locator('img[src*="/thumbnails/"]')).toHaveCount(0);
  await expect(viewer.getByRole("alert")).toHaveCount(0);
  expect(originalRequests).toBe(2);
  expect(pageErrors).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);
});
