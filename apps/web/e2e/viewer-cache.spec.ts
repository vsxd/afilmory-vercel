import { fileURLToPath } from "node:url";

import type { Locator, Page } from "@playwright/test";
import { devices, expect, test } from "@playwright/test";
import sharp from "sharp";

import fixtureManifest from "./fixtures/photos-manifest.json" with { type: "json" };
import { stubCartoBasemap } from "./helpers";

interface WorkerObservation {
  worker: number;
  direction: "request" | "response";
  type: string;
  skipBaseTexture?: boolean;
}

type ProbeWindow = Window & {
  viewerCacheProbe?: WorkerObservation[];
};

// Observe the real workers without replacing decoding, uploads, or rendering.
async function observeTextureWorkers(page: Page) {
  await page.addInitScript(() => {
    const observations: WorkerObservation[] = [];
    (window as ProbeWindow).viewerCacheProbe = observations;
    const NativeWorker = window.Worker;
    let nextId = 0;
    window.Worker = class extends NativeWorker {
      private readonly observationId: number | null;

      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.observationId =
          options?.name === "texture-worker" ? ++nextId : null;
        if (this.observationId === null) return;
        this.addEventListener("message", (event) => {
          observations.push({
            worker: this.observationId!,
            direction: "response",
            type: event.data.type,
          });
        });
      }

      override postMessage(
        message: unknown,
        options?: Transferable[] | StructuredSerializeOptions,
      ) {
        const request = message as {
          type: string;
          payload?: { skipBaseTexture?: boolean };
        };
        if (this.observationId !== null) {
          observations.push({
            worker: this.observationId,
            direction: "request",
            type: request.type,
            skipBaseTexture: request.payload?.skipBaseTexture,
          });
        }
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
    };
  });
}

async function observations(page: Page) {
  return page.evaluate(() => (window as ProbeWindow).viewerCacheProbe ?? []);
}

async function paintedCanvas(viewer: Locator, id: string) {
  const photo = viewer.getByRole("group", { name: id, exact: true });
  // aria-hidden changes only after onImagePainted. A thumbnail or DOM fallback
  // cannot satisfy this locator, even if the viewer silently fails WebGL.
  const canvas = photo
    .getByRole("img", { name: id, exact: true })
    .locator("canvas");
  await expect(canvas).toBeVisible();
  await expect(photo.locator('img[src*="/thumbnails/"]')).toHaveCount(0);
  return { photo, canvas };
}

async function imageDifference(a: Buffer, b: Buffer) {
  const [before, after] = await Promise.all([
    sharp(a).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
    sharp(b).removeAlpha().raw().toBuffer({ resolveWithObject: true }),
  ]);
  expect(after.info).toEqual(before.info);
  const { width, height, channels } = before.info;
  let difference = 0;
  let count = 0;
  // Compare the photo center, excluding transient zoom badges and controls.
  for (let y = Math.floor(height * 0.2); y < height * 0.7; y++) {
    for (let x = Math.floor(width * 0.2); x < width * 0.8; x++) {
      const index = (y * width + x) * channels;
      for (let channel = 0; channel < channels; channel++) {
        difference += Math.abs(
          before.data[index + channel]! - after.data[index + channel]!,
        );
        count++;
      }
    }
  }
  return difference / count;
}

async function swipe(
  page: Page,
  surface: Locator,
  direction: "next" | "previous",
) {
  const box = (await surface.boundingBox())!;
  const sign = direction === "next" ? -1 : 1;
  const start = box.x + box.width * (direction === "next" ? 0.8 : 0.2);
  const y = box.y + box.height * 0.45;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: start, y }],
  });
  for (let step = 1; step <= 12; step++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: start + sign * box.width * 0.6 * (step / 12), y }],
    });
  }
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await cdp.detach();
}

for (const mobile of [false, true]) {
  test.describe(mobile ? "mobile viewer cache" : "desktop viewer cache", () => {
    test.use({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1365, height: 900 },
      deviceScaleFactor: mobile ? 3 : 1,
      isMobile: mobile,
      hasTouch: mobile,
      userAgent: async ({ browserName }, provideUserAgent) => {
        await provideUserAgent(
          mobile
            ? devices[browserName === "webkit" ? "iPhone 15" : "Pixel 5"]
                .userAgent
            : undefined,
        );
      },
      serviceWorkers: "block",
    });

    test("returns to a painted JPEG without another base decode and still resolves zoom tiles", async ({
      page,
      browserName,
    }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await observeTextureWorkers(page);
      await stubCartoBasemap(page);
      await page.route("**/thumbnails/**", (route) => {
        const filename = new URL(route.request().url()).pathname
          .split("/")
          .at(-1)!;
        return route.fulfill({
          contentType: filename.endsWith(".webm") ? "video/webm" : "image/jpeg",
          path: fileURLToPath(
            new URL(`fixtures/thumbnails/${filename}`, import.meta.url),
          ),
        });
      });
      const requests = new Map<string, number>();
      const originals = new Map<string, Promise<Buffer>>();
      await page.route("https://photos.fixture.test/**", async (route) => {
        const id = new URL(route.request().url()).pathname
          .split("/")
          .at(-1)!
          .replace(/\.jpg$/, "");
        requests.set(id, (requests.get(id) ?? 0) + 1);
        if (!originals.has(id)) {
          const photo = fixtureManifest.photos.find((item) => item.id === id)!;
          originals.set(
            id,
            sharp(
              fileURLToPath(
                new URL(`fixtures/thumbnails/${id}.jpg`, import.meta.url),
              ),
            )
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
          body: await originals.get(id)!,
        });
      });

      await page.goto("/photos/SYNTH0001?sort=asc");
      const viewer = page.getByRole("dialog", { name: "Photo viewer" });
      const { photo, canvas } = await paintedCanvas(viewer, "SYNTH0001");
      const firstCanvas = await canvas.elementHandle();
      const firstPixels = await canvas.screenshot({ animations: "disabled" });
      const surface = viewer.locator(".swiper").first();
      if (mobile && browserName === "chromium")
        await swipe(page, surface, "next");
      else await page.keyboard.press("ArrowRight");
      await expect(page).toHaveURL(/\/photos\/SYNTH0002\?sort=asc$/);
      await paintedCanvas(viewer, "SYNTH0002");
      expect(
        await firstCanvas!.evaluate((element) => element.isConnected),
      ).toBe(false);
      // An already-painted inactive slide must still have an image to reveal
      // under the finger; its WebGL child has been deliberately released.
      await expect(photo.locator('img[src*="/thumbnails/"]')).toHaveCount(1);

      const beforeReturn = (await observations(page)).length;
      if (mobile && browserName === "chromium")
        await swipe(page, surface, "previous");
      else await page.keyboard.press("ArrowLeft");
      await expect(page).toHaveURL(/\/photos\/SYNTH0001\?sort=asc$/);
      const returned = await paintedCanvas(viewer, "SYNTH0001");
      await expect
        .poll(async () =>
          (await observations(page))
            .slice(beforeReturn)
            .some(
              (event) =>
                event.direction === "request" &&
                event.type === "load-image" &&
                event.skipBaseTexture === true,
            ),
        )
        .toBe(true);
      const warmLoad = (await observations(page))
        .slice(beforeReturn)
        .find((event) => event.type === "load-image")!;
      await expect
        .poll(async () =>
          (await observations(page)).some(
            (event) =>
              event.worker === warmLoad.worker && event.type === "init-done",
          ),
        )
        .toBe(true);
      expect(
        (await observations(page)).filter(
          (event) =>
            event.worker === warmLoad.worker && event.type === "image-loaded",
        ),
      ).toEqual([]);
      expect(requests.get("SYNTH0001")).toBe(1);
      await expect(
        viewer.locator("[data-photo-viewer-media]").getByRole("status"),
      ).toHaveCount(0);
      expect(
        await imageDifference(
          firstPixels,
          await returned.canvas.screenshot({ animations: "disabled" }),
        ),
      ).toBeLessThan(2);

      // Warm previews still need the real high-resolution source when zooming.
      // Exercise that lazy path, then verify actual pixels change as well.
      const zoom = returned.photo.getByRole("button", {
        name: "Zoom in",
        exact: true,
      });
      for (let step = 0; step < 20; step++) await zoom.click();
      await expect
        .poll(async () =>
          (await observations(page)).some(
            (event) =>
              event.worker === warmLoad.worker && event.type === "tile-created",
          ),
        )
        .toBe(true);
      expect(
        await imageDifference(
          firstPixels,
          await returned.canvas.screenshot({ animations: "disabled" }),
        ),
      ).toBeGreaterThan(3);
      await expect(viewer.getByRole("alert")).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  });
}
