import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

// 生产构建冒烟（webServer 见 scripts/e2e-prod-server.ts，经
// `pnpm test:e2e:prod` 触发）：dev server 永远跑不到的产物形态——外部
// manifest 资产 + index.html 内联 fetch 脚本、压缩/手动分块 bundle、PWA
// Service Worker——只在这里于真实浏览器中验证。
//
// fixture 缩略图已由 e2e-prod-server 写进 dist，Speed Insights 在 E2E
// 环境显式关闭。页面加载全程零 404，本站资源一律不用 route stub —— 这很关键：SW
// （clientsClaim + skipWaiting）激活后接管的请求 Playwright route 拦截不到，
// 只有真实文件才能保证确定性。字体也来自仓库内的静态资源，不访问外网。
// 原图域名是虚构的 .test 域，打开查看器后必然加载失败（降级回缩略图态），
// 因此 console error 断言只覆盖首屏加载 + SW 注册阶段。

// Web Delivery Manifest v3 的轻量 gallery index 与按需详情分片。
const EXTERNAL_MANIFEST_ASSET = /\/assets\/gallery-index\.[0-9a-f]{10}\.json/;
const PHOTO_DETAIL_ASSET =
  /\/assets\/photo-details\.(?:root|[01]+(?:-\d+)?)\.[0-9a-f]{10}\.json/;

test.describe("production original image loading", () => {
  // Keep the CDN fixture interceptable; the separate smoke test below covers SW.
  test.use({ serviceWorkers: "block" });

  test("retains a DOM image URL across eviction and releases it when the viewer closes", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const { getContext } = HTMLCanvasElement.prototype;
      HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        ...args
      ) {
        if (String(args[0]).includes("webgl")) return null;
        return Reflect.apply(getContext, this, args);
      } as typeof getContext;
      // Exercise the real byte-budget eviction using small image fixtures.
      const size = Object.getOwnPropertyDescriptor(
        Blob.prototype,
        "size",
      )!.get!;
      Object.defineProperty(Blob.prototype, "size", {
        configurable: true,
        get() {
          return this.type === "image/jpeg"
            ? 140 * 1024 * 1024
            : size.call(this);
        },
      });
    });
    await page.route("https://photos.fixture.test/**", (route) =>
      route.fulfill({
        contentType: "image/jpeg",
        path: fileURLToPath(
          new URL("fixtures/thumbnails/SYNTH0001.jpg", import.meta.url),
        ),
      }),
    );
    await page.goto("/");
    await page.locator('[data-photo-id="SYNTH0001"]').click();
    const viewer = page.getByRole("dialog", { name: "Photo viewer" });
    const first = viewer.getByRole("group", { name: "SYNTH0001", exact: true });
    const original = first.locator('img[src^="blob:"]');
    await expect(original).toBeVisible();
    const firstUrl = (await original.getAttribute("src"))!;
    await expect
      .poll(() =>
        original.evaluate((img) => (img as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
    await page.keyboard.press("ArrowLeft");
    await expect(page).not.toHaveURL(/\/photos\/SYNTH0001(?:\?|$)/);
    const second = viewer
      .getByRole("group", { name: "SYNTH0002", exact: true })
      .locator('img[src^="blob:"]');
    await expect(second).toBeVisible();
    await expect
      .poll(() =>
        second.evaluate((img) => (img as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
    await page.keyboard.press("ArrowRight");
    await expect(page).toHaveURL(/\/photos\/SYNTH0001(?:\?|$)/);
    await expect(original).toHaveAttribute("src", firstUrl);
    await expect
      .poll(() =>
        original.evaluate((img) => (img as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
    expect(
      await page.evaluate(async (url) => (await fetch(url)).ok, firstUrl),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(viewer).toHaveCount(0);
    expect(
      await page.evaluate(
        async (url) =>
          fetch(url).then(
            () => true,
            () => false,
          ),
        firstUrl,
      ),
    ).toBe(false);
  });

  test("downloads, detects, and paints an original image without errors", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("https://photos.fixture.test/**", (route) =>
      route.fulfill({
        contentType: "image/jpeg",
        path: fileURLToPath(
          new URL("fixtures/thumbnails/SYNTH0001.jpg", import.meta.url),
        ),
      }),
    );
    await page.goto("/");
    await page.locator('[data-photo-id="SYNTH0001"]').click();
    const viewer = page.getByRole("dialog", { name: "Photo viewer" });
    const photo = viewer.getByRole("group", { name: "SYNTH0001", exact: true });
    // The WebGL wrapper becomes accessible only after onImagePainted. Require
    // its canvas so a thumbnail or silent DOM fallback cannot pass this test.
    await expect(
      photo
        .getByRole("img", { name: "SYNTH0001", exact: true })
        .locator("canvas"),
    ).toBeVisible();
    await expect(photo.locator('img[src*="/thumbnails/"]')).toHaveCount(0);
    await expect(viewer.getByRole("alert")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

test("production bundle serves gallery, viewer route, and service worker", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(`console: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => {
    consoleErrors.push(`pageerror: ${error.message}`);
  });
  const manifestRequests: string[] = [];
  const detailRequests: string[] = [];
  page.on("request", (request) => {
    if (EXTERNAL_MANIFEST_ASSET.test(request.url())) {
      manifestRequests.push(request.url());
    }
    if (PHOTO_DETAIL_ASSET.test(request.url()))
      detailRequests.push(request.url());
  });

  await page.goto("/");

  // 画廊从生产 bundle 渲染出照片格。
  await expect(
    page.getByRole("button", { name: "Search & Filter" }),
  ).toBeVisible();
  const photoItems = page.locator("[data-photo-id]");
  await expect(photoItems.first()).toBeVisible();
  expect(await photoItems.count()).toBeGreaterThan(0);
  // 生产专属：manifest 以外部 hashed 资产 + 内联 fetch 脚本交付（dev server
  // 走 /__afilmory/ 中间件、内嵌模式则完全无请求）。不能断言
  // window.__AFILMORY__.manifest.mode === 'external'：manifest 加载完成后
  // setRuntimeManifest（src/runtime/browser-runtime.ts）会把它归一成
  // { mode: 'inline', data }，画廊可见时必然已是 inline。改为断言两个
  // 免竞态的产物形态：#manifest 内联脚本里烘焙了 hashed 资产 URL，
  // 且页面确实对该资产发起过请求。
  expect(
    await page.evaluate(
      () => document.querySelector("#manifest")?.textContent ?? "",
    ),
  ).toMatch(EXTERNAL_MANIFEST_ASSET);
  expect(manifestRequests).not.toEqual([]);
  // Full EXIF/tone/location records are not part of the startup request graph.
  expect(detailRequests).toEqual([]);

  // 生产专属：Service Worker 注册并激活（registerType: autoUpdate）。
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const registration = await navigator.serviceWorker?.getRegistration();
          return registration?.active?.state ?? null;
        }),
      { timeout: 15_000 },
    )
    .toBe("activated");

  // A controlled navigation to a real static document must bypass the SPA
  // NavigationRoute. Without navigateFallbackDenylist Workbox serves
  // index.html here, silently breaking feeds/originals/photo SEO shells.
  const feedPage = await page.context().newPage();
  const feedResponse = await feedPage.goto("/feed.xml");
  expect(feedResponse?.headers()["content-type"]).toMatch(
    /^(?:application|text)\/xml(?:;|$)/,
  );
  expect(await feedPage.content()).toContain("<rss");
  expect(await feedPage.content()).toContain("Afilmory");
  await feedPage.close();

  // 加载 + SW 注册全程无 error 级 console 输出。
  expect(consoleErrors).toEqual([]);

  // 点击照片打开查看器路由（原图来自虚构 CDN 域，此后不再断言 console）。
  await photoItems.first().click();
  await expect(
    page.getByRole("dialog", { name: "Photo viewer" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/photos\/[^/?]+/);
  await expect.poll(() => detailRequests.length).toBeGreaterThan(0);
});

test.describe("production navigation journeys", () => {
  test.use({ serviceWorkers: "block" });
  test.beforeEach(async ({ page }) => {
    const { stubCartoBasemap, VIEWER_FIXTURE_IMAGE_PATH } =
      await import("./helpers");
    await stubCartoBasemap(page);
    await page.route("https://photos.fixture.test/**", (route) =>
      route.fulfill({
        contentType: "image/png",
        path: VIEWER_FIXTURE_IMAGE_PATH,
      }),
    );
  });

  test("trailing-slash detail opens and standalone close returns to filtered gallery", async ({
    page,
  }) => {
    await page.goto("/photos/SYNTH0001/?sort=asc");
    const viewer = page.getByRole("dialog", { name: "Photo viewer" });
    await expect(viewer).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/\?sort=asc$/);
    await expect(viewer).toHaveCount(0);
  });

  test("gallery → map → gallery preserves sort; standalone map parameters stay on map", async ({
    page,
  }) => {
    await page.goto("/?sort=asc");
    await page
      .getByRole("button", { name: "Map Explore", exact: true })
      .click();
    await expect(page).toHaveURL(/\/explore$/);
    await page
      .getByRole("button", { name: "Back to Gallery", exact: true })
      .click();
    await expect(page).toHaveURL(/\/\?sort=asc$/);
    await page.goto("/explore?mode=photos");
    await page
      .getByRole("button", { name: "Back to Gallery", exact: true })
      .click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("detail → map → gallery does not reopen the viewer", async ({
    page,
  }) => {
    await page.goto("/photos/SYNTH0001?sort=asc");
    await page
      .getByRole("link", { name: "View location in map", exact: true })
      .click();
    await expect(page).toHaveURL(/\/explore\?photoId=SYNTH0001$/);
    await page
      .getByRole("button", { name: "Back to Gallery", exact: true })
      .click();
    await expect(page).toHaveURL(/\/\?sort=asc$/);
    await expect(
      page.getByRole("dialog", { name: "Photo viewer" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Map Explore", exact: true }),
    ).toBeVisible();
  });

  test("stepping replaces detail history and forward reopens a closed viewer", async ({
    page,
  }) => {
    await page.goto("/");
    await page
      .locator('[data-gallery-photo-link][data-photo-id="SYNTH0001"]')
      .click();
    const viewer = page.getByRole("dialog", { name: "Photo viewer" });
    await expect(viewer).toBeVisible();
    await page.keyboard.press("ArrowLeft");
    await expect(page).toHaveURL(/\/photos\/SYNTH0002$/);
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/$/);
    await page.goForward();
    await expect(page).toHaveURL(/\/photos\/SYNTH0002$/);
    await expect(viewer).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    await expect(viewer).toHaveCount(0);
  });
});

test.describe("production gallery view restoration", () => {
  test.use({ serviceWorkers: "block" });
  test("restores scroll position after visiting map", async ({ page }) => {
    const { stubCartoBasemap } = await import("./helpers");
    await stubCartoBasemap(page);
    await page.goto("/?sort=asc");
    const viewport = page.locator(
      "#main-content [data-radix-scroll-area-viewport]",
    );
    await expect(
      page.locator("[data-gallery-photo-link]").first(),
    ).toBeVisible();
    await viewport.evaluate((element) => {
      element.scrollTop = 400;
    });
    await expect
      .poll(() => viewport.evaluate((element) => element.scrollTop))
      .toBe(400);
    // Activate the actual map button without Playwright scrolling its header into view.
    await page
      .getByRole("button", { name: "Map Explore", exact: true })
      .first()
      .evaluate((element: HTMLButtonElement) => element.click());
    await expect(page).toHaveURL(/\/explore$/);
    await page
      .getByRole("button", { name: "Back to Gallery", exact: true })
      .click();
    await expect(page).toHaveURL(/\/\?sort=asc$/);
    await expect
      .poll(() => viewport.evaluate((element) => element.scrollTop))
      .toBe(400);
  });
});

test.describe("production detail actions", () => {
  test.use({ serviceWorkers: "block" });
  test.beforeEach(async ({ page }) => {
    const { VIEWER_FIXTURE_IMAGE_PATH, stubCartoBasemap } =
      await import("./helpers");
    await stubCartoBasemap(page);
    await page.route("https://photos.fixture.test/**", (route) =>
      route.fulfill({
        contentType: "image/png",
        path: VIEWER_FIXTURE_IMAGE_PATH,
      }),
    );
  });

  test("reduced motion close completes without waiting for an animation", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page
      .locator('[data-gallery-photo-link][data-photo-id="SYNTH0001"]')
      .click();
    await expect(
      page.getByRole("dialog", { name: "Photo viewer" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole("dialog", { name: "Photo viewer" }),
    ).toHaveCount(0);
  });

  test("copy link shares the canonical photo URL without browsing context", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(
      "/photos/SYNTH0001?sort=asc&returnTo=%2Fexplore%3Fmode%3Dphotos",
    );
    const viewer = page.getByRole("dialog", { name: "Photo viewer" });
    await expect(viewer).toBeVisible();
    await viewer.getByRole("button", { name: "Share Photo" }).click();
    await page.getByRole("button", { name: "Copy Link" }).click();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(`${new URL(page.url()).origin}/photos/SYNTH0001`);
  });
});
