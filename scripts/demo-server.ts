/* eslint-disable no-console */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { assertManifest } from "@afilmory/schema";

import {
  createE2EWebEnvironment,
  resolveViteBin,
  VITE_CONFIG_LOADER_ARGS,
} from "./e2e-web-environment.js";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const webDir = path.join(rootDir, "apps/web");
const fixturesDir = path.join(webDir, "e2e/fixtures");
const localMediaBaseUrl = "/originals";

/** The browser demo uses real local media, without Playwright request stubs. */
export const createDemoFixture = async () => {
  const manifest = assertManifest(
    JSON.parse(
      await fs.readFile(path.join(fixturesDir, "photos-manifest.json"), "utf8"),
    ),
  );
  manifest.source = { provider: "local", baseUrl: localMediaBaseUrl };
  for (const photo of manifest.photos) {
    const fileName = `${photo.id}.jpg`;
    const mediaUrl = `${localMediaBaseUrl}/${encodeURIComponent(fileName)}`;
    photo.originalUrl = mediaUrl;
    photo.thumbnailUrl = mediaUrl;
    photo.s3Key = fileName;
    if (photo.video?.type === "live-photo") {
      const videoFileName = `${photo.id}.webm`;
      photo.video.videoUrl = `${localMediaBaseUrl}/${encodeURIComponent(videoFileName)}`;
      photo.video.s3Key = videoFileName;
    }
  }

  // Keep both the committed fixture and the developer's generated manifest
  // unchanged. A unique directory also lets multiple demos run independently.
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "afilmory-demo-"));
  const cleanup = () => fs.rm(directory, { recursive: true, force: true });
  const manifestPath = path.join(directory, "photos-manifest.json");
  try {
    await fs.writeFile(manifestPath, JSON.stringify(manifest));
    return { manifestPath, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
};

export const createDemoEnvironment = (
  manifestPath: string,
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv => ({
  ...createE2EWebEnvironment({ embedManifest: true, source }),
  AFILMORY_MANIFEST_PATH: manifestPath,
  LOCAL_PHOTOS_BASE_URL: localMediaBaseUrl,
  LOCAL_PHOTOS_PATH: path.join(fixturesDir, "thumbnails"),
  PHOTO_STORAGE_PROVIDER: "local",
  SITE_DESCRIPTION: "A zero-credential synthetic Afilmory demo",
  SITE_NAME: "Afilmory Demo",
  SITE_TITLE: "Afilmory Demo",
});

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainModule) {
  const host = process.env.HOST ?? "127.0.0.1";
  const port = process.env.PORT ?? "1924";
  const viteBin = resolveViteBin();
  const fixture = await createDemoFixture();
  console.info(`Starting the synthetic demo at http://${host}:${port}`);
  const server = spawn(
    process.execPath,
    [
      viteBin,
      ...VITE_CONFIG_LOADER_ARGS,
      "--mode",
      "demo",
      "--host",
      host,
      "--port",
      port,
      "--strictPort",
    ],
    {
      cwd: webDir,
      env: createDemoEnvironment(fixture.manifestPath),
      stdio: "inherit",
    },
  );
  const forwardSignal = (signal: NodeJS.Signals) => server.kill(signal);
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, forwardSignal);
  }
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.once("exit", (code, signal) => {
        process.exitCode = code ?? (signal ? 1 : 0);
        resolve();
      });
    });
  } catch (error) {
    console.error(`Failed to start the demo server: ${String(error)}`);
    process.exitCode = 1;
  } finally {
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      process.off(signal, forwardSignal);
    }
    await fixture.cleanup();
  }
}
