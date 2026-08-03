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
