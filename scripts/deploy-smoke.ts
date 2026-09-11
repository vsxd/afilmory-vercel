/* eslint-disable no-console */
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { assertManifest } from "@afilmory/schema";
import sharp from "sharp";

import { createE2EWebEnvironment } from "./e2e-web-environment.js";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const fixtureKeys = ["deploy/amber.jpg", "deploy/blue sky.png"] as const;

export const createDeploySmokeEnvironment = (
  workspace: string,
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv => ({
  ...createE2EWebEnvironment({ embedManifest: false, source }),
  AFILMORY_MANIFEST_PATH: path.join(
    workspace,
    "generated/photos-manifest.json",
  ),
  AFILMORY_PUBLIC_ASSET_DIR: path.join(workspace, "apps/web/public"),
  BUILDER_FAIL_ON_PHOTO_ERROR: "true",
  BUILDER_USE_CLUSTER_MODE: "false",
  // This temporary source snapshot is tested, never published. With no Git
  // metadata its sourceExact remains false; do not invent a public revision.
  CI: "false",
  DOTENV_CONFIG_PATH: path.join(workspace, "smoke.environment.env"),
  LOCAL_PHOTOS_BASE_URL: "/originals",
  LOCAL_PHOTOS_PATH: path.join(workspace, "photos"),
  PHOTO_STORAGE_PROVIDER: "local",
  REPO_TOKEN: "",
  REPO_URL: "",
  REQUIRE_FRESH_BUILD: "true",
  SKIP_MANIFEST_BUILD: "false",
});

const isSourceFile = (relativePath: string): boolean => {
  const segments = relativePath.split("/");
  if (segments.some((segment) => segment.startsWith(".env"))) return false;
  if (
    segments.some((segment) =>
      ["node_modules", "dist", ".git"].includes(segment),
    )
  )
    return false;
  if (/^(?:generated|photos)\//.test(relativePath)) return false;
  if (/^apps\/web\/public\/(?:thumbnails|originals)(?:\/|$)/.test(relativePath))
    return false;
  // Only build inputs and the source they import belong in the snapshot.
  return (
    /^(?:apps\/web|packages|scripts|locales|test)\//.test(relativePath) ||
    (!relativePath.includes("/") &&
      /(?:\.(?:[cm]?js|json|ts|yaml)|^LICENSE)$/.test(relativePath))
  );
};

/** Reuse installed dependencies, but every workspace package resolves to its copy. */
const linkDependencies = async (
  sourceRoot: string,
  workspace: string,
  packageFiles: string[],
) => {
  const packageDirectories = new Set(
    packageFiles.map((file) => path.dirname(file)),
  );
  for (const relativeDirectory of packageDirectories) {
    const sourceModules = path.join(
      sourceRoot,
      relativeDirectory,
      "node_modules",
    );
    const destinationModules = path.join(
      workspace,
      relativeDirectory,
      "node_modules",
    );
    let entries;
    try {
      entries = await fs.readdir(sourceModules, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    await fs.mkdir(destinationModules, { recursive: true });
    const link = async (name: string) => {
      const sourcePath = path.join(sourceModules, name);
      const realPath = await fs.realpath(sourcePath);
      const packageDirectory = path.relative(sourceRoot, realPath);
      const target = packageDirectories.has(packageDirectory)
        ? path.join(workspace, packageDirectory)
        : realPath;
      await fs.symlink(target, path.join(destinationModules, name), "dir");
    };
    for (const entry of entries) {
      if (entry.name === ".bin") {
        // pnpm's wrappers use paths relative to .bin. Copy those wrappers while
        // sharing the immutable external packages through the .pnpm link.
        await fs.cp(
          path.join(sourceModules, entry.name),
          path.join(destinationModules, entry.name),
          { recursive: true },
        );
      } else if (entry.name.startsWith("@") && entry.isDirectory()) {
        await fs.mkdir(path.join(destinationModules, entry.name));
        for (const name of await fs.readdir(
          path.join(sourceModules, entry.name),
        )) {
          await link(`${entry.name}/${name}`);
        }
      } else if (entry.name === ".pnpm" || !entry.name.startsWith(".")) {
        await link(entry.name);
      }
    }
  }
};

export async function createDeploySmokeWorkspace(
  sourceRoot = rootDir,
): Promise<string> {
  const realSourceRoot = await fs.realpath(sourceRoot);
  const workspace = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "afilmory-deploy-smoke-")),
  );
  try {
    // Enumerate Git's source inventory, but copy working-tree bytes, including
    // unstaged edits and new source files. A clone of HEAD would test stale code.
    const files = [
      ...new Set(
        execFileSync(
          "git",
          ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
          {
            cwd: realSourceRoot,
            encoding: "utf8",
            maxBuffer: 10 * 1024 * 1024,
          },
        )
          .split("\0")
          .filter((file) => file && isSourceFile(file)),
      ),
    ];
    const copied: string[] = [];
    for (const file of files) {
      const sourcePath = path.join(realSourceRoot, file);
      let stat;
      try {
        stat = await fs.lstat(sourcePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
        throw error;
      }
      // Never let source symlinks escape the isolated workspace.
      if (!stat.isFile())
        throw new Error(`deploy smoke source is not a regular file: ${file}`);
      const destination = path.join(workspace, file);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.copyFile(sourcePath, destination);
      copied.push(file);
    }
    await linkDependencies(
      realSourceRoot,
      workspace,
      copied.filter((file) => path.basename(file) === "package.json"),
    );
    await fs.writeFile(
      path.join(workspace, "smoke.environment.env"),
      "# Intentionally empty synthetic build environment.\n",
    );
    const photos = path.join(workspace, "photos");
    await fs.mkdir(path.join(photos, "deploy"), { recursive: true });
    await sharp({
      create: { width: 1200, height: 800, channels: 3, background: "#b86a32" },
    })
      .jpeg()
      .toFile(path.join(photos, fixtureKeys[0]));
    await sharp({
      create: { width: 800, height: 1200, channels: 3, background: "#397fb5" },
    })
      .png()
      .toFile(path.join(photos, fixtureKeys[1]));
    return workspace;
  } catch (error) {
    await fs.rm(workspace, { force: true, recursive: true });
    throw error;
  }
}

const runDeployEntrypoint = async (workspace: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn("sh", ["scripts/build-static.sh"], {
      cwd: workspace,
      env: createDeploySmokeEnvironment(workspace),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      process.stderr.write(chunk);
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) resolve(output);
      else
        reject(
          new Error(`build-static.sh exited with ${signal ?? `code ${code}`}`),
        );
    });
  });

export async function verifyDeployOutput(
  workspace: string,
  output: string,
): Promise<void> {
  if (
    !output.includes("[precheck] Running builder CLI") ||
    !output.includes("tsx src/cli.ts")
  ) {
    throw new Error(
      "deploy smoke did not observe the real Builder CLI invocation",
    );
  }
  const manifest = assertManifest(
    JSON.parse(
      await fs.readFile(
        path.join(workspace, "generated/photos-manifest.json"),
        "utf8",
      ),
    ),
  );
  if (
    manifest.source.provider !== "local" ||
    manifest.photos.length !== fixtureKeys.length ||
    fixtureKeys.some(
      (key) => !manifest.photos.some((photo) => photo.s3Key === key),
    )
  ) {
    throw new Error(
      "deploy smoke manifest does not contain exactly the synthetic local photos",
    );
  }
  const dist = path.join(workspace, "apps/web/dist");
  for (const relativePath of [
    "index.html",
    "feed.xml",
    "sitemap.xml",
    "sw.js",
  ]) {
    await fs.access(path.join(dist, relativePath));
  }
  const assets = await fs.readdir(path.join(dist, "assets"));
  if (
    !assets.some((name) =>
      /^(?:gallery-index|photos-manifest)\.[0-9a-f]{10}\.json$/.test(name),
    )
  ) {
    throw new Error("deploy output is missing its hashed delivery manifest");
  }
  for (const photo of manifest.photos) {
    for (const [url, prefix] of [
      [photo.originalUrl, "/originals/"],
      [photo.thumbnailUrl, "/thumbnails/"],
    ]) {
      if (!url.startsWith(prefix))
        throw new Error(`unexpected smoke media URL: ${url}`);
      const relative = decodeURIComponent(url.slice(1));
      const file = path.resolve(dist, relative);
      if (!file.startsWith(`${dist}${path.sep}`))
        throw new Error(`smoke media escapes output: ${url}`);
      const metadata = await sharp(file).metadata();
      if (!metadata.width || !metadata.height)
        throw new Error(`invalid deployed image: ${url}`);
    }
    const original = await fs.readFile(
      path.join(dist, "originals", photo.s3Key),
    );
    if (
      !original.equals(
        await fs.readFile(path.join(workspace, "photos", photo.s3Key)),
      )
    ) {
      throw new Error(
        `deployed original differs from its source: ${photo.s3Key}`,
      );
    }
    const shell = await fs.readFile(
      path.join(dist, "photos", photo.id, "index.html"),
      "utf8",
    );
    if (!shell.includes(photo.id) || !shell.includes('property="og:image"')) {
      throw new Error(`deploy output is missing photo metadata: ${photo.id}`);
    }
  }
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainModule) {
  const workspace = await createDeploySmokeWorkspace();
  try {
    console.info(
      "[deploy-smoke] Building current source in an isolated workspace with no manifest or thumbnails.",
    );
    const output = await runDeployEntrypoint(workspace);
    await verifyDeployOutput(workspace, output);
    console.info(
      "Clean deployment smoke passed: real Builder CLI, manifest, originals, thumbnails and photo shells.",
    );
  } finally {
    await fs.rm(workspace, { force: true, recursive: true });
  }
}
