# 项目质量审计与改进记录 · 2026-09-11

本轮对工作区的应用、共享包、Builder、构建部署脚本、依赖、测试与开源协作文件进行了分区检查，并直接修复了已确认的问题。整合远端 `6d4d520f` 的工程契约重构后，最终 198 个测试文件、1,305 个测试通过；开发、生产及 WebKit/iPhone 浏览器检查通过；完整依赖审计的风险条目从 5 个降为 0。

本记录描述本轮实际改动和验证证据，不把已有工程能力记作新增成果。

## 检查范围

| 区域              | 检查重点与证据                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ |
| Builder           | workflow 分层、存储扫描、缩略图复用与清理、manifest 合并、图片失败处理、缓存与隐私边界；Builder 单测和合成照片构建 |
| Schema / Media    | manifest 严格校验、路径标识、字典键、二进制 helper；共享包单测与类型检查                                           |
| Web               | 图库、查看器、图片加载、焦点和键盘、滑块、地图、运行时导航和数据分片；组件测试及真实浏览器                         |
| UI / WebGL viewer | 组件生命周期、输入、图像缓存释放、渲染降级；单测、类型检查及生产图片加载测试                                       |
| 构建与部署        | Vite 插件、SEO/RSS、原图静态服务、PWA、demo/E2E 隔离、部署入口；插件单测与真实 `build-static.sh`                   |
| 供应链            | lockfile、直接及传递依赖、生产 SBOM、secret scanner、workspace contracts                                           |
| GitHub 项目质量   | CI、Issue/PR 模板、双语 README、贡献指南、安全说明、许可映射、依赖升级与发布文档                                   |

## 已完成的修复

| 问题                                                                      | 修复后的行为                                                        | 主要位置                                                                 |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| manifest 指向的缩略图缺失时，旧版本文件会被误认为有效缓存                 | 只复用实际存在的目标文件，否则重新生成                              | `packages/builder/src/image/thumbnail.ts`                                |
| CDN 改写缩略图文件名后，清理逻辑可能把仍在使用的远端产物当成孤儿          | 无法确定当前版本时保留该照片的远端产物，避免误删                    | `packages/builder/src/plugins/thumbnail-storage/plugin.ts`               |
| 特殊照片 ID 导致路径归一化或 URL 编码失败；位置字典接受危险对象键         | 拒绝 `.`、`..` 和孤立 UTF-16 surrogate；过滤不安全字典键            | `packages/schema/src/manifest.ts`                                        |
| SEO 标题里的 `$&` 等字符被当成替换指令；数值型 EXIF 会使 RSS 生成失败     | 保留字面文本，统一安全转换相机和镜头字段                            | `apps/web/plugins/vite/build-assets-seo.ts`、`rss.ts`                    |
| 客户端中断原图请求后，文件流可能仍占用文件描述符                          | 响应关闭时销毁文件流并清理监听器                                    | `apps/web/plugins/vite/photos-static.ts`                                 |
| 图库链接没有有效布局尺寸；退出查看器后焦点恢复被 inert 或动画隐藏状态阻止 | 链接占据完整图片区域；退出完成且隔离解除后恢复焦点                  | `MasonryPhotoItem.tsx`、`PhotoViewer.tsx`、`useDialogFocusManagement.ts` |
| 滑块在拖动返回起点、取消或多指操作时行为不稳定                            | 使用 pointer capture，按当前值更新，明确结束/取消及提交路径         | `apps/web/src/components/ui/slider.tsx`                                  |
| XHR 在定时回调中同步抛错，图片请求 Promise 一直悬挂                       | 构造、初始化和发送失败都进入明确的 reject 路径                      | `apps/web/src/lib/image-fetch-service.ts`                                |
| 首次打开地图时 Vite 才发现页面依赖，重新优化触发整页重载并取消导航        | 预扫描真实页面入口；demo/E2E 使用独立优化缓存                       | `apps/web/vite.config.ts`                                                |
| 禁用 WebGL 后，小地图初始化和卸载崩溃，导致照片切换进入错误页             | 独立检测 WebGL2、释放探测 context；不可用时显示坐标或地图不可用状态 | `feature.ts`、`MiniMap.tsx`、`MapLibre.tsx`                              |
| demo 仍指向测试专用域名，离开 Playwright 的请求桩后图片无法显示           | 临时 manifest 指向本地合成图片/视频，退出后清理临时文件             | `scripts/demo-server.ts`                                                 |
| SBOM 把依赖归属压平，未声明版本的 workspace 还会产生重复身份              | 保留各包依赖边、可选依赖和组件类型；无版本包使用统一无版本 PURL     | `scripts/generate-sbom.ts`                                               |
| secret scanner 遇到工作区内已删除的跟踪文件或目录会异常退出               | 跳过 ENOENT/ENOTDIR，同时继续检查其他源码                           | `scripts/scan-secrets.ts`                                                |
| 环境变体和默认本地原图目录容易误入版本控制                                | 忽略 `.env.*` 和根目录 `photos/`，保留公开 `.env.template`          | `.gitignore`                                                             |

这些行为修复均补充了针对触发条件的回归测试。冷启动地图问题使用全新优化缓存做过失败/成功对照；无 WebGL 的生产失败保留了原图片缓存断言，并把导航断言收紧到确切的第二张照片 URL。

## 依赖安全升级

审计前发现 1 个 critical、1 个 high、3 个 moderate 受影响包记录。Vitest 与其 mocker 属于同一公告的两个包记录。

| 依赖                       | 本轮处理                                                               | 上游依据                                                                                                                                                                                                               |
| -------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MapLibre GL                | 5.24.0 → 6.4.1；显式打包模块 worker，适配 React 地图组件和 WebGL2 降级 | [归属信息 XSS 公告](https://github.com/maplibre/maplibre-gl-js/security/advisories/GHSA-jrc7-96c5-q579)、[v6 迁移指南](https://github.com/maplibre/maplibre-gl-js/blob/v6.0.0/docs/guides/v5-to-v6-migration-guide.md) |
| Vitest / coverage / mocker | 升级至 4.1.11；适配构造器 mock、类型与 Oxc JSX 配置                    | [安全公告](https://github.com/advisories/GHSA-82fw-gwwq-j7x9)、[Vitest 4 迁移指南](https://v4.vitest.dev/guide/migration)                                                                                              |
| js-yaml                    | 约束为 4.3.2，更新 lockfile                                            | [安全公告](https://github.com/nodeca/js-yaml/security/advisories/GHSA-2883-xcg3-v3hh)                                                                                                                                  |
| valibot                    | 旧可选依赖随解析图更新移除；约束最低补丁版本为 1.4.2                   | [安全公告](https://github.com/open-circle/valibot/security/advisories/GHSA-5qjj-4xww-7phc)                                                                                                                             |

按本次审计源返回的依赖计数，完整依赖图为 1,233、生产图为 317，两个审计均为零已知漏洞。该结论是当前锁文件在本次查询时的结果。

npm 官方 registry 的 DNS/TLS 在本机失败后，使用 npmmirror 完成依赖下载，使用支持审计接口的 Yarn registry 查询漏洞。未修改仓库或全局 registry 配置，lockfile 未写入镜像地址；随后通过了 `--frozen-lockfile --offline --ignore-scripts` 检查。

可复现的备用命令：

```bash
pnpm install --frozen-lockfile --registry=https://registry.npmmirror.com
pnpm audit --registry=https://registry.yarnpkg.com --audit-level=low
pnpm audit --registry=https://registry.yarnpkg.com --prod --audit-level=low
```

MapLibre 6 的交互地图需要 WebGL2，这是本轮安全升级的兼容性变化。双语 README 已说明不支持时的表现，照片浏览仍可使用普通图片降级路径。

## 工程与开源协作改进

- 将原先遗漏的 Web 构建插件及脚本纳入覆盖率，增加独立 `web-build` 分区门槛。
- 适配 Vitest 4 的覆盖率口径，保留所有测试、源码 include 和既有 exclude 范围；对仍满足的原门槛予以保留，仅校准失效指标。
- WebKit/iPhone 测试命令移除 Unix 专用环境变量前缀；CI 增加独立浏览器报告和 trace 产物。
- 更新中英文安装步骤、零凭据 demo、静态托管回退规则和 S3 默认凭据链说明。
- 明确 `PHOTO_LOCATION_MODE` 影响发布的元数据，不会清除下载原图中的 EXIF/GPS。
- 校正 Vite 8、React Router 8、Builder 默认值与并发、schema 严格/宽松解析行为及包公开 API 文档。
- 补充 Issue 环境信息、PR 检查项，校正贡献指南、依赖升级策略与实际 CI 的一致性。
- 许可分类与包元数据通过 workspace contracts；本轮未变更项目的许可选择。

## 最终验证

| 检查                                       | 结果                                                                  |
| ------------------------------------------ | --------------------------------------------------------------------- |
| Vitest 全量 + V8 覆盖率                    | 198 个文件、1,305 个测试通过                                          |
| 全局与五个架构分区覆盖率门槛               | 全部通过，统计 385 个源码文件                                         |
| 工具配置和 7 个 workspace 类型检查         | 通过，包含 Web 单测和 Worker 独立编译环境                             |
| ESLint、Prettier、`git diff --check`       | 通过                                                                  |
| Chromium 开发环境 E2E                      | 11 通过；4 项为配置内既定 skip                                        |
| 生产构建 E2E                               | 10 通过，包含原图/DOM 缓存释放、地图导航、历史、滚动和 Service Worker |
| Desktop WebKit / iPhone                    | 2 通过                                                                |
| `deploy:smoke`                             | 真实 `build-static.sh`、前端生产构建、PWA 和本地原图复制通过          |
| 合成 fixture 重新生成与漂移检查            | 无差异，18 张合成照片                                                 |
| Workspace contracts / 高置信度 secret scan | 通过                                                                  |
| 完整及生产依赖审计                         | 均为 0 个已知漏洞                                                     |
| 冻结 lockfile 离线安装                     | 通过                                                                  |
| 真实生产 SBOM                              | 316 个组件、317 个依赖节点；无重复或悬空引用                          |

最终覆盖率为 statements **74.33%**、branches **65.82%**、functions **75.45%**、lines **75.52%**。本地详细产物位于 `coverage/index.html` 和 `artifacts/sbom.cdx.json`。

整合保留了远端的 Builder 请求/计划分离、只读数据快照、转换取消与错误契约、TIFF 像素处理及 TypeScript Worker。本轮同步 XHR 失败回归适配了新的阶段错误；新启用的 Web 单测类型检查中，mock 改用明确的可调用签名以兼容 Vitest 4。地图依赖的显式预构建与页面入口预扫描合并为同一个 Vite 配置项。

Vitest 4 使用 AST 重映射。迁移对照中的同一批 1,249 个测试和 371 个源码文件，分支总数从 7,038 变为 8,897，函数总数从 1,626 变为 2,531；已覆盖分支和函数数也同时增加。旧版曾将未执行的 TUI 分支/函数报告为 100%，新版明确计入未覆盖项。因此百分比不能直接跨版本比较。对照表、门槛和执行方式见 [测试指南](testing.md#coverage-gate)。

## 验证边界与后续质量方向

构建和浏览器验证使用仓库的合成照片，覆盖本地 provider 和静态发布流程；S3/CDN 的边界行为通过存储适配器与故障注入测试验证，没有对真实云端照片执行读写。GitHub Actions 配置经过本地检查，但远端运行结果、仓库规则和账户级设置不属于本地验证结果。

Web 构建区的覆盖率仍低于其他主体模块，部分 TUI、独立命令入口和异常渲染分支也有明显空白。后续适合继续增加真实故障场景和 CLI 集成验证，逐步提高门槛。当前没有因此排除源码，也不将通过本轮检查理解为不存在其他缺陷。
