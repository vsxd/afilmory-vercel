# 媒体资源生命周期

本文记录当前媒体资源约定。后续任务类型、转换调度和 Worker 契约见 [工程契约](./engineering-contracts.md)；实施及最新验证见 [实施计划](./engineering-refactor-plan.md)。

## 架构决策

重构范围是媒体资源所有权和异步任务边界。保留格式转换策略、WebGL 渲染、照片仓库与导航模块；这些职责已有独立边界，不需要因资源释放缺陷全部重写。

| 层次                        | 持有什么                                            | 谁负责释放或取消                                         |
| --------------------------- | --------------------------------------------------- | -------------------------------------------------------- |
| 图片缓存 / VideoBlobCache   | 可复用 Blob                                         | LRU 逐出引用；runtime 销毁时清空                         |
| MediaResourceScope          | 活跃 object URL 的释放登记                          | 消费者调用 lease.release；runtime.dispose 兜底           |
| ImageLoaderManager          | 当前图片请求及转换等待                              | 新请求替代旧请求，或 cleanup 中止                        |
| VideoBlobCache 的共享任务   | 按源 URL 去重的下载、转换 Promise 和独立 controller | 最后一个订阅者退出时 abort；单个订阅者不会取消其他订阅者 |
| VideoLoadService 的当前任务 | 独立 controller、元素、播放 URL lease               | cleanup 先中止任务，再清除元素 src、释放 lease           |
| 图片组件                    | 已交付的图片 lease                                  | 照片来源改变、组件卸载或结果被替换时释放                 |
| 视频组件                    | 独立申请的 runtime loader                           | 切换来源、退出当前照片或卸载时归还                       |

Blob URL 不再存入缓存。两个消费者使用同一个 Blob 时各有自己的 URL，释放其中一个不会影响另一个。创建多个 URL 不等于复制多个 Blob 数据缓冲。

图片加载任务完成和图片显示结束是不同事件。图片内容以 empty / loaded / failed 联合表示；加载 effect 清理仅取消当前任务，已交付的 lease 保留到内容不再使用。取消后晚到的结果由接收端立即 release。详情视频不再复用已退出 runtime 跟踪的图片 loader。

## 必须保持的规则

1. 缓存不能撤销消费者的 URL；消费者不能释放其他消费者的 URL。
2. release 和 dispose 幂等；runtime 销毁后不再允许创建 loader 或 URL。
3. 异步任务持有自己的 signal，不在 await 后读取可能已属于新任务的 controller。
4. 每个 await 后及附加媒体前检查取消；旧任务不能更新 loading indicator、写缓存或清理新任务。
5. 共享任务订阅的退出立即生效，最后一个消费者取消后可以立刻重试同一 URL；旧任务的 finally 只能移除自己的 pending 条目。
6. 缓存命中也经过取消检查。Promise 的微任务边界不能被当作同步完成。
7. 错误、超时、取消和正常卸载都必须清理视频监听、计时器及拥有的 URL。

## 范围与取舍

- 图片缓存维持移动端 64 MiB、桌面端 256 MiB、50 条上限；视频 Blob 缓存限制为 64 MiB、10 条。沿用 LRU 至少保留最新一条的行为。
- 缓存预算约束可复用数据，不是页面总内存硬上限。活跃消费者、解码后的像素和 GPU 纹理仍有独立生命周期；活跃图片不能为了满足缓存预算而被强制撤销。
- 不支持 AbortSignal 的图像解码器可能继续计算到结束。调用方取消会立即结束等待并屏蔽回调，过期结果不会回填图片缓存或创建 URL。活动解码在退出前仍占用并发额度；`await runtime.dispose()` 可等待排空。HEIC 不再持有模块级产物缓存。
- MOV 处理仍是重标记 MIME，并非转码；容器/编码兼容性策略未改变。
- `ImageLoadResult.release()` 是新的内部契约；新增消费者必须配对释放。转换与 Motion Photo 提取层只返回 Blob，不返回拥有隐式生命周期的 URL。

## 回归验证

`apps/web/src/lib/__tests__/media-lifecycle.test.ts` 覆盖：字节预算逐出、多个图片消费者独立释放、runtime 销毁、转换期间取消与迟到回调、共享视频下载、独立取消、取消后立即重试、失败重试、传输忽略 abort、缓存命中后取消、旧 Motion Photo 结果迟到和视频失败释放。

组件测试验证视频来源稳定时不重载、来源变化时重载、卸载取消、播放定时器清理，以及图片加载完成后 lease 保持有效、卸载时释放。

生产浏览器回归使用真实 DOM 图片加载，在小型合成 Blob 上模拟大图字节预算，检查 A → B → A 后原图仍可解码、URL 仍可读取，以及关闭查看器后 URL 已失效。WebGL 原图绘制及原有导航/PWA 冒烟测试继续保留。

生产浏览器验证使用合成照片数据；最新检查结果集中记录于实施计划，不代表已部署或已验证线上所有媒体编码。
