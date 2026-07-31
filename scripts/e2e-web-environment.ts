import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = path.join(root, "apps/web/e2e/fixtures");

/** Keep direct Vite-bin entrypoints aligned with apps/web package scripts. */
export const VITE_CONFIG_LOADER_ARGS = ["--configLoader", "runner"] as const;

/**
 * Vite's bin as resolved from apps/web, so entrypoints can run it via node
 * directly instead of relying on pnpm being resolvable on PATH (webServer
 * child processes may miss it under an nvm lazy-loader shell).
 */
export function resolveViteBin(): string {
  const webRequire = createRequire(path.join(root, "apps/web/package.json"));
  return path.join(
    path.dirname(webRequire.resolve("vite/package.json")),
    "bin/vite.js",
  );
}

const PASSTHROUGH_KEYS = [
  "ALL_PROXY",
  "APPDATA",
  "CI",
  "COMSPEC",
  "FORCE_COLOR",
  "HOME",
  "HTTPS_PROXY",
  "HTTP_PROXY",
  "LANG",
  "LC_ALL",
  "LOCALAPPDATA",
  "LOGNAME",
  "NODE_EXTRA_CA_CERTS",
  "NO_COLOR",
  "NO_PROXY",
  "PATH",
  "PATHEXT",
  "PLAYWRIGHT_BROWSERS_PATH",
  "SHELL",
  "SYSTEMROOT",
  "TEMP",
  "TERM",
  "TMP",
  "TMPDIR",
  "USER",
  "USERPROFILE",
  "all_proxy",
  "https_proxy",
  "http_proxy",
  "no_proxy",
] as const;

interface E2EWebEnvironmentOptions {
  embedManifest: boolean;
  source?: NodeJS.ProcessEnv;
}

/**
 * Builds the environment for Vite's E2E child process from an allowlist.
 * Repository-specific variables are fixed below so a developer's shell or
 * private .env cannot silently change the test fixture.
 */
export function createE2EWebEnvironment({
  embedManifest,
  source = process.env,
}: E2EWebEnvironmentOptions): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};

  for (const key of PASSTHROUGH_KEYS) {
    const value = source[key];
    if (value !== undefined) environment[key] = value;
  }
  // Node warns when both are set and FORCE_COLOR wins anyway.
  if (environment.FORCE_COLOR !== undefined) delete environment.NO_COLOR;

  return {
    ...environment,
    AFILMORY_EMBED_MANIFEST: String(embedManifest),
    AFILMORY_MANIFEST_PATH: path.join(fixturesDir, "photos-manifest.json"),
    AFILMORY_PUBLIC_ASSET_DIR: fixturesDir,
    DOTENV_CONFIG_PATH: path.join(fixturesDir, "environment.env"),
    MAP_PROJECTION: "mercator",
    MAP_STYLE: "builtin",
    PHOTO_STORAGE_PROVIDER: "s3",
    SITE_ACCENT_COLOR: "#007bff",
    SITE_DESCRIPTION: "Synthetic Playwright fixture",
    SITE_LANGUAGE: "en",
    SITE_NAME: "Afilmory E2E",
    SITE_TITLE: "Afilmory E2E",
    SITE_URL: "https://gallery.fixture.test",
    TZ: "UTC",
    VITE_AFILMORY_DEBUG: "false",
    VITE_AFILMORY_WEBGL_DEBUG: "false",
    VITE_ENABLE_SPEED_INSIGHTS: "false",
  };
}
