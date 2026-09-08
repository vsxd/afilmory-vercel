# 软件工程质量审计

基线：`b9a8c395`，2026-09-08。目标是让代码具备清晰、严谨、可验证、易演进的工程品质。UI、UX、响应式图片、观赏模式、策展等功能与产品改进均不在当前路线内。本文保留审计时的证据与判断；后续修复状态及验证结果见 [实施计划](./engineering-refactor-plan.md)。

## 判断标准

贡献者读完模块接口，应能知道它依赖什么、拥有什么、何时完成、如何失败、谁来清理。修改一个规则时，应能定位到唯一权威实现，并通过相关检查验证影响。

以四项衡量改进：

1. **局部可理解性**：理解一个函数需要追踪多少隐含状态和跨模块约定。
2. **契约表达能力**：非法组合、错误阶段、资源所有权和操作顺序能否由类型或运行时校验约束。
3. **变更可控性**：修改一个规则涉及的模块是否与实际职责一致，是否存在手工保持同步的副本。
4. **验证可信度**：测试是否验证对外行为和不变量，类型检查和构建检查是否覆盖实际执行边界。

评价不以文件长度、类数量、设计模式数量或覆盖率数字单独决定。下文的工程优先级表示投入顺序，不等同于缺陷严重程度。

## 值得保留的基础

- Builder workflow 已分离扫描、规划、处理、合并、写入。ArtifactWriter 在严格校验与原子 manifest 提交后清理旧产物，事务顺序明确。
- Schema 与 media 独立，Web 使用分片发布协议和 PhotoRepository，延续静态优先架构。
- NavigationController 统一导航命令与路由快照；不要重新建立反向同步的第二份导航真源。
- AppRuntime 和媒体 lease 已明确部分资源所有权；共享视频缓存对取消和并发有专门保护。
- WebGL renderer、worker bridge、input controller、scheduler 已分离，存在真实生产绘制测试。
- CI 已有类型、格式、lint、覆盖率分区、workspace contracts、部署入口及浏览器回归。

下一阶段应完善现有边界的语义，而不是继续按文件长度拆分模块。

## 1. 收敛异步任务、错误与资源契约

代码依据：

- `apps/web/src/lib/image-loading-types.ts:1`：状态由多个可选 boolean 和 `Partial<LoadingState>` 表达，`onError` 不携带原因。
- `apps/web/src/lib/image-convert/manager.ts:110`：格式检测失败、无需转换、没有转换策略都可以返回 null。
- `apps/web/src/lib/image-conversion-service.ts:26`：signal 在转换前后检查，无法移除队列任务；转换异常由此层决定回退原 Blob 并写入缓存。
- `apps/web/src/lib/image-convert/strategies/heic.ts:84`：模块级转换产物缓存仍在 AppRuntime 所有权之外。
- `apps/web/src/components/ui/photo-viewer/types.ts` 的 ProgressiveImageState：获取完成、渲染完成、错误、Blob 和 URL 由独立字段表示，合法组合依赖调用方维护。

这里已有实际缺陷证据：取消排队任务后策略仍执行；原图 XHR 没有应用层超时；DOM 解码失败没有统一错误回调。仅添加更多 cancelled 判断不能使整体契约清晰。

建议分别定义三类概念：

- **任务结果**：明确无需转换、转换成功、转换失败、取消；保留阶段、稳定错误 code 和原始 cause。降级策略由编排层决定，底层不要将异常伪装成“无需处理”。
- **任务生命周期**：明确排队、执行、完成、取消、超时及共享订阅规则。最后一个订阅者取消后移除未启动工作；无法中断的运行中解码可继续，但不能交付过期结果。
- **资源生命周期**：区分任务结束和资源使用结束，缓存、lease、loader、converter 各有唯一 owner。明确 release / dispose 的幂等性；真正异步的清理应有可等待的完成语义。

不要把显示、任务和资源全部塞进一个庞大的全局状态机。先在媒体任务这一条链路使用有限的判别联合和小型状态转换函数，现有界面通过适配层保持行为。

验收：任务恰好结算一次；晚到结果不能污染新任务；一个消费者释放不影响其他消费者；关闭 runtime 后不再启动待执行工作或持有其私有缓存。无需新增交互入口。

## 2. 核心服务表达事实，表现层负责文案

代码依据：`apps/web/src/lib/image-convert/manager.ts:148`、`strategies/heic.ts:49`、`strategies/tiff.ts:30` 直接取得全局 i18n 并生成 loading 文案。调度或转换测试因此需要替换 i18n 模块。

建议服务发出 typed 事件，如 queued / converting / progress / failed，携带 format、字节数等数据，由现有表现层翻译成原来的文案。日志在能理解操作上下文的边界记录一次；错误传播保留 cause，减少重复日志和字符串包装。

Builder 也有较宽的依赖面：`core/contracts/services.ts` 暴露具体 StorageManager 类型，各 workflow 阶段接收完整 BuildSession。类型导入不构成运行时循环，但具体类结构会约束测试替身与替换实现。

按实际使用能力收窄阶段参数：扫描拿到列举能力、配置和事件接口；规划拿到快照、规则和产物查询能力；执行拿到任务与执行服务。Storage port 使用能力接口，composition root 绑定真实实现。无需引入依赖注入框架，也不必给每个类机械添加接口。

验收：纯调度和决策可在 Node 中测试，只在网络、文件系统、解码器等外部边界替换实现；阅读接口即可列出真实依赖。

## 3. 区分 Builder 的用户选项、计划和执行中间态

代码依据：`packages/builder/src/types/options.ts:1` 的公开 BuilderOptions 同时包含 force / concurrency / progressListener，以及 `reprocessKeys`、`derivedReprocessKeys`、`plannedKeys`、`locationMode` 等内部字段。`workflow/diff-planner.ts:129` 修改 options，worker 随后依赖这些字段进行二次决策。

这不是当前已复现的规划错误，但它把“某个阶段已经运行过”编码成共享对象上的隐含变更。`@internal` 注释不能限制类型层面的构造与传入。

建议逐步建立：

```text
BuildRequest           用户输入，规范化后只读
BuildPlan              任务、规划原因、有效处理策略
BuildExecutionContext  运行服务、进度回调、取消与资源作用域
BuildResult            对外可观察结果
```

DiffPlanner 显式返回计划，processor 消费计划，不再依赖前序阶段对 options 的旁路修改。保持当前增量构建、插件事件顺序、失败保留旧条目和原子提交策略。插件若依赖现有事件载荷，需要兼容适配与明确的 API 变更评审。

BuildSession 保留为本次构建的协调上下文，逐步收敛 config 字段、getConfig 回调和 services.config 这些重复访问路径，选择唯一事实来源。

验收：相同有效输入和快照得到相同计划；处理阶段所需条件全部显式；连续构建不继承上一轮中间态；既有插件与构建事务契约通过。

## 4. 给 PhotoRepository 明确的只读快照语义

代码依据：`apps/web/src/data-runtime/photo-repository.ts:101` 返回内部可变数组；`:105` 返回可变实体；`:178` 原地补全实体；`:242` 替换数组并通过全局版本通知订阅者。

当前设计已用新数组身份处理集合刷新。本轮没有复现 UI 不更新，不能将其报告成现存界面故障。工程问题是公开接口允许调用方修改仓库数据而不通知，旧照片引用也会随补全改变，快照语义需要阅读内部实现才能理解。

建议查询接口返回只读集合和只读实体，仓库统一拥有变更权限。补全先构造并校验候选实体，再以结构共享发布：未变实体保留身份，已变实体获得新身份。不要每次查询都深拷贝整库。

保持分片去重、深层校验和原子合并。只有确实存在全局订阅开销时，再增加按 ID 或 selector 的窄订阅。

验收：公开消费者不能通过类型正常修改返回数据；旧快照不被后续补全改写；一次提交只暴露完整合法状态；异常分片不部分污染仓库。

## 5. 把 Worker 纳入完整的编译与协议边界

代码依据：`packages/webgl-viewer/src/worker-bridge.ts:46` 将 raw JavaScript、常量和 `function.toString()` 拼成 Worker；`worker-protocol.ts` 注释要求手工同步 worker 的 postMessage。Worker 是 JS，当前 `allowJs: false` 的 TS 配置不会完整约束其消息发送。

现有源码执行测试、生产绘制测试及闭包序列化修复值得保留。这不是新的启动故障。维护成本在于：给共享函数添加一个正常模块依赖，也可能违反“该函数会被序列化”的额外约定；协议声明不能自动约束实际发送方。

建议评估独立 TypeScript Worker 构建入口，使用普通 import 共享纯函数和请求/响应联合类型。若继续使用 raw JS，至少增加独立 checkJs / JSDoc 检查及完整的发送、接收协议契约。选择一条实现路径，避免维护两套协议定义。

迁移时保留 sessionId、迟到消息丢弃、transferable 所有权、bitmap close 和 worker terminate。验证压缩构建、Worker 资产路径、静态托管 base、浏览器兼容性及真实纹理绘制。

## 6. 把架构约定变成范围准确的自动检查

按各 workspace 的 TypeScript 路径解析，本轮扫描 `apps/web/src` 和 `packages/*/src` 中 352 个非测试 TS/TSX 文件，得到 682 条范围内的静态运行时 import/export 边。排除 type-only、动态 import、raw Worker、声明文件和构建插件后，发现一个循环：

```text
packages/builder/src/photo/execution-context.ts
  → packages/builder/src/photo/logger-adapter.ts
  → packages/builder/src/photo/execution-context.ts
```

原因：context 工厂需要创建 logger，而 logger-adapter 同时提供“创建 logger”和“从 context 获取 logger”。目前调用位于函数内，没有复现初始化失败；这是可以低成本消除的职责耦合。分离不依赖 context 的 logger 工厂与 contextual accessor 即可，不需要改变日志行为。

现有 `scripts/check-workspace-contracts.ts:86` 主要检查外部依赖声明、workspace 元数据和许可证，局部 import 被跳过。ESLint 已限制部分依赖方向，Vite 分包插件也检查生产 vendor 循环；这些不等于完整的源模块依赖约束。

建议增加明确的边界规则：核心服务不依赖表现层或全局 i18n；生产模块不导入测试；包消费者遵守公开入口；禁止新增静态运行时循环。正确区分类型与运行时依赖、开发工具与生产图，避免简单文本正则误报。

另一个覆盖缺口是 Web 单测类型：`apps/web/tsconfig.json:28` 排除了 src 下的测试，根 `tsconfig.tools.json` 覆盖构建插件、脚本和 e2e，没有单独包含这些 Web 单测。当前 Vitest 使用转译执行，不能将“测试通过”等同于“测试调用满足公开 TypeScript API”。建议增加专用 test tsconfig，检查测试替身、fixture 和生产契约是否一致。

验收：故意插入违规 import、静态循环、测试中的错误 API 调用，对应检查确实失败；合法 type-only 依赖不被误判。

## 7. 用不变量和契约测试支撑安全重构

项目已有大量有效的生命周期、manifest、导航及生产测试。下一步应补跨实现的一致性和检查盲区。

优先组织可复用契约：

- **媒体任务**：结算一次、独立订阅、取消边界、释放顺序、失败后重新调用、dispose 后不得回填。
- **构建事务**：不完整扫描不提交；候选校验失败不改写已发布 manifest；提交与清理顺序明确；相同输入可复现。沿用已有测试并补边界，不重复创建相同断言。
- **数据仓库**：错误分片拒绝、一次提交原子可见、快照与通知语义一致。
- **适配器**：单进程与 cluster、不同存储 provider、DOM 与 WebGL 的共同契约使用同一组验收，再针对实现差异补专门测试。

复杂状态顺序可使用有限操作序列生成或性质测试，覆盖 A 开始、B 接管、A 迟到、dispose 等组合。只模拟真正的外部依赖，让内部模块真实组合。构建器和 Worker 保留实际编码样本和生产 bundle 执行测试。

若公开 API 必须依赖大量内部对象、模块替身和类型断言才能测试，应先检查接口是否暴露过多细节。

## 工程实施顺序

| 顺序 | 可独立评审的改进                                                  | 完成标准                                          |
| ---- | ----------------------------------------------------------------- | ------------------------------------------------- |
| 1    | 解除 logger/context 循环；补源模块边界检查；建立 Web 单测类型检查 | 检查范围明确，能拦截真实违规，既有行为保持        |
| 2    | 媒体事件与错误模型；明确转换结果；收回 i18n 和隐藏缓存依赖        | 核心层表达事实，错误原因完整，资源所有者唯一      |
| 3    | 队列取消、共享订阅和清理契约                                      | 任务与资源生命周期分别可验证，晚到结果不越界      |
| 4    | Builder request / plan / execution 分离                           | 阶段输入输出显式，计划不通过修改用户 options 传递 |
| 5    | Repository 只读快照；Worker 编译与协议边界                        | 数据发布语义稳定，跨线程实现由类型和构建共同约束  |
| 持续 | 不变量测试、契约文档、工程规则清理                                | 减少隐含约定和重复事实，贡献者能局部理解代码      |

先用少量自动检查保护重构，再沿具体调用链收敛契约。每次评审应回答：删除了哪条隐含约定，哪种错误现在可以在编译或测试中发现，维护者少需要记住什么。

工程说明也要跟随事实：AGENTS.md 的 Vite 7 / React Router 7 已落后于 package.json 的 Vite 8.2.2 / React Router 8.3.1；ESLint 还有旧 Electron 路由提示和历史目录规则。按实际支持范围整理，避免贡献者被旧约定误导。

## 缺陷证据与验证记录

上一轮确认的实现问题保留为重构输入，功能与交互改进暂缓：

| 问题                           | 证据与限制                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| TIFF 灰度通道与零值 alpha 错误 | 真实 Sharp TIFF 与真实 tiff decoder，捕获 Canvas 输入。8 位灰度被当 RGB 读取；透明红色 alpha 0 变成 255。未修改原文件。        |
| DOM 解码失败不报告             | 真实 ProgressiveImage/DOMImageViewer，模拟 loader 成功并派发 img error；错误回调没有收到失败。不是坏图在浏览器中的端到端复现。 |
| 原图没有应用层超时             | 模拟停滞 XHR，推进 60 秒仍 pending，cleanup 可结算；不推断浏览器底层永不超时。                                                 |
| 取消排队转换仍执行             | 真实 manager/pipeline/service，单槽阻塞并取消第二个任务，后者仍调用策略；策略是可控替身。                                      |

前一轮验证：192 个文件、1,223 个单元测试、10 个生产 Playwright 测试通过；类型、ESLint、Prettier、workspace contracts 和生产构建通过。临时探针 3 个文件、13 个用例通过，其中 5 个缺陷复现，8 个沿用既有基线。探针断言错误行为，不能作为修复后的正式测试契约。

探针、详细实现证据及上一版审计备份位于本机 `/tmp/afilmory-art-review-2026-09-08/`。系统 pnpm 启动未正常完成，前一轮使用已安装工具的直接入口验证，没有把 pnpm 命令本身记录为通过。本轮补充静态依赖图和代码核对，修订后检查 Markdown 格式及 `git diff --check`，没有因文档重写重复执行完整业务测试。

只读快照、Builder 计划分离、typed Worker 等是经代码确认的工程改进机会，不是本轮复现的新业务故障。未进行真实 S3 扫描、部署、大图库或移动 GPU 压力测试。
