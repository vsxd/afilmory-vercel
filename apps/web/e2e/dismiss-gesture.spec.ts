import { fileURLToPath } from "node:url";

import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

// 同 runtime-state.spec：缩略图是 gitignore 的构建产物，用本地 PNG 兜住，让画廊离线渲染。
const VIEWER_FIXTURE_IMAGE_PATH = fileURLToPath(
  new URL("../public/favicon-48x48.png", import.meta.url),
);

async function stubLocalThumbnails(page: Page) {
  await page.route("**/thumbnails/**", async (route) => {
    await route.fulfill({
      contentType: "image/png",
      headers: { "Cache-Control": "no-store" },
      path: VIEWER_FIXTURE_IMAGE_PATH,
    });
  });
}

async function openGallery(page: Page) {
  await page.goto(`/?e2e=${Date.now()}`);
  await expect(
    page.getByRole("button", { name: "Search & Filter" }),
  ).toBeVisible();
  // 瀑布流照片格用 data-photo-id 稳定定位（纯计算 masonry 无 gridcell 角色）。
  await expect(page.locator("[data-photo-id]").first()).toBeVisible();
}

/**
 * 打开查看器并返回 [dialog, 拖拽面 surface]。手势在缩略图态即可跑（高清原图跨域加载
 * 失败、WebGL canvas 不挂载——见 memory/viewer-requires-cdn-cors）；不做严格 console
 * 断言，避免该 CORS 噪声与 headless WebGL 的不确定性。
 */
async function openViewer(page: Page): Promise<[Locator, Locator]> {
  await openGallery(page);
  await page.locator("[data-photo-id]").first().click();
  const dialog = page.getByRole("dialog", { name: "Photo viewer" });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/photos\/[^/?]+/);
  const surface = dialog.locator(".swiper").first();
  await expect(surface).toBeVisible();
  return [dialog, surface];
}

async function surfaceCenter(
  surface: Locator,
): Promise<{ x: number; y: number }> {
  const box = await surface.boundingBox();
  if (!box) throw new Error("drag surface has no bounding box");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** 桌面：用真实鼠标事件从媒体面中心向下拖 dy 像素。 */
async function mouseDragDown(
  page: Page,
  surface: Locator,
  dy: number,
  steps = 12,
) {
  const { x, y } = await surfaceCenter(surface);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + dy, { steps });
  await page.mouse.up();
}

/** 移动：经 CDP 派发真实触摸序列向下拖 dy 像素（Playwright 内建 touchscreen 只有 tap）。 */
async function touchDragDown(
  page: Page,
  surface: Locator,
  dy: number,
  steps = 12,
) {
  const { x, y } = await surfaceCenter(surface);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  for (let i = 1; i <= steps; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: y + (dy * i) / steps }],
    });
  }
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await cdp.detach();
}

// 关闭后返回瀑布流的路由是 `/` 或 `/?...`（layout 延迟 ~500ms navigate，toHaveURL 自动重试兜住）。
const GALLERY_URL = /\/(\?.*)?$/;
const VIEWER_URL = /\/photos\/[^/?]+/;

test.beforeEach(async ({ page }) => {
  await stubLocalThumbnails(page);
});

test.describe("下滑关闭手势的动画结束态", () => {
  test("桌面：向下拖过阈值 → 关闭并回到瀑布流", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "鼠标路径仅在桌面 project 跑",
    );
    const [dialog, surface] = await openViewer(page);
    await mouseDragDown(page, surface, 400);
    await expect(page).toHaveURL(GALLERY_URL);
    await expect(dialog).toBeHidden();
  });

  test("桌面：向下短拖不过阈值 → 弹回，查看器保持打开", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "鼠标路径仅在桌面 project 跑",
    );
    const [dialog, surface] = await openViewer(page);
    await mouseDragDown(page, surface, 60);
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(VIEWER_URL);
  });

  test("移动：触摸向下拖过阈值 → 关闭并回到瀑布流", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile",
      "触摸路径仅在移动 project 跑",
    );
    const [dialog, surface] = await openViewer(page);
    await touchDragDown(page, surface, 400);
    await expect(page).toHaveURL(GALLERY_URL);
    await expect(dialog).toBeHidden();
  });

  test("移动：触摸向下短拖不过阈值 → 弹回，查看器保持打开", async ({
    page,
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== "mobile",
      "触摸路径仅在移动 project 跑",
    );
    const [dialog, surface] = await openViewer(page);
    await touchDragDown(page, surface, 60);
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(VIEWER_URL);
  });
});
