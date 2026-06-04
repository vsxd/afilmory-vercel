# 照片处理模块

`packages/builder/src/photo` 包含单张照片从源对象到 manifest item 的处理逻辑。它由 `AfilmoryBuilder` 调用，运行时依赖 builder services、storage manager、plugin runtime 和 per-worker loggers。

## 模块结构

```text
photo/
├── cache-manager.ts          # 判断现有 manifest/缩略图/缓存能否复用
├── data-processors.ts        # 缩略图、EXIF、影调分析处理器
├── execution-context.ts      # AsyncLocalStorage 执行上下文
├── gainmap-detector.ts       # Ultra HDR gain map 检测
├── geocoding.ts              # 反向地理编码实现，被 geocoding 插件调用
├── id.ts                     # photo id 生成与冲突处理
├── image-pipeline.ts         # 核心图片处理管道
├── info-extractor.ts         # 标题、日期、tags 等 manifest 信息提取
├── live-photo-handler.ts     # Live Photo sidecar 匹配与 URL 生成
├── logger-adapter.ts         # worker/logger 适配器
├── motion-photo-detector.ts  # Android/Google Motion Photo metadata 检测
├── processor.ts              # processPhoto 入口
└── index.ts                  # 模块导出
```

## Pipeline Steps

`processPhoto` 会构造 `PhotoProcessingContext`，再调用 `processPhotoWithPipeline`。核心步骤：

1. 读取源对象 key，并查找已有 manifest item。
2. 下载原图 buffer。
3. 对 HEIC/HEIF/HIF、BMP 等格式做预处理。
4. 用 Sharp 读取宽高、格式等 metadata。
5. 生成或复用 JPEG 缩略图与 ThumbHash。
6. 提取或复用 EXIF。
7. 检测 Ultra HDR gain map。
8. 检测嵌入式 Motion Photo。
9. 匹配独立 Live Photo 视频文件。
10. 防止同一照片同时存在 Motion Photo 和 Live Photo。
11. 计算或复用影调分析。
12. 提取标题、拍摄时间、tags、描述等展示信息。
13. 组装 `PhotoManifestItem` 并触发插件事件。

## Execution Context

管道阶段通过 `runWithPhotoExecutionContext` 访问共享能力：

- storage manager
- storage config
- builder services
- plugin event emitter
- storage key normalizer
- scoped photo loggers

这样可以避免把大型 builder 对象传入每个处理函数，也让 worker/cluster 模式下的日志和服务访问更稳定。

## Cache Reuse

缓存判断集中在 `cache-manager.ts` 和 `data-processors.ts`：

- 非强制模式下，如果源对象未变化，会复用已有 manifest item。
- 已有缩略图和 `thumbHash` 时会复用缩略图文件。
- `--force-thumbnails` 只强制刷新缩略图和 ThumbHash。
- `--force-manifest` 强制刷新 EXIF、影调分析等 manifest 派生数据。
- `--force` 会重新处理所有照片。

## Video and HDR Handling

- Live Photo：通过 storage provider 的 `detectLivePhotos` 或 `createLivePhotoMap` 按同名图片/视频配对，视频 key 会转成公开 URL。
- Motion Photo：从 EXIF/XMP container metadata 中检测嵌入视频 offset、size 和 presentation timestamp。
- HDR：`gainmap-detector.ts` 检测 ContainerDirectory 中的 gain map 条目，结果写入 `isHDR`。

Manifest 中的 `video` 是 sum type：

```ts
type VideoSource =
  | { type: "live-photo"; videoUrl: string; s3Key: string }
  | {
      type: "motion-photo";
      offset: number;
      size?: number;
      presentationTimestamp?: number;
    };
```

## Geocoding

反向地理编码由 `plugins/geocoding.ts` 在构建生命周期中调用 `photo/geocoding.ts`。默认根配置未启用该插件；需要时在 `builder.config.ts` 中显式加入：

```ts
import { defineBuilderConfig, geocodingPlugin } from "@afilmory/builder";

export default defineBuilderConfig(() => ({
  plugins: [
    geocodingPlugin({
      enable: true,
      provider: "auto",
      mapboxToken: process.env.MAPBOX_TOKEN,
    }),
  ],
}));
```

## Extending the Pipeline

- 添加新处理步骤时优先放在 `image-pipeline.ts` 附近，保持顺序清晰。
- 添加新可复用数据时同步更新 cache 判定、manifest 类型和迁移逻辑。
- 添加插件行为时优先通过 plugin lifecycle hook，不要绕过 `AfilmoryBuilder` services。
- 新字段如果进入 manifest，需要同步 `@afilmory/data` 类型、web runtime 使用方和测试。
