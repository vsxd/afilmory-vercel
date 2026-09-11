import "dotenv-expand/config";

/* eslint-disable no-console */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { isAfilmoryManifest } from "@afilmory/schema";
import { $ } from "execa";

import { checkOriginalAccess } from "../../../scripts/check-original-access";
import { resolveSiteUrl } from "../../../scripts/site-url";
import baseSiteConfig from "../../../site.config";

interface ManifestSnapshot {
  content: string;
  path: string;
}

interface PrecheckOptions {
  env?: NodeJS.ProcessEnv;
  runBuilder?: (env: NodeJS.ProcessEnv) => Promise<void>;
  fetch?: typeof fetch;
  workdir?: string;
}

export const precheck = async (options: PrecheckOptions = {}) => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const workdir = options.workdir ?? path.resolve(__dirname, "../../..");
  const env = options.env ?? process.env;
  const shouldBuildManifest = env.SKIP_MANIFEST_BUILD !== "true";
  // In production a stale/degraded build must fail loudly rather than silently
  // publishing an old gallery. Vercel sets VERCEL_ENV=production for production
  // deploys; REQUIRE_FRESH_BUILD=true is the platform-agnostic override.
  const requireFreshBuild =
    env.REQUIRE_FRESH_BUILD === "true" || env.VERCEL_ENV === "production";
  const photoStorageProvider = env.PHOTO_STORAGE_PROVIDER ?? "s3";
  const requiredS3Vars = ["S3_BUCKET_NAME"] as const;
  const missingS3Vars = requiredS3Vars.filter((key) => !env[key]);
  const manifestPath = path.join(workdir, "generated/photos-manifest.json");
  const readExistingManifestSnapshot = async (): Promise<ManifestSnapshot> => {
    let content: string;
    try {
      content = await readFile(manifestPath, "utf-8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error("manifest file is missing");
      }
      throw error;
    }

    const parsed = JSON.parse(content);
    if (!isAfilmoryManifest(parsed)) {
      throw new Error(
        `[precheck] Existing manifest at ${manifestPath} is not manifest v2. ` +
          "Run pnpm build:manifest with S3 credentials to regenerate it.",
      );
    }

    return { content, path: manifestPath };
  };

  if (!shouldBuildManifest) {
    console.warn(
      "[precheck] SKIP_MANIFEST_BUILD=true, skipping builder. Static output may be stale if S3 data changed.",
    );
    return;
  }

  if (
    photoStorageProvider === "s3" &&
    Boolean(env.S3_ACCESS_KEY_ID) !== Boolean(env.S3_SECRET_ACCESS_KEY)
  ) {
    throw new Error(
      "[precheck] S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must either both be provided or both be omitted to use the AWS default credential chain.",
    );
  }

  if (photoStorageProvider === "s3" && missingS3Vars.length > 0) {
    if (requireFreshBuild) {
      throw new Error(
        `[precheck] Missing required S3 environment variables: ${missingS3Vars.join(", ")}. ` +
          "A fresh build is required (VERCEL_ENV=production or REQUIRE_FRESH_BUILD=true); " +
          "refusing to publish using an existing manifest.",
      );
    }
    try {
      await readExistingManifestSnapshot();
      console.warn(
        `[precheck] Missing S3 env vars (${missingS3Vars.join(", ")}), using existing manifest instead of running builder.`,
      );
      return;
    } catch (error) {
      if (
        error instanceof Error &&
        !error.message.includes("manifest file is missing")
      ) {
        throw error;
      }
      throw new Error(
        `[precheck] Missing required S3 environment variables: ${missingS3Vars.join(", ")}. ` +
          `Either configure them or commit an existing manifest at ${manifestPath}. ` +
          "Required: S3_BUCKET_NAME. S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are optional as a pair; omitting both uses the AWS default credential chain. " +
          "Optional: S3_REGION (default: us-east-1), S3_ENDPOINT, S3_PREFIX, S3_CUSTOM_DOMAIN.",
      );
    }
  }

  console.info(
    "[precheck] Running builder CLI to refresh manifest from source...",
  );

  const runBuilder =
    options.runBuilder ??
    ((builderEnv: NodeJS.ProcessEnv) =>
      $({
        cwd: workdir,
        env: builderEnv,
        stdio: "inherit",
      })`pnpm --filter @afilmory/builder cli`);

  try {
    await runBuilder({ ...env });
  } catch (error) {
    if (requireFreshBuild) {
      const hasValidManifest = await readExistingManifestSnapshot()
        .then(() => true)
        .catch(() => false);
      if (hasValidManifest) {
        console.error(
          "[precheck] Builder failed and a fresh build is required " +
            "(VERCEL_ENV=production or REQUIRE_FRESH_BUILD=true); refusing to publish.",
        );
      }
      throw error;
    }

    // The builder switches manifests atomically. A failure before that switch
    // leaves the old manifest untouched; a late plugin/cleanup failure may
    // happen after a new valid manifest was committed and old immutable
    // thumbnails were collected. Never roll the JSON file back by itself: that
    // could make it reference thumbnails that no longer exist. Continue only
    // when the manifest currently on disk is independently valid.
    let currentManifest: ManifestSnapshot;
    try {
      currentManifest = await readExistingManifestSnapshot();
    } catch {
      throw error;
    }

    console.warn(
      `[precheck] Builder failed, continuing with the valid manifest at ${currentManifest.path}. ` +
        `Set SKIP_MANIFEST_BUILD=true to make this explicit. Error: ${
          error instanceof Error ? error.message : String(error)
        }`,
    );
    return;
  }

  if (
    photoStorageProvider === "s3" &&
    (requireFreshBuild || env.VERCEL === "1")
  ) {
    try {
      const snapshot = await readExistingManifestSnapshot();
      const manifest = JSON.parse(snapshot.content);
      if (!isAfilmoryManifest(manifest) || manifest.photos.length === 0) return;
      const result = await checkOriginalAccess(
        manifest.photos[0]!.originalUrl,
        resolveSiteUrl(
          {
            SITE_URL: env.SITE_URL,
            VERCEL: env.VERCEL,
            VERCEL_PROJECT_PRODUCTION_URL: env.VERCEL_PROJECT_PRODUCTION_URL,
          },
          baseSiteConfig.url,
        ),
        options.fetch,
      );
      const log = result.code === "ok" ? console.info : console.warn;
      log(
        `[precheck] Public original check (${result.code}): ${result.message}`,
      );
    } catch {
      console.warn(
        "[precheck] Public original check could not run. Verify the generated manifest, SITE_URL, and public original access after deployment.",
      );
    }
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  precheck().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
