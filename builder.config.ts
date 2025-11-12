import os from 'node:os'

import { defineBuilderConfig } from '@afilmory/builder'

import { env } from './env.js'

/**
 * 静态部署配置 - 仅支持 S3 存储
 *
 * 这个配置用于静态站点部署（如 Vercel、Netlify、GitHub Pages 等）
 * 照片必须存储在 S3 兼容的对象存储中
 *
 * 使用方式：
 * 1. 配置 .env 文件中的 S3 相关环境变量（必填）
 * 2. 可选：配置 REPO_URL 和 REPO_TOKEN 启用远程仓库缓存
 * 3. 运行 pnpm build:static 生成静态站点
 * 4. 部署 apps/web/dist 目录到托管平台
 */
export default defineBuilderConfig(() => ({
  // 远程仓库缓存 - 根据环境变量自动启用
  repo: {
    enable: !!(env.REPO_URL && env.REPO_TOKEN),
    url: env.REPO_URL || '',
    token: env.REPO_TOKEN || '',
  },

  // 使用 S3 存储
  storage: {
    provider: 's3',
    bucket: env.S3_BUCKET_NAME,
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    prefix: env.S3_PREFIX,
    customDomain: env.S3_CUSTOM_DOMAIN,
    excludeRegex: env.S3_EXCLUDE_REGEX,
    maxFileLimit: 1000,
    keepAlive: true,
    maxSockets: 64,
    connectionTimeoutMs: 5_000,
    socketTimeoutMs: 30_000,
    requestTimeoutMs: 20_000,
    idleTimeoutMs: 10_000,
    totalTimeoutMs: 60_000,
    retryMode: 'standard',
    maxAttempts: 3,
    downloadConcurrency: 8,
  },

  system: {
    processing: {
      defaultConcurrency: 10,
      enableLivePhotoDetection: true,
      digestSuffixLength: 0,
    },
    observability: {
      showProgress: true,
      showDetailedStats: true,
      logging: {
        verbose: false,
        level: 'info',
        outputToFile: false,
      },
      performance: {
        worker: {
          workerCount: os.cpus().length * 2,
          timeout: 30_000,
          useClusterMode: true,
          workerConcurrency: 2,
        },
      },
    },
  },
  plugins: [],
}))
