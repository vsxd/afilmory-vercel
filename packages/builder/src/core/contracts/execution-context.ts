import type { PhotoProcessingLoggers } from "../../photo/logger-types.js";
import type { BuilderOutputSettings } from "../../types/config.js";
import type {
  BuilderPluginEvent,
  BuilderPluginEventPayloads,
} from "./plugin-events.js";
import type { PluginRunState } from "./plugin-ref.js";
import type { BuilderServices } from "./services.js";
import type { BuilderStorage } from "./storage.js";

/**
 * Function shape for emitting plugin events from within the photo pipeline.
 * Decoupled from AfilmoryBuilder so the execution context does not need
 * a hard dependency on the builder class.
 */
export type EmitPluginEventFn = <TEvent extends BuilderPluginEvent>(
  runState: PluginRunState,
  event: TEvent,
  payload: BuilderPluginEventPayloads[TEvent],
) => Promise<void>;

/**
 * The async-local-storage context that photo pipeline stages can access
 * via getPhotoExecutionContext(). The `services` field replaces the
 * previous `builder: AfilmoryBuilder` reference, breaking the cycle.
 *
 * 组装只有一个入口：createPhotoExecutionContext（photo/execution-context.ts）。
 * 所有字段均为必填——写入方（processor / geocoding 插件）都经过工厂，不存在
 * "半初始化"的合法状态。
 */
export interface PhotoExecutionContext {
  services: BuilderServices;
  emitPluginEvent: EmitPluginEventFn;
  storageManager: BuilderStorage;
  normalizeStorageKey: (key: string) => string;
  /** 归一化后的输出路径（services.config.output）；照片作用域内的唯一读取入口。 */
  output: BuilderOutputSettings;
  loggers: PhotoProcessingLoggers;
}
