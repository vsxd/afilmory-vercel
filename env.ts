import "dotenv-expand/config";

import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    // S3 存储配置（必填，项目仅支持 S3 存储）
    S3_REGION: z.string().default("us-east-1"),
    // 构建前端时允许为空，builder 会在运行时做严格校验
    S3_ACCESS_KEY_ID: z.string().default(""),
    S3_SECRET_ACCESS_KEY: z.string().default(""),
    S3_ENDPOINT: z.string().default("https://s3.us-east-1.amazonaws.com"),
    S3_BUCKET_NAME: z.string().default(""),
    S3_PREFIX: z.string().default(""),
    S3_CUSTOM_DOMAIN: z.string().default(""),
    S3_EXCLUDE_REGEX: z.string().optional(),

    // 远程仓库缓存配置（可选）
    REPO_URL: z.string().optional(),
    REPO_TOKEN: z.string().optional(),
    BUILDER_REPO_URL: z.string().optional(),
    GIT_TOKEN: z.string().optional(),

    // 站点基本配置(可选,如果不设置则使用 site.config.ts 中的默认值)
    SITE_NAME: z.string().optional(),
    SITE_TITLE: z.string().optional(),
    SITE_DESCRIPTION: z.string().optional(),
    SITE_URL: z.string().optional(),
    SITE_ACCENT_COLOR: z.string().optional(),
    SITE_LANGUAGE: z.string().optional(),

    // 作者信息(可选)
    AUTHOR_NAME: z.string().optional(),
    AUTHOR_URL: z.string().optional(),
    AUTHOR_AVATAR: z.string().optional(),

    // 社交媒体(可选)
    SOCIAL_GITHUB: z.string().optional(),
    SOCIAL_TWITTER: z.string().optional(),
    SOCIAL_RSS: z.enum(["true", "false"]).optional(), // 'true' or 'false'

    // Feed 配置(可选)
    FEED_FOLO_FEED_ID: z.string().optional(),
    FEED_FOLO_USER_ID: z.string().optional(),

    // 地图配置(可选)
    MAP_STYLE: z.string().optional(), // 'builtin' or custom
    MAP_PROJECTION: z.enum(["globe", "mercator"]).optional(),

    // 构建期反向地理编码（可选）
    // 布尔型开关用 enum 约束，输入拼写错误会在构建期立即失败，而不是被 `!== "false"` 静默当作 true。
    GEOCODING_ENABLED: z.enum(["true", "false"]).default("true"),
    GEOCODING_PROVIDER: z.enum(["nominatim", "mapbox", "auto"]).optional(),
    GEOCODING_LOCALES: z.string().optional(),
    GEOCODING_LANGUAGE: z.string().optional(),
    GEOCODING_USER_AGENT: z.string().optional(),
    GEOCODING_CACHE_PATH: z.string().optional(),
    GEOCODING_CACHE_PRECISION: z.coerce.number().optional(),
    GEOCODING_NOMINATIM_BASE_URL: z.string().optional(),
    MAPBOX_TOKEN: z.string().optional(),

    // Builder 性能配置（可选）
    BUILDER_USE_CLUSTER_MODE: z.enum(["true", "false"]).optional(),
  },
  runtimeEnv: process.env,
  isServer: typeof window === "undefined",
});
