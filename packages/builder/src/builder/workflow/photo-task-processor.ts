import { logger } from "../../logger/index.js";
import type { PhotoProcessorOptions } from "../../photo/processor.js";
import { processPhoto } from "../../photo/processor.js";
import type { StorageObject } from "../../storage/interfaces.js";
import type {
  PhotoManifestItem,
  ProcessPhotoResult,
} from "../../types/photo.js";
import { ClusterPool } from "../../worker/cluster-pool.js";
import type { TaskCompletedPayload } from "../../worker/pool.js";
import { WorkerPool } from "../../worker/pool.js";
import type { BuildSession } from "./session.js";

export interface ProcessingStats {
  newCount: number;
  processedCount: number;
  skippedCount: number;
  failedCount: number;
}

export interface PhotoTaskProcessingResult {
  processorOptions: PhotoProcessorOptions;
  mode: "cluster" | "worker";
  concurrency: number;
  results: ProcessPhotoResult[];
  stats: ProcessingStats;
}

export class PhotoTaskProcessor {
  async process(
    session: BuildSession,
    tasksToProcess: StorageObject[],
    existingManifestMap: Map<string, PhotoManifestItem>,
    livePhotoMap: Map<string, StorageObject>,
  ): Promise<PhotoTaskProcessingResult> {
    const { options } = session;
    const processorOptions: PhotoProcessorOptions = {
      isForceMode: options.isForceMode,
      isForceManifest: options.isForceManifest,
      isForceThumbnails: options.isForceThumbnails,
    };

    const concurrency =
      options.concurrencyLimit ??
      session.config.system.processing.defaultConcurrency;
    const { useClusterMode } =
      session.config.system.observability.performance.worker;
    const shouldUseCluster =
      useClusterMode && tasksToProcess.length >= concurrency * 2;
    const mode = shouldUseCluster ? "cluster" : "worker";

    await session.emit("beforeProcessTasks", {
      options,
      tasks: tasksToProcess,
      processorOptions,
      mode,
      concurrency,
    });

    const stats: ProcessingStats = {
      newCount: 0,
      processedCount: 0,
      skippedCount: 0,
      failedCount: 0,
    };

    const { progressListener } = options;
    const totalTasks = tasksToProcess.length;
    let completedTaskCount = 0;

    const emitProgress = (currentKey?: string): void => {
      progressListener?.onProgress?.({
        total: totalTasks,
        completed: completedTaskCount,
        ...stats,
        currentKey,
      });
    };

    const handleTaskCompleted = ({
      result,
      taskIndex,
      completed,
    }: TaskCompletedPayload<ProcessPhotoResult>): void => {
      this.applyResultCounters(stats, result);
      completedTaskCount = completed;
      emitProgress(tasksToProcess[taskIndex]?.key);
    };

    progressListener?.onStart?.({
      total: totalTasks,
      mode,
      concurrency,
    });
    emitProgress();

    logger.main.info(
      `开始${shouldUseCluster ? "多进程" : "并发"}处理任务，${shouldUseCluster ? "进程" : "Worker"}数：${concurrency}${shouldUseCluster ? `，每进程并发：${session.config.system.observability.performance.worker.workerConcurrency}` : ""}`,
    );

    const results = shouldUseCluster
      ? await this.processWithCluster(
          session,
          tasksToProcess,
          existingManifestMap,
          livePhotoMap,
          handleTaskCompleted,
          concurrency,
        )
      : await this.processWithWorkers(
          session,
          tasksToProcess,
          existingManifestMap,
          livePhotoMap,
          processorOptions,
          handleTaskCompleted,
          concurrency,
        );

    completedTaskCount = Math.max(completedTaskCount, totalTasks);
    emitProgress();
    progressListener?.onComplete?.({
      total: totalTasks,
      completed: completedTaskCount,
      ...stats,
    });

    return {
      processorOptions,
      mode,
      concurrency,
      results,
      stats,
    };
  }

  completeEmptyRun(session: BuildSession, stats: ProcessingStats): void {
    session.options.progressListener?.onComplete?.({
      total: 0,
      completed: 0,
      ...stats,
    });
  }

  private async processWithCluster(
    session: BuildSession,
    tasksToProcess: StorageObject[],
    existingManifestMap: Map<string, PhotoManifestItem>,
    livePhotoMap: Map<string, StorageObject>,
    onTaskCompleted: (
      payload: TaskCompletedPayload<ProcessPhotoResult>,
    ) => void,
    concurrency: number,
  ): Promise<ProcessPhotoResult[]> {
    const clusterPool = new ClusterPool<ProcessPhotoResult>({
      concurrency,
      totalTasks: tasksToProcess.length,
      workerConcurrency:
        session.config.system.observability.performance.worker
          .workerConcurrency,
      sharedData: {
        existingManifestMap,
        livePhotoMap,
        imageObjects: tasksToProcess,
        builderConfig: session.getConfig(),
        builderOptions: session.options,
        photoIdCollisionKeys: Array.from(session.getPhotoIdCollisionKeys()),
      },
      onTaskCompleted,
    });

    return await clusterPool.execute();
  }

  private async processWithWorkers(
    session: BuildSession,
    tasksToProcess: StorageObject[],
    existingManifestMap: Map<string, PhotoManifestItem>,
    livePhotoMap: Map<string, StorageObject>,
    processorOptions: PhotoProcessorOptions,
    onTaskCompleted: (
      payload: TaskCompletedPayload<ProcessPhotoResult>,
    ) => void,
    concurrency: number,
  ): Promise<ProcessPhotoResult[]> {
    const workerPool = new WorkerPool<ProcessPhotoResult>({
      concurrency,
      totalTasks: tasksToProcess.length,
      onTaskCompleted,
    });

    return await workerPool.execute(async (taskIndex, workerId) => {
      const obj = tasksToProcess[taskIndex];

      return await processPhoto(
        obj,
        taskIndex,
        workerId,
        tasksToProcess.length,
        existingManifestMap,
        livePhotoMap,
        processorOptions,
        session.services,
        (runState, event, payload) =>
          session.emitPluginEvent(runState, event, payload),
        {
          runState: session.runState,
          builderOptions: session.options,
        },
      );
    });
  }

  private applyResultCounters(
    stats: ProcessingStats,
    result: ProcessPhotoResult | null | undefined,
  ): void {
    if (!result) return;

    switch (result.type) {
      case "new": {
        stats.newCount++;
        stats.processedCount++;
        break;
      }
      case "processed": {
        stats.processedCount++;
        break;
      }
      case "skipped": {
        stats.skippedCount++;
        break;
      }
      case "failed": {
        stats.failedCount++;
        break;
      }
    }
  }
}
