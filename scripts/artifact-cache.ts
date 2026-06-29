import "dotenv-expand/config";

/* eslint-disable no-console */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { assertManifest } from "@afilmory/schema";

interface ArtifactCacheConfig {
  cacheDir: string;
  repoBranch?: string;
  repoToken: string;
  repoUrl: string;
  rootDir: string;
}

interface ArtifactPathPair {
  cachePath: string;
  label: string;
  targetPath: string;
  validate?: (filePath: string) => Promise<void>;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const createConfig = (
  env: NodeJS.ProcessEnv = process.env,
): ArtifactCacheConfig | null => {
  const repoUrl = env.REPO_URL || env.BUILDER_REPO_URL || "";
  const repoToken = env.REPO_TOKEN || env.GIT_TOKEN || "";

  if (!repoUrl || !repoToken) {
    return null;
  }

  return {
    cacheDir: path.join(rootDir, "apps/web/assets-git"),
    repoBranch: env.REPO_BRANCH || env.REPO_CACHE_BRANCH,
    repoToken,
    repoUrl,
    rootDir,
  };
};

const artifactPairs = (config: ArtifactCacheConfig): ArtifactPathPair[] => [
  {
    cachePath: path.join(config.cacheDir, "photos-manifest.json"),
    label: "photos manifest",
    targetPath: path.join(config.rootDir, "generated/photos-manifest.json"),
    validate: validateManifestFile,
  },
  {
    cachePath: path.join(config.cacheDir, "geocoding-cache.json"),
    label: "geocoding cache",
    targetPath: path.join(config.rootDir, "generated/geocoding-cache.json"),
  },
  {
    cachePath: path.join(config.cacheDir, "thumbnails"),
    label: "thumbnails",
    targetPath: path.join(config.rootDir, "apps/web/public/thumbnails"),
  },
];

const pathExists = async (targetPath: string): Promise<boolean> => {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
};

const validateManifestFile = async (filePath: string): Promise<void> => {
  const content = await fs.readFile(filePath, "utf-8");
  assertManifest(JSON.parse(content));
};

const sanitize = (value: string, config: ArtifactCacheConfig): string =>
  value
    .replaceAll(config.repoToken, "[REPO_TOKEN]")
    .replaceAll(encodeURIComponent(config.repoToken), "[REPO_TOKEN]");

const isLocalhostHostname = (hostname: string): boolean =>
  hostname === "localhost" ||
  hostname === "127.0.0.1" ||
  hostname === "[::1]" ||
  hostname === "::1";

export const createAuthenticatedRepoUrl = (
  repoUrl: string,
  token: string,
): string => {
  let url: URL;
  try {
    url = new URL(repoUrl);
  } catch {
    // Not a URL we can embed credentials into (e.g. scp-style git@host:repo).
    return repoUrl;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return repoUrl;
  }

  // Never transmit REPO_TOKEN over plaintext HTTP (it would be sent in the
  // clear, and is also embedded in the URL). Allow http only for localhost so
  // local testing against a throwaway git server still works.
  if (url.protocol === "http:" && !isLocalhostHostname(url.hostname)) {
    throw new Error(
      "Refusing to send REPO_TOKEN over plaintext HTTP. " +
        "Use an https:// REPO_URL (http is permitted only for localhost).",
    );
  }

  if (!url.username) {
    url.username = "x-access-token";
  }
  url.password = token;
  return url.toString();
};

const run = async (
  config: ArtifactCacheConfig,
  command: string,
  args: string[],
  cwd: string = config.rootDir,
): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString("utf-8");
      const stderr = Buffer.concat(stderrChunks).toString("utf-8");
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(
        new Error(
          sanitize(
            `${command} ${args[0] ?? ""} failed with exit code ${code}.\n${
              stderr || stdout
            }`,
            config,
          ),
        ),
      );
    });
  });

const cloneCacheRepository = async (
  config: ArtifactCacheConfig,
): Promise<void> => {
  await fs.rm(config.cacheDir, { force: true, recursive: true });
  await fs.mkdir(path.dirname(config.cacheDir), { recursive: true });

  const args = ["clone", "--depth=1"];
  if (config.repoBranch) {
    args.push("--branch", config.repoBranch);
  }
  args.push(
    createAuthenticatedRepoUrl(config.repoUrl, config.repoToken),
    config.cacheDir,
  );

  await run(config, "git", args);
};

const copyArtifact = async (
  sourcePath: string,
  targetPath: string,
): Promise<void> => {
  await fs.rm(targetPath, { force: true, recursive: true });
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.cp(sourcePath, targetPath, {
    force: true,
    recursive: true,
    // 拒绝软链接：缓存仓库内容是不可信的，symlink 可能指向服务目录之外的任意文件，
    // 被复制进 public/ 后会被静态站点直接对外提供。
    filter: async (src) => !(await fs.lstat(src)).isSymbolicLink(),
  });
};

const restoreArtifacts = async (config: ArtifactCacheConfig): Promise<void> => {
  await cloneCacheRepository(config);

  for (const pair of artifactPairs(config)) {
    try {
      if (!(await pathExists(pair.cachePath))) {
        console.warn(`[artifact-cache] Missing cached ${pair.label}; skipped.`);
        continue;
      }
      if (pair.validate) {
        await pair.validate(pair.cachePath);
      }
      await copyArtifact(pair.cachePath, pair.targetPath);
      console.info(`[artifact-cache] Restored ${pair.label}.`);
    } catch (error) {
      console.warn(
        `[artifact-cache] Could not restore ${pair.label}; skipped. ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
};

const ensureCacheReadme = async (
  config: ArtifactCacheConfig,
): Promise<void> => {
  const readmePath = path.join(config.cacheDir, "README.md");
  if (await pathExists(readmePath)) {
    return;
  }
  await fs.writeFile(
    readmePath,
    [
      "# afilmory-metadata-cache",
      "",
      "This repository stores generated Afilmory build artifacts:",
      "",
      "- `photos-manifest.json`",
      "- `geocoding-cache.json`",
      "- `thumbnails/`",
      "",
      "It is not a source photo storage backend.",
      "",
    ].join("\n"),
  );
};

const saveArtifacts = async (config: ArtifactCacheConfig): Promise<void> => {
  await cloneCacheRepository(config);

  const gitPaths = ["README.md"];
  for (const pair of artifactPairs(config)) {
    if (!(await pathExists(pair.targetPath))) {
      console.warn(`[artifact-cache] Missing local ${pair.label}; skipped.`);
      continue;
    }
    if (pair.validate) {
      await pair.validate(pair.targetPath);
    }
    await copyArtifact(pair.targetPath, pair.cachePath);
    gitPaths.push(path.relative(config.cacheDir, pair.cachePath));
    console.info(`[artifact-cache] Staged ${pair.label}.`);
  }

  await ensureCacheReadme(config);
  await run(
    config,
    "git",
    ["config", "user.name", "Afilmory Cache Bot"],
    config.cacheDir,
  );
  await run(
    config,
    "git",
    ["config", "user.email", "afilmory-cache@users.noreply.github.com"],
    config.cacheDir,
  );
  await run(config, "git", ["add", ...gitPaths], config.cacheDir);

  const status = await run(
    config,
    "git",
    ["status", "--porcelain"],
    config.cacheDir,
  );
  if (!status.trim()) {
    console.info("[artifact-cache] Remote cache is already up to date.");
    return;
  }

  await run(
    config,
    "git",
    ["commit", "-m", "chore: update afilmory artifact cache"],
    config.cacheDir,
  );
  await run(
    config,
    "git",
    ["push", "--set-upstream", "origin", "HEAD"],
    config.cacheDir,
  );
  console.info("[artifact-cache] Remote cache updated.");
};

const main = async (): Promise<void> => {
  const command = process.argv[2];
  if (command !== "restore" && command !== "save") {
    throw new Error(
      "Usage: pnpm exec tsx scripts/artifact-cache.ts <restore|save>",
    );
  }

  const config = createConfig();
  if (!config) {
    console.info(
      "[artifact-cache] REPO_URL/REPO_TOKEN not configured; skipped.",
    );
    return;
  }

  if (command === "restore") {
    await restoreArtifacts(config);
    return;
  }

  await saveArtifacts(config);
};

// Only run when invoked as a script, so the module can be imported in tests
// without executing git commands as a side effect.
const isMainModule =
  !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
