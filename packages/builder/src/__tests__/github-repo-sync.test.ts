import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { execa } from "execa";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { logger, setConsoleForwarding } from "../logger/index.js";
import { CURRENT_MANIFEST_VERSION } from "../manifest/version.js";
import { setBuilderOutputSettings, webAppDir } from "../output-paths.js";
import {
  buildGitAuthenticationEnv,
  persistBuildOutputsToRepository,
  prepareRepositoryLayout,
  pushUpdatesToRemoteRepo,
  restoreLocalOutputLayout,
  syncRemoteCacheRepository,
} from "../plugins/github-repo-sync";

describe("GitHub repo sync auth", () => {
  it("should configure askpass auth for GitHub HTTPS repositories", async () => {
    const env = buildGitAuthenticationEnv(
      "https://github.com/vsxd/afilmory-metadata-cache.git",
      "github_pat_test",
    );

    expect(env).toBeDefined();
    expect(env?.GIT_TERMINAL_PROMPT).toBe("0");
    expect(env?.GIT_ASKPASS).toContain("git-askpass.js");

    const username = await execa(
      env!.GIT_ASKPASS!,
      ["Username for https://github.com"],
      { env },
    );
    const password = await execa(
      env!.GIT_ASKPASS!,
      ["Password for https://github.com"],
      { env },
    );

    expect(username.stdout).toBe("x-access-token");
    expect(password.stdout).toBe("github_pat_test");
  });

  it("should not forward unrelated process environment variables", () => {
    const previousSecret = process.env.S3_SECRET_ACCESS_KEY;
    process.env.S3_SECRET_ACCESS_KEY = "secret-that-should-not-reach-git";

    try {
      const env = buildGitAuthenticationEnv(
        "https://github.com/vsxd/afilmory-metadata-cache.git",
        "github_pat_test",
      );

      expect(env?.S3_SECRET_ACCESS_KEY).toBeUndefined();
      expect(env?.AFILMORY_GIT_PASSWORD).toBe("github_pat_test");
      expect(env?.GIT_TERMINAL_PROMPT).toBe("0");
    } finally {
      if (previousSecret === undefined) {
        delete process.env.S3_SECRET_ACCESS_KEY;
      } else {
        process.env.S3_SECRET_ACCESS_KEY = previousSecret;
      }
    }
  });

  it("should skip askpass auth when the url is not a GitHub HTTPS repository", () => {
    expect(
      buildGitAuthenticationEnv(
        "ssh://git@github.com/vsxd/afilmory-metadata-cache.git",
        "github_pat_test",
      ),
    ).toBe(undefined);
    expect(
      buildGitAuthenticationEnv(
        "https://example.com/repo.git",
        "github_pat_test",
      ),
    ).toBe(undefined);
  });

  it("should skip askpass auth when the url already contains credentials", () => {
    expect(
      buildGitAuthenticationEnv(
        "https://someone:secret@github.com/vsxd/afilmory-metadata-cache.git",
        "github_pat_test",
      ),
    ).toBe(undefined);
  });
});

describe("GitHub repo sync layout recovery", () => {
  let tmpDir: string;
  let assetsGitDir: string;
  let manifestPath: string;
  let geocodingCachePath: string;
  let thumbnailsDir: string;

  beforeEach(async () => {
    setConsoleForwarding(false);

    tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "afilmory-github-repo-sync-"),
    );
    assetsGitDir = path.join(tmpDir, "assets-git");
    manifestPath = path.join(tmpDir, "generated", "photos-manifest.json");
    geocodingCachePath = path.join(tmpDir, "generated", "geocoding-cache.json");
    thumbnailsDir = path.join(tmpDir, "public", "thumbnails");

    setBuilderOutputSettings({
      manifestPath,
      thumbnailsDir,
      originalsDir: path.join(tmpDir, "public", "originals"),
    });
  });

  afterEach(async () => {
    setConsoleForwarding(true);
    await fs.rm(tmpDir, { force: true, recursive: true });
  });

  it("replaces dangling legacy output symlinks with hydrated local outputs", async () => {
    await fs.mkdir(path.dirname(manifestPath), { recursive: true });
    await fs.mkdir(path.dirname(thumbnailsDir), { recursive: true });
    await fs.symlink(path.join(tmpDir, "missing-manifest.json"), manifestPath);
    await fs.symlink(
      path.join(tmpDir, "missing-geocoding-cache.json"),
      geocodingCachePath,
    );
    await fs.symlink(path.join(tmpDir, "missing-thumbnails"), thumbnailsDir);

    await seedRepoAssets(assetsGitDir);
    await prepareRepositoryLayout({ assetsGitDir, logger });

    expect((await fs.lstat(manifestPath)).isSymbolicLink()).toBe(false);
    expect((await fs.lstat(geocodingCachePath)).isSymbolicLink()).toBe(false);
    expect((await fs.lstat(thumbnailsDir)).isSymbolicLink()).toBe(false);
    expect((await fs.lstat(manifestPath)).isFile()).toBe(true);
    expect((await fs.lstat(geocodingCachePath)).isFile()).toBe(true);
    expect((await fs.lstat(thumbnailsDir)).isDirectory()).toBe(true);

    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
    const geocodingCache = JSON.parse(
      await fs.readFile(geocodingCachePath, "utf-8"),
    );
    expect(manifest.data).toHaveLength(1);
    expect(geocodingCache).toMatchObject({ version: 2, entries: {} });
    await expect(
      fs.readFile(path.join(thumbnailsDir, "photo.jpg"), "utf-8"),
    ).resolves.toBe("thumb");
  });

  it("seeds an empty cache repo from existing local outputs before hydrating", async () => {
    await fs.mkdir(path.dirname(manifestPath), { recursive: true });
    await fs.mkdir(thumbnailsDir, { recursive: true });
    await fs.mkdir(assetsGitDir, { recursive: true });
    await fs.writeFile(
      manifestPath,
      JSON.stringify(
        {
          version: CURRENT_MANIFEST_VERSION,
          data: [{ id: "local-photo" }],
          cameras: [],
          lenses: [],
        },
        null,
        2,
      ),
    );
    await fs.writeFile(
      geocodingCachePath,
      JSON.stringify({ version: 2, entries: { local: {} } }, null, 2),
    );
    await fs.writeFile(path.join(thumbnailsDir, "local.jpg"), "local-thumb");

    await prepareRepositoryLayout({ assetsGitDir, logger });

    const repoManifest = JSON.parse(
      await fs.readFile(
        path.join(assetsGitDir, "photos-manifest.json"),
        "utf-8",
      ),
    );
    const repoGeocodingCache = JSON.parse(
      await fs.readFile(
        path.join(assetsGitDir, "geocoding-cache.json"),
        "utf-8",
      ),
    );
    expect(repoManifest.data).toEqual([{ id: "local-photo" }]);
    expect(repoGeocodingCache.entries).toEqual({ local: {} });
    await expect(
      fs.readFile(path.join(assetsGitDir, "thumbnails", "local.jpg"), "utf-8"),
    ).resolves.toBe("local-thumb");
  });

  it("restores regular local output paths after repo-backed symlinks become dangling", async () => {
    await seedRepoAssets(assetsGitDir);
    await linkLocalOutputsToRepo(assetsGitDir, {
      manifestPath,
      geocodingCachePath,
      thumbnailsDir,
    });

    await fs.rm(assetsGitDir, { force: true, recursive: true });
    await restoreLocalOutputLayout({ assetsGitDir, logger });

    const manifestStat = await fs.lstat(manifestPath);
    const geocodingCacheStat = await fs.lstat(geocodingCachePath);
    const thumbnailsStat = await fs.lstat(thumbnailsDir);
    expect(manifestStat.isSymbolicLink()).toBe(false);
    expect(manifestStat.isFile()).toBe(true);
    expect(geocodingCacheStat.isSymbolicLink()).toBe(false);
    expect(geocodingCacheStat.isFile()).toBe(true);
    expect(thumbnailsStat.isSymbolicLink()).toBe(false);
    expect(thumbnailsStat.isDirectory()).toBe(true);

    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
    expect(manifest).toEqual({
      version: CURRENT_MANIFEST_VERSION,
      data: [],
      cameras: [],
      lenses: [],
    });
    const geocodingCache = JSON.parse(
      await fs.readFile(geocodingCachePath, "utf-8"),
    );
    expect(geocodingCache).toMatchObject({ version: 2, entries: {} });
    await expect(fs.readdir(thumbnailsDir)).resolves.toEqual([]);
  });

  it("preserves accessible manifest and thumbnails when falling back to local output", async () => {
    await seedRepoAssets(assetsGitDir);
    await prepareRepositoryLayout({ assetsGitDir, logger });

    await restoreLocalOutputLayout({ assetsGitDir, logger });

    const manifestStat = await fs.lstat(manifestPath);
    const geocodingCacheStat = await fs.lstat(geocodingCachePath);
    const thumbnailsStat = await fs.lstat(thumbnailsDir);
    expect(manifestStat.isSymbolicLink()).toBe(false);
    expect(geocodingCacheStat.isSymbolicLink()).toBe(false);
    expect(thumbnailsStat.isSymbolicLink()).toBe(false);

    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
    const geocodingCache = JSON.parse(
      await fs.readFile(geocodingCachePath, "utf-8"),
    );
    expect(manifest.data).toHaveLength(1);
    expect(geocodingCache).toMatchObject({ version: 2, entries: {} });
    await expect(
      fs.readFile(path.join(thumbnailsDir, "photo.jpg"), "utf-8"),
    ).resolves.toBe("thumb");
  });

  it("preserves readable thumbnails when only the repo manifest target is missing", async () => {
    await seedRepoAssets(assetsGitDir);
    await linkLocalOutputsToRepo(assetsGitDir, {
      manifestPath,
      geocodingCachePath,
      thumbnailsDir,
    });

    await fs.rm(path.join(assetsGitDir, "photos-manifest.json"), {
      force: true,
    });
    await restoreLocalOutputLayout({ assetsGitDir, logger });

    const manifestStat = await fs.lstat(manifestPath);
    const geocodingCacheStat = await fs.lstat(geocodingCachePath);
    const thumbnailsStat = await fs.lstat(thumbnailsDir);
    expect(manifestStat.isSymbolicLink()).toBe(false);
    expect(geocodingCacheStat.isSymbolicLink()).toBe(false);
    expect(thumbnailsStat.isSymbolicLink()).toBe(false);

    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
    expect(manifest).toEqual({
      version: CURRENT_MANIFEST_VERSION,
      data: [],
      cameras: [],
      lenses: [],
    });
    const geocodingCache = JSON.parse(
      await fs.readFile(geocodingCachePath, "utf-8"),
    );
    expect(geocodingCache).toMatchObject({ version: 2, entries: {} });
    await expect(
      fs.readFile(path.join(thumbnailsDir, "photo.jpg"), "utf-8"),
    ).resolves.toBe("thumb");
  });

  it("rejects a symlinked assets-git directory before linking build outputs", async () => {
    const externalDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "afilmory-assets-external-"),
    );
    await seedRepoAssets(externalDir);
    await fs.symlink(externalDir, assetsGitDir, "dir");

    try {
      await expect(
        prepareRepositoryLayout({ assetsGitDir, logger }),
      ).rejects.toThrow("assets-git 目录不能是符号链接");
    } finally {
      await fs.rm(externalDir, { force: true, recursive: true });
    }
  });

  it("rejects symlinked cache files before hydrating local outputs", async () => {
    const externalFile = path.join(tmpDir, "external.json");
    await fs.writeFile(externalFile, "{}");
    await seedRepoAssets(assetsGitDir);
    await fs.rm(path.join(assetsGitDir, "photos-manifest.json"));
    await fs.symlink(
      externalFile,
      path.join(assetsGitDir, "photos-manifest.json"),
    );

    await expect(
      prepareRepositoryLayout({ assetsGitDir, logger }),
    ).rejects.toThrow("远程缓存 manifest 不能是符号链接");
  });

  it("rejects symlinked geocoding cache files before hydrating local outputs", async () => {
    const externalFile = path.join(tmpDir, "external-geocoding.json");
    await fs.writeFile(externalFile, "{}");
    await seedRepoAssets(assetsGitDir);
    await fs.rm(path.join(assetsGitDir, "geocoding-cache.json"));
    await fs.symlink(
      externalFile,
      path.join(assetsGitDir, "geocoding-cache.json"),
    );

    await expect(
      prepareRepositoryLayout({ assetsGitDir, logger }),
    ).rejects.toThrow("远程缓存 geocoding cache 不能是符号链接");
  });

  it("rejects suspicious thumbnail cache entries before hydrating local outputs", async () => {
    await seedRepoAssets(assetsGitDir);
    await fs.symlink(
      path.join(assetsGitDir, "thumbnails", "photo.jpg"),
      path.join(assetsGitDir, "thumbnails", "linked.jpg"),
    );

    await expect(
      prepareRepositoryLayout({ assetsGitDir, logger }),
    ).rejects.toThrow("远程缓存 thumbnails 不能包含符号链接");

    await fs.rm(assetsGitDir, { force: true, recursive: true });
    await seedRepoAssets(assetsGitDir);
    await fs.mkdir(path.join(assetsGitDir, "thumbnails", "nested"));
    await fs.writeFile(
      path.join(assetsGitDir, "thumbnails", "nested", "photo.jpg"),
      "nested",
    );

    await expect(
      prepareRepositoryLayout({ assetsGitDir, logger }),
    ).rejects.toThrow("远程缓存 thumbnails 只允许第一层 .jpg 文件");

    await fs.rm(assetsGitDir, { force: true, recursive: true });
    await seedRepoAssets(assetsGitDir);
    await fs.writeFile(
      path.join(assetsGitDir, "thumbnails", "note.txt"),
      "txt",
    );

    await expect(
      prepareRepositoryLayout({ assetsGitDir, logger }),
    ).rejects.toThrow("远程缓存 thumbnails 只能包含 .jpg 文件");
  });

  it("rejects non-cache root entries in the cache repo", async () => {
    await seedRepoAssets(assetsGitDir);
    await fs.writeFile(path.join(assetsGitDir, "README.md"), "metadata");

    await expect(
      prepareRepositoryLayout({ assetsGitDir, logger }),
    ).rejects.toThrow("远程缓存仓库包含非缓存文件：README.md");
  });

  it("copies local build outputs back into the cache repo workspace", async () => {
    await seedRepoAssets(assetsGitDir);
    await fs.mkdir(path.dirname(manifestPath), { recursive: true });
    await fs.mkdir(thumbnailsDir, { recursive: true });
    await fs.writeFile(
      manifestPath,
      JSON.stringify(
        {
          version: CURRENT_MANIFEST_VERSION,
          data: [{ id: "built-photo" }],
          cameras: [],
          lenses: [],
        },
        null,
        2,
      ),
    );
    await fs.writeFile(
      geocodingCachePath,
      JSON.stringify({ version: 2, entries: { built: {} } }, null, 2),
    );
    await fs.writeFile(path.join(thumbnailsDir, "built.jpg"), "built-thumb");

    await persistBuildOutputsToRepository({ assetsGitDir, logger });

    const repoManifest = JSON.parse(
      await fs.readFile(
        path.join(assetsGitDir, "photos-manifest.json"),
        "utf-8",
      ),
    );
    const repoGeocodingCache = JSON.parse(
      await fs.readFile(
        path.join(assetsGitDir, "geocoding-cache.json"),
        "utf-8",
      ),
    );

    expect(repoManifest.data).toEqual([{ id: "built-photo" }]);
    expect(repoGeocodingCache.entries).toEqual({ built: {} });
    await expect(
      fs.readFile(path.join(assetsGitDir, "thumbnails", "built.jpg"), "utf-8"),
    ).resolves.toBe("built-thumb");
    await expect(
      fs.access(path.join(assetsGitDir, "thumbnails", "photo.jpg")),
    ).rejects.toThrow();
  });

  it("hydrates and persists the configured geocoding cache path", async () => {
    const customGeocodingCachePath = path.join(
      tmpDir,
      "custom-cache",
      "locations.json",
    );
    setBuilderOutputSettings({
      manifestPath,
      thumbnailsDir,
      originalsDir: path.join(tmpDir, "public", "originals"),
      geocodingCachePath: customGeocodingCachePath,
    });
    await seedRepoAssets(assetsGitDir);

    await prepareRepositoryLayout({ assetsGitDir, logger });

    await expect(
      fs.readFile(customGeocodingCachePath, "utf-8"),
    ).resolves.toContain('"entries": {}');

    await fs.writeFile(
      customGeocodingCachePath,
      JSON.stringify({ version: 2, entries: { custom: {} } }, null, 2),
    );
    await persistBuildOutputsToRepository({ assetsGitDir, logger });

    const repoGeocodingCache = JSON.parse(
      await fs.readFile(
        path.join(assetsGitDir, "geocoding-cache.json"),
        "utf-8",
      ),
    );
    expect(repoGeocodingCache.entries).toEqual({ custom: {} });
  });
});

describe("GitHub repo sync git integration", () => {
  let tmpDir: string;
  let remoteDir: string;
  let seedDir: string;
  let assetsGitDirName: string;
  let assetsGitDir: string;
  let manifestPath: string;
  let thumbnailsDir: string;

  beforeEach(async () => {
    setConsoleForwarding(false);

    tmpDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "afilmory-github-repo-sync-git-"),
    );
    remoteDir = path.join(tmpDir, "remote.git");
    seedDir = path.join(tmpDir, "seed");
    assetsGitDirName = `.assets-git-test-${path.basename(tmpDir)}`;
    assetsGitDir = path.join(webAppDir, assetsGitDirName);
    manifestPath = path.join(tmpDir, "generated", "photos-manifest.json");
    thumbnailsDir = path.join(tmpDir, "public", "thumbnails");

    setBuilderOutputSettings({
      manifestPath,
      thumbnailsDir,
      originalsDir: path.join(tmpDir, "public", "originals"),
    });

    await createCacheRemote({ remoteDir, seedDir });
  });

  afterEach(async () => {
    setConsoleForwarding(true);
    await fs.rm(assetsGitDir, { force: true, recursive: true });
    const webAppEntries = await fs.readdir(webAppDir).catch(() => []);
    await Promise.all(
      webAppEntries
        .filter(
          (entry) =>
            entry.startsWith(`${assetsGitDirName}.backup-`) ||
            entry.startsWith(".assets-git-clone-"),
        )
        .map((entry) =>
          fs.rm(path.join(webAppDir, entry), { force: true, recursive: true }),
        ),
    );
    await fs.rm(tmpDir, { force: true, recursive: true });
  });

  it("uses a fresh clone fallback when pull cannot overwrite an untracked file", async () => {
    await cloneCacheRemote(remoteDir, assetsGitDir);

    await fs.writeFile(
      path.join(seedDir, "thumbnails", "remote-only.jpg"),
      "remote",
    );
    await git(seedDir, "add", "thumbnails/remote-only.jpg");
    await git(seedDir, "commit", "-m", "add remote thumbnail");
    await git(seedDir, "push", "origin", "main");

    await fs.writeFile(
      path.join(assetsGitDir, "thumbnails", "remote-only.jpg"),
      "local-untracked",
    );

    await syncRemoteCacheRepository({
      assetsGitDir,
      logger,
      repoConfig: { enable: true, url: remoteDir, token: "token" },
    });

    await expect(
      fs.readFile(
        path.join(assetsGitDir, "thumbnails", "remote-only.jpg"),
        "utf-8",
      ),
    ).resolves.toBe("remote");

    const backups = (await fs.readdir(webAppDir)).filter((entry) =>
      entry.startsWith(`${assetsGitDirName}.backup-`),
    );
    expect(backups).toHaveLength(1);
  });

  it("stages and pushes only cache paths", async () => {
    await cloneCacheRemote(remoteDir, assetsGitDir);
    await fs.writeFile(
      path.join(assetsGitDir, "photos-manifest.json"),
      JSON.stringify(
        {
          version: CURRENT_MANIFEST_VERSION,
          data: [{ id: "cache-only" }],
          cameras: [],
          lenses: [],
        },
        null,
        2,
      ),
    );
    await fs.writeFile(path.join(assetsGitDir, "README.md"), "do not push");

    await pushUpdatesToRemoteRepo({
      assetsGitDir,
      logger,
      repoConfig: { enable: true, url: remoteDir, token: "token" },
    });

    const inspectDir = path.join(tmpDir, "inspect-cache-only");
    await cloneCacheRemote(remoteDir, inspectDir);
    const manifest = JSON.parse(
      await fs.readFile(path.join(inspectDir, "photos-manifest.json"), "utf-8"),
    );
    expect(manifest.data).toEqual([{ id: "cache-only" }]);
    await expect(
      fs.access(path.join(inspectDir, "README.md")),
    ).rejects.toThrow();
  });

  it("pushes existing cache-only ahead commits", async () => {
    await cloneCacheRemote(remoteDir, assetsGitDir);
    await fs.writeFile(
      path.join(assetsGitDir, "photos-manifest.json"),
      JSON.stringify(
        {
          version: CURRENT_MANIFEST_VERSION,
          data: [{ id: "ahead-cache" }],
          cameras: [],
          lenses: [],
        },
        null,
        2,
      ),
    );
    await git(assetsGitDir, "add", "photos-manifest.json");
    await git(assetsGitDir, "commit", "-m", "cache ahead");

    await pushUpdatesToRemoteRepo({
      assetsGitDir,
      logger,
      repoConfig: { enable: true, url: remoteDir, token: "token" },
    });

    const inspectDir = path.join(tmpDir, "inspect-ahead-cache");
    await cloneCacheRemote(remoteDir, inspectDir);
    const manifest = JSON.parse(
      await fs.readFile(path.join(inspectDir, "photos-manifest.json"), "utf-8"),
    );
    expect(manifest.data).toEqual([{ id: "ahead-cache" }]);
  });

  it("skips pushing when existing ahead commits touch non-cache paths", async () => {
    await cloneCacheRemote(remoteDir, assetsGitDir);
    await fs.writeFile(path.join(assetsGitDir, "README.md"), "local docs");
    await git(assetsGitDir, "add", "README.md");
    await git(assetsGitDir, "commit", "-m", "docs ahead");

    await pushUpdatesToRemoteRepo({
      assetsGitDir,
      logger,
      repoConfig: { enable: true, url: remoteDir, token: "token" },
    });

    const inspectDir = path.join(tmpDir, "inspect-non-cache-ahead");
    await cloneCacheRemote(remoteDir, inspectDir);
    await expect(
      fs.access(path.join(inspectDir, "README.md")),
    ).rejects.toThrow();
  });

  it("skips pushing when ahead commits touched then reverted non-cache paths", async () => {
    await cloneCacheRemote(remoteDir, assetsGitDir);
    await fs.writeFile(path.join(assetsGitDir, "README.md"), "temporary docs");
    await git(assetsGitDir, "add", "README.md");
    await git(assetsGitDir, "commit", "-m", "docs ahead");
    await git(assetsGitDir, "rm", "README.md");
    await git(assetsGitDir, "commit", "-m", "remove docs ahead");

    await pushUpdatesToRemoteRepo({
      assetsGitDir,
      logger,
      repoConfig: { enable: true, url: remoteDir, token: "token" },
    });

    const remoteCommitCount = await execa("git", [
      "--git-dir",
      remoteDir,
      "rev-list",
      "--count",
      "main",
    ]);
    expect(remoteCommitCount.stdout.trim()).toBe("1");
  });
});

async function seedRepoAssets(assetsGitDir: string): Promise<void> {
  await fs.mkdir(path.join(assetsGitDir, "thumbnails"), { recursive: true });
  await fs.writeFile(
    path.join(assetsGitDir, "thumbnails", "photo.jpg"),
    "thumb",
  );
  await fs.writeFile(
    path.join(assetsGitDir, "photos-manifest.json"),
    JSON.stringify(
      {
        version: CURRENT_MANIFEST_VERSION,
        data: [{ id: "photo" }],
        cameras: [],
        lenses: [],
      },
      null,
      2,
    ),
  );
  await fs.writeFile(
    path.join(assetsGitDir, "geocoding-cache.json"),
    JSON.stringify(
      { version: 2, updatedAt: new Date(0).toISOString(), entries: {} },
      null,
      2,
    ),
  );
}

async function linkLocalOutputsToRepo(
  assetsGitDir: string,
  paths: {
    manifestPath: string;
    geocodingCachePath: string;
    thumbnailsDir: string;
  },
): Promise<void> {
  await fs.mkdir(path.dirname(paths.manifestPath), { recursive: true });
  await fs.mkdir(path.dirname(paths.thumbnailsDir), { recursive: true });
  await fs.symlink(
    path.join(assetsGitDir, "photos-manifest.json"),
    paths.manifestPath,
  );
  await fs.symlink(
    path.join(assetsGitDir, "geocoding-cache.json"),
    paths.geocodingCachePath,
  );
  await fs.symlink(path.join(assetsGitDir, "thumbnails"), paths.thumbnailsDir);
}

async function createCacheRemote(options: {
  remoteDir: string;
  seedDir: string;
}): Promise<void> {
  const { remoteDir, seedDir } = options;

  await git(path.dirname(remoteDir), "init", "--bare", remoteDir);
  await fs.mkdir(seedDir, { recursive: true });
  await git(seedDir, "init");
  await configureGitUser(seedDir);
  await seedRepoAssets(seedDir);
  await git(seedDir, "add", ".");
  await git(seedDir, "commit", "-m", "seed cache");
  await git(seedDir, "branch", "-M", "main");
  await git(seedDir, "remote", "add", "origin", remoteDir);
  await git(seedDir, "push", "-u", "origin", "main");
  await execa("git", [
    "--git-dir",
    remoteDir,
    "symbolic-ref",
    "HEAD",
    "refs/heads/main",
  ]);
}

async function cloneCacheRemote(
  remoteDir: string,
  targetDir: string,
): Promise<void> {
  await execa("git", ["clone", "-b", "main", remoteDir, targetDir]);
  await configureGitUser(targetDir);
}

async function configureGitUser(cwd: string): Promise<void> {
  await git(cwd, "config", "user.email", "test@example.com");
  await git(cwd, "config", "user.name", "Test User");
}

async function git(cwd: string, ...args: string[]): Promise<void> {
  await execa("git", args, { cwd });
}
