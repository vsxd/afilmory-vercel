import "dotenv-expand/config";

import { execSync } from "node:child_process";
import cluster from "node:cluster";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import type { BuildProgressListener } from "./builder/builder.js";
import { AfilmoryBuilder } from "./builder/index.js";
import { loadBuilderConfig } from "./config/index.js";
import { ExifService } from "./image/exif.js";
import {
  isThumbnailEncodingStale,
  THUMBNAIL_ENCODING_SIGNATURE,
} from "./image/thumbnail.js";
import {
  configureLoggerObservability,
  logger,
  setLogListener,
} from "./logger/index.js";
import { runAsWorker } from "./runAsWorker.js";

type BuilderTUI = import("./cli/tui.js").BuilderTUI;

async function main() {
  // 检查是否作为 cluster worker 运行
  if (
    process.env.CLUSTER_WORKER === "true" ||
    process.argv.includes("--cluster-worker") ||
    cluster.isWorker
  ) {
    await runAsWorker();
    return;
  }

  // 解析命令行参数
  const args = new Set(process.argv.slice(2));
  const isForceMode = args.has("--force");
  const isForceManifest = args.has("--force-manifest");
  let isForceThumbnails = args.has("--force-thumbnails");
  const disableUi = args.has("--no-ui");

  // 帮助信息必须在加载配置之前处理：新手在没有任何凭据/配置的机器上运行的
  // 第一条命令往往就是 --help，不能让它因缺失 storage 配置而崩栈。
  if (args.has("--help") || args.has("-h")) {
    logger.main.info(`
Photo gallery builder (S3 static site build)

Usage: tsx packages/builder/src/cli.ts [options]

Options:
  --force              Force reprocessing of all photos
  --force-manifest     Force regeneration of the manifest
  --force-thumbnails   Force regeneration of thumbnails
  --config             Show the current configuration
  --help, -h          Show this help
  --no-ui             Use plain log output (disable the TUI)

Examples:
  tsx packages/builder/src/cli.ts                           # incremental update
  tsx packages/builder/src/cli.ts --force                   # full rebuild
  tsx packages/builder/src/cli.ts --force-thumbnails        # force-regenerate thumbnails
  tsx packages/builder/src/cli.ts --config                  # show configuration

Configuration:
  Set system.processing.worker.useClusterMode = true in builder.config.ts
  to enable cluster mode and take advantage of multiple CPU cores.
`);
    return;
  }

  const builderConfig = await loadBuilderConfig({
    cwd: join(fileURLToPath(import.meta.url), "../../../.."),
  });
  configureLoggerObservability(builderConfig.system.observability.logging);
  // Fail before acquiring ExifTool/Builder resources or hiding the terminal
  // cursor. Read-only configuration output does not require the build runtime.
  if (!args.has("--config")) environmentCheck();
  const cliBuilder = new AfilmoryBuilder(builderConfig, {
    exifService: new ExifService({
      exiftoolPath: process.env.EXIFTOOL_PATH,
    }),
    ownsExifService: true,
  });
  process.title = "photo-gallery-builder-main";

  // 显示配置信息
  if (args.has("--config")) {
    const config = cliBuilder.getConfig();
    const storage = config.user?.storage;
    if (!storage) {
      // loadBuilderConfig 在缺失 storage 时已抛错，此分支仅为类型收窄。
      throw new Error("unreachable: storage missing after loadBuilderConfig");
    }
    logger.main.info("🔧 Current config:");
    logger.main.info(`   Storage provider: ${storage.provider}`);

    switch (storage.provider) {
      case "s3": {
        logger.main.info(`   Bucket: ${storage.bucket}`);
        logger.main.info(`   Region: ${storage.region || "not set"}`);
        logger.main.info(`   Endpoint: ${storage.endpoint || "default"}`);
        logger.main.info(
          `   Custom domain: ${storage.customDomain || "not set"}`,
        );
        logger.main.info(`   Prefix: ${storage.prefix || "none"}`);
        break;
      }
    }
    logger.main.info(
      `   Default concurrency: ${config.system.processing.defaultConcurrency}`,
    );
    logger.main.info(
      `   Live Photo detection: ${config.system.processing.enableLivePhotoDetection ? "enabled" : "disabled"}`,
    );
    logger.main.info(
      `   Photo suffix digest length: ${config.system.processing.digestSuffixLength}`,
    );
    logger.main.info(
      `   Process count: ${config.system.processing.worker.processCount}`,
    );
    logger.main.info(
      `   Worker timeout: ${config.system.processing.worker.timeout}ms`,
    );
    logger.main.info(
      `   Cluster mode: ${config.system.processing.worker.useClusterMode ? "enabled" : "disabled"}`,
    );
    logger.main.info("");
    cliBuilder.dispose();
    return;
  }

  // 缩略图编码参数签名校验：磁盘标记（.encoding）与当前参数不一致或缺失时，
  // 等价于 --force-thumbnails。否则部署构建从 artifact-cache 恢复旧缩略图后，
  // 增量模式判定 0 张需处理，质量/尺寸参数的代码变更永远不会生效。
  const { thumbnailsDir } = cliBuilder.getConfig().output;
  if (
    !isForceMode &&
    !isForceThumbnails &&
    (await isThumbnailEncodingStale(thumbnailsDir))
  ) {
    isForceThumbnails = true;
    logger.main.info(
      `🧾 Thumbnail encoding signature marker mismatch (current: ${THUMBNAIL_ENCODING_SIGNATURE}); force-regenerating all thumbnails this run`,
    );
  }

  // 确定运行模式
  let runMode = "incremental update";
  if (isForceMode) {
    runMode = "full rebuild";
  } else if (isForceManifest && isForceThumbnails) {
    runMode = "force refresh manifest and thumbnails";
  } else if (isForceManifest) {
    runMode = "force refresh manifest";
  } else if (isForceThumbnails) {
    runMode = "force refresh thumbnails";
  }

  const config = cliBuilder.getConfig();
  const concurrencyLimit =
    config.system.processing.worker.globalTaskConcurrency;
  const finalConcurrency =
    concurrencyLimit ?? config.system.processing.defaultConcurrency;
  const processingMode = config.system.processing.worker.useClusterMode
    ? "multi-process cluster"
    : "single-process concurrency pool";
  const processingModeKey = config.system.processing.worker.useClusterMode
    ? "cluster"
    : "worker";

  const useTui =
    config.system.observability.showProgress &&
    process.stdout.isTTY &&
    !disableUi;
  let tui: BuilderTUI | null = null;
  let progressListener: BuildProgressListener | undefined;

  if (useTui) {
    const { BuilderTUI } = await import("./cli/tui.js");
    tui = new BuilderTUI();
    tui.attach();
    tui.setRunMetadata({
      runMode,
      concurrency: finalConcurrency,
      processingMode: processingModeKey,
    });
    progressListener = tui.createProgressListener();
    setLogListener((message) => tui?.handleLog(message), {
      forwardToConsole: false,
    });
  }

  logger.main.info(`🚀 Run mode: ${runMode}`);
  logger.main.info(`⚡ Max concurrency: ${finalConcurrency}`);
  logger.main.info(`🔧 Processing mode: ${processingMode}`);

  // 启动构建过程
  let buildResult: import("./types/options.js").BuilderResult | undefined;
  try {
    const result = await cliBuilder.buildManifest({
      isForceMode,
      isForceManifest,
      isForceThumbnails,
      concurrencyLimit,
      progressListener,
    });

    buildResult = result;
    tui?.markSuccess(result);
  } catch (error) {
    tui?.markError(error);
    throw error;
  } finally {
    if (useTui) {
      setLogListener(null, { forwardToConsole: true });
      tui?.detach();
    }
    cliBuilder.dispose();
  }

  // 失败照片汇总：在 TUI detach 之后输出，确保用户能在终端看到。
  // 默认 exit 0（让 Vercel 等部署在个别照片失败时仍能继续发布其余照片）；
  // 设置 BUILDER_FAIL_ON_PHOTO_ERROR=true 可启用严格模式：任意照片失败即以非零码退出。
  let exitCode = 0;
  if (buildResult && buildResult.failedCount > 0) {
    logger.main.warn(
      `⚠️ ${buildResult.failedCount} photo(s) failed to process. New photos that failed are omitted from the manifest; photos that failed while being reprocessed keep their previous manifest entry (which may now be stale). Check the failure logs above.`,
    );
    if (process.env.BUILDER_FAIL_ON_PHOTO_ERROR === "true") {
      logger.main.error(
        "BUILDER_FAIL_ON_PHOTO_ERROR=true; exiting the build with a non-zero status code.",
      );
      exitCode = 1;
    }
  }

  // 清理 ExifTool 进程后退出
  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(exitCode);
}

// 运行主函数
main().catch((error) => {
  logger.main.error("Build failed:", error);
  throw error;
});

function environmentCheck() {
  try {
    execSync("perl -v", { stdio: "ignore" });
  } catch {
    throw new Error(
      "exiftool requires Perl. Install it (e.g. `brew install perl` / `apt install perl`) and re-run.",
    );
  }
}
