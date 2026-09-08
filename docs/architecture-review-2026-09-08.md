# 导航重构后的补充审计

后续修复说明：下文保留 `03c18b9d` 基线的审计事实。三个缺陷已在本地代码中按 [媒体生命周期设计](media-lifecycle.md) 重构修复，新增正常行为的回归测试；历史位置与复现结论不代表当前实现仍有这些缺陷。

审计基线：`03c18b9d`。本轮检查媒体缓存、异步任务取消和详情更新，不重复上一轮导航问题。以下三个缺陷均有服务层最小复现；尚未用生产照片完成浏览器端复现，不能据此认定它们是此前 A7C09603 加载失败的根因。本轮不修改运行时代码。

## 1. P2：图片缓存逐出会撤销消费者仍持有的 URL

位置：`apps/web/src/lib/image-cache-service.ts:25`，以及 `apps/web/src/components/ui/photo-viewer/hooks.ts:112`、`ProgressiveImage.tsx:328`。

缓存清理直接调用 `URL.revokeObjectURL`，但返回给组件的 `blobSrc` 没有使用计数或独立所有权。组件保存的 `highResLoaded` 也不会随缓存逐出失效。

复现：模拟移动端 64 MiB 缓存预算，通过真实 `ImageConversionService` 依次处理两个大小为 40 MiB 的 Blob。第二张进入缓存后，第一张返回给消费者的 URL 已被撤销。测试仅覆盖 Blob 的 `size` 属性，不实际分配大文件。

用户影响：查看 A、切换到 B 后，邻近的 A 幻灯片仍可保留 React 状态；返回 A 时，加载 hook 因 `highResLoaded` 为真而跳过重取，DOM 查看器重新挂载却使用已撤销的 URL。Live Photo、HDR 和无 WebGL 的 DOM 路径可能无法显示原图；使用同一 URL 的复制、下载操作也可能失败。WebGL 同时接收 `sourceBlob`，不能把影响泛化成所有照片必然显示失败。

建议：区分缓存持有和组件持有。可以缓存 Blob，由消费者创建并释放自己的 URL；也可以使用 acquire/release 引用计数，让逐出只释放缓存引用，最后一个消费者退出后才 revoke。单纯增大缓存预算不能解决所有权问题。

## 2. P2：同一 MOV 并发转换会撤销先返回的地址

位置：`apps/web/src/lib/video-converter.ts:75-89`，`apps/web/src/lib/lru-cache.ts:66`。

`relabelMovAsMp4` 只缓存已完成结果，没有按源 URL 合并进行中的任务。两个请求同时未命中时，会各自下载并创建 URL。第二次 `set` 替换同键值，LRU 清理函数立即撤销第一个 URL，而第一个调用方已经获得该地址。

复现：用 `Promise.all` 并发调用两次真实 `relabelMovAsMp4`，请求相同 URL。结果得到两个不同的播放地址，并记录到 `revokeObjectURL(firstResult)`。网络及浏览器 URL API 使用替身，缓存及转换函数使用真实实现。

用户影响：网格悬停和详情查看器都能发起视频加载，多个消费者重叠时可能遇到播放地址提前失效；同时还有重复下载和内存占用。测试证明了地址生命周期缺陷，没有断言已开始播放的视频一定立即停止。

建议：按源 URL 合并下载/转换任务，同时明确每个消费者的取消和 URL 释放规则。不能把共享任务绑定到第一个消费者的 AbortSignal，否则关闭一个页面会中断其他消费者。仅去重仍不能解决缓存容量逐出时的活跃消费者所有权问题。

## 3. P2：取消视频加载后，异步结果仍会重新写入视频元素

位置：`apps/web/src/lib/video-load-service.ts:261-269`、`:163`。

`cleanup()` 中止并清空当前 AbortController，但 `convertVideo()` 在 await 后没有验证原任务是否仍有效。接着 `loadVideoSource()` 从可变实例字段读取 signal：cleanup 后得到 undefined；如果新任务已启动，则错误地读到新任务的 signal。

复现：先通过真实转换函数填充 MOV 缓存，再调用 `processVideo()` 并立即 `cleanup()`。cleanup 当下 video 没有 src；等待 Promise 微任务后，旧任务仍写入缓存 URL，收到模拟 loadeddata 后还成功 resolve。此复现不依赖忽略 abort 的网络替身，因为第二次转换直接命中缓存。

用户影响：快速离开、切换照片或卸载查看器时，已取消的任务仍可重新加载媒体，并调用共享 loading indicator。若同一个服务已有新任务，旧结果还可能清理新任务的视频监听与等待状态。

建议：每次调用捕获独立 controller 和任务标识，在每个 await 后及所有副作用前检查它们；显式将该 signal 传入 `loadVideoSource`。过期任务只能清理自己拥有的资源，不能调用会清理新任务的实例级方法。Motion Photo 分支应遵守同一规则。

## 验证与排除项

- 临时 Vitest 探针：3 个文件、4 个用例通过。其中 3 个验证上述缺陷当前确实存在，另 1 个排除 EXIF 语言更新疑点；这些通过不表示缺陷已修复。
- EXIF 语言：使用真实 i18next 切换 en-US → zh-CN，面板标题及格式化日期均更新。当前 react-i18next 会更新 i18n 包装对象，不能仅凭 `[i18n]` 依赖判定此处有 bug。
- 单个超预算图片：LRU 明确保留最新一条，因此“单张大图入缓存立即撤销自己”的猜测不成立。
- 详情分片补全：仓库通知会产生新的照片数组，未取得界面不刷新的复现，不列为缺陷。
- 复现探针保存在本机 `/tmp/afilmory-audit-2026-09-08/`，保留原仓库相对路径；复制回对应路径后可用根目录 `node_modules/.bin/vitest run --project web audit-` 复跑。探针不纳入常规测试套件，避免把错误行为当成应保留的契约。

建议下一轮优先统一媒体资源所有权和任务取消边界，再补正常行为的回归测试。这三个问题共享生命周期设计缺口，但修复应分别验证图片缓存、共享视频转换和服务取消三个边界。
