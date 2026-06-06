import type { AfilmoryManifest } from "@afilmory/schema";
import { parseManifest } from "@afilmory/schema";

import {
  ensureBrowserRuntime,
  setRuntimeManifest,
} from "~/runtime/browser-runtime";

const MANIFEST_REQUEST_TIMEOUT_MS = 15_000;

async function fetchManifest(url: string): Promise<unknown> {
  const controller =
    typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = globalThis.setTimeout(
    () => controller?.abort(),
    MANIFEST_REQUEST_TIMEOUT_MS,
  );

  try {
    const response = await fetch(url, {
      credentials: "same-origin",
      cache: "force-cache",
      signal: controller?.signal,
      headers: {
        accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Manifest request failed: ${response.status} ${response.statusText}`.trim(),
      );
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        `Manifest request timed out after ${MANIFEST_REQUEST_TIMEOUT_MS}ms`,
      );
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

function coerceManifest(input: unknown): AfilmoryManifest {
  const manifest = parseManifest(input);
  setRuntimeManifest(manifest);
  return manifest;
}

export async function loadManifestRuntime(): Promise<AfilmoryManifest> {
  const runtime = ensureBrowserRuntime();
  const manifestRuntime = runtime.manifest;

  if (!manifestRuntime) {
    throw new Error("No manifest source was injected into the page.");
  }

  if ("data" in manifestRuntime && manifestRuntime.data) {
    return coerceManifest(manifestRuntime.data);
  }

  const existingPromise = manifestRuntime.promise;
  if (existingPromise) {
    try {
      return coerceManifest(await existingPromise);
    } catch (error) {
      manifestRuntime.promise = undefined;
      throw error;
    }
  }

  const manifestUrl =
    manifestRuntime.mode === "external" ? manifestRuntime.url : undefined;
  if (!manifestUrl) {
    throw new Error("No manifest source was injected into the page.");
  }

  const manifestPromise = fetchManifest(manifestUrl).catch((error) => {
    manifestRuntime.promise = undefined;
    throw error;
  });
  manifestRuntime.promise = manifestPromise;

  return coerceManifest(await manifestPromise);
}
