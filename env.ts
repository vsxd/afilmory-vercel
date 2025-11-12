import 'dotenv-expand/config'

import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

export const env = createEnv({
  server: {
    // S3 存储配置（必填，项目仅支持 S3 存储）
    S3_REGION: z.string().default('us-east-1'),
    S3_ACCESS_KEY_ID: z.string().min(1, 'S3_ACCESS_KEY_ID is required'),
    S3_SECRET_ACCESS_KEY: z.string().min(1, 'S3_SECRET_ACCESS_KEY is required'),
    S3_ENDPOINT: z
      .string()
      .default('https://s3.us-east-1.amazonaws.com'),
    S3_BUCKET_NAME: z.string().min(1, 'S3_BUCKET_NAME is required'),
    S3_PREFIX: z.string().default(''),
    S3_CUSTOM_DOMAIN: z.string().default(''),
    S3_EXCLUDE_REGEX: z.string().optional(),

    // Git token for uploading updated manifest to remote repository (CI/CD)
    GIT_TOKEN: z.string().optional(),
  },
  runtimeEnv: process.env,
  isServer: typeof window === 'undefined',
})
