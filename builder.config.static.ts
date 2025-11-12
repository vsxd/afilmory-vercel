import os from 'node:os'

import { defineBuilderConfig } from '@afilmory/builder'

/**
 * 静态部署配置
 *
 * 这个配置用于静态站点部署（如 Vercel、Netlify、GitHub Pages 等）
 *
 * 使用方式：
 * 1. 将照片放在 photos/ 目录下
 * 2. 运行 pnpm build:static 生成静态站点
 * 3. 部署 apps/web/dist 目录到托管平台
 */
export default defineBuilderConfig(() => ({
  // 不使用远程仓库缓存
  repo: {
    enable: false,
    url: '',
    token: '',
  },

  // 使用本地文件系统存储
  storage: {
    provider: 'local',
    basePath: './photos', // 照片源目录
    baseUrl: '/photos',   // 照片在网站上的访问路径
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
          workerCount: os.cpus().length,
          timeout: 30_000,
          useClusterMode: true,
          workerConcurrency: 2,
        },
      },
    },
  },
  plugins: [],
}))
