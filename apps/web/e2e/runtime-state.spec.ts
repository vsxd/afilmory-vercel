import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import {
  stubCartoBasemap,
  stubLocalThumbnails,
  VIEWER_FIXTURE_IMAGE_PATH,
} from "./helpers";

const LEGACY_GLOBALS = [
  "__CONFIG__",
  "__SITE_CONFIG__",
  "__MANIFEST__",
  "__MANIFEST_URL__",
  "__MANIFEST_PROMISE__",
  "__AFILMORY_STARTUP__",
  "router",
] as const;

function collectRuntimeDiagnostics(page: Page): string[] {
  const diagnostics: string[] = [];

  page.on("console", (message) => {
    const text = message.text();
    const type = message.type();
    const isAppWarningOrError = type === "error" || type === "warning";
    const isKnownRuntimeWarning =
      /HydrateFallback|non-boolean attribute|mask is not defined|localStorage is not available/.test(
        text,
      );
    const isKnownBrowserGpuWarning =
      type === "warning" &&
      /GL Driver Message .*GPU stall due to ReadPixels/.test(text);
    const isKnownAfilmoryDebugOutput =
      type === "info" &&
      /\[PhotoRepository\]|import\.meta\.glob keys|routeObject:|LRU Cache:|Map: Selected|Found \d+ photos with GPS coordinates|ExifTool loaded|Registered image converter strategy|Detected file type|Found suitable conversion strategy|No strategy found|Converting image|Regular image cache|Processing Motion Photo|Motion Photo video|Falling back to regular image processing|Using cached|Converting MOV|Video cache|Target format|conversion completed|Starting simple transmux conversion/.test(
        text,
      );

    if (
      (isAppWarningOrError && !isKnownBrowserGpuWarning) ||
      isKnownRuntimeWarning ||
      isKnownAfilmoryDebugOutput
    ) {
      // 失败输出里带上来源位置，省一轮"这条 console 是谁打的"排查。
      const loc = message.location();
      diagnostics.push(
        `${type}: ${text} @@ ${loc.url}:${loc.lineNumber}:${loc.columnNumber}`,
      );
    }
  });

  page.on("pageerror", (error) => {
    diagnostics.push(`pageerror: ${error.message}`);
  });

  return diagnostics;
}

async function openGallery(page: Page) {
  await page.goto(`/?e2e=${Date.now()}`);
  await expect(
    page.getByRole("button", { name: "Search & Filter" }),
  ).toBeVisible();
  // 纯计算 masonry（无 gridcell 角色）：用照片格的 data-photo-id 稳定定位。
  await expect(page.locator("[data-photo-id]").first()).toBeVisible();
}

async function openCommandPalette(page: Page) {
  await page.getByRole("button", { name: "Search & Filter" }).click();
  const input = page
    .getByRole("dialog", { name: "Search & Filter" })
    .getByRole("combobox");
  await expect(input).toBeVisible();
  return input;
}

async function stubOriginalImages(page: Page) {
  // 合成 fixture 的原图域名（.test 保留 TLD，不会真实解析）——见
  // scripts/create-synthetic-e2e-fixture.ts。
  await page.route("https://photos.fixture.test/**", async (route) => {
    await route.fulfill({
      contentType: "image/png",
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
      path: VIEWER_FIXTURE_IMAGE_PATH,
    });
  });
}

test.beforeEach(async ({ page }) => {
  await stubCartoBasemap(page);
  await stubLocalThumbnails(page);
});

test("loads the gallery from the unified browser runtime namespace", async ({
  page,
}) => {
  const diagnostics = collectRuntimeDiagnostics(page);

  await openGallery(page);

  const runtimeState = await page.evaluate((legacyGlobals) => {
    const appWindow = window as typeof window & {
      __AFILMORY__?: {
        config?: unknown;
        manifest?: {
          data?: {
            schema?: unknown;
            version?: unknown;
            photos?: unknown[];
          };
        };
      };
    } & Record<string, unknown>;
    const runtime = appWindow.__AFILMORY__;
    const scriptText = [...document.querySelectorAll("script")]
      .map((script) => script.textContent ?? "")
      .join("\n");

    return {
      configInjected: scriptText.includes("window.__AFILMORY__.config"),
      hasConfig: Boolean(runtime?.config),
      hasManifest: Boolean(runtime?.manifest),
      manifestSchema: runtime?.manifest?.data?.schema,
      manifestVersion: runtime?.manifest?.data?.version,
      manifestPhotoCount: Array.isArray(runtime?.manifest?.data?.photos)
        ? runtime.manifest.data.photos.length
        : 0,
      oldGlobals: Object.fromEntries(
        legacyGlobals.map((key) => [key, typeof appWindow[key]]),
      ),
      oldGlobalStringsInScripts:
        /__CONFIG__|__SITE_CONFIG__|__MANIFEST_PROMISE__|window\.router/.test(
          scriptText,
        ),
    };
  }, LEGACY_GLOBALS);

  expect(runtimeState.configInjected).toBe(true);
  expect(runtimeState.hasConfig).toBe(true);
  expect(runtimeState.hasManifest).toBe(true);
  expect(runtimeState.manifestSchema).toBe("afilmory.manifest");
  expect(runtimeState.manifestVersion).toBe(2);
  expect(runtimeState.manifestPhotoCount).toBeGreaterThan(0);
  expect(runtimeState.oldGlobalStringsInScripts).toBe(false);
  expect(runtimeState.oldGlobals).toEqual(
    Object.fromEntries(LEGACY_GLOBALS.map((key) => [key, "undefined"])),
  );
  expect(diagnostics).toEqual([]);
});

test("opens the viewer from command search and restores route and scroll state", async ({
  page,
}) => {
  const diagnostics = collectRuntimeDiagnostics(page);

  await stubOriginalImages(page);
  await openGallery(page);
  const input = await openCommandPalette(page);
  await input.fill("SYNTH00");
  await expect(
    page.getByRole("option", { name: /SYNTH00/ }).first(),
  ).toBeVisible();
  await input.press("Enter");

  await expect(page).toHaveURL(/\/photos\/[^/?]+/);
  const viewer = page.getByRole("dialog", { name: "Photo viewer" });
  await expect(viewer).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.body).overflow))
    .toBe("hidden");

  await expect(
    page.getByRole("heading", { name: "Photo Inspector" }),
  ).toBeVisible();
  await expect(page.getByText("Basic Information")).toBeVisible();

  await viewer.getByRole("button", { name: "Share Photo" }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy Link" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await viewer.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog", { name: "Photo viewer" })).toHaveCount(
    0,
  );
  await expect(page).toHaveURL(/\/(\?.*)?$/);
  await expect
    .poll(() => page.evaluate(() => getComputedStyle(document.body).overflow))
    .not.toBe("hidden");
  expect(diagnostics).toEqual([]);
});

test("applies and resets command-palette camera filters through URL state", async ({
  page,
}) => {
  const diagnostics = collectRuntimeDiagnostics(page);

  await openGallery(page);
  const input = await openCommandPalette(page);
  await input.fill("Lumina LX-7");
  await expect(
    page.getByRole("option", { name: /Lumina LX-7.*Camera Filter/ }),
  ).toBeVisible();
  await input.press("Enter");

  await expect(page).toHaveURL(/cameras=Lumina\+LX-7/);
  await expect(page.getByText("Current Filters")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Clear Lumina LX-7" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Reset search and filters" }).click();
  await page.keyboard.press("Escape");

  await expect
    .poll(() =>
      page.evaluate(() =>
        new URL(window.location.href).searchParams.has("cameras"),
      ),
    )
    .toBe(false);
  await expect(page.getByText("Current Filters")).toHaveCount(0);
  expect(diagnostics).toEqual([]);
});

test("does not let pending gallery URL canonicalization undo map navigation", async ({
  page,
}) => {
  await page.addInitScript(() => {
    let didClickMap = false;
    const clickMapAsSoonAsItMounts = () => {
      if (didClickMap) return;
      const mapButton = [...document.querySelectorAll("button")].find(
        (button) => button.getAttribute("aria-label") === "Map Explore",
      );
      if (!mapButton) return;
      didClickMap = true;
      mapButton.click();
    };

    new MutationObserver(clickMapAsSoonAsItMounts).observe(document, {
      childList: true,
      subtree: true,
    });
  });

  // `rating` is a removed legacy parameter. Its canonicalization used to
  // run in a passive gallery effect after the page was already interactive;
  // when map navigation won the preceding microtask, that stale effect could
  // still resolve its route-relative setSearchParams call back to `/`.
  await page.goto(`/?e2e=${Date.now()}&rating=5`);

  await expect(page).toHaveURL(/\/explore$/);
});

test("opens the map route and renders MapLibre data from runtime services", async ({
  page,
}) => {
  const diagnostics = collectRuntimeDiagnostics(page);

  await openGallery(page);
  await page.getByRole("button", { name: "Map Explore" }).click();

  await expect(page).toHaveURL(/\/explore$/);
  await expect(
    page.getByRole("heading", { name: "Explore Map" }),
  ).toBeVisible();
  // 合成 fixture 里 GPS 照片横跨恰好 4 个虚构国家（见
  // scripts/create-synthetic-e2e-fixture.ts 的 COUNTRIES），可做精确断言。
  await expect(page.getByText("Found 4 countries")).toBeVisible();
  await expect(page.locator(".maplibregl-map")).toBeVisible();
  await expect.poll(() => page.locator("canvas").count()).toBeGreaterThan(0);
  expect(diagnostics).toEqual([]);
});

test("map photo roundtrip restores the selected marker and panned camera", async ({
  page,
}) => {
  await stubOriginalImages(page);
  await page.goto("/explore?mode=photos&photoId=SYNTH0001");
  const photoLink = page.locator('a[href^="/photos/SYNTH0001"]').first();
  await expect(photoLink).toBeVisible();
  const canvas = page.locator("canvas.maplibregl-canvas");
  const markerPosition = () =>
    photoLink.evaluate((element) => {
      const rect = element
        .closest(".maplibregl-marker")!
        .getBoundingClientRect();
      return { x: rect.x, y: rect.y };
    });
  const initial = await markerPosition();
  await canvas.focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(async () => Math.abs((await markerPosition()).x - initial.x))
    .toBeGreaterThan(50);
  // Wait for the real map's pan inertia to settle before capturing its position.
  let last = await markerPosition();
  await expect
    .poll(async () => {
      const next = await markerPosition();
      const difference = Math.abs(next.x - last.x) + Math.abs(next.y - last.y);
      last = next;
      return difference;
    })
    .toBeLessThan(1);
  const before = await markerPosition();
  await photoLink.click();
  const viewer = page.getByRole("dialog", { name: "Photo viewer" });
  await expect(viewer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/explore\?mode=photos&photoId=SYNTH0001$/);
  await expect(photoLink).toBeVisible();
  await expect
    .poll(async () => {
      const after = await markerPosition();
      return Math.abs(after.x - before.x) + Math.abs(after.y - before.y);
    })
    .toBeLessThan(3);
});
