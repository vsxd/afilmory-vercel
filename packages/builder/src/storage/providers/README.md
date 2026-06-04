# S3 存储提供商

本项目的静态站点配置只面向 S3 兼容对象存储。原始照片保留在 S3 或兼容服务中，Builder 在构建期读取源对象、生成缩略图和 manifest；生产部署不会打包原图。

## 配置来源

根目录 `builder.config.ts` 使用：

```ts
storage: {
  provider: "s3",
  bucket: env.S3_BUCKET_NAME,
  region: env.S3_REGION,
  endpoint: env.S3_ENDPOINT,
  accessKeyId: env.S3_ACCESS_KEY_ID,
  secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  prefix: env.S3_PREFIX,
  customDomain: env.S3_CUSTOM_DOMAIN,
  excludeRegex: env.S3_EXCLUDE_REGEX,
  keepAlive: true,
  maxSockets: 64,
  connectionTimeoutMs: 5_000,
  socketTimeoutMs: 30_000,
  requestTimeoutMs: 20_000,
  idleTimeoutMs: 10_000,
  totalTimeoutMs: 60_000,
  retryMode: "standard",
  maxAttempts: 3,
  downloadConcurrency: 8,
}
```

## 环境变量

Builder 刷新 manifest 时必需：

| 变量                   | 说明          |
| ---------------------- | ------------- |
| `S3_BUCKET_NAME`       | bucket 名称   |
| `S3_ACCESS_KEY_ID`     | access key ID |
| `S3_SECRET_ACCESS_KEY` | secret key    |

可选：

| 变量               | 默认值                               | 说明                         |
| ------------------ | ------------------------------------ | ---------------------------- |
| `S3_REGION`        | `us-east-1`                          | S3 region                    |
| `S3_ENDPOINT`      | `https://s3.us-east-1.amazonaws.com` | S3 或兼容服务 endpoint       |
| `S3_PREFIX`        | 空                                   | 只扫描指定 key prefix        |
| `S3_CUSTOM_DOMAIN` | 空                                   | 生成公开 URL 时使用的 CDN 域 |
| `S3_EXCLUDE_REGEX` | 空                                   | 排除对象 key 的正则表达式    |

## 支持的服务

只要兼容 AWS S3 API 即可，包括：

- AWS S3
- MinIO
- 阿里云 OSS S3-compatible endpoint
- 腾讯云 COS S3-compatible endpoint
- 其他 S3-compatible provider

不同 provider 的 endpoint 和公开 URL 规则可能不同。若配置了 `S3_CUSTOM_DOMAIN`，公开 URL 会优先使用该域名。

## Public URL 生成规则

`S3StorageProvider.generatePublicUrl(key)`：

1. 有 `customDomain` 时：`customDomain + encoded key`。
2. AWS endpoint 或未设置 endpoint 时：`https://<bucket>.s3.<region>.amazonaws.com/<encoded key>`。
3. 阿里云 OSS endpoint 时：把 bucket 插入 endpoint host。
4. 其他自定义 endpoint 时：`endpoint/<bucket>/<encoded key>`。

所有 key 会按 URL path segment 安全编码。

## 扫描与过滤

- `listImages()` 只返回支持的图片扩展名。
- 支持格式定义在 `packages/builder/src/constants/index.ts`：
  `.jpg`, `.jpeg`, `.png`, `.webp`, `.bmp`, `.tiff`, `.tif`, `.heic`, `.heif`, `.hif`。
- `S3_PREFIX` 限制扫描前缀。
- `S3_EXCLUDE_REGEX` 可排除某些 key，例如 `.*\.txt$`。
- `maxFileLimit` 可在配置中限制扫描数量。

## Live Photo 检测

S3 provider 会在对象列表中按同目录、同基础文件名匹配图片和视频：

- 图片扩展名来自支持图片格式。
- 视频扩展名包括 `.mov` 和 `.mp4`。
- 匹配结果用于 manifest 的 `video: { type: "live-photo", ... }`。

## 网络和重试

下载单个对象时会使用：

- `downloadConcurrency` 控制 provider 内部下载并发。
- `requestTimeoutMs`、`idleTimeoutMs`、`totalTimeoutMs` 控制超时。
- `maxAttempts` 和标准 backoff 控制重试。
- 大文件会输出内存压力警告。

## 构建缓存

`REPO_URL`/`REPO_TOKEN` 只用于缓存生成的 manifest 和缩略图，帮助 CI 增量构建。它不是照片存储方式，也不会改变 S3 provider 的源对象读取逻辑。

## 常见问题

- **缺少 S3 凭据**：`precheck` 会在已有 `generated/photos-manifest.json` 时复用 manifest；没有 manifest 时构建失败。
- **URL 不是预期 CDN 域名**：确认 `S3_CUSTOM_DOMAIN` 是否设置，且不要在 key 中重复写 CDN path。
- **照片没有出现在 manifest**：检查扩展名、`S3_PREFIX` 和 `S3_EXCLUDE_REGEX`。
- **首次构建慢**：首次需要下载和处理全部照片，后续会基于现有 manifest 增量复用。
