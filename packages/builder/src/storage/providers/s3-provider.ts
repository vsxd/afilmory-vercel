import type {
  _Object,
  DeleteObjectCommandOutput,
  GetObjectCommandOutput,
  ListObjectsV2CommandOutput,
  PutObjectCommandOutput,
} from "@aws-sdk/client-s3";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";

import { logger } from "../../logger/index.js";
import { createS3Client, resolveForcePathStyle } from "../../s3/client.js";
import { backoffDelay, sleep } from "../../utils/backoff.js";
import { Semaphore } from "../../utils/semaphore.js";
import { compileExcludeRegex } from "../exclude-regex.js";
import type {
  ProgressCallback,
  S3Config,
  StorageListing,
  StorageObject,
  StorageProvider,
  StorageUploadOptions,
} from "../interfaces";
import {
  DEFAULT_DOWNLOAD_MEMORY_BUDGET_BYTES,
  DEFAULT_MAX_DOWNLOAD_BYTES,
} from "../interfaces.js";
import { detectLivePhotoPairs } from "../live-photo.js";
import { isSupportedImageKey } from "../supported-formats.js";
import { assertSafeHttpBaseUrl, joinPublicUrl } from "../url.js";

export interface S3SendOptions {
  abortSignal?: AbortSignal;
  requestTimeout?: number;
}

/** Pure URL derivation, also used to recognize provider-owned cached URLs. */
export function generateS3PublicUrl(
  config: Pick<
    S3Config,
    "bucket" | "region" | "endpoint" | "customDomain" | "forcePathStyle"
  >,
  key: string,
): string {
  if (config.customDomain) return joinPublicUrl(config.customDomain, key);
  const endpoint =
    config.endpoint ||
    `https://s3.${config.region ?? "us-east-1"}.amazonaws.com`;
  if (resolveForcePathStyle(config)) {
    return joinPublicUrl(joinPublicUrl(endpoint, config.bucket), key);
  }
  const publicEndpoint = new URL(endpoint);
  publicEndpoint.hostname = `${config.bucket}.${publicEndpoint.hostname}`;
  return joinPublicUrl(publicEndpoint.toString(), key);
}

export type S3GetObjectOutput = Omit<GetObjectCommandOutput, "Body"> & {
  Body?: Buffer | GetObjectCommandOutput["Body"];
};

export interface S3ClientLike {
  send: {
    (
      command: GetObjectCommand,
      options?: S3SendOptions,
    ): Promise<S3GetObjectOutput>;
    (
      command: ListObjectsV2Command,
      options?: S3SendOptions,
    ): Promise<ListObjectsV2CommandOutput>;
    (
      command: PutObjectCommand,
      options?: S3SendOptions,
    ): Promise<PutObjectCommandOutput>;
    (
      command: DeleteObjectCommand,
      options?: S3SendOptions,
    ): Promise<DeleteObjectCommandOutput>;
  };
  destroy?: () => void;
}

class DownloadLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DownloadLimitError";
  }
}

class S3BodyReadError extends Error {
  constructor(message: string, cause: unknown) {
    super(message, { cause });
    this.name = "S3BodyReadError";
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    name?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return (
    candidate.name === "NoSuchKey" ||
    candidate.name === "NotFound" ||
    candidate.$metadata?.httpStatusCode === 404
  );
}

function isNonRetryableS3Error(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const status = (error as { $metadata?: { httpStatusCode?: number } })
    .$metadata?.httpStatusCode;
  return (
    status !== undefined &&
    status >= 400 &&
    status < 500 &&
    status !== 408 &&
    status !== 425 &&
    status !== 429
  );
}

function cancelUnreadBody(body: unknown, reason: Error): void {
  if (!body || typeof body !== "object" || body instanceof Buffer) return;
  const candidate = body as {
    cancel?: (reason?: unknown) => Promise<unknown> | unknown;
    destroy?: () => void;
  };
  if (typeof candidate.destroy === "function") {
    // No error listener has been installed yet on these early-rejection
    // paths. destroy(error) would emit an unhandled "error" event; a plain
    // destroy still closes the body/socket promptly.
    candidate.destroy();
    return;
  }
  if (typeof candidate.cancel === "function") {
    void Promise.resolve(candidate.cancel(reason)).catch(() => {});
  }
}

function assertOptionalPositiveInteger(
  name: string,
  value: number | undefined,
  max: number,
): void {
  if (value === undefined) return;
  if (!Number.isSafeInteger(value) || value <= 0 || value > max) {
    throw new Error(`${name} must be a positive integer <= ${max}`);
  }
}

// 将 AWS S3 对象转换为通用存储对象
function convertS3ObjectToStorageObject(s3Object: _Object): StorageObject {
  return {
    key: s3Object.Key || "",
    size: s3Object.Size,
    lastModified: s3Object.LastModified,
    etag: s3Object.ETag,
  };
}

export class S3StorageProvider implements StorageProvider {
  private readonly config: S3Config;
  private readonly s3Client: S3ClientLike;
  private readonly limiter: Semaphore;
  /** Weighted semaphore capping provider-wide in-flight body buffer bytes. */
  private readonly byteBudget: Semaphore;
  private readonly memoryBudgetBytes: number;
  private readonly maxDownloadBytes: number;
  private readonly clientHandlesRetries: boolean;
  private disposed = false;

  constructor(
    config: S3Config,
    options: {
      s3Client?: S3ClientLike;
      /** Set true when an injected client already owns command-level retries. */
      clientHandlesRetries?: boolean;
    } = {},
  ) {
    // Config loading treats empty optional URL strings as "unset". Preserve
    // that contract for callers that instantiate the provider directly too;
    // otherwise generatePublicUrl would later call new URL("") and the SDK
    // would receive an invalid endpoint provider.
    const normalizedConfig: S3Config = {
      ...config,
      endpoint: config.endpoint || undefined,
      customDomain: config.customDomain || undefined,
    };
    if (!normalizedConfig.bucket?.trim()) {
      throw new Error("S3 bucket must be a non-empty string");
    }
    if (normalizedConfig.endpoint) {
      assertSafeHttpBaseUrl(normalizedConfig.endpoint, "S3 endpoint");
    }
    if (normalizedConfig.customDomain) {
      assertSafeHttpBaseUrl(normalizedConfig.customDomain, "S3 customDomain");
    }
    assertOptionalPositiveInteger(
      "downloadConcurrency",
      config.downloadConcurrency,
      1024,
    );
    assertOptionalPositiveInteger("maxAttempts", config.maxAttempts, 10);
    assertOptionalPositiveInteger(
      "maxFileLimit",
      config.maxFileLimit,
      10_000_000,
    );
    for (const [name, value] of [
      ["requestTimeoutMs", config.requestTimeoutMs],
      ["idleTimeoutMs", config.idleTimeoutMs],
      ["totalTimeoutMs", config.totalTimeoutMs],
    ] as const) {
      assertOptionalPositiveInteger(name, value, 86_400_000);
    }
    assertOptionalPositiveInteger(
      "maxDownloadBytes",
      config.maxDownloadBytes,
      Number.MAX_SAFE_INTEGER,
    );
    assertOptionalPositiveInteger(
      "downloadMemoryBudgetBytes",
      config.downloadMemoryBudgetBytes,
      Number.MAX_SAFE_INTEGER,
    );
    this.config = normalizedConfig;
    this.s3Client = options.s3Client ?? createS3Client(normalizedConfig);
    this.clientHandlesRetries =
      options.clientHandlesRetries ?? options.s3Client === undefined;
    this.limiter = new Semaphore(this.config.downloadConcurrency ?? 16);
    this.maxDownloadBytes =
      this.config.maxDownloadBytes ?? DEFAULT_MAX_DOWNLOAD_BYTES;
    const memoryBudget =
      this.config.downloadMemoryBudgetBytes ??
      DEFAULT_DOWNLOAD_MEMORY_BUDGET_BYTES;
    if (memoryBudget < this.maxDownloadBytes) {
      throw new Error(
        "downloadMemoryBudgetBytes must be greater than or equal to maxDownloadBytes",
      );
    }
    this.memoryBudgetBytes = memoryBudget;
    this.byteBudget = new Semaphore(memoryBudget);
  }

  private async acquireByteBudget(
    bytes: number,
    signal: AbortSignal,
  ): Promise<() => void> {
    if (bytes > this.memoryBudgetBytes) {
      throw new DownloadLimitError(
        `Download requires ${bytes} bytes, exceeding the global memory budget of ${this.memoryBudgetBytes} bytes`,
      );
    }
    return await this.byteBudget.acquire({ weight: bytes, signal });
  }

  async getFile(key: string, signal?: AbortSignal): Promise<Buffer | null> {
    signal?.throwIfAborted();
    return await this.limiter.run(
      async () => {
        try {
          return await this.executeWithRetry(
            `download ${key}`,
            async () => {
              const totalTimeoutMs = this.config.totalTimeoutMs ?? 60_000;
              const idleTimeoutMs = this.config.idleTimeoutMs ?? 10_000;
              const requestTimeoutMs = this.config.requestTimeoutMs ?? 20_000;
              const startTime = Date.now();
              const controller = new AbortController();
              const abortFromCaller = () => controller.abort(signal?.reason);
              signal?.addEventListener("abort", abortFromCaller, {
                once: true,
              });
              if (signal?.aborted) abortFromCaller();
              const totalTimer = setTimeout(
                () => controller.abort(),
                totalTimeoutMs,
              );
              let idleTimer: NodeJS.Timeout | null = null;
              let firstByteAt: number | null = null;
              let releaseBudget: (() => void) | undefined;
              const clearTimers = () => {
                clearTimeout(totalTimer);
                if (idleTimer) {
                  clearTimeout(idleTimer);
                  idleTimer = null;
                }
              };

              try {
                logger.s3.info(`Download started: ${key}`);

                const command = new GetObjectCommand({
                  Bucket: this.config.bucket,
                  Key: key,
                });

                const response = await this.s3Client.send(command, {
                  abortSignal: controller.signal,
                  requestTimeout: requestTimeoutMs,
                });

                if (!response.Body) {
                  logger.s3.error(`No Body in S3 response: ${key}`);
                  return null;
                }

                const declaredLength = response.ContentLength;
                if (
                  declaredLength !== undefined &&
                  declaredLength > this.maxDownloadBytes
                ) {
                  const error = new DownloadLimitError(
                    `Refusing to download ${key}: declared size ${declaredLength} exceeds maxDownloadBytes=${this.maxDownloadBytes}`,
                  );
                  cancelUnreadBody(response.Body, error);
                  throw error;
                }

                // 如果 Body 已经是 Buffer
                if (response.Body instanceof Buffer) {
                  if (response.Body.length > this.maxDownloadBytes) {
                    throw new DownloadLimitError(
                      `Refusing to download ${key}: body size ${response.Body.length} exceeds maxDownloadBytes=${this.maxDownloadBytes}`,
                    );
                  }
                  releaseBudget = await this.acquireByteBudget(
                    Math.max(1, response.Body.length),
                    controller.signal,
                  );
                  const duration = Date.now() - startTime;
                  const sizeKB = Math.round(response.Body.length / 1024);
                  logger.s3.success(
                    `Download complete: ${key} (${sizeKB}KB, ${duration}ms)`,
                  );
                  return response.Body;
                }

                // 以流方式读取并监控首字节与空闲超时
                const chunks: Uint8Array[] = [];
                const stream = response.Body as NodeJS.ReadableStream;
                const pausable = stream as NodeJS.ReadableStream & {
                  pause?: () => void;
                  resume?: () => void;
                  destroy?: (error?: Error) => void;
                };
                pausable.pause?.();
                const reservedBytes = Math.max(
                  1,
                  declaredLength ?? this.maxDownloadBytes,
                );
                try {
                  releaseBudget = await this.acquireByteBudget(
                    reservedBytes,
                    controller.signal,
                  );
                } catch (error) {
                  cancelUnreadBody(
                    response.Body,
                    error instanceof Error ? error : new Error(String(error)),
                  );
                  throw error;
                }

                const resetIdle = () => {
                  if (idleTimer) clearTimeout(idleTimer);
                  idleTimer = setTimeout(() => {
                    controller.abort();
                  }, idleTimeoutMs);
                };

                resetIdle();

                const buffer: Buffer = await new Promise((resolve, reject) => {
                  let receivedBytes = 0;
                  stream.on("data", (chunk: Uint8Array) => {
                    if (!firstByteAt) firstByteAt = Date.now();
                    receivedBytes += chunk.byteLength;
                    if (
                      receivedBytes > this.maxDownloadBytes ||
                      receivedBytes > reservedBytes
                    ) {
                      const error = new DownloadLimitError(
                        `Refusing to download ${key}: streamed body exceeded its ${Math.min(this.maxDownloadBytes, reservedBytes)} byte reservation`,
                      );
                      pausable.destroy?.(error);
                      reject(error);
                      return;
                    }
                    chunks.push(chunk);
                    resetIdle();
                  });

                  const removeAbortListener = () =>
                    controller.signal.removeEventListener("abort", onAbort);
                  const onAbort = () => {
                    const error = new S3BodyReadError(
                      `S3 response body was aborted while reading ${key}`,
                      new Error("Request aborted"),
                    );
                    pausable.destroy?.(error);
                    reject(error);
                  };
                  controller.signal.addEventListener("abort", onAbort, {
                    once: true,
                  });

                  stream.on("end", () => {
                    removeAbortListener();
                    clearTimers();
                    const buf = Buffer.concat(chunks);
                    resolve(buf);
                  });

                  stream.on("error", (error) => {
                    removeAbortListener();
                    clearTimers();
                    reject(
                      error instanceof DownloadLimitError ||
                        error instanceof S3BodyReadError
                        ? error
                        : new S3BodyReadError(
                            `S3 response body failed while reading ${key}`,
                            error,
                          ),
                    );
                  });
                  // addEventListener does not replay an abort that won the race
                  // immediately before registration. Check the state after all
                  // handlers are installed so such a stream cannot remain
                  // paused forever with both timeout timers already consumed.
                  if (controller.signal.aborted) {
                    onAbort();
                  } else {
                    pausable.resume?.();
                  }
                });

                const duration = Date.now() - startTime;
                const ttfb = firstByteAt ? firstByteAt - startTime : duration;
                const sizeKB = Math.round(buffer.length / 1024);
                logger.s3.success(
                  `Download complete: ${key} (${sizeKB}KB, ${duration}ms, TTFB ${ttfb}ms)`,
                );
                return buffer;
              } finally {
                clearTimers();
                signal?.removeEventListener("abort", abortFromCaller);
                releaseBudget?.();
              }
            },
            signal,
          );
        } catch (error) {
          if (signal?.aborted) throw signal.reason;
          if (isNotFoundError(error)) {
            logger.s3.warn(`S3 object does not exist: ${key}`);
          } else {
            logger.s3.error(
              `Download failed permanently: ${key}: ${errorMessage(error)}`,
            );
          }
          return null;
        }
      },
      { signal },
    );
  }

  private async executeWithRetry<T>(
    operation: string,
    callback: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    if (this.disposed) {
      throw new Error("S3 storage provider has already been disposed");
    }

    const maxAttempts = this.config.maxAttempts ?? 3;
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      signal?.throwIfAborted();
      try {
        return await callback();
      } catch (error) {
        signal?.throwIfAborted();
        lastError = error;
        const canRetry =
          attempt < maxAttempts &&
          !(error instanceof DownloadLimitError) &&
          !isNotFoundError(error) &&
          !isNonRetryableS3Error(error) &&
          (!this.clientHandlesRetries || error instanceof S3BodyReadError);
        logger.s3.warn(
          `${operation} failed (attempt ${attempt}/${maxAttempts}): ${errorMessage(error)}`,
        );
        if (!canRetry) break;
        const delay = backoffDelay(attempt);
        logger.s3.info(`Retrying ${operation} after ${delay}ms`);
        await sleep(delay, signal);
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error(`${operation} failed: ${String(lastError)}`);
  }

  // 编译并缓存 S3_EXCLUDE_REGEX。无效正则不应崩掉整个构建——记录告警并忽略。
  // 注意分层约定：provider 只应用自身配置里的静态 excludeRegex；跨 provider 的
  // 动态过滤由 StorageManager.excludeFilters 统一负责（见 manager.ts）。
  private excludeRegexCache: RegExp | null | undefined;

  private getExcludeRegex(): RegExp | null {
    if (this.excludeRegexCache !== undefined) {
      return this.excludeRegexCache;
    }
    this.excludeRegexCache = compileExcludeRegex(
      this.config.excludeRegex,
      (error) => {
        logger.s3.warn(
          `S3_EXCLUDE_REGEX is invalid, ignored: ${this.config.excludeRegex}`,
          error,
        );
      },
    );
    return this.excludeRegexCache;
  }

  private isExcluded(key: string | undefined): boolean {
    const excludeRegex = this.getExcludeRegex();
    return Boolean(key && excludeRegex && excludeRegex.test(key));
  }

  async listImages(): Promise<StorageObject[]> {
    const { objects } = await this.listS3ObjectsDetailed();

    // 过滤出图片文件并转换为通用格式
    const imageObjects = objects
      .filter(
        (obj: _Object) =>
          isSupportedImageKey(obj.Key) && !this.isExcluded(obj.Key),
      )
      .map((obj) => convertS3ObjectToStorageObject(obj));

    return imageObjects;
  }

  async listAllFiles(
    progressCallback?: ProgressCallback,
  ): Promise<StorageObject[]> {
    const listing = await this.listAllFilesDetailed(progressCallback);
    return listing.objects;
  }

  async listAllFilesDetailed(
    _progressCallback?: ProgressCallback,
  ): Promise<StorageListing> {
    const listing = await this.listS3ObjectsDetailed();

    // 同样应用 S3_EXCLUDE_REGEX，使其与 listImages 一致——否则被排除的文件仍会
    // 进入 Live Photo 检测和 afterAllFilesListed 插件载荷。
    return {
      ...listing,
      objects: listing.objects
        .filter((obj: _Object) => !this.isExcluded(obj.Key))
        .map((obj) => convertS3ObjectToStorageObject(obj)),
    };
  }

  private async listS3ObjectsDetailed(): Promise<StorageListing<_Object>> {
    const objects: _Object[] = [];
    let continuationToken: string | undefined;
    let remaining = this.config.maxFileLimit;
    const seenTokens = new Set<string>();

    try {
      do {
        const pageSize = remaining ? Math.min(remaining, 1000) : 1000;
        const listCommand = new ListObjectsV2Command({
          Bucket: this.config.bucket,
          Prefix: this.config.prefix,
          MaxKeys: pageSize,
          ContinuationToken: continuationToken,
        });

        const listResponse = await this.executeWithRetry(
          "list S3 objects",
          async () => await this.s3Client.send(listCommand),
        );
        const contents = listResponse.Contents || [];
        const pageObjects = remaining ? contents.slice(0, remaining) : contents;
        objects.push(...pageObjects);

        if (remaining) {
          remaining -= pageObjects.length;
          if (remaining <= 0) {
            // Reaching the configured limit is incomplete only when the
            // provider proves that more keys exist. An exact, final page is a
            // complete snapshot.
            if (
              listResponse.IsTruncated ||
              contents.length > pageObjects.length
            ) {
              const message = `Reached maxFileLimit=${this.config.maxFileLimit}; the storage snapshot is incomplete.`;
              logger.s3.warn(message);
              return {
                objects,
                complete: false,
                reason: { code: "max-file-limit", message },
              };
            }
            break;
          }
        }

        if (!listResponse.IsTruncated) {
          continuationToken = undefined;
          continue;
        }

        const nextToken = listResponse.NextContinuationToken;
        if (!nextToken || seenTokens.has(nextToken)) {
          const message = !nextToken
            ? "S3 returned IsTruncated=true without a continuation token."
            : `S3 repeated continuation token ${JSON.stringify(nextToken)}.`;
          logger.s3.error(message);
          return {
            objects,
            complete: false,
            reason: { code: "pagination-anomaly", message },
          };
        }
        seenTokens.add(nextToken);
        continuationToken = nextToken;
      } while (continuationToken);

      return { objects, complete: true };
    } catch (error) {
      const message = `S3 listing failed after ${objects.length} objects: ${errorMessage(error)}`;
      logger.s3.error(message);
      return {
        objects,
        complete: false,
        reason: { code: "provider-error", message },
      };
    }
  }

  generatePublicUrl(key: string): string {
    // 注意：这里各分支的 URL 风格（virtual-hosted vs path-style）必须与
    // s3/client.ts 的 resolveForcePathStyle 推导保持一致——客户端取数和
    // 对外公布的 URL 用同一种寻址风格，改动任一侧时同步另一侧及其测试。
    // 如果设置了自定义域名，直接使用自定义域名
    return generateS3PublicUrl(this.config, key);
  }

  detectLivePhotos(allObjects: StorageObject[]): Map<string, StorageObject> {
    // 配对逻辑是纯 key 运算，与本地文件系统 provider 共用（见 live-photo.ts）。
    return detectLivePhotoPairs(allObjects);
  }

  async deleteFile(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
    });

    await this.executeWithRetry(
      `delete ${key}`,
      async () => await this.s3Client.send(command),
    );
  }

  async listObjectKeys(prefix: string): Promise<string[]> {
    const keys: string[] = [];
    let continuationToken: string | undefined;
    const seenTokens = new Set<string>();

    do {
      const listResponse = await this.executeWithRetry(
        `list objects under ${prefix}`,
        async () =>
          await this.s3Client.send(
            new ListObjectsV2Command({
              Bucket: this.config.bucket,
              Prefix: prefix,
              MaxKeys: 1000,
              ContinuationToken: continuationToken,
            }),
          ),
      );

      for (const object of listResponse.Contents ?? []) {
        if (object.Key) keys.push(object.Key);
      }

      const nextToken = listResponse.NextContinuationToken;
      if (listResponse.IsTruncated && !nextToken) {
        throw new Error(
          "S3 returned IsTruncated=true without a continuation token while listing object keys",
        );
      }
      if (listResponse.IsTruncated && seenTokens.has(nextToken!)) {
        throw new Error(
          `S3 repeated continuation token ${JSON.stringify(nextToken)} while listing object keys`,
        );
      }
      if (listResponse.IsTruncated) seenTokens.add(nextToken!);
      continuationToken = listResponse.IsTruncated ? nextToken : undefined;
    } while (continuationToken);

    return keys;
  }

  async uploadFile(
    key: string,
    data: Buffer,
    options?: StorageUploadOptions,
  ): Promise<StorageObject> {
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      Body: data,
      ContentType: options?.contentType,
      CacheControl: options?.cacheControl,
    });

    const response = await this.executeWithRetry(
      `upload ${key}`,
      async () => await this.s3Client.send(command),
    );
    const lastModified = new Date();

    return {
      key,
      size: data.byteLength,
      lastModified,
      etag: response.ETag ?? undefined,
    };
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.s3Client.destroy?.();
  }
}
