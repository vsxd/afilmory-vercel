import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import sharp from "sharp";

import {
  stubCartoBasemap,
  stubLocalThumbnails,
  VIEWER_FIXTURE_IMAGE_PATH,
} from "./helpers";

// The same paint contracts run against Vite and its production CSS bundle.
// Keep the CDN fixture interceptable; prod-smoke separately tests the SW.
test.use({ serviceWorkers: "block" });

const pageErrors = new WeakMap<Page, string[]>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  await stubLocalThumbnails(page);
  await stubCartoBasemap(page);
  await page.route("https://photos.fixture.test/**", (route) =>
    route.fulfill({
      contentType: "image/png",
      headers: { "Access-Control-Allow-Origin": "*" },
      path: VIEWER_FIXTURE_IMAGE_PATH,
    }),
  );
});

test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});

async function openGallery(page: Page) {
  await page.goto("/");
  const header = page.locator("[data-gallery-header]");
  await expect(header.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByLabel("Loading", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("grid")).toHaveCount(1);
  await expect(
    page.locator("[data-gallery-photo-link]").first(),
  ).toBeInViewport();
  return header;
}

async function finishTransitions(control: Locator) {
  await control.evaluate(async (element) => {
    await Promise.all(
      element.getAnimations().map((animation) => animation.finished),
    );
  });
}

async function readPaint(control: Locator) {
  return control.evaluate((element) => {
    const style = getComputedStyle(element);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d")!;
    // Canvas normalizes rgba(), color() and color-mix() to comparable sRGB
    // pixels, including opacity. It does not modify the component's styles.
    const pixel = (color: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      return Array.from(context.getImageData(0, 0, 1, 1).data);
    };
    return {
      background: pixel(style.backgroundColor),
      border: pixel(style.borderTopColor),
      foreground: pixel(style.color),
      controlBackground: pixel(style.getPropertyValue("--af-surface-control")),
      controlBorder: pixel(style.getPropertyValue("--af-border")),
      accent: pixel(style.getPropertyValue("--color-accent")),
      accentContent: pixel(style.getPropertyValue("--color-accent-content")),
    };
  });
}

test("filter selection survives hover and the input owns one reduced-motion focus boundary", async ({
  page,
}) => {
  const header = await openGallery(page);
  await header.getByRole("button", { name: "Search & Filter" }).click();
  const dialog = page.getByRole("dialog", { name: "Search & Filter" });
  const input = dialog.getByRole("combobox");
  await expect(input).toBeFocused();
  const shell = input.locator("..");
  await expect
    .poll(async () => {
      const paint = await readPaint(shell);
      return paint.border;
    })
    .toEqual((await readPaint(shell)).accent);
  expect(
    await shell.evaluate((element) => getComputedStyle(element).boxShadow),
  ).not.toBe("none");
  expect(
    await input.evaluate((element) => ({
      outline: getComputedStyle(element).outlineStyle,
      shadow: getComputedStyle(element).boxShadow,
    })),
  ).toEqual({ outline: "none", shadow: "none" });

  const filter = dialog
    .getByRole("region", { name: "Camera Filter" })
    .getByRole("button")
    .first();
  await filter.hover();
  await expect(filter).toHaveAttribute("aria-pressed", "false");
  await finishTransitions(filter);
  const unselectedHover = await readPaint(filter);
  await filter.click();
  await expect(filter).toHaveAttribute("aria-pressed", "true");
  await dialog
    .getByRole("heading", { name: "Search & Filter", exact: true })
    .hover();
  await expect
    .poll(async () => (await readPaint(filter)).border)
    .not.toEqual(unselectedHover.controlBorder);
  await finishTransitions(filter);
  const selected = await readPaint(filter);
  expect(selected.background[3]).toBeGreaterThan(0);

  await filter.hover();
  await finishTransitions(filter);
  await expect
    .poll(async () => {
      const paint = await readPaint(filter);
      return paint.background[3];
    })
    .toBeGreaterThanOrEqual(selected.background[3]!);
  await expect
    .poll(async () => (await readPaint(filter)).border)
    .toEqual(selected.border);
  const selectedHover = await readPaint(filter);
  expect(selectedHover.background).not.toEqual(unselectedHover.background);
  // A selected hover retains the accent hue; allow 8-bit alpha rounding.
  for (let channel = 0; channel < 3; channel++) {
    expect(
      Math.abs(
        selectedHover.background[channel]! - selectedHover.accent[channel]!,
      ),
    ).toBeLessThanOrEqual(6);
  }

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(() =>
      filter.evaluate((element) =>
        Math.max(
          ...getComputedStyle(element)
            .transitionDuration.split(",")
            .map((duration) => Number.parseFloat(duration) * 1000),
        ),
      ),
    )
    .toBeLessThanOrEqual(0.01);
});

test.describe("mobile surface composition", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test("floating controls keep their own background and the viewer uses a readable solid selection", async ({
    page,
  }) => {
    const header = await openGallery(page);
    await expect
      .poll(() =>
        page.evaluate(
          () => document.body.scrollHeight - document.body.clientHeight,
        ),
      )
      .toBeGreaterThan(900);
    // Body owns mobile scrolling. A vendor :root overflow rule must not
    // propagate its scroll range to the fixed document viewport.
    await expect
      .poll(() =>
        page.evaluate(
          () => getComputedStyle(document.documentElement).overflow,
        ),
      )
      .toBe("hidden");
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.synthesizeScrollGesture", {
      x: 195,
      y: 700,
      yDistance: -900,
      gestureSourceType: "touch",
    });
    await cdp.detach();
    await expect
      .poll(() => page.evaluate(() => document.body.scrollTop))
      .toBeGreaterThan(500);
    await expect(header).not.toBeInViewport();
    const floating = page.locator("[data-gallery-floating-actions]");
    await expect(floating).toBeInViewport({ ratio: 1 });
    const overlayPaint = await readPaint(floating);
    expect(Math.max(...overlayPaint.background.slice(0, 3))).toBeLessThan(64);
    expect(overlayPaint.background[3]).toBeGreaterThanOrEqual(192);
    const search = floating.getByRole("button", { name: "Search & Filter" });
    await expect
      .poll(async () => (await readPaint(search)).background)
      .toEqual((await readPaint(search)).controlBackground);

    await page.locator("[data-gallery-photo-link]").first().click();
    const viewer = page.getByRole("dialog", { name: "Photo viewer" });
    await expect(viewer).toBeVisible();
    await expect(
      viewer.getByRole("toolbar", { name: "Zoom controls" }),
    ).toBeVisible();
    const info = viewer.getByRole("button", {
      name: "Photo information",
      exact: true,
    });
    await info.tap();
    await expect(info).toHaveAttribute("aria-pressed", "true");
    await expect
      .poll(async () => (await readPaint(info)).background)
      .toEqual((await readPaint(info)).accent);
    await expect
      .poll(async () => (await readPaint(info)).foreground)
      .toEqual((await readPaint(info)).accentContent);
    const selected = await readPaint(info);
    const luminance = (channels: number[]) =>
      channels.slice(0, 3).reduce((sum, value, index) => {
        const component = value / 255;
        const linear =
          component <= 0.04045
            ? component / 12.92
            : ((component + 0.055) / 1.055) ** 2.4;
        return sum + linear * [0.2126, 0.7152, 0.0722][index]!;
      }, 0);
    const background = luminance(selected.background);
    const foreground = luminance(selected.foreground);
    expect(
      (Math.max(background, foreground) + 0.05) /
        (Math.min(background, foreground) + 0.05),
    ).toBeGreaterThanOrEqual(3);
    await expect(
      viewer.getByRole("heading", { name: "Photo Inspector" }),
    ).toBeVisible();
    const closeInfo = viewer.getByRole("button", {
      name: "Close photo information",
    });
    await closeInfo.tap();
    await expect(info).toHaveAttribute("aria-pressed", "false");
  });
});

test("author statistics respond to their own container width without overflowing", async ({
  page,
}) => {
  const header = await openGallery(page);
  const photoStat = header.getByRole("group", { name: /^Photos:/ });
  const statistics = photoStat.locator("../..");
  const value = photoStat.locator(":scope > span").last();
  for (const [width, fontSize] of [
    [209, 13],
    [210, 14],
    [279, 14],
    [280, 15],
  ]) {
    await statistics.evaluate((element, size) => {
      (element as HTMLElement).style.width = `${size}px`;
    }, width);
    await expect
      .poll(() =>
        value.evaluate((element) =>
          Number.parseFloat(getComputedStyle(element).fontSize),
        ),
      )
      .toBe(fontSize);
    const bounds = await statistics.evaluate((element) => {
      const rectangle = element.getBoundingClientRect();
      return {
        width: rectangle.width,
        overflow: element.scrollWidth - element.clientWidth,
        childrenFit: Array.from(
          element.querySelectorAll('[role="group"]'),
        ).every((group) => {
          const child = group.getBoundingClientRect();
          return (
            child.left >= rectangle.left - 0.5 &&
            child.right <= rectangle.right + 0.5
          );
        }),
      };
    });
    expect(bounds.width).toBe(width);
    expect(bounds.overflow).toBeLessThanOrEqual(0);
    expect(bounds.childrenFit).toBe(true);
  }
});

test.describe("fractional device-pixel photo edges", () => {
  test.use({
    viewport: { width: 1375, height: 707 },
    deviceScaleFactor: 2.2,
  });

  test("the hover shade covers both edges of the photo", async ({
    page,
  }, testInfo) => {
    // Flat white removes image detail from the comparison. Leave fixture video
    // requests to the shared route; the first photo is an ordinary still image.
    await page.route("**/thumbnails/**", async (route) => {
      if (new URL(route.request().url()).pathname.endsWith(".webm")) {
        await route.fallback();
        return;
      }
      await route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><path fill="white" d="M0 0h600v600H0z"/></svg>',
      });
    });
    await openGallery(page);
    const photo = page.locator("[data-gallery-photo-link]").first();
    const thumbnail = photo.getByRole("img");
    await expect
      .poll(() =>
        thumbnail.evaluate(
          (element) =>
            (element as HTMLImageElement).complete &&
            (element as HTMLImageElement).naturalWidth > 0,
        ),
      )
      .toBe(true);
    await photo.hover();
    const overlay = photo.locator("[data-gallery-photo-overlay]");
    await expect(overlay).toHaveCSS("opacity", "1");
    await expect(thumbnail).toHaveCSS("opacity", "1");
    await finishTransitions(thumbnail);
    await finishTransitions(overlay);

    const bounds = await photo.boundingBox();
    expect(bounds).not.toBeNull();
    const thumbnailBounds = await thumbnail.locator("..").boundingBox();
    expect(thumbnailBounds).not.toBeNull();
    for (const dimension of ["x", "y", "width", "height"] as const) {
      expect(thumbnailBounds![dimension]).toBeCloseTo(bounds![dimension], 2);
    }
    const scale = await page.evaluate(() => window.devicePixelRatio);
    // This fixture must continue exercising fractional rasterization rather
    // than accidentally turning into an integer-aligned screenshot check.
    const deviceLeft = bounds!.x * scale;
    expect(Math.abs(deviceLeft - Math.round(deviceLeft))).toBeGreaterThan(0.1);

    const screenshot = await page.screenshot({
      path: testInfo.outputPath("hover-photo-edges.png"),
      scale: "device",
    });
    await testInfo.attach("hover-photo-edges", {
      body: screenshot,
      contentType: "image/png",
    });
    const { data, info } = await sharp(screenshot)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const rgb = (x: number, y: number) => {
      const offset = (y * info.width + x) * info.channels;
      return Array.from(data.subarray(offset, offset + 3));
    };
    const left = Math.floor(deviceLeft);
    const right = Math.ceil((bounds!.x + bounds!.width) * scale) - 1;
    const inset = Math.ceil(4 * scale);
    const samples = [];
    for (const fraction of [0.55, 0.75, 0.85, 0.95, 1 - 4 / bounds!.height]) {
      const row = Math.floor((bounds!.y + bounds!.height * fraction) * scale);
      // Four CSS pixels stay inside the detail label's padding. Compare on the
      // same row so the vertical gradient itself cannot look like an edge gap.
      for (const [edge, inside, direction] of [
        [left, left + inset, 1],
        [right, right - inset, -1],
      ]) {
        const reference = rgb(inside!, row);
        for (let offset = 0; offset < 2; offset++) {
          const pixel = rgb(edge! + offset * direction!, row);
          samples.push({
            row,
            edge,
            offset,
            pixel,
            reference,
            excess: Math.max(
              ...pixel.map((value, channel) => value - reference[channel]!),
            ),
          });
        }
      }
    }
    const worst = samples.reduce((current, sample) =>
      sample.excess > current.excess ? sample : current,
    );
    await testInfo.attach("hover-edge-samples", {
      body: JSON.stringify({ bounds, scale, samples }, null, 2),
      contentType: "application/json",
    });
    expect(worst.excess, JSON.stringify(worst)).toBeLessThanOrEqual(5);
  });
});
