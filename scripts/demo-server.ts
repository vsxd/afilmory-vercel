/* eslint-disable no-console */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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

export const createDemoEnvironment = (
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv => ({
  ...createE2EWebEnvironment({ embedManifest: true, source }),
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
  console.info(`Starting the synthetic demo at http://${host}:${port}`);
  const server = spawn(
    process.execPath,
    [
      viteBin,
      ...VITE_CONFIG_LOADER_ARGS,
      "--mode",
      "e2e",
      "--host",
      host,
      "--port",
      port,
      "--strictPort",
    ],
    {
      cwd: webDir,
      env: createDemoEnvironment(),
      stdio: "inherit",
    },
  );
  server.once("error", (error) => {
    console.error(`Failed to start the demo server: ${error.message}`);
    process.exitCode = 1;
  });
  server.once("exit", (code) => {
    process.exitCode = code ?? 0;
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => server.kill(signal));
  }
}
