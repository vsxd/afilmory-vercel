import { fileURLToPath } from "node:url";

import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import sharp from "sharp";

import fixtureManifest from "./fixtures/photos-manifest.json" with { type: "json" };
import { stubCartoBasemap } from "./helpers";

test.use({ serviceWorkers: "block" });

const pageErrors = new WeakMap<Page, string[]>();
const diagnostics = new WeakMap<Page, string[]>();
const originalFixtures = new Map<string, Promise<Buffer>>();

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  const messages: string[] = [];
  diagnostics.set(page, messages);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning")
      messages.push(`${message.type()}: ${message.text()}`);
  });
  page.on("worker", (worker) => messages.push(`worker: ${worker.url()}`));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await stubCartoBasemap(page);
  // Use each photo's actual fixture aspect ratio for both rendering paths.
  // A square favicon would conceal portrait/landscape fitting regressions.
  await page.route(
    /(?:https:\/\/photos\.fixture\.test\/fixtures|\/thumbnails)\/SYNTH\d{4}\.(?:jpg|webm)(?:\?.*)?$/,
    async (route) => {
      const url = new URL(route.request().url());
      const filename = url.pathname.split("/").at(-1)!;
      const fixturePath = fileURLToPath(
        new URL(`fixtures/thumbnails/${filename}`, import.meta.url),
      );
      const isOriginal =
        url.hostname === "photos.fixture.test" && filename.endsWith(".jpg");
      if (isOriginal && !originalFixtures.has(filename)) {
        const photo = fixtureManifest.photos.find(
          (item) => `${item.id}.jpg` === filename,
        )!;
        // The texture worker addresses tiles in manifest pixel coordinates.
        // Returning a 256px thumbnail as a 6000px original would produce empty
        // tiles, so keep the synthetic original's decoded dimensions accurate.
        originalFixtures.set(
          filename,
          sharp(fixturePath)
            .resize(photo.width, photo.height)
            .jpeg()
            .toBuffer(),
        );
      }
      return route.fulfill({
        contentType: filename.endsWith(".webm") ? "video/webm" : "image/jpeg",
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

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) {
    await testInfo.attach("viewer-diagnostics", {
      body: (diagnostics.get(page) ?? []).join("\n"),
      contentType: "text/plain",
    });
  }
  expect(pageErrors.get(page)).toEqual([]);
});

async function openViewer(page: Page, id = "SYNTH0001") {
  await page.goto(`/photos/${id}?sort=asc`);
  const viewer = page.getByRole("dialog", { name: "Photo viewer" });
  await expect(viewer).toBeVisible();
  const photo = viewer.getByRole("group", { name: id, exact: true });
  await expect(
    photo.locator('img[src^="blob:"], [role="img"][aria-hidden="false"]'),
  ).toBeVisible();
  await expect(
    photo.getByRole("toolbar", { name: "Zoom controls" }),
  ).toBeVisible();
  await expect(photo.locator('img[src*="/thumbnails/"]')).toHaveCount(0);
  await expect(
    viewer.locator('.af-viewer-filmstrip [aria-current="true"]'),
  ).toBeInViewport();
  return { viewer, photo };
}

async function expectSequence(
  viewer: Locator,
  source: "all" | "filtered",
  position: number,
  total: number,
) {
  const sequence = viewer.locator("[data-photo-viewer-sequence]");
  await expect(sequence).toHaveAttribute("data-photo-viewer-sequence", source);
  const label = source === "all" ? "All photos" : "Current filters";
  await expect(sequence).toContainText(
    `${label} · Photo ${position} of ${total}`,
  );
  await expect(sequence).toContainText(`${position} / ${total}`);
}

test("desktop keeps the default inspector and filmstrip while showing the actual sequence", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1365, height: 900 });
  const { viewer } = await openViewer(page);
  await expectSequence(viewer, "all", 1, 18);
  const info = viewer.locator("[data-photo-info]");
  await expect(
    info.getByRole("heading", { name: "Capture Parameters" }),
  ).toBeVisible();
  await expect(
    info.getByRole("heading", { name: "Device Information" }),
  ).toBeVisible();
  await expect.poll(async () => (await info.boundingBox())?.width).toBe(320);
  const fileHeading = info.getByRole("heading", { name: "Basic Information" });
  await expect(fileHeading).toHaveCount(1);
  for (const name of ["Capture Parameters", "Device Information"]) {
    expect(
      await info.getByRole("heading", { name }).evaluate((heading) => {
        const file = [
          ...heading.closest("[data-photo-info]")!.querySelectorAll("h4"),
        ].find((item) => item.textContent === "Basic Information")!;
        return Boolean(
          heading.compareDocumentPosition(file) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        );
      }),
    ).toBe(true);
  }

  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/\/photos\/SYNTH0002\?sort=asc$/);
  await expectSequence(viewer, "all", 2, 18);
  await expect(
    viewer.locator('.af-viewer-filmstrip [aria-current="true"]'),
  ).toHaveAttribute("title", "SYNTH0002");
  await expect.poll(async () => (await info.boundingBox())?.width).toBe(320);
  // Crossing the breakpoint enables viewport refitting. Mobile retains its
  // existing closed-by-default information state until explicitly opened.
  await page.setViewportSize({ width: 390, height: 844 });
  await viewer
    .getByRole("button", { name: "Photo information", exact: true })
    .click();
  await expectSplitLayout(viewer);
});

test("sequence labels follow the filtered set and the existing all-photo fallback", async ({
  page,
}) => {
  const filters = new URLSearchParams({
    sort: "asc",
    cameras: "Polaris P1",
    lenses: "Lumina Vista 35mm F1.8",
  });
  await page.goto(`/?${filters}`);
  await page
    .locator('[data-gallery-photo-link][data-photo-id="SYNTH0014"]')
    .click();
  const viewer = page.getByRole("dialog", { name: "Photo viewer" });
  await expectSequence(viewer, "filtered", 1, 2);
  await page.keyboard.press("ArrowRight");
  await expect(page).toHaveURL(/\/photos\/SYNTH0016\?/);
  await expectSequence(viewer, "filtered", 2, 2);
  // A searched/deep-linked photo outside the filters uses the full library.
  // The label must describe that actual viewer sequence, not just the URL.
  await page.goto(`/photos/SYNTH0001?${filters}`);
  await expectSequence(viewer, "all", 1, 18);
});

async function readLayout(viewer: Locator) {
  return viewer.evaluate((element) => {
    const rect = (selector: string) => {
      const node = element.querySelector(selector)!;
      const box = node.getBoundingClientRect();
      return {
        left: box.left,
        top: box.top,
        right: box.right,
        bottom: box.bottom,
        width: box.width,
        height: box.height,
      };
    };
    return {
      media: rect("[data-photo-viewer-media]"),
      main: rect(".af-viewer-main"),
      strip: rect(".af-viewer-filmstrip"),
      info: rect(".af-viewer-info-shell"),
      viewport: { width: innerWidth, height: innerHeight },
      overflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
}

async function expectSplitLayout(viewer: Locator, landscape = false) {
  await expect(viewer).toHaveAttribute("data-info-open", "true");
  await expect(viewer.locator("[data-photo-info]")).toBeVisible();
  await expect
    .poll(async () => {
      const { media, main, strip, info, viewport, overflow } =
        await readLayout(viewer);
      const fits = [media, strip, info].every(
        (rect) =>
          rect.left >= -1 &&
          rect.top >= -1 &&
          rect.right <= viewport.width + 1 &&
          rect.bottom <= viewport.height + 1,
      );
      const separate = landscape
        ? main.right <= info.left + 1
        : strip.bottom <= info.top + 1;
      return (
        fits &&
        separate &&
        media.bottom <= strip.top + 1 &&
        media.height > 90 &&
        info.height > 100 &&
        overflow <= 0
      );
    })
    .toBe(true);
  await expect(
    viewer.locator('.af-viewer-filmstrip [aria-current="true"]'),
  ).toBeInViewport({ ratio: 1 });
  await expect(
    viewer.getByRole("button", { name: "More photo space" }),
  ).toBeInViewport({ ratio: 1 });
  await expect(
    viewer.getByRole("button", { name: "More info space" }),
  ).toBeInViewport({ ratio: 1 });
}

async function imageDifference(before: Buffer, after: Buffer) {
  const [a, b] = await Promise.all([
    sharp(before).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(after).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  if (a.info.width !== b.info.width || a.info.height !== b.info.height)
    return Number.POSITIVE_INFINITY;
  // The screenshot includes siblings painted over the canvas. Exclude its
  // bottom controls/temporary zoom indicator so only photo pixels decide fit.
  const photoRows = Math.max(1, a.info.height - 80);
  const photoBytes = photoRows * a.info.width * a.info.channels;
  let difference = 0;
  for (let index = 0; index < photoBytes; index++)
    difference += Math.abs(a.data[index]! - b.data[index]!);
  return difference / photoBytes;
}

async function domScale(photo: Locator) {
  return photo
    .locator(".react-transform-component")
    .evaluate(
      (element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).a,
    );
}

async function expectDOMPhotoFits(photo: Locator) {
  await expect
    .poll(() =>
      photo.locator('img[src^="blob:"]').evaluate((image: HTMLImageElement) => {
        const box = image.getBoundingClientRect();
        const viewport = image
          .closest("[data-photo-viewer-media]")!
          .getBoundingClientRect();
        const scale = Math.min(
          box.width / image.naturalWidth,
          box.height / image.naturalHeight,
        );
        const width = image.naturalWidth * scale;
        const height = image.naturalHeight * scale;
        const left = box.left + (box.width - width) / 2;
        const top = box.top + (box.height - height) / 2;
        return (
          width > 0 &&
          height > 0 &&
          left >= viewport.left - 1 &&
          top >= viewport.top - 1 &&
          left + width <= viewport.right + 1 &&
          top + height <= viewport.bottom + 1
        );
      }),
    )
    .toBe(true);
}

for (const scenario of [
  { width: 390, height: 844, renderer: "WebGL" },
  { width: 320, height: 568, renderer: "DOM" },
] as const) {
  test(`${scenario.width}×${scenario.height} ${scenario.renderer} keeps photos and info separate, refits after adjustment, and handles rotation`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({
      width: scenario.width,
      height: scenario.height,
    });
    if (scenario.renderer === "DOM") {
      await page.addInitScript(() => {
        const { getContext } = HTMLCanvasElement.prototype;
        HTMLCanvasElement.prototype.getContext = function (
          this: HTMLCanvasElement,
          ...args: Parameters<typeof getContext>
        ) {
          if (
            args[0] === "webgl" ||
            args[0] === "webgl2" ||
            args[0] === "experimental-webgl"
          )
            return null;
          return Reflect.apply(getContext, this, args);
        } as typeof getContext;
      });
    }
    const { viewer, photo } = await openViewer(page, "SYNTH0002");
    const infoButton = viewer.getByRole("button", {
      name: "Photo information",
      exact: true,
    });
    const closedHeight = (await viewer
      .locator("[data-photo-viewer-media]")
      .boundingBox())!.height;
    await infoButton.click();
    await expectSplitLayout(viewer);
    const balancedHeight = (await readLayout(viewer)).media.height;
    expect(balancedHeight).toBeLessThan(closedHeight);

    const morePhoto = viewer.getByRole("button", { name: "More photo space" });
    const moreInfo = viewer.getByRole("button", { name: "More info space" });
    const zoomIn = photo.getByRole("button", { name: "Zoom in", exact: true });
    const canvas = photo.locator("canvas");
    if (scenario.renderer === "WebGL") await expect(canvas).toBeVisible();
    const initialImage =
      scenario.renderer === "WebGL"
        ? await canvas.screenshot({ animations: "disabled" })
        : null;
    if (scenario.renderer === "DOM") await expectDOMPhotoFits(photo);
    // Several deliberate zoom steps give the synthetic gradient a measurable
    // change before testing refit; a tiny single step can resemble fit.
    for (let step = 0; step < 5; step++) await zoomIn.click();
    if (initialImage) {
      await expect
        .poll(async () =>
          imageDifference(
            initialImage,
            await canvas.screenshot({ animations: "disabled" }),
          ),
        )
        .toBeGreaterThan(3)
        .catch(async (error: unknown) => {
          await testInfo.attach("fit-before-zoom", {
            body: initialImage,
            contentType: "image/png",
          });
          await testInfo.attach("after-zoom", {
            body: await canvas.screenshot({ animations: "disabled" }),
            contentType: "image/png",
          });
          throw error;
        });
    } else {
      await expect.poll(() => domScale(photo)).toBeGreaterThan(1.1);
    }

    await morePhoto.click();
    await expect(morePhoto).toBeDisabled();
    await expect
      .poll(async () => (await readLayout(viewer)).media.height)
      .toBeGreaterThan(balancedHeight);
    await expectSplitLayout(viewer);
    await moreInfo.click();
    await expect
      .poll(async () => (await readLayout(viewer)).media.height)
      .toBeCloseTo(balancedHeight, 0);
    if (initialImage) {
      await expect
        .poll(async () =>
          imageDifference(
            initialImage,
            await canvas.screenshot({ animations: "disabled" }),
          ),
        )
        .toBeLessThan(4);
    } else {
      await expect.poll(() => domScale(photo)).toBeCloseTo(1, 2);
      await expectDOMPhotoFits(photo);
    }
    await moreInfo.click();
    await expect(moreInfo).toBeDisabled();
    await expect
      .poll(async () => (await readLayout(viewer)).media.height)
      .toBeLessThan(balancedHeight);
    await expectSplitLayout(viewer);

    await viewer
      .getByRole("button", { name: "Close photo information" })
      .click();
    await expect(viewer.locator("[data-photo-info]")).toHaveCount(0);
    await expect(infoButton).toHaveAttribute("aria-pressed", "false");
    await expect(infoButton).toBeFocused();
    await expect
      .poll(
        async () =>
          (await viewer.locator("[data-photo-viewer-media]").boundingBox())
            ?.height,
      )
      .toBeCloseTo(closedHeight, 0);
    await infoButton.click();
    await expectSplitLayout(viewer);
    await page.setViewportSize({ width: 568, height: 320 });
    await expectSplitLayout(viewer, true);
    if (scenario.renderer === "DOM") await expectDOMPhotoFits(photo);
    await page.setViewportSize({ width: 844, height: 390 });
    await expectSplitLayout(viewer, true);
    if (scenario.renderer === "DOM") await expectDOMPhotoFits(photo);

    // Exercise a landscape photograph in the same compact inspector layout.
    await viewer
      .locator(".af-viewer-filmstrip")
      .getByRole("button", { name: "Open SYNTH0001", exact: true })
      .click();
    await expectSequence(viewer, "all", 1, 18);
    await expectSplitLayout(viewer, true);
    if (scenario.renderer === "DOM") {
      const landscapePhoto = viewer.getByRole("group", {
        name: "SYNTH0001",
        exact: true,
      });
      await expect(landscapePhoto.locator('img[src^="blob:"]')).toBeVisible();
      await expectDOMPhotoFits(landscapePhoto);
    }
  });
}
