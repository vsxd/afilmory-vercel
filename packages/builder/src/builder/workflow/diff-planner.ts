import { createThumbnailInventory } from "../../image/thumbnail.js";
import { findPhotoIdCollisionKeys } from "../../photo/id.js";
import { getStorageObjectVersion } from "../../photo/live-photo-handler.js";
import { toProcessorOptions } from "../../photo/processing-options.js";
import { decidePhotoWork } from "../../photo/work-decision.js";
import type { StorageObject } from "../../storage/interfaces.js";
import type { BuilderPluginOptions } from "../../types/options.js";
import type { PhotoManifestItem } from "../../types/photo.js";
import type { BuildPlan } from "./plan.js";
import { copyProcessorOptions } from "./plan.js";
import type { BuildSession } from "./session.js";

type PlanningContext = Pick<
  BuildSession,
  | "config"
  | "options"
  | "emit"
  | "logger"
  | "getPhotoIdForKey"
  | "setPhotoIdCollisionKeys"
>;

export class DiffPlanner {
  async plan(
    session: PlanningContext,
    imageObjects: StorageObject[],
    existingManifestMap: ReadonlyMap<string, PhotoManifestItem>,
    livePhotoMap: ReadonlyMap<string, StorageObject> = new Map(),
    repairedPhotoKeys: ReadonlySet<string> = new Set(),
  ): Promise<BuildPlan> {
    const { logger } = session;
    const collisionKeys = findPhotoIdCollisionKeys(
      imageObjects.map((object) => object.key),
    );
    session.setPhotoIdCollisionKeys(collisionKeys);
    if (collisionKeys.size > 0) {
      logger.main.warn(
        `Detected ${collisionKeys.size} photos with the same name across directories; adding a path digest suffix to their IDs to avoid collisions`,
      );
    }
    await session.emit("afterImagesListed", {
      options: session.options,
      imageObjects,
    });

    // Hooks keep their legacy mutable payload. Planning captures its values and
    // publishes a separate policy, never writes hidden state onto session.options.
    const options: BuilderPluginOptions = {
      ...session.options,
      locationMode: session.config.system.processing.locationMode ?? "coarse",
      reprocessKeys: [
        ...new Set([
          ...repairedPhotoKeys,
          ...(session.options.reprocessKeys ?? []),
        ]),
      ],
    };
    const policy = toProcessorOptions(options);
    const reprocessKeys = new Set(options.reprocessKeys);
    const s3ImageKeys = new Set(imageObjects.map((object) => object.key));
    const reasons = new Map<string, string>();
    const tasks: StorageObject[] = [];
    let inventoryPromise:
      ReturnType<typeof createThumbnailInventory> | undefined;
    for (const object of imageObjects) {
      const existingItem = existingManifestMap.get(object.key);
      const decision = await decidePhotoWork(
        existingItem,
        object,
        policy,
        async () => {
          inventoryPromise ??= createThumbnailInventory(
            session.config.output.thumbnailsDir,
          );
          return (await inventoryPromise).has(
            session.getPhotoIdForKey(object.key, existingItem),
            existingItem?.thumbnailUrl,
          );
        },
      );
      const currentVideo = livePhotoMap.get(object.key);
      const previousVideo =
        existingItem?.video?.type === "live-photo"
          ? existingItem.video
          : undefined;
      const videoChanged = currentVideo
        ? !previousVideo ||
          previousVideo.s3Key !== currentVideo.key ||
          previousVideo.version !== getStorageObjectVersion(currentVideo)
        : Boolean(previousVideo);
      if (videoChanged) reprocessKeys.add(object.key);
      if (decision.shouldProcess || videoChanged) {
        tasks.push(object);
        reasons.set(
          object.key,
          videoChanged ? "Live Photo sidecar changed" : decision.reason,
        );
      }
    }
    const tasksToProcess = [...tasks].sort(
      (a, b) =>
        (b.size ?? 0) - (a.size ?? 0) ||
        (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
    );
    if (tasks[0]?.key !== tasksToProcess[0]?.key)
      logger.main.info(
        "Reordered the processing queue by file size (largest first)",
      );
    await session.emit("afterTasksPrepared", {
      options: session.options,
      tasks: tasksToProcess,
      totalImages: imageObjects.length,
    });
    // Capture explicit plugin additions/removals to the prepared task list too.
    const processorOptions = toProcessorOptions({
      ...session.options,
      locationMode: options.locationMode,
      reprocessKeys: [
        ...new Set([
          ...reprocessKeys,
          ...(session.options.reprocessKeys ?? []),
        ]),
      ],
    });
    processorOptions.plannedKeys = new Set(
      tasksToProcess.map((task) => task.key),
    );
    for (const task of tasksToProcess)
      if (!reasons.has(task.key)) reasons.set(task.key, "plugin-prepared task");
    logger.main.info(
      `Found ${imageObjects.length} photos in storage; ${tasksToProcess.length} need processing`,
    );
    return Object.freeze({
      s3ImageKeys,
      tasksToProcess: Object.freeze(
        tasksToProcess.map((task) =>
          Object.freeze({
            ...task,
            ...(task.lastModified
              ? { lastModified: new Date(task.lastModified) }
              : {}),
          }),
        ),
      ),
      reasons: new Map(
        tasksToProcess.map((task) => [task.key, reasons.get(task.key)!]),
      ),
      processorOptions: Object.freeze(copyProcessorOptions(processorOptions)),
    });
  }
}
