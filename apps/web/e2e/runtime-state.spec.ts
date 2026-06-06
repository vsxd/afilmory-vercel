import { fileURLToPath } from "node:url";

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

const VIEWER_FIXTURE_IMAGE_PATH = fileURLToPath(
  new URL("../public/favicon-48x48.png", import.meta.url),
);

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
    const isKnownExternalAbort =
      type === "error" &&
      /AJAXError: signal is aborted without reason.*tiles\.basemaps\.cartocdn\.com\/gl\/.+\/sprite\.json/.test(
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
      (isAppWarningOrError &&
        !isKnownExternalAbort &&
        !isKnownBrowserGpuWarning) ||
      isKnownRuntimeWarning ||
      isKnownAfilmoryDebugOutput
    ) {
      diagnostics.push(`${type}: ${text}`);
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
  await expect(page.getByRole("gridcell").first()).toBeVisible();
}

async function openCommandPalette(page: Page) {
  await page.getByRole("button", { name: "Search & Filter" }).click();
  const input = page.getByPlaceholder("Search photos...");
  await expect(input).toBeVisible();
  return input;
}

async function stubOriginalImages(page: Page) {
  await page.route("https://img.misfork.com/afilmory/**", async (route) => {
    await route.fulfill({
      contentType: "image/png",
      headers: {
        "Access-Control-Allow-Origin": "*",
      },
      path: VIEWER_FIXTURE_IMAGE_PATH,
    });
  });
}

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
  await input.fill("A7C010");
  await expect(
    page.getByRole("button", { name: /A7C010/ }).first(),
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
  await input.fill("SONY ILCE-7C");
  await expect(
    page.getByRole("button", { name: /SONY ILCE-7C.*Camera Filter/ }),
  ).toBeVisible();
  await input.press("Enter");

  await expect(page).toHaveURL(/cameras=SONY\+ILCE-7C/);
  await expect(page.getByText("Current Filters")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Clear SONY ILCE-7C" }),
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
  await expect(page.getByText(/Found \d+ countries/)).toBeVisible();
  await expect(page.locator(".maplibregl-map")).toBeVisible();
  await expect.poll(() => page.locator("canvas").count()).toBeGreaterThan(0);
  expect(diagnostics).toEqual([]);
});
