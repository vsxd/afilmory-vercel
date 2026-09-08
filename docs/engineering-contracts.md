# 工程契约

本文说明当前跨模块契约。实施过程和验证记录见 [实施计划](./engineering-refactor-plan.md)，媒体资源细节见 [媒体生命周期](./media-lifecycle.md)。

## Builder：输入、规划、执行

```text
BuildRequest → BuildSession → SourceScanner → DiffPlanner → BuildPlan
                                                        ↓
ArtifactWriter ← ManifestAssembler ← PhotoTaskProcessor
```

- `BuildRequest` 只包含调用方的 force、concurrency 和 progress 配置。Session 复制并冻结请求；配置统一由 `services.config` 提供。
- `BuilderPluginOptions` 是生命周期事件的可变兼容载荷。插件通过现有失效提示影响规划；调用方请求不会被写入本轮中间态。
- `BuildPlan` 显式携带任务、规划原因、源 key 集合及处理策略。体积相同的任务按 key 稳定排序，策略中的集合独立复制。
- `PhotoTaskProcessor` 给插件提供执行副本，再将同一份 `processorOptions` 交给单进程或 cluster。`beforeProcessTasks` 修改后的实际任务列表用于处理、manifest 对账及 `afterProcessTasks`。
- 阶段通过 `Pick<BuildSession, ...>` 和 `BuilderStorage` 能力接口声明依赖，composition root 绑定真实服务。内部 workflow 不从 Builder 根入口公开。

插件迁移注意：`reprocessKeys`、`derivedReprocessKeys` 仍可作为插件的失效输入；计划内部计算出的 key 不再回写 `options`。需要观察有效策略时读取 `beforeProcessTasks.processorOptions`，观察队列时读取事件的 `tasks`；不要把已弃用的 `options.plannedKeys` 当作跨阶段通信渠道。官方插件、增量处理、失败保留旧条目及提交后清理的事务顺序由现有回归保护。

## Repository：发布快照

磁盘 DTO 继续使用 schema 的可变 `PhotoManifestItem`，Web 消费者使用递归只读的 `PhotoManifest`。Repository 在输入边界复制并深冻结 JSON；查询只返回当前快照，不执行整库深拷贝。

详情或地图分片先完整解析、校验 ID 集合并构造候选实体，再一次发布：已变照片获得新身份，未变实体与子节点共享，旧快照永久保持原值。发布后再通知订阅者，不暴露部分合并状态。超时或 dispose 即使遇到忽略 AbortSignal 的 transport，也会结束等待并丢弃迟到结果。

React 读取照片列表使用 `usePhotoRepositorySnapshot()`，它通过 `useSyncExternalStore` 直接返回快照。仅订阅版本号、随后调用稳定对象的 `getPhotos()`，会允许 React Compiler 缓存旧返回值。命令式代码可直接查询 Repository；渲染代码必须通过快照 hook 建立数据依赖。

## 媒体任务：事实与表现分离

- 转换结果是 `original` 或 `converted`；原图附带 native / unhandled / unidentified 原因。失败抛出包含 stage、稳定 code、原始 cause 的 `MediaTaskError`。
- 核心发出 fetching / progress / queued / converting / native-fallback / loaded 事件。表现层适配器负责 i18n 和既有 LoadingIndicator 文案。
- 同一 URL 的转换任务共享执行，各订阅者独立取消。最后一个订阅者离开后移除待办；无法中断的活动解码继续占用并发额度，直至真正退出。
- `AppRuntime.dispose()` 同步关闭资源入口、取消等待并清空缓存，返回的 Promise 可等待活动解码结束。它不承诺终止不支持取消的第三方 codec。
- XHR 以 60 秒无字节进展为超时条件。合法进展续期；成功、失败、替代和取消都移除事件与计时器。
- 编排层决定转换失败后的原生回退，失败回退不写转换缓存。DOM 解码失败与 WebGL 回退后的失败汇入同一个错误/lease 清理路径。

## Worker：编译与所有权

`texture.worker.ts` 是标准模块 Worker 入口，由 Vite 生成资产 URL。主线程与 Worker 使用 `worker-protocol.ts` 的请求/响应联合；尺寸预算和 LOD/grid 数学通过普通 import 共享，不再序列化函数或拼接 raw 脚本。

Worker 持有全尺寸源 bitmap，成功 postMessage 后底图/瓦片所有权转交 engine。旧 generation 的解码结果和 transfer 失败的产物必须 close；重复 session ID 也不会接纳旧解码。terminate 后已在途的 bitmap 仍由 engine 接收并释放。

`tsconfig.worker.json` 只启用 WebWorker globals；主包使用 DOM 环境，两者各自检查。生产回归必须确认加载真实 Worker 资产并绘制 canvas，不能把静默 DOM fallback 当作成功。

## 自动检查的边界

`pnpm contracts` 使用各 workspace 的 TypeScript 解析规则检查生产源模块的静态运行时循环、生产到测试的引用、包公开入口和相对路径绕过、lib 到表现层的反向依赖、UI 到 schema、转换核心到 i18n。类型和动态 import 参与边界检查，但不作为静态运行时循环边；它不声称检测运行时动态加载死锁。

`pnpm type-check` 同时包含 Web 生产代码、独立 Web 单测配置、工具/E2E、各包及 Worker 环境。Vitest 转译通过不能替代这些类型检查。ESLint 不删除调用末尾的显式 `undefined`，因为语法规则无法判断它是否是 TypeScript 的必需参数。

验证真实编码样本、并发与取消顺序、原子提交和生产压缩产物；避免通过复制实现的断言或放宽检查阈值获得绿灯。
