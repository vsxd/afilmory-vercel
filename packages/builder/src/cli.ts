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
import { logger, setLogListener } from "./logger/index.js";
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

  const builderConfig = await loadBuilderConfig({
    cwd: join(fileURLToPath(import.meta.url), "../../../.."),
  });
  const cliBuilder = new AfilmoryBuilder(builderConfig, {
    exifService: new ExifService({
      exiftoolPath: process.env.EXIFTOOL_PATH,
    }),
    ownsExifService: true,
  });
  process.title = "photo-gallery-builder-main";

  // 解析命令行参数
  const args = new Set(process.argv.slice(2));
  const isForceMode = args.has("--force");
  const isForceManifest = args.has("--force-manifest");
  const isForceThumbnails = args.has("--force-thumbnails");
  const disableUi = args.has("--no-ui");

  // 显示帮助信息
  if (args.has("--help") || args.has("-h")) {
    logger.main.info(`
照片库构建工具 (S3 静态站点构建)

用法：tsx packages/builder/src/cli.ts [选项]

选项：
  --force              强制重新处理所有照片
  --force-manifest     强制重新生成 manifest
  --force-thumbnails   强制重新生成缩略图
  --config             显示当前配置信息
  --help, -h          显示帮助信息
  --no-ui             使用传统日志输出（禁用 TUI）

示例：
  tsx packages/builder/src/cli.ts                           # 增量更新
  tsx packages/builder/src/cli.ts --force                   # 全量更新
  tsx packages/builder/src/cli.ts --force-thumbnails        # 强制重新生成缩略图
  tsx packages/builder/src/cli.ts --config                  # 显示配置信息

配置：
  在 builder.config.ts 中设置 performance.worker.useClusterMode = true 
  可启用多进程集群模式，发挥多核心优势。
`);
    cliBuilder.dispose();
    return;
  }

  // 显示配置信息
  if (args.has("--config")) {
    const config = cliBuilder.getConfig();
    const userConfig = config.user;
    const storage = userConfig?.storage;
    if (!storage) {
      logger.main.error("未配置存储提供商，请先在配置文件中设置 storage 字段");
      cliBuilder.dispose();
      return;
    }
    logger.main.info("🔧 当前配置：");
    logger.main.info(`   存储提供商：${storage.provider}`);

    switch (storage.provider) {
      case "s3": {
        logger.main.info(`   存储桶：${storage.bucket}`);
        logger.main.info(`   区域：${storage.region || "未设置"}`);
        logger.main.info(`   端点：${storage.endpoint || "默认"}`);
        logger.main.info(`   自定义域名：${storage.customDomain || "未设置"}`);
        logger.main.info(`   前缀：${storage.prefix || "无"}`);
        break;
      }
    }
    logger.main.info(
      `   默认并发数：${config.system.processing.defaultConcurrency}`,
    );
    logger.main.info(
      `   Live Photo 检测：${config.system.processing.enableLivePhotoDetection ? "启用" : "禁用"}`,
    );
    logger.main.info(
      `   照片后缀摘要长度：${config.system.processing.digestSuffixLength}`,
    );
    logger.main.info(
      `   Worker 数：${config.system.observability.performance.worker.workerCount}`,
    );
    logger.main.info(
      `   Worker 超时：${config.system.observability.performance.worker.timeout}ms`,
    );
    logger.main.info(
      `   集群模式：${config.system.observability.performance.worker.useClusterMode ? "启用" : "禁用"}`,
    );
    logger.main.info("");
    if (!userConfig) {
      logger.main.warn("未配置用户级设置（storage）");
      cliBuilder.dispose();
      return;
    }
    cliBuilder.dispose();
    return;
  }

  // 确定运行模式
  let runMode = "增量更新";
  if (isForceMode) {
    runMode = "全量更新";
  } else if (isForceManifest && isForceThumbnails) {
    runMode = "强制刷新 manifest 和缩略图";
  } else if (isForceManifest) {
    runMode = "强制刷新 manifest";
  } else if (isForceThumbnails) {
    runMode = "强制刷新缩略图";
  }

  const config = cliBuilder.getConfig();
  const concurrencyLimit =
    config.system.observability.performance.worker.workerCount;
  const finalConcurrency =
    concurrencyLimit ?? config.system.processing.defaultConcurrency;
  const processingMode = config.system.observability.performance.worker
    .useClusterMode
    ? "多进程集群"
    : "并发线程池";
  const processingModeKey = config.system.observability.performance.worker
    .useClusterMode
    ? "cluster"
    : "worker";

  const useTui = process.stdout.isTTY && !disableUi;
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

  logger.main.info(`🚀 运行模式：${runMode}`);
  logger.main.info(`⚡ 最大并发数：${finalConcurrency}`);
  logger.main.info(`🔧 处理模式：${processingMode}`);
  logger.main.info(`🏗️ 使用构建器：AfilmoryBuilder (适配器模式)`);

  environmentCheck();

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
      `⚠️ 有 ${buildResult.failedCount} 张照片处理失败，已从 manifest 中跳过（未写入空字段）。请检查上方失败日志。`,
    );
    if (process.env.BUILDER_FAIL_ON_PHOTO_ERROR === "true") {
      logger.main.error(
        "BUILDER_FAIL_ON_PHOTO_ERROR=true，构建以非零状态码退出。",
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
  logger.main.error("构建失败：", error);
  throw error;
});

function environmentCheck() {
  try {
    execSync("perl -v", { stdio: "ignore" });

    logger.main.info("Perl 已安装");
  } catch (err) {
    console.error(err);
    logger.main.error("Perl 未安装，请安装 Perl 并重新运行");
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1);
  }
}
