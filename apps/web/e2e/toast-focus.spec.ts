import { expect, test } from "@playwright/test";

import {
  stubCartoBasemap,
  stubLocalThumbnails,
  VIEWER_FIXTURE_IMAGE_PATH,
} from "./helpers";

// Run the real notification adapter against both Vite and extracted production
// CSS. Production's script-injected Sonner reset must not erase keyboard focus.
test.use({ serviceWorkers: "block" });

test("a copied-link notification keeps one visible keyboard focus boundary", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await stubCartoBasemap(page);
  await stubLocalThumbnails(page);
  await page.route("https://photos.fixture.test/**", (route) =>
    route.fulfill({
      contentType: "image/png",
      headers: { "Access-Control-Allow-Origin": "*" },
      path: VIEWER_FIXTURE_IMAGE_PATH,
    }),
  );
  await page.goto("/photos/SYNTH0001?sort=asc");
  const viewer = page.getByRole("dialog", { name: "Photo viewer" });
  await expect(viewer).toBeVisible();
  await viewer.getByRole("button", { name: "Share Photo" }).click();
  await page.getByRole("menuitem", { name: "Copy Link" }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(`${new URL(page.url()).origin}/photos/SYNTH0001`);

  const notification = page.locator("[data-sonner-toast]").filter({
    hasText: "Link copied to clipboard",
  });
  await expect(notification).toBeVisible();
  await expect(page.getByRole("menu")).toHaveCount(0);
  // Leave the modal's focus scope before using Sonner's advertised hotkey.
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);
  const surfaceShadow = await notification.evaluate(
    (element) => getComputedStyle(element).boxShadow,
  );
  expect(surfaceShadow).not.toBe("none");

  await page.keyboard.press("Alt+KeyT");
  await expect(page.locator("[data-sonner-toaster]")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(notification).toBeFocused();
  await expect
    .poll(() =>
      notification.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          visible: element.matches(":focus-visible"),
          outline: style.outlineStyle,
          width: Number.parseFloat(style.outlineWidth),
          offset: Number.parseFloat(style.outlineOffset),
        };
      }),
    )
    .toEqual({ visible: true, outline: "solid", width: 2, offset: 2 });
  await expect
    .poll(() =>
      notification.evaluate((element) => getComputedStyle(element).boxShadow),
    )
    .toBe(surfaceShadow);
  expect(errors).toEqual([]);
});
