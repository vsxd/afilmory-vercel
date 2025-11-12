# 静态站点部署指南（仅支持 S3 存储）

本指南将帮助你将 Afilmory 部署为静态站点（类似 Hexo/Hugo），无需数据库、Redis 等后端服务。

**重要提示：本项目仅支持 S3 兼容存储，照片不会被打包到部署产物中，确保项目体积小，适合部署到 Vercel 等平台。**

## 📋 部署流程概览

```
S3 照片存储 → 读取照片 → 图片处理 → 生成 manifest → 构建前端 → 部署到托管平台
```

## 🚀 快速开始

### 1. 准备 S3 存储

#### 选择 S3 服务

支持以下 S3 兼容服务：
- **AWS S3** - Amazon S3 对象存储
- **MinIO** - 开源对象存储服务
- **阿里云 OSS** - 阿里云对象存储
- **腾讯云 COS** - 腾讯云对象存储
- 其他 S3 兼容服务

#### 上传照片到 S3

将你的照片上传到 S3 存储桶中。

**支持的格式：**
- JPG / JPEG
- PNG
- HEIC (Apple 设备照片格式)
- TIFF
- Live Photos (iPhone)

**建议的目录结构：**
```
your-bucket/
├── photos/
│   ├── 2024/
│   │   ├── IMG_001.jpg
│   │   ├── IMG_002.heic
│   │   └── IMG_003.png
│   ├── 2023/
│   │   ├── travel/
│   │   │   ├── photo1.jpg
│   │   │   └── photo2.jpg
│   │   └── daily/
│   │       └── photo3.jpg
```

### 2. 配置环境变量

在项目根目录创建 `.env` 文件：

```bash
cp .env.template .env
```

编辑 `.env` 文件，填写你的 S3 配置：

```bash
# S3 存储桶名称（必填）
S3_BUCKET_NAME=your-bucket-name

# S3 区域（必填）
S3_REGION=us-east-1

# S3 访问密钥（必填）
S3_ACCESS_KEY_ID=your-access-key-id
S3_SECRET_ACCESS_KEY=your-secret-access-key

# S3 Endpoint（可选，默认 AWS S3）
S3_ENDPOINT=https://s3.us-east-1.amazonaws.com

# S3 前缀（可选，照片在 bucket 中的路径前缀）
S3_PREFIX=photos/

# 自定义域名（可选，如果使用 CDN）
S3_CUSTOM_DOMAIN=https://cdn.example.com
```

**不同服务的配置示例：**

<details>
<summary>AWS S3</summary>

```bash
S3_BUCKET_NAME=my-photos
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
S3_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
S3_ENDPOINT=https://s3.us-east-1.amazonaws.com
```
</details>

<details>
<summary>MinIO</summary>

```bash
S3_BUCKET_NAME=photos
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_ENDPOINT=https://minio.example.com
```
</details>

<details>
<summary>阿里云 OSS</summary>

```bash
S3_BUCKET_NAME=my-photos
S3_REGION=oss-cn-hangzhou
S3_ACCESS_KEY_ID=LTAI5t...
S3_SECRET_ACCESS_KEY=xxx...
S3_ENDPOINT=https://oss-cn-hangzhou.aliyuncs.com
S3_CUSTOM_DOMAIN=https://cdn.example.com
```
</details>

### 3. 配置站点信息

编辑 `config.json` 文件（如果不存在，从 `config.example.json` 复制）：

```json
{
  "name": "我的照片集",
  "title": "我的 Afilmory",
  "description": "记录生活中的美好瞬间",
  "url": "https://your-site.vercel.app",
  "accentColor": "#007bff",
  "author": {
    "name": "你的名字",
    "url": "https://your-website.com",
    "avatar": "https://your-avatar-url.com/avatar.jpg"
  },
  "social": {
    "github": "your-github-username",
    "twitter": "your-twitter-handle",
    "rss": true
  }
}
```

### 4. 安装依赖

```bash
pnpm install
```

### 5. 本地构建和预览

```bash
# 构建静态站点
pnpm build:static

# 预览构建结果
cd apps/web
pnpm serve
```

构建完成后，打开 http://localhost:4173 预览你的照片站点。

## 🌐 部署到 Vercel

### 方式一：通过 GitHub 自动部署（推荐）

1. **将项目推送到 GitHub**

```bash
git add .
git commit -m "准备部署到 Vercel"
git push
```

2. **在 Vercel 导入项目**

- 访问 [vercel.com](https://vercel.com)
- 点击 "New Project"
- 从 GitHub 导入你的仓库
- Vercel 会自动检测 `vercel.json` 配置

3. **配置环境变量**

在 Vercel 项目设置中添加以下环境变量：

必填：
- `S3_BUCKET_NAME`
- `S3_REGION`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`

可选：
- `S3_ENDPOINT`
- `S3_PREFIX`
- `S3_CUSTOM_DOMAIN`

4. **部署**

点击 "Deploy" 按钮开始部署。

5. **后续自动部署**

每次推送到 `main` 分支，Vercel 都会自动重新构建和部署。

### 方式二：通过 Vercel CLI

1. **安装 Vercel CLI**

```bash
npm i -g vercel
```

2. **登录 Vercel**

```bash
vercel login
```

3. **设置环境变量**

确保本地 `.env` 文件已配置好 S3 凭证。

4. **部署**

```bash
# 首次部署
vercel

# 生产环境部署
vercel --prod
```

### 配置说明

项目根目录的 `vercel.json` 已经配置好：

```json
{
  "buildCommand": "sh scripts/build-static.sh",
  "outputDirectory": "apps/web/dist",
  "installCommand": "pnpm install"
}
```

## 📦 部署到其他平台

### Netlify

1. **通过拖拽部署**

```bash
# 本地构建
pnpm build:static

# 将 apps/web/dist 目录拖拽到 Netlify
```

2. **通过 Git 自动部署**

在 Netlify 项目设置中配置：

- **Build command:** `sh scripts/build-static.sh`
- **Publish directory:** `apps/web/dist`
- **Install command:** `pnpm install`

### GitHub Pages

```bash
# 安装 gh-pages
pnpm add -D gh-pages

# 构建
pnpm build:static

# 部署到 gh-pages 分支
npx gh-pages -d apps/web/dist
```

在 GitHub 仓库设置中启用 GitHub Pages，选择 `gh-pages` 分支。

### Cloudflare Pages

1. 在 Cloudflare Pages 中连接你的 Git 仓库
2. 配置构建设置：
   - **Build command:** `sh scripts/build-static.sh`
   - **Build output directory:** `apps/web/dist`
   - **Root directory:** `/` (默认)

## 🔄 更新照片

### 添加新照片

1. 将新照片上传到 S3 存储桶
2. 推送代码变更到 GitHub（如果使用自动部署）或运行构建命令：

```bash
# 如果使用 Vercel CLI
vercel --prod

# 或者推送到 Git（触发自动部署）
git commit --allow-empty -m "Trigger rebuild"
git push
```

3. Vercel 会自动重新构建和部署

### 增量更新（推荐）

如果只想重新生成 manifest 而不重新处理所有图片：

```bash
# 只生成 manifest（会自动检测 S3 中新增/修改的照片）
pnpm build:manifest:static

# 构建前端
pnpm --filter @afilmory/web build
```

## ⚙️ 高级配置

### S3 存储桶权限配置

为了确保构建过程能够正常访问 S3，你的 S3 存储桶需要配置适当的权限。

#### AWS S3 权限策略示例

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::your-bucket-name",
        "arn:aws:s3:::your-bucket-name/*"
      ]
    }
  ]
}
```

#### CORS 配置（如果需要浏览器直接访问）

如果照片需要通过浏览器直接从 S3 访问，需要配置 CORS：

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedOrigins": ["https://your-site.vercel.app"],
    "ExposeHeaders": []
  }
]
```

### 使用 CDN 加速

强烈建议配置 CDN 来加速照片访问：

1. 配置 CloudFront（AWS）/ CDN（阿里云）等服务
2. 将 CDN 域名填入 `S3_CUSTOM_DOMAIN` 环境变量
3. 照片将通过 CDN 域名访问，大幅提升加载速度

### 自定义构建配置

编辑 `builder.config.static.ts` 来调整图片处理参数：

```typescript
export default defineBuilderConfig(() => ({
  storage: {
    provider: 's3',
    bucket: env.S3_BUCKET_NAME,
    region: env.S3_REGION,
    // ... S3 配置
    downloadConcurrency: 16,      // S3 下载并发数
    maxFileLimit: 1000,           // 最大文件数量限制
  },
  system: {
    processing: {
      defaultConcurrency: 10,           // 图片处理并发数
      enableLivePhotoDetection: true,   // 检测 Live Photos
      digestSuffixLength: 0,
    },
    observability: {
      showProgress: true,               // 显示进度
      showDetailedStats: true,          // 显示详细统计
    },
  },
}))
```

## 🐛 常见问题

### 1. 构建时提示缺少 S3 环境变量

**错误信息：**
```
❌ 错误：缺少 S3_BUCKET_NAME 环境变量
```

**解决方案：**
1. 确保创建了 `.env` 文件
2. 填写完整的 S3 配置信息
3. 如果在 Vercel 部署，需要在 Vercel 项目设置中配置环境变量

### 2. S3 连接失败或权限错误

**解决方案：**
- 检查 S3 凭证是否正确
- 确认 IAM 用户有 `s3:GetObject` 和 `s3:ListBucket` 权限
- 验证 `S3_ENDPOINT` 配置是否正确
- 检查网络连接，确保能访问 S3 服务

### 3. 图片处理速度很慢

**解决方案：**
- 首次处理会比较慢，这是正常的
- 可以调整 `builder.config.static.ts` 中的 `downloadConcurrency` 和 `defaultConcurrency` 参数
- 后续更新只会处理新增/修改的照片，速度会快很多
- 考虑使用更接近的 S3 区域

### 4. Vercel 部署超时

**解决方案：**
- Vercel 免费版构建时间限制为 45 分钟
- 如果照片特别多，可能会超时
- 建议：
  1. 分批上传照片
  2. 使用增量构建
  3. 升级到 Vercel Pro 版本（构建时间更长）

### 5. 部署后图片不显示

**解决方案：**
- 检查 S3 存储桶的公开访问策略
- 配置正确的 CORS 规则
- 确认 `S3_CUSTOM_DOMAIN` 配置正确（如果使用）
- 检查浏览器控制台是否有 CORS 错误

### 6. 如何减少构建时间？

**解决方案：**
1. 使用增量构建（只处理新增照片）
2. 减少照片数量或分批处理
3. 提高 S3 下载并发数
4. 使用距离更近的 S3 区域

## 📊 构建产物说明

构建完成后，`apps/web/dist` 目录包含：

```
dist/
├── index.html              # 主页面
├── assets/                 # JS/CSS 资源
│   ├── index-xxx.js
│   └── index-xxx.css
├── manifest.json           # 照片信息清单（包含 S3 URL）
├── sitemap.xml            # 站点地图
├── feed.json              # RSS feed
└── og-image.png           # Open Graph 图片
```

**注意：**
- 照片文件不会被打包到 `dist` 目录中
- 照片通过 S3（或配置的 CDN）直接访问
- 构建产物体积很小，通常只有几 MB

## 🎉 完成

恭喜！你的静态照片站点已经部署成功。

**后续使用流程：**
1. 将新照片上传到 S3 存储桶
2. 推送代码到 GitHub 或运行 `vercel --prod`
3. Vercel 会自动重新构建和部署
4. 增量构建会自动检测 S3 中的新照片

**性能优化建议：**
- 配置 CDN 加速照片访问
- 使用 WebP 格式减小图片体积
- 启用 S3 的压缩传输
- 合理设置缓存策略

## 📚 更多信息

- [完整项目文档](./README.md)
- [配置选项说明](./README.md#⚙️-configuration-options)
- [Vercel 文档](https://vercel.com/docs)
- [GitHub Issues](https://github.com/Afilmory/Afilmory/issues)
